import copy
import base64
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from hermes4_drive_trash import InboxTrash, INBOX, ACCOUNT, SCOPE, NoRedirect
import hermes_drive_intake as intake
import hermes4_trash_probe as probe
from hermes4_work import ConnectedGitHub

FILE = 'synthetic-source-0'
REVISION = 'revision-1'
INTENT = 'a' * 64


class DriveTransport(InboxTrash):
    def __init__(self):
        super().__init__('test-only', conditional_verified=True, enabled=True)
        self.file = dict(id=FILE, name='synthetic.png', mimeType='image/png', parents=[INBOX], trashed=False,
                         explicitlyTrashed=False, headRevisionId=REVISION,
                         properties=dict(unrelated='preserved'), capabilities=dict(canTrash=True))
        self.etag = '"file-version-1"'
        self.email = ACCOUNT
        self.patches = []
        self.race = self.timeout = self.bad_readback = False

    def request(self, path, *, method='GET', payload=None, etag=None):
        if path.startswith('/about?'):
            return dict(user=dict(emailAddress=self.email)), None
        if method == 'GET':
            return copy.deepcopy(self.file), self.etag
        if self.race:
            self.etag = '"concurrent-version"'
            self.file['headRevisionId'] = 'revision-2'
        if etag != self.etag:
            raise ValueError('DRIVE_REVISION_CONFLICT')
        self.patches.append(dict(path=path, payload=copy.deepcopy(payload), etag=etag))
        self.file.update(payload, explicitlyTrashed=payload.get('trashed', False))
        self.etag = '"file-version-2"'
        if self.bad_readback:
            self.file['properties'] = {}
        if self.timeout:
            self.timeout = False
            raise TimeoutError('response lost')
        return copy.deepcopy(self.file), self.etag


class TrashGuards(unittest.TestCase):
    def test_metadata_only_trash_is_conditional_and_reads_back(self):
        client = DriveTransport()
        receipt = client.trash(FILE, REVISION, INTENT)
        self.assertEqual(receipt['scope'], SCOPE)
        self.assertEqual(receipt['identity'], ACCOUNT)
        self.assertTrue(receipt['trashed'])
        self.assertEqual(client.patches[0]['payload'], dict(trashed=True, properties=dict(
            unrelated='preserved', hermesCleanup=INTENT)))
        self.assertEqual(client.patches[0]['etag'], '"file-version-1"')
        self.assertNotIn('removeParents', client.patches[0]['path'])
        self.assertNotIn('addParents', client.patches[0]['path'])

    def test_every_mismatch_stops_before_patch(self):
        cases = [lambda c: c.file.update(parents=['permanent-archive']),
                 lambda c: c.file.update(parents=[INBOX, 'another-parent']),
                 lambda c: c.file.update(id='different-id'),
                 lambda c: c.file.update(mimeType='application/vnd.google-apps.folder'),
                 lambda c: c.file.update(headRevisionId='same-bytes-new-revision'),
                 lambda c: c.file.update(trashed=None),
                 lambda c: c.file.update(capabilities=dict(canTrash=False)),
                 lambda c: c.file.update(capabilities={}),
                 lambda c: setattr(c, 'email', 'connected-owner@example.com'),
                 lambda c: setattr(c, 'etag', None),
                 lambda c: setattr(c, 'etag', 'W/"weak-etag"'),
                 lambda c: setattr(c, 'conditional_verified', False),
                 lambda c: setattr(c, 'enabled', False)]
        for change in cases:
            client = DriveTransport()
            change(client)
            before = copy.deepcopy(client.file)
            with self.subTest(change=change), self.assertRaises(ValueError):
                client.trash(FILE, REVISION, INTENT)
            self.assertFalse(client.patches)
            self.assertEqual(before, client.file)

    def test_source_revision_race_returns_conflict_without_trashing(self):
        client = DriveTransport()
        client.race = True
        with self.assertRaisesRegex(ValueError, 'DRIVE_REVISION_CONFLICT'):
            client.trash(FILE, REVISION, INTENT)
        self.assertFalse(client.file['trashed'])
        self.assertFalse(client.patches)

    def test_lost_patch_response_reconciles_only_same_intent_and_revision(self):
        client = DriveTransport()
        client.timeout = True
        with self.assertRaises(TimeoutError):
            client.trash(FILE, REVISION, INTENT)
        self.assertTrue(client.trash(FILE, REVISION, INTENT)['trashed'])
        self.assertEqual(len(client.patches), 1)
        with self.assertRaisesRegex(ValueError, 'TRASHED_BY_OTHER_OPERATION'):
            client.trash(FILE, REVISION, 'b' * 64)
        self.assertEqual(len(client.patches), 1)

    def test_missing_trash_receipt_never_claims_success(self):
        client = DriveTransport()
        client.bad_readback = True
        with self.assertRaisesRegex(ValueError, 'TRASH_READBACK_FAILED'):
            client.trash(FILE, REVISION, INTENT)

    def test_external_trash_is_not_accepted_as_own_cleanup(self):
        client = DriveTransport()
        client.file.update(trashed=True, explicitlyTrashed=True)
        with self.assertRaisesRegex(ValueError, 'TRASHED_BY_OTHER_OPERATION'):
            client.trash(FILE, REVISION, INTENT)
        self.assertFalse(client.patches)

    def test_invalid_ids_and_missing_revision_never_issue_any_request(self):
        client = InboxTrash('test-only', enabled=True)
        with patch.object(client, 'request') as request:
            for file_id, revision in [('invalid/id?query=1', REVISION), (FILE, ''), (FILE, None)]:
                with self.assertRaises(ValueError):
                    client.trash(file_id, revision, INTENT)
            request.assert_not_called()

    def test_no_token_delete_or_redirect_fallback(self):
        with self.assertRaisesRegex(ValueError, 'HERMES_CLEANUP_CREDENTIALS_MISSING'):
            InboxTrash('', enabled=True).trash(FILE, REVISION, INTENT)
        with self.assertRaisesRegex(ValueError, 'CLEANUP_METHOD_FORBIDDEN'):
            InboxTrash('test-only').request('/files/' + FILE, method='DELETE')
        with self.assertRaisesRegex(ValueError, 'CLEANUP_REDIRECT_REJECTED'):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.example')

    def test_actions_checks_the_revision_with_unchanged_read_identity(self):
        item = dict(drive_file_id=FILE, source_revision=REVISION)
        good = dict(id=FILE, headRevisionId=REVISION, trashed=False)
        with patch.dict(os.environ, {'GOOGLE_ACCESS_TOKEN': 'existing-read-only-token'}):
            for meta, success in [(good, True), (dict(good, headRevisionId='changed'), False),
                                  (dict(good, trashed=True), False), (dict(good, id='wrong'), False)]:
                with patch.object(intake, 'api', return_value=(200, json.dumps(meta).encode())) as request:
                    if success:
                        intake.verify_source_revision(item)
                    else:
                        with self.assertRaisesRegex(ValueError, 'SOURCE_REVISION_CHANGED'):
                            intake.verify_source_revision(item)
                    self.assertEqual(request.call_args.args[1], 'existing-read-only-token')

    def test_pending_actions_sources_are_checked_and_incomplete_results_stop_cleanup(self):
        def call(name, **args):
            url = args['url']
            if '/actions/runs?' in url:
                runs = [dict(path='.github/workflows/hermes-drive-intake.yml', status='queued', head_sha='f' * 40)] if 'status=queued' in url else []
                value = dict(total_count=len(runs), workflow_runs=runs)
            elif '/contents/hermes/queue?' in url:
                value = [dict(path='hermes/queue/other.json')]
            else:
                value = dict(content=base64.b64encode(json.dumps(dict(schema=1,drive_file_id=FILE)).encode()).decode())
            return dict(content=json.dumps(value))
        claims = ConnectedGitHub(call).pending_sources()
        self.assertEqual(claims, {FILE: {'hermes/queue/other.json'}})
        with self.assertRaisesRegex(ValueError, 'PENDING_ACTIONS_LIST_INCOMPLETE'):
            ConnectedGitHub(lambda *a,**kw: dict(content=json.dumps(dict(total_count=101,workflow_runs=[])))).pending_sources()

    def test_permission_probe_reports_missing_hermes_auth_without_substituting_owner(self):
        fixture = dict(synthetic_only=True, inbox_file_id=FILE, outside_file_id='synthetic-outside')
        with patch.dict(os.environ, {'HERMES_CLEANUP_ACCESS_TOKEN': ''}):
            result = probe.probe(fixture)
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'HERMES_CLEANUP_CREDENTIALS_MISSING')
        self.assertEqual(result['permanent_deletions'], 0)


if __name__ == '__main__':
    unittest.main()

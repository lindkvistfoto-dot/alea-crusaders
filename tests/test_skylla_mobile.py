import copy
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import skylla_mobile as mobile
from test_skylla_batch import manifest, result


class MobileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir='/tmp')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.args = SimpleNamespace(batch_id='SYNTHETIC-001', manifest_sha256='', mode='dry-run',
            ticket=self.root / 'TICKET.json', output=self.root / 'report')
        self.manifest = manifest(3)
        self.args.manifest_sha256 = self.manifest['manifest_sha256']
        self.args.ticket.write_text(json.dumps({'batch_id': self.args.batch_id,
            'manifest_sha256': self.args.manifest_sha256, 'mode': 'dry-run', 'ticket': 'signed-description'}))
        self.receipts = self.root / 'seeds.json'
        self.receipts.write_text('{"results": []}')

    def invoke(self, response=None, mode=None):
        if mode:
            self.args.mode = mode
        calls = []
        def request(url, body=None, headers=None):
            calls.append((body, headers))
            if body['operation'] == 'authorize':
                return {'credential': 'private.synthetic-credential', 'expires_at': 'synthetic'}
            entry = next(e for e in self.manifest['entries'] if e['id'] == body['id'])
            if response:
                return response(self.manifest, entry, body)
            return result(self.manifest, entry, 'verified', delete_api_invoked=False)
        with patch.dict(os.environ, {'RUNNER_TEMP': str(self.root), 'GOOGLE_ACCESS_TOKEN': 'private.drive-token'}), \
            patch.object(mobile, 'selected', return_value=(self.manifest, {'receipts_path': str(self.receipts)})), \
            patch.object(mobile, 'oidc', return_value='private.oidc-token'), patch.object(mobile, 'request', side_effect=request), \
            patch.object(mobile, 'summary'):
            status = mobile.run(self.args)
        return status, calls

    def test_single_authorization_for_all_objects_and_private_credentials_excluded(self):
        status, calls = self.invoke()
        self.assertEqual(status, 0)
        self.assertEqual(sum(b['operation'] == 'authorize' for b, _ in calls), 1)
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(b.get('action') != 'execute' for b, _ in calls))
        secret = self.root / 'skylla-mobile-private/credential.json'
        self.assertEqual(secret.stat().st_mode & 0o777, 0o600)
        public = ''.join(p.read_text() for p in self.args.output.rglob('*') if p.is_file())
        self.assertNotIn('private.', public)

    def test_partial_failure_writes_report_and_continues(self):
        first = self.manifest['entries'][0]['id']
        def partial(m, e, body):
            return result(m, e, 'skipped' if e['id'] == first else 'verified', reason='SYNTHETIC_UNSAFE')
        status, calls = self.invoke(partial)
        self.assertEqual(status, 2)
        r = mobile.batch.load(self.args.output / 'journal/REPORT.json')
        self.assertEqual((r['skipped'], r['verified']), (1, 2))
        self.assertEqual(len(calls), 4)

    def test_changed_ticket_mode_manifest_and_id_fail_before_authorization(self):
        original = mobile.batch.load(self.args.ticket)
        for field in ('mode', 'batch_id', 'manifest_sha256'):
            bad = {**original, field: 'unapproved'}
            self.args.ticket.write_text(json.dumps(bad))
            with self.assertRaises(mobile.batch.archive.k.Blocked):
                self.invoke()

    def test_exact_production_batch_is_registered_with_100_objects(self):
        expected = '638c68cc4e4e2b6e01d986abef009bfac22499ef7a95746146cfdfdf038da090'
        m, _ = mobile.selected('SKYLLA-BATCH-001', expected)
        self.assertEqual(len(m['entries']), 100)
        self.assertEqual(sum(e['size_bytes'] for e in m['entries']), 333077975)
        with self.assertRaises(mobile.batch.archive.k.Blocked):
            mobile.selected('SKYLLA-BATCH-001', '0' * 64)

    def test_environment_unknown_is_unprotected_without_leaking_provider_error(self):
        with patch.object(mobile, 'request', side_effect=RuntimeError('private-provider-information')):
            r = mobile.environment_status()
        self.assertFalse(r['owner_gate_verified'])
        self.assertNotIn('private-provider', json.dumps(r))

    def test_production_prepare_cannot_be_enabled_from_dispatch(self):
        self.args.mode = 'execute'
        with patch.object(mobile, 'selected', return_value=(self.manifest, {})), \
             patch.object(mobile, 'environment_status', return_value={'owner_gate_verified': True}), \
             patch.object(mobile, 'request') as req:
            with self.assertRaises(mobile.batch.archive.k.Blocked):
                mobile.prepare(self.args)
            req.assert_not_called()

    def test_workflow_has_one_protected_job_no_broad_secrets_or_auto_execution(self):
        text = (mobile.ROOT / '.github/workflows/skylla-mobile.yml').read_text()
        self.assertIn('workflow_dispatch:', text)
        self.assertEqual(text.count('    environment:\n'), 1)
        self.assertIn("needs.preflight.outputs.execute_ready == 'true'", text)
        self.assertIn('--mode dry-run', text)
        self.assertNotIn('secrets.', text)
        self.assertNotIn('pull_request_target:', text)
        self.assertNotIn('  push:', text)
        self.assertNotIn('SUPABASE_SERVICE_ROLE_KEY', text)
        self.assertNotIn('write-all', text)
        self.assertIn('cancel-in-progress: false', text)
        self.assertIn('path: ${{ runner.temp }}/skylla-result/', text)

    def test_journal_manifest_change_blocks_resume(self):
        self.invoke()
        changed = copy.deepcopy(self.manifest)
        changed['batch_id'] = 'SYNTHETIC-002'
        changed.pop('manifest_sha256')
        changed['manifest_sha256'] = mobile.batch.digest(changed)
        with self.assertRaises(mobile.batch.archive.k.Blocked):
            mobile.batch.Journal(self.args.output / 'journal', changed)


if __name__ == '__main__':
    unittest.main()

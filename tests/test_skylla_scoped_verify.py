from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import skylla_scoped_verify as v
import skylla_edge_plan as edge
import test_skylla_edge_plan as fixtures
from test_skylla_archive import FOLDERS


class ScopedClientTests(unittest.TestCase):
    def plan(self):
        m, e = fixtures.ServerPlanTests().inputs()
        return edge.build(m, e, FOLDERS)

    def receipt(self, entry, plan):
        return {'schema': 'skylla-server-verification/v1', 'project_id': plan['project_id'],
                'plan_sha256': plan['plan_sha256'], 'system': 'supabase', 'id': entry['id'],
                'bucket': entry['bucket'], 'object_path': entry['object_path'], 'sha256': entry['sha256'],
                'drive_sha256': entry['sha256'], 'size_bytes': entry['size_bytes'],
                'permanent_drive_file_id': entry['permanent_drive_file_id'], 'format': 'PNG',
                'complete_decode': True, 'status': 'verified_complete', 'safe_to_delete': False,
                'deletion_authorized': False, 'authorization_method': 'deployment_scoped_read_capability',
                'verified_at': datetime.now(timezone.utc).isoformat(),
                'capability_expires_at': (datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat()}

    def test_only_hash_is_deployable_and_token_is_private_exclusive(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); token = base/'private'; public = base/'descriptor.json'
            plan = self.plan(); conf = v.issue(plan, token, public)
            secret = v.read_token(token)
            self.assertEqual(token.stat().st_mode & 0o777, 0o600)
            self.assertEqual(conf['token_sha256'], hashlib.sha256(secret.encode()).hexdigest())
            self.assertNotIn(secret, public.read_text())
            with self.assertRaises(v.s.k.Blocked): v.issue(plan, token, public)

    def test_token_inside_repository_symlinks_long_window_and_weak_permissions_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); plan = self.plan()
            with self.assertRaises(v.s.k.Blocked): v.issue(plan, v.s.ROOT/'unsafe-token', base/'public')
            with self.assertRaises(v.s.k.Blocked): v.issue(plan, base/'private', base/'public', 31)
            v.issue(plan, base/'private', base/'public')
            (base/'alias').symlink_to(base/'private')
            with self.assertRaises(v.s.k.Blocked): v.read_token(base/'alias')
            (base/'private').chmod(0o644)
            with self.assertRaises(v.s.k.Blocked): v.read_token(base/'private')

    def test_valid_receipt_is_saved_without_deletion_permission(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); plan = self.plan();v.issue(plan, base/'private', base/'public')
            report = v.verify(plan, base/'private', base/'out', post=lambda token, entry, p: self.receipt(entry,p))
            self.assertEqual(report['verified'], 1)
            self.assertFalse(report['safe_to_delete'])
            self.assertNotIn(v.read_token(base/'private'), json.dumps(report))

    def test_receipt_hash_mismatch_stops_and_raw_errors_are_not_logged(self):
        for bad_hash in [True, False]:
            with tempfile.TemporaryDirectory() as directory:
                base = Path(directory); plan = self.plan();v.issue(plan, base/'private', base/'public')
                def post(token, entry, p):
                    if not bad_hash: raise RuntimeError('sensitive-provider-detail')
                    r = self.receipt(entry,p);r['sha256'] = '0'*64;return r
                report = v.verify(plan, base/'private', base/'out', post=post)
                self.assertEqual(report['verified'], 0)
                self.assertIsNotNone(report['stopped_reason'])
                self.assertNotIn('sensitive-provider-detail', json.dumps(report))

    def test_stale_proof_cannot_be_imported_as_current(self):
        plan = self.plan();entry = plan['entries'][0];r = self.receipt(entry,plan)
        r['verified_at'] = (datetime.now(timezone.utc)-timedelta(minutes=10)).isoformat()
        with self.assertRaises(v.s.k.Blocked):v.validate_receipt(r,entry,plan)


if __name__ == '__main__': unittest.main()

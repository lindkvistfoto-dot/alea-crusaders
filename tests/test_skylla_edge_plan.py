"""A server read allowlist requires genuine permanent archive proofs."""
import hashlib
import json
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import skylla_edge_plan as p
from test_skylla_archive import fixture, Drive, FOLDERS


class ServerPlanTests(unittest.TestCase):
    def inputs(self):
        raw, desc = fixture()
        proof = p.s.archive_one(desc, FOLDERS, Drive(raw, desc), True)
        proof['descriptor'] = desc
        row = {'bucket': desc['bucket'], 'object_path': desc['object_path'],
               'recorded_job_sha256_not_current_bytes': desc['expected_sha256'],
               'size_bytes': len(raw), 'permanent_drive_file_id': proof['permanent_drive_file_id'],
               'drive_sha256': proof['drive_sha256'], 'target_folder_id': desc['target_folder_id'],
               'inbox_file_ids': [desc['inbox_file_id']]}
        return {'objects': [row]}, {'proofs': [proof]}

    def test_deterministic_actual_readback_plan_has_no_delete_permission(self):
        m, e = self.inputs()
        a = p.build(m, e, FOLDERS)
        self.assertEqual(a, p.build(m, e, FOLDERS))
        raw = json.dumps(a['entries'], separators=(',', ':'), ensure_ascii=False).encode()
        self.assertEqual(a['plan_sha256'], hashlib.sha256(raw).hexdigest())
        self.assertFalse(a['safe_to_delete'])
        self.assertFalse(a['deletion_supported'])

    def test_metadata_alone_and_incomplete_decode_cannot_authorize_server_read(self):
        for change in ['bytes_equal', 'archive_status', 'complete_decode', 'sha256']:
            m, e = self.inputs()
            proof = e['proofs'][0]
            if change == 'bytes_equal': proof[change] = False
            elif change == 'archive_status': proof[change] = 'metadata_only'
            elif change == 'complete_decode': proof['archive_verification'][change] = False
            else: proof['source_drive_verification'][change] = '0'*64
            with self.assertRaises(p.s.k.Blocked): p.build(m, e, FOLDERS)

    def test_wrong_permanent_id_folder_size_and_unknown_original_are_blocked(self):
        for change in ['permanent_drive_file_id', 'target_folder_id', 'size_bytes', 'object_path']:
            m, e = self.inputs()
            m['objects'][0][change] = 999 if change == 'size_bytes' else 'wrong'
            with self.assertRaises(p.s.k.Blocked): p.build(m, e, FOLDERS)

    def test_duplicate_object_or_readback_fails_closed(self):
        m, e = self.inputs()
        with self.assertRaises(p.s.k.Blocked): p.build({'objects': m['objects']*2}, e, FOLDERS)
        with self.assertRaises(p.s.k.Blocked): p.build(m, {'proofs': e['proofs']*2}, FOLDERS)

    def test_no_archive_means_empty_allowlist(self):
        m, _ = self.inputs()
        self.assertEqual(p.build(m, {'proofs': []}, FOLDERS)['entries'], [])


if __name__ == '__main__': unittest.main()

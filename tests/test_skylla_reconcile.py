import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import skylla_reconcile as r
import test_skylla_edge_plan as fixtures
import test_skylla_scoped_verify as source_fixtures
from test_skylla_archive import FOLDERS


class ReconcileTests(unittest.TestCase):
    def source_inputs(self):
        m, e = self.inputs()
        plan = r.edge.build(m, e, FOLDERS)
        receipt = source_fixtures.ScopedClientTests().receipt(plan['entries'][0], plan)
        report = {'plan_sha256': plan['plan_sha256'], 'receipts': [receipt]}
        return m, plan, report

    def test_source_receipt_is_recorded_idempotently_without_delete_permission(self):
        m, plan, report = self.source_inputs()
        a = r.attach_source_receipts(m, plan, report, 'synthetic-receipts.json')
        b = r.attach_source_receipts(a, plan, report, 'synthetic-receipts.json')
        self.assertEqual(a, b)
        self.assertEqual(a['summary']['supabase_last_byte_verified'], 1)
        self.assertEqual(a['objects'][0]['source_actual_sha256'], plan['entries'][0]['sha256'])
        self.assertFalse(a['objects'][0]['safe_to_delete'])

    def test_changed_source_receipt_and_duplicate_event_fail_closed(self):
        m, plan, report = self.source_inputs()
        report['receipts'][0]['sha256'] = '0'*64
        with self.assertRaises(r.s.k.Blocked): r.attach_source_receipts(m, plan, report, 'bad.json')
        m, plan, report = self.source_inputs()
        report['receipts'] *= 2
        with self.assertRaises(r.s.k.Blocked): r.attach_source_receipts(m, plan, report, 'duplicate.json')

    def inputs(self):
        m, e = fixtures.ServerPlanTests().inputs()
        m.update({'summary': {}, 'first_delete_pilot': {'status': 'blocked'}})
        m['objects'][0].update({'source_actual_sha256': None,
            'eligible_for_delete_proposal': True, 'safe_to_delete': True,
            'blocking_issues': ['remaining_batch_waits_for_verified_pilot']})
        return m, e

    def test_drive_readback_never_becomes_supabase_proof_or_delete_permission(self):
        m, e = self.inputs()
        out = r.reconcile(m, e, FOLDERS)
        row = out['objects'][0]
        self.assertIsNone(row['source_actual_sha256'])
        self.assertFalse(row['eligible_for_delete_proposal'])
        self.assertFalse(row['safe_to_delete'])
        self.assertEqual(out['summary']['drive_archive_verified'], 1)
        self.assertIn('current_supabase_bytes_not_verified', row['blocking_issues'])
        self.assertNotIn('remaining_batch_waits_for_verified_pilot', row['blocking_issues'])
        self.assertTrue(m['objects'][0]['safe_to_delete'])  # input was not mutated

    def test_repeat_reconciliation_preserves_ids_and_has_no_duplicate_rows(self):
        m, e = self.inputs()
        a = r.reconcile(m, e, FOLDERS)
        b = r.reconcile(a, e, FOLDERS)
        self.assertEqual(a['objects'], b['objects'])
        self.assertEqual(a['summary'], b['summary'])

    def test_bad_descriptor_sha_and_incomplete_proof_stop_reconciliation(self):
        for field in ['sha', 'decode']:
            m, e = self.inputs()
            if field == 'sha': e['proofs'][0]['descriptor']['expected_sha256'] = '0'*64
            else: e['proofs'][0]['archive_verification']['complete_decode'] = False
            with self.assertRaises(r.s.k.Blocked): r.reconcile(m, e, FOLDERS)

    def test_metadata_claim_without_readback_stays_blocked(self):
        m, _ = self.inputs()
        out = r.reconcile(m, {'proofs': []}, FOLDERS)
        self.assertEqual(out['summary']['drive_archive_verified'], 0)
        self.assertEqual(out['objects'][0]['archive_status'], 'readback_evidence_missing')


if __name__ == '__main__': unittest.main()

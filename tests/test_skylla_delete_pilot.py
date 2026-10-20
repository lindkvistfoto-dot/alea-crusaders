import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import skylla_delete_pilot as d


class DeleteClientTests(unittest.TestCase):
    def setUp(self):
        self.proposal = d.PROPOSAL.read_bytes()
        approved = json.loads(self.proposal)['objects']
        self.plan = {'schema': 'skylla-approved-delete-pilot/v1', 'project_id': 'wbmosmkirsitkonejzpg',
                     'bucket': 'alea-hermes-source', 'owner_approved': True,
                     'separate_approval_required_for_further_objects': True,
                     'approved_proposal_sha256': hashlib.sha256(self.proposal).hexdigest(),
                     'entries': [{'id': str(i), 'bucket': 'alea-hermes-source', 'object_path': e['object_path'],
                                  'sha256': e['source_actual_sha256'], 'drive_sha256': e['drive_sha256'],
                                  'size_bytes': e['size_bytes'], 'permanent_drive_file_id': e['permanent_drive_file_id']}
                                 for i,e in enumerate(approved)]}
        self.rehash()

    def rehash(self):
        self.plan['plan_sha256'] = hashlib.sha256(json.dumps(self.plan['entries'], separators=(',', ':')).encode()).hexdigest()

    def test_exact_five_valid_and_subset_valid(self):
        d.validate_approved_plan(self.plan, self.proposal)
        self.plan['entries'] = self.plan['entries'][:2]
        self.rehash()
        d.validate_approved_plan(self.plan, self.proposal)

    def test_other_object_and_modified_hash_rejected(self):
        for field,value in [('object_path','spell/not-approved/file.png'), ('sha256','0'*64),
                            ('permanent_drive_file_id','different-file'), ('bucket','alea-hermes-public')]:
            self.setUp()
            self.plan['entries'][0][field] = value
            self.rehash()
            with self.assertRaises(d.access.s.k.Blocked):
                d.validate_approved_plan(self.plan, self.proposal)

    def test_missing_approval_and_changed_proposal_rejected(self):
        self.plan['owner_approved'] = False
        with self.assertRaises(d.access.s.k.Blocked):
            d.validate_approved_plan(self.plan, self.proposal)
        self.setUp()
        with self.assertRaises(d.access.s.k.Blocked):
            d.validate_approved_plan(self.plan, self.proposal+b'\n')

    def test_unknown_transfer_stops_batch_and_preserves_intent(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as root:
            root=Path(root);token=root/'private.cap';token.write_text('a'*43);token.chmod(0o600)
            calls=[]
            def transfer(*args):
                self.assertTrue(list((root/'out').glob('*.intent.json')))
                calls.append(args[1]['id'])
                raise OSError('sensitive provider error')
            report=d.run(self.plan,token,root/'out','delete',self.proposal,transfer)
            self.assertEqual(len(calls),1)
            self.assertEqual(report['not_attempted'],4)
            self.assertEqual(report['receipts'][0]['status'],'outcome_unknown')
            self.assertNotIn('sensitive',json.dumps(report))
            with self.assertRaises(FileExistsError):
                d.run(self.plan,token,root/'out','delete',self.proposal,transfer)

    def test_skipped_objects_allow_remaining_exact_approved_objects(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as root:
            root=Path(root);token=root/'private.cap';token.write_text('a'*43);token.chmod(0o600)
            def transfer(token,entry,plan,action):
                return {'id':entry['id'],'object_path':entry['object_path'],'status':'skipped','delete_api_invoked':False}
            result=d.run(self.plan,token,root/'out','delete',self.proposal,transfer)
            self.assertEqual(len(result['receipts']),5)
            self.assertEqual(result['not_attempted'],0)


if __name__ == '__main__':
    unittest.main()

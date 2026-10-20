import copy
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import io
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import skylla_batch as b


def manifest(count=3):
    sha=hashlib.sha256(b'small synthetic original').hexdigest()
    parent=b.archive.target_folder('skill',b.load(b.archive.ROOT/'config/hermes-drive-folders.json'))
    entries=[]
    for i in range(count):
        path=f'skill/synthetic-{i}/{sha}.png'
        entries.append({'id':hashlib.sha256(path.encode()).hexdigest(),'object_path':path,'bucket':b.BUCKET,
            'sha256':sha,'size_bytes':24+i,'inbox_file_id':'synthetic-inbox-id','complete_decode':True,
            'source_identity':{'id':f'synthetic-storage-{i}','etag':f'synthetic-etag-{i}','size_bytes':24+i,
                               'version':'v1','last_modified':'2026-10-18T00:00:00Z'},
            'drive':{'file_id':f'synthetic-drive-{i}','parent_id':parent,'revision_id':f'synthetic-revision-{i}','sha256':sha,'size_bytes':24+i},
            'dependency':{'job_id':f'synthetic-job-{i}'}})
    m={'schema':b.SCHEMA,'project_id':b.PROJECT,'bucket':b.BUCKET,'batch_id':'SYNTHETIC-001',
       'approval_required':True,'entries':entries};m['manifest_sha256']=b.digest(m)
    return m


def result(m,e,status,**extra):
    return {'id':e['id'],'object_path':e['object_path'],'bucket':b.BUCKET,'sha256':e['sha256'],
            'size_bytes':e['size_bytes'],'manifest_sha256':m['manifest_sha256'],'status':status,**extra}


class BatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir='/tmp');self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.token=self.root/'private.cap';self.token.write_text('x'*43);self.token.chmod(0o600)
        self.m=manifest();self.present={e['id']:True for e in self.m['entries']};self.calls=[]

    def send(self,token,m,e,action,receipt):
        self.calls.append((e['id'],action))
        if action=='status':
            return result(m,e,'present',identity_unchanged=True) if self.present[e['id']] else result(m,e,'absent',absence_verified=True)
        if action=='verify':
            return result(m,e,'verified',verification_receipt={'payload':{'id':e['id']},'signature':'synthetic'})
        events=[json.loads(x) for x in (self.root/'journal/events.jsonl').read_text().splitlines()]
        self.assertEqual(events[-1]['kind'],'intent');self.assertEqual(events[-1]['action'],'execute')
        if not self.present[e['id']]:return result(m,e,'skipped',reason='ALREADY_ABSENT_NO_DELETE_SENT')
        self.present[e['id']]=False
        return result(m,e,'deleted',absence_verified=True)

    def run_batch(self,**kwargs):
        return b.run(self.m,self.token,self.root/'journal',send=kwargs.pop('send',self.send),**kwargs)

    def test_one_command_handles_100_and_rejects_101(self):
        self.m=manifest(100);self.present={e['id']:True for e in self.m['entries']}
        r=self.run_batch();self.assertEqual(r['confirmed_deleted_this_run'],100)
        self.assertEqual(r['reclaimed_object_bytes_verified'],sum(e['size_bytes'] for e in self.m['entries']))
        with self.assertRaises(b.archive.k.Blocked):b.validate_manifest(manifest(101))

    def test_unchanged_batch_is_idempotent_and_rechecks_absence_on_resume(self):
        first=self.run_batch();self.calls=[];second=self.run_batch()
        self.assertEqual(first['reclaimed_object_bytes_verified'],second['reclaimed_object_bytes_verified'])
        self.assertEqual(second['confirmed_deleted_this_run'],0)
        self.assertTrue(all(action=='status' for _,action in self.calls))

    def test_lost_delete_response_is_reconciled_without_second_delete(self):
        first_id=self.m['entries'][0]['id']
        def lost(token,m,e,action,receipt):
            out=self.send(token,m,e,action,receipt)
            if e['id']==first_id:raise b.archive.k.Blocked('synthetic lost response')
            return out
        first=self.run_batch(send=lost);self.assertEqual(first['unknown'],1)
        self.calls=[];second=self.run_batch();self.assertEqual(second['verified_absent_in_batch'],3)
        self.assertNotIn((first_id,'execute'),self.calls)

    def test_unknown_but_still_present_rechecks_status_before_safe_retry(self):
        first=self.m['entries'][0]['id']
        def down(token,m,e,action,receipt):
            if e['id']==first:raise b.archive.k.Blocked('not sent')
            return self.send(token,m,e,action,receipt)
        self.run_batch(send=down);self.calls=[];r=self.run_batch()
        self.assertEqual(self.calls[:2],[(first,'status'),(first,'execute')]);self.assertEqual(r['verified_absent_in_batch'],3)

    def test_changed_object_on_resume_is_skipped_and_others_continue(self):
        self.run_batch();self.present={e['id']:True for e in self.m['entries']}
        def changed(token,m,e,action,receipt):return result(m,e,'skipped',identity_unchanged=False,reason='SOURCE_VERSION_CHANGED')
        r=self.run_batch(send=changed);self.assertEqual(r['skipped'],3);self.assertEqual(r['reclaimed_object_bytes_verified'],0)

    def test_recreated_object_requires_new_approval_even_if_content_matches(self):
        self.run_batch();first=self.m['entries'][0]['id'];self.present[first]=True;self.calls=[]
        r=self.run_batch();self.assertNotIn((first,'execute'),self.calls)
        self.assertEqual(r['results'][0]['reason'],'RECREATED_AFTER_COMPLETION')

    def test_preexisting_missing_object_is_never_counted_as_freed(self):
        self.present[self.m['entries'][0]['id']]=False
        a=self.run_batch();b2=self.run_batch()
        expected=sum(e['size_bytes'] for e in self.m['entries'][1:])
        self.assertEqual(a['reclaimed_object_bytes_verified'],expected);self.assertEqual(b2['reclaimed_object_bytes_verified'],expected)

    def test_unsafe_file_does_not_stop_batch(self):
        first=self.m['entries'][0]['id']
        def unsafe(token,m,e,action,receipt):
            return result(m,e,'skipped',reason='ACTIVE_SOURCE_DEPENDENCY') if e['id']==first else self.send(token,m,e,action,receipt)
        r=self.run_batch(send=unsafe);self.assertEqual(r['skipped'],1);self.assertEqual(r['confirmed_deleted_this_run'],2)

    def test_wrong_response_identity_becomes_unknown_without_stopping_other_files(self):
        first=self.m['entries'][0]['id']
        def corrupt(token,m,e,action,receipt):
            return result(m,e,'deleted',id='outside',absence_verified=True) if e['id']==first else self.send(token,m,e,action,receipt)
        r=self.run_batch(send=corrupt);self.assertEqual(r['unknown'],1);self.assertEqual(r['confirmed_deleted_this_run'],2)

    def test_missing_authentication_stops_after_one_attempt_not_100(self):
        calls=[]
        def no_auth(*args):calls.append(1);raise b.AuthorizationUnavailable('missing')
        r=self.run_batch(send=no_auth);self.assertEqual(len(calls),1);self.assertEqual(r['not_attempted'],2)
        self.assertEqual(r['results'][0]['status'],'outcome_unknown')

    def test_global_network_outage_stops_after_three_failures(self):
        self.m=manifest(100);calls=[]
        def down(*args):calls.append(1);raise b.archive.k.Blocked('network down')
        r=self.run_batch(send=down);self.assertEqual(len(calls),3)
        self.assertEqual(r['unknown'],3);self.assertEqual(r['not_attempted'],97)

    def test_interrupted_process_leaves_intent_and_resumes(self):
        def interrupt(*args):raise KeyboardInterrupt()
        r=self.run_batch(send=interrupt);self.assertTrue(r['interrupted']);self.assertEqual(r['not_attempted'],3)
        r=self.run_batch();self.assertEqual(r['verified_absent_in_batch'],3);self.assertEqual(self.calls[0][1],'status')

    def test_torn_journal_tail_is_preserved_then_reconciled(self):
        self.run_batch()
        with (self.root/'journal/events.jsonl').open('ab') as f:f.write(b'{"torn":')
        r=self.run_batch();self.assertEqual(r['verified_absent_in_batch'],3)
        self.assertEqual(len(list((self.root/'journal').glob('torn-tail-*.bin'))),1)

    def test_atomic_report_recovers_with_stale_temporary_file(self):
        journal=self.root/'journal';journal.mkdir();(journal/'REPORT.json.stale.tmp').write_text('incomplete')
        self.assertEqual(self.run_batch()['verified_absent_in_batch'],3)

    def test_exclusive_lock_blocks_concurrent_runner(self):
        journal=b.Journal(self.root/'journal',self.m)
        try:
            with self.assertRaises(b.archive.k.Blocked):b.Journal(self.root/'journal',self.m)
        finally:journal.close()

    def test_journal_symlink_cannot_redirect_writes(self):
        outside=self.root/'must-not-change';outside.write_text('preserve')
        journal=self.root/'journal';journal.mkdir();(journal/'events.jsonl').symlink_to(outside)
        with self.assertRaises(b.archive.k.Blocked):self.run_batch()
        self.assertEqual(outside.read_text(),'preserve');self.assertFalse(self.calls)

    def test_different_manifest_cannot_reuse_journal(self):
        self.run_batch();self.m=manifest(2)
        with self.assertRaises(b.archive.k.Blocked):self.run_batch()

    def test_verify_only_never_executes_deletes_and_saves_reusable_receipts(self):
        r=self.run_batch(verify_only=True);self.assertEqual(r['verified'],3);self.assertEqual(r['reclaimed_object_bytes_verified'],0)
        self.assertTrue(all(a=='verify' for _,a in self.calls));self.assertTrue(r['results'][0]['verification_receipt'])

    def test_manifest_tampering_and_duplicate_paths_are_rejected(self):
        for edit in [lambda m:m.update(bucket='display'),lambda m:m['entries'][0].update(sha256='0'*64),
                     lambda m:m['entries'].append(copy.deepcopy(m['entries'][0]))]:
            m=manifest();edit(m)
            with self.assertRaises(b.archive.k.Blocked):b.validate_manifest(m)

    def test_issue_is_read_only_without_owner_and_exact_approval_enables_execute(self):
        att={'manifest_sha256':self.m['manifest_sha256'],'revision_set_sha256':b.revision_set(self.m),
             'observed_at':datetime.now(timezone.utc).isoformat(),'all_permanent_ids_and_parents_checked':True}
        c=b.issue(self.m,att,self.root/'read.cap',self.root/'read.json')
        self.assertEqual(c['operation'],'verify_only');self.assertEqual((self.root/'read.cap').stat().st_mode&0o777,0o600)
        owner={'owner_approved':True,'manifest_sha256':self.m['manifest_sha256'],'object_count':3}
        c=b.issue(self.m,att,self.root/'execute.cap',self.root/'execute.json',owner_approval=owner)
        self.assertEqual(c['operation'],'execute');self.assertNotIn('token',c)
        self.assertNotIn((self.root/'execute.cap').read_text(),json.dumps(c))

    def test_wrong_owner_approval_or_stale_attestation_never_creates_token(self):
        att={'manifest_sha256':self.m['manifest_sha256'],'revision_set_sha256':b.revision_set(self.m),
             'observed_at':datetime.now(timezone.utc).isoformat(),'all_permanent_ids_and_parents_checked':True}
        for owner in [{'owner_approved':False},{'owner_approved':True,'manifest_sha256':'wrong','object_count':3}]:
            with self.assertRaises(b.archive.k.Blocked):b.issue(self.m,att,self.root/'never.cap',self.root/'never.json',owner_approval=owner)
            self.assertFalse((self.root/'never.cap').exists())
        att['observed_at']='2020-01-01T00:00:00Z'
        with self.assertRaises(b.archive.k.Blocked):b.issue(self.m,att,self.root/'never.cap',self.root/'never.json')

    def test_excessive_window_or_loose_token_permissions_are_rejected(self):
        self.token.chmod(0o644)
        with self.assertRaises(b.archive.k.Blocked):self.run_batch()

    def test_deployment_bundle_contains_hash_only_and_can_be_disabled(self):
        att={'manifest_sha256':self.m['manifest_sha256'],'revision_set_sha256':b.revision_set(self.m),
             'observed_at':datetime.now(timezone.utc).isoformat(),'all_permanent_ids_and_parents_checked':True}
        descriptor=b.issue(self.m,att,self.root/'read.cap',self.root/'read.json')
        bundle=b.deployment(self.m,descriptor)
        self.assertEqual(bundle['project_id'],b.PROJECT);self.assertFalse(bundle['verify_jwt'])
        self.assertNotIn((self.root/'read.cap').read_text(),json.dumps(bundle))
        files={x['name']:x['content'] for x in b.deployment()['files']}
        self.assertFalse(json.loads(files['skylla-batch/capability.json'])['enabled'])
        self.assertEqual(json.loads(files['skylla-batch/plan.json'])['entries'],[])


class PreparationTests(unittest.TestCase):
    def inputs(self):
        raw=io.BytesIO();Image.new('RGBA',(8,8),(5,10,15,255)).save(raw,format='PNG');data=raw.getvalue()
        sha=hashlib.sha256(data).hexdigest();folders=b.load(b.archive.ROOT/'config/hermes-drive-folders.json')
        parent=b.archive.target_folder('skill',folders);path=f'skill/synthetic/{sha}.png'
        desc={'bucket':b.BUCKET,'kind':'skill','target_key':'synthetic','object_path':path,
              'expected_sha256':sha,'expected_size_bytes':len(data),'inbox_file_id':'synthetic-inbox-id','target_folder_id':parent}
        proof=b.archive.pair_proof(data,data,desc,{'id':'synthetic-archive-id','parents':[parent],
              'size':len(data),'mimeType':'image/png','trashed':False},folders);proof['object_path']=path
        row={'object_path':path,'size_bytes':len(data),'source_actual_sha256':sha,'supabase_present':True,
             'hermes_job':{'id':'synthetic-job'},'source_verification':{'complete_decode':True,'sha256':sha},
             'registry_link':{'matching_current_records':[{'table':'rule_skills','id':'synthetic','field':'icon_path'}]}}
        source={'id':'synthetic-storage-id','object_path':path,'version':'v1','size_bytes':len(data),
                'updated_at':'2026-10-18T10:00:00.123456+00:00','metadata':{'eTag':'"exact-etag"','lastModified':'2026-10-18T10:00:01Z'}}
        job={'id':'synthetic-job','status':'active','source_path':path,'source_sha256':sha,'kind':'skill',
             'target_key':'synthetic','app_path':'hermes/skill/synthetic/output.webp','app_sha256':'a'*64}
        snapshot={'objects':[source],'jobs':[job],'registry':[{'table':'rule_skills','id':'synthetic','images':{'icon_path':job['app_path']}}]}
        native=[{'id':'synthetic-archive-id','mime_type':'image/png','size':str(len(data)),
                 'parent_ids':[parent],'shared':False,'title':sha+'.png'}]
        revisions={'observed_at':datetime.now(timezone.utc).isoformat(),'files':[{'file_id':'synthetic-archive-id',
                   'current_revision_id':'synthetic-revision','revisions':[{'id':'synthetic-revision',
                   'modified_at':'2026-10-18T00:00:00Z','size_bytes':len(data)}]}]}
        return [{'objects':[row]},{'proofs':[proof]},snapshot,native,revisions]

    def test_full_byte_receipt_reused_only_for_same_single_drive_revision(self):
        m,a,blocked=b.prepare(*self.inputs(),'SYNTHETIC-001');self.assertEqual(len(m['entries']),1)
        self.assertEqual(a['revision_set_sha256'],b.revision_set(m));self.assertFalse(blocked)

    def test_storage_info_timestamp_uses_database_milliseconds_not_s3_last_modified(self):
        m,_,_=b.prepare(*self.inputs(),'SYNTHETIC-001')
        self.assertEqual(m['entries'][0]['source_identity']['last_modified'],'2026-10-18T10:00:00.123+00:00')

    def test_refreshing_drive_observations_preserves_exact_approved_manifest(self):
        args=self.inputs();m,_,_=b.prepare(*args,'SYNTHETIC-001');before=copy.deepcopy(m)
        a=b.attest_current_drive(m,args[3],args[4]);self.assertEqual(m,before)
        self.assertEqual(a['manifest_sha256'],m['manifest_sha256'])

    def test_refresh_cannot_accept_a_changed_current_drive_revision(self):
        args=self.inputs();m,_,_=b.prepare(*args,'SYNTHETIC-001')
        args[4]['files'][0]['current_revision_id']='other-revision'
        with self.assertRaises(b.archive.k.Blocked):b.attest_current_drive(m,args[3],args[4])

    def test_new_or_multiple_drive_revisions_require_new_actual_byte_proof(self):
        for change in ['new','multiple']:
            args=self.inputs();revision=args[-1]['files'][0]
            if change=='new':revision['revisions'][0]['modified_at']='2099-01-01T00:00:00Z'
            else:revision['revisions'].append(copy.deepcopy(revision['revisions'][0]))
            with self.assertRaises(b.archive.k.Blocked):b.prepare(*args,'SYNTHETIC-001')

    def test_incomplete_byte_proof_or_wrong_parent_cannot_prepare(self):
        for change in ['proof','parent','hash']:
            args=self.inputs()
            if change=='proof':args[1]['proofs'][0]['archive_verification']['complete_decode']=False
            elif change=='parent':args[3][0]['parent_ids']=['wrong-folder']
            else:args[0]['objects'][0]['source_verification']['sha256']='0'*64
            with self.assertRaises(b.archive.k.Blocked):b.prepare(*args,'SYNTHETIC-001')

    def test_active_source_dependency_or_changed_pointer_is_excluded(self):
        for change in ['processing','pointer','duplicate']:
            args=self.inputs()
            if change=='processing':args[2]['jobs'][0]['status']='processing'
            elif change=='pointer':args[2]['registry'][0]['images']['icon_path']='other.webp'
            else:args[2]['jobs'].append(copy.deepcopy(args[2]['jobs'][0]))
            with self.assertRaises(b.archive.k.Blocked):b.prepare(*args,'SYNTHETIC-001')


if __name__=='__main__':unittest.main()

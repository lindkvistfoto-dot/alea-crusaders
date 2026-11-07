import io
import importlib.util
import os
import sys
import unittest
import urllib.error
from unittest.mock import patch
from pathlib import Path

os.environ.setdefault('SUPABASE_URL', 'https://example.test')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test-only')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import hermes_alea_worker as worker

class WorkerTest(unittest.TestCase):
    def job(self):
        ident='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        return {'id':ident,'requested_by':user,'source_path':user+'/'+ident+'/original','output_path':'trophy/'+ident+'.webp','source_sha256':worker.io.digest(b'original'),'source_bytes':8,'source_mime':'image/png','operation':'CREATE','state':'activated','lease_token':'lease','archive_drive_id':'fixed-existing-drive-id'}

    def test_archive_reuses_uploaded_copy_after_lost_ack(self):
        j=self.job()
        with patch.object(worker.io,'storage_download',return_value=b'original'),patch.object(worker,'upload_fixed_id') as upload,patch.object(worker,'verify_archive') as verify,patch.object(worker.io,'rest') as rest:
            worker.archive_job(j)
            upload.assert_not_called();verify.assert_called_once_with('fixed-existing-drive-id',j['source_sha256'])
            self.assertEqual(rest.call_args.args[0],'rpc/hermes_alea_archive_result')
            self.assertEqual(rest.call_args.args[2]['token'],'lease')

    def test_source_mismatch_never_archives_or_acknowledges(self):
        with patch.object(worker.io,'storage_download',return_value=b'bad'),patch.object(worker,'upload_fixed_id') as archive,patch.object(worker.io,'rest') as rest:
            with self.assertRaisesRegex(ValueError,'SOURCE_HASH'):worker.archive_job(self.job())
            archive.assert_not_called();rest.assert_not_called()

    def test_archive_failure_does_not_stop_batch(self):
        jobs=[self.job(),{**self.job(),'id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]
        with patch.object(worker,'archive_job',side_effect=[ValueError('ARCHIVE_HASH_MISMATCH'),None]) as run,patch.object(worker.io,'rest') as rest:
            failures=worker.archive_batch(jobs)
            self.assertEqual(run.call_count,2);self.assertEqual(len(failures),1)
            self.assertEqual(rest.call_args.args[2]['failure'],'ARCHIVE_HASH_MISMATCH')

    def test_report_mode_never_calls_cleanup(self):
        rows=[{'id':'id','source_candidate':True,'output_candidate':True,'abandoned_candidate':False}]
        with patch.object(worker,'all_rows',return_value=iter(rows)),patch.object(worker,'inventory',return_value={'objects':2,'orphans_for_review':0}),patch.object(worker,'cleanup_file') as delete,patch.object(worker,'write_heartbeat'):
            report=worker.cleanup_report()
            delete.assert_not_called();self.assertEqual(report['mode'],'report_only');self.assertEqual(report['output_candidates'],1)

    def test_cleanup_recovers_delete_before_ack(self):
        job=self.job();row={**job,'archive_drive_id':'drive','output_sha256':'f'*64}
        missing=urllib.error.HTTPError('https://example.test',404,'missing',{},None)
        with patch.object(worker,'verify_archive'),patch.object(worker.io,'rest',return_value=job) as rest,patch.object(worker.io,'storage_download',side_effect=missing),patch.object(worker.io,'fetch') as delete:
            worker.cleanup_file(row,'source')
            delete.assert_not_called();self.assertEqual(rest.call_args_list[0].args[2]['action'],'reserve');self.assertEqual(rest.call_args_list[-1].args[2]['action'],'ack')

    def test_hash_mismatch_keeps_reservation_and_does_not_delete(self):
        row={**self.job(),'archive_drive_id':'drive'}
        with patch.object(worker,'verify_archive'),patch.object(worker.io,'rest',return_value=row) as rest,patch.object(worker.io,'storage_download',return_value=b'changed'),patch.object(worker.io,'fetch') as delete:
            with self.assertRaisesRegex(ValueError,'DELETE_HASH'):worker.cleanup_file(row,'source')
            delete.assert_not_called();self.assertEqual(rest.call_count,1)

    def test_inventory_pages_actual_objects_and_counts_orphans(self):
        page=[{'job_id':'id'}]*500
        with patch.object(worker.io,'rest',side_effect=[page,[{'job_id':None}]]) as rest:
            report=worker.inventory();self.assertEqual(report,{'objects':501,'orphans_for_review':1});self.assertEqual(rest.call_args.args[2]['page_offset'],500)

    def test_fixed_id_upload_reuses_the_same_id_after_indeterminate_response(self):
        j=self.job()
        missing=urllib.error.HTTPError('https://drive.test',404,'missing',{},None)
        with patch.object(worker.io,'storage_download',return_value=b'original'),patch.object(worker,'verify_archive',side_effect=[missing,None]),patch.object(worker,'upload_fixed_id') as upload,patch.object(worker.io,'rest'):
            worker.archive_job(j)
            self.assertEqual(upload.call_args.args[2],'fixed-existing-drive-id')

    def test_intent_is_persisted_before_first_upload(self):
        j=self.job();j['archive_drive_id']=None
        missing=urllib.error.HTTPError('https://drive.test',404,'missing',{},None)
        worker.io.TOKEN='test-only'
        with patch.object(worker.io,'storage_download',return_value=b'original'),patch.object(worker.io,'fetch',return_value=b'{"ids":["new-fixed-drive-id"]}'),patch.object(worker,'verify_archive',side_effect=[missing,None]),patch.object(worker,'upload_fixed_id') as upload,patch.object(worker.io,'rest',return_value='new-fixed-drive-id') as rest:
            worker.archive_job(j)
            self.assertEqual(rest.call_args_list[0].args[0],'rpc/hermes_alea_archive_intent')
            self.assertEqual(upload.call_args.args[2],'new-fixed-drive-id')

    def test_missing_storage_error_accepts_only_explicit_not_found(self):
        missing=urllib.error.HTTPError('https://example.test',400,'missing',{},io.BytesIO(b'{"statusCode":"404","error":"not_found"}'))
        denied=urllib.error.HTTPError('https://example.test',400,'denied',{},io.BytesIO(b'{"statusCode":"403","error":"permission_denied"}'))
        self.assertTrue(worker.missing_storage_object(missing));self.assertFalse(worker.missing_storage_object(denied))

class AbandonedCleanupTest(unittest.TestCase):
    def row(self):
        job=WorkerTest().job()
        job.update({'state':'uploading','source_sha256':worker.io.digest(b'original'),
                    'output_sha256':worker.io.digest(b'webpdata')})
        return {**job,'abandoned_candidate':True,'source_candidate':False,'output_candidate':False}

    def missing(self):
        return urllib.error.HTTPError('https://storage.test/object',404,'missing',{},None)

    def test_abandoned_cleanup_deletes_both_objects_before_ack(self):
        row=self.row()
        with patch.object(worker.io,'rest',side_effect=[row,row]) as rest, \
             patch.object(worker.io,'storage_download',side_effect=[b'original',self.missing(),b'webpdata',self.missing()]), \
             patch.object(worker.io,'fetch',return_value=b'') as delete:
            worker.cleanup_abandoned_file(row)
        self.assertEqual(rest.call_args_list[0].args[2]['action'],'reserve')
        self.assertEqual(rest.call_args_list[-1].args[2]['action'],'ack')
        self.assertEqual(delete.call_count,2)
        self.assertIn(row['source_path'],delete.call_args_list[0].args[2].decode())
        self.assertIn(row['output_path'],delete.call_args_list[1].args[2].decode())

    def test_abandoned_cleanup_acknowledges_objects_already_missing(self):
        row=self.row()
        with patch.object(worker.io,'rest',side_effect=[row,row]) as rest, \
             patch.object(worker.io,'storage_download',side_effect=[self.missing(),self.missing()]), \
             patch.object(worker.io,'fetch') as delete:
            worker.cleanup_abandoned_file(row)
        delete.assert_not_called()
        self.assertEqual(rest.call_args_list[-1].args[2]['action'],'ack')

    def test_abandoned_hash_mismatch_never_deletes_or_acknowledges(self):
        row=self.row()
        with patch.object(worker.io,'rest',return_value=row) as rest, \
             patch.object(worker.io,'storage_download',return_value=b'unexpected'), \
             patch.object(worker.io,'fetch') as delete:
            with self.assertRaisesRegex(ValueError,'DELETE_HASH_MISMATCH'):
                worker.cleanup_abandoned_file(row)
        delete.assert_not_called()
        self.assertEqual(rest.call_count,1)

    def test_report_only_lists_abandoned_jobs_without_deleting(self):
        row=self.row()
        with patch.object(worker,'all_rows',return_value=iter([row])), \
             patch.object(worker,'inventory',return_value={'objects':0,'orphans_for_review':0}), \
             patch.object(worker,'cleanup_abandoned_file') as cleanup, \
             patch.object(worker,'write_heartbeat'):
            report=worker.cleanup_report(environment='DEV')
        cleanup.assert_not_called()
        self.assertEqual(report['abandoned_candidates'],1)
        self.assertEqual(report['mode'],'report_only')

    def test_qualified_cleanup_failure_creates_alert(self):
        row=self.row()
        with patch.object(worker,'all_rows',return_value=iter([row])), \
             patch.object(worker,'inventory',return_value={'objects':0,'orphans_for_review':0}), \
             patch.object(worker,'cleanup_abandoned_file',side_effect=ValueError('DELETE_READBACK_FAILED')), \
             patch.object(worker,'report_alert') as alert, patch.object(worker,'write_heartbeat'):
            report=worker.cleanup_report(execute=True,environment='DEV')
        self.assertEqual(report['failures'][0]['kind'],'abandoned')
        alert.assert_called_once()
        self.assertEqual(alert.call_args.args[1],'hermes-alea:dev:abandoned:'+row['id'])
        self.assertEqual(alert.call_args.args[2],'critical')

    def test_successful_cleanup_resolves_incident_alert(self):
        row=self.row()
        with patch.object(worker,'all_rows',return_value=iter([row])), \
             patch.object(worker,'inventory',return_value={'objects':0,'orphans_for_review':0}), \
             patch.object(worker,'cleanup_abandoned_file'), patch.object(worker,'resolve_alert') as resolve, \
             patch.object(worker,'write_heartbeat'):
            report=worker.cleanup_report(execute=True,environment='DEV')
        resolve.assert_called_once_with('hermes-alea:dev:abandoned:'+row['id'])
        self.assertEqual(report['abandoned_cleaned'],1)
        self.assertEqual(report['failures'],[])

    def test_active_job_is_not_selected_as_abandoned(self):
        row=self.row();row.update({'state':'activated','abandoned_candidate':False})
        with patch.object(worker,'all_rows',return_value=iter([row])), \
             patch.object(worker,'inventory',return_value={'objects':0,'orphans_for_review':0}), \
             patch.object(worker,'cleanup_abandoned_file') as cleanup, \
             patch.object(worker,'write_heartbeat'):
            report=worker.cleanup_report(execute=True,environment='DEV')
        cleanup.assert_not_called()
        self.assertEqual(report['abandoned_cleaned'],0)

if __name__=='__main__':unittest.main()

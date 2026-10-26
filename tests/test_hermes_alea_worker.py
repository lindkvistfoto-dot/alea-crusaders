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
        with patch.object(worker,'all_rows',return_value=iter(rows)),patch.object(worker,'inventory',return_value={'objects':2,'orphans_for_review':0}),patch.object(worker,'cleanup_file') as delete:
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

if __name__=='__main__':unittest.main()

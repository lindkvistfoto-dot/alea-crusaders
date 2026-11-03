#!/usr/bin/env python3
"""SKYLLA FAST LANE 2.0: one fixed batch, one capability, durable resume.

Preparation and issuance never delete. A trusted deployment must bind the exact
manifest and capability descriptor. Only an explicit matching owner approval
allows issuance of an execute capability. No Storage/Drive key enters this tool.
"""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import urllib.request
import urllib.error

import skylla_archive as archive
import skylla_scoped_verify as access

PROJECT = 'wbmosmkirsitkonejzpg'
BUCKET = 'alea-hermes-source'
ENDPOINT = f'https://{PROJECT}.supabase.co/functions/v1/skylla-batch'
SCHEMA = 'skylla-fast-lane-batch/v2'


class AuthorizationUnavailable(archive.k.Blocked):
    pass


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


def stamp(value):
    return datetime.fromisoformat(value.replace(' UTC', '+00:00').replace('Z', '+00:00'))


def validate_manifest(manifest):
    payload = {k:v for k,v in manifest.items() if k != 'manifest_sha256'}
    entries = manifest.get('entries', [])
    if (manifest.get('schema') != SCHEMA or manifest.get('project_id') != PROJECT
            or manifest.get('bucket') != BUCKET or manifest.get('approval_required') is not True
            or manifest.get('manifest_sha256') != digest(payload) or not 1 <= len(entries) <= 100
            or len({e['id'] for e in entries}) != len(entries)
            or len({e['object_path'] for e in entries}) != len(entries)):
        raise archive.k.Blocked('INVALID_FIXED_BATCH')
    folders = load(archive.ROOT / 'config/hermes-drive-folders.json')
    for e in entries:
        parts = e['object_path'].split('/')
        archive.validate_descriptor({'bucket':BUCKET,'kind':parts[0],'target_key':parts[1],
            'object_path':e['object_path'],'expected_sha256':e['sha256'],'expected_size_bytes':e['size_bytes'],
            'inbox_file_id':e['inbox_file_id'],'target_folder_id':e['drive']['parent_id']}, folders)
        if (e['bucket'] != BUCKET or e['id'] != hashlib.sha256(e['object_path'].encode()).hexdigest()
                or e['drive']['file_id'] == e['inbox_file_id'] or e['drive']['sha256'] != e['sha256']
                or not e['drive']['revision_id'] or e.get('complete_decode') is not True
                or not e.get('source_identity', {}).get('id') or not e['source_identity'].get('etag')
                or not e['source_identity'].get('version')
                or e['source_identity']['size_bytes'] != e['size_bytes']):
            raise archive.k.Blocked('INVALID_OBJECT_OR_BYTE_PROOF')


def revision_set(manifest):
    return digest(sorted([{'file_id':e['drive']['file_id'], 'revision_id':e['drive']['revision_id']}
                          for e in manifest['entries']], key=lambda x:x['file_id']))


def attest_current_drive(manifest,native,revisions):
    """Refresh provider observations without changing an owner-approved manifest."""
    validate_manifest(manifest)
    metadata={m['id']:m for m in native};files={f['file_id']:f for f in revisions['files']}
    if len(metadata)!=len(native) or len(files)!=len(revisions['files']):
        raise archive.k.Blocked('AMBIGUOUS_DRIVE_OBSERVATIONS')
    for entry in manifest['entries']:
        d=entry['drive'];m=metadata.get(d['file_id'],{});r=files.get(d['file_id'],{})
        current=next((v for v in r.get('revisions',[]) if v['id']==r.get('current_revision_id')), {})
        if (r.get('current_revision_id')!=d['revision_id'] or m.get('mime_type')!='image/png'
                or int(m.get('size',-1))!=entry['size_bytes'] or d['parent_id'] not in m.get('parent_ids',[])
                or m.get('title')!=entry['sha256']+'.png' or m.get('shared') is not False
                or current.get('size_bytes')!=entry['size_bytes']):
            raise archive.k.Blocked('CURRENT_PERMANENT_DRIVE_REVISION_CHANGED')
    return {'manifest_sha256':manifest['manifest_sha256'],'observed_at':revisions['observed_at'],
            'revision_set_sha256':revision_set(manifest),'all_permanent_ids_and_parents_checked':True}


def prepare(source_manifest, readbacks, snapshot, native, revisions, batch_id, limit=100):
    """Reuse complete byte proofs only for a single unchanged binary revision.

    Legacy Supabase proofs lack an object-version binding: the server must hash
    those bytes once and issue a signed version-bound reusable receipt.
    """
    if not 1 <= limit <= 100:
        raise archive.k.Blocked('MAXIMUM_100_OBJECTS')
    objects = {o['object_path']:o for o in snapshot['objects']}
    jobs = {j['id']:j for j in snapshot['jobs']}
    proofs = {p.get('object_path',p.get('descriptor',{}).get('object_path')):p for p in readbacks['proofs']}
    meta = {m['id']:m for m in native}
    rev = {r['file_id']:r for r in revisions['files']}
    selected, blocked = [], []
    for row in sorted(source_manifest['objects'], key=lambda r:(-r['size_bytes'],r['object_path'])):
        if len(selected) >= limit:
            break
        path = row['object_path']
        if row.get('supabase_present') is False or path not in objects:
            continue
        try:
            p=proofs[path];m=meta[p['permanent_drive_file_id']];r=rev[m['id']]
            source=objects[path];job=jobs[row['hermes_job']['id']]
            sha=row['source_actual_sha256'];size=row['size_bytes']
            # A single binary revision predating the actual full readback can be
            # bound to that proof without downloading the same PNG again.
            if (len(r['revisions']) != 1 or r['current_revision_id'] != r['revisions'][0]['id']
                    or stamp(r['revisions'][0]['modified_at']) > stamp(p['verified_at'])
                    or int(r['revisions'][0]['size_bytes']) != size
                    or m['mime_type'] != 'image/png' or int(m['size']) != size
                    or p['target_folder_id'] not in m['parent_ids'] or m.get('shared') is not False
                    or m['title'] != sha+'.png' or p['archive_status'] != 'verified_readback'
                    or p['drive_sha256'] != sha or p['bytes_equal'] is not True
                    or p['archive_verification']['complete_decode'] is not True
                    or p['archive_verification']['sha256'] != sha
                    or row['source_verification']['complete_decode'] is not True
                    or row['source_verification']['sha256'] != sha or source['size_bytes'] != size):
                raise archive.k.Blocked('REVISION_OR_BYTE_PROOF_MISMATCH')
            links=row['registry_link']['matching_current_records']
            if job['status'] != 'active' or len(links) != 1 or row.get('historical_version_review_required'):
                raise archive.k.Blocked('UNFINISHED_OR_HISTORICAL_DEPENDENCY')
            link=links[0]
            registry=next(v for v in snapshot['registry'] if v['table']==link['table'] and v['id']==link['id'])
            if (registry['images'].get(link['field']) != job['app_path'] or job['source_path'] != path
                    or job['source_sha256'] != sha or any(path in canonical(v['images']).decode() for v in snapshot['registry'])
                    or len([j for j in snapshot['jobs'] if j['source_path']==path]) != 1):
                raise archive.k.Blocked('ACTIVE_SOURCE_CONSUMER_OR_REFERENCE_CHANGED')
            selected.append({'id':hashlib.sha256(path.encode()).hexdigest(),'bucket':BUCKET,'object_path':path,
                'sha256':sha,'size_bytes':size,'inbox_file_id':p['inbox_file_id'],'complete_decode':True,
                'source_identity':{'id':source['id'],'version':source['version'],
                    'etag':source['metadata']['eTag'],
                    # Storage.info last_modified is the database modification
                    # time at millisecond precision, not S3 metadata.lastModified.
                    'last_modified':stamp(source['updated_at']).isoformat(timespec='milliseconds'),'size_bytes':size},
                'drive':{'file_id':m['id'],'parent_id':p['target_folder_id'],'revision_id':r['current_revision_id'],
                    'revision_modified_at':r['revisions'][0]['modified_at'],'sha256':sha,'size_bytes':size,
                    'full_readback_at':p['verified_at'],'full_readback_receipt_sha256':digest(p)},
                'dependency':{'job_id':job['id'],'kind':job['kind'],'target_key':job['target_key'],
                    'app_path':job['app_path'],'app_sha256':job['app_sha256'],'registry_table':link['table'],
                    'registry_id':link['id'],'registry_field':link['field']}})
        except (KeyError, StopIteration, TypeError, ValueError, archive.k.Blocked):
            blocked.append(path)
    result={'schema':SCHEMA,'batch_id':batch_id,'project_id':PROJECT,'bucket':BUCKET,
        'approval_required':True,'prepared_at':archive.k.now(),'entries':selected,
        'baseline_source_objects':len(snapshot['objects']),
        'baseline_source_bytes':sum(o['size_bytes'] for o in snapshot['objects']),
        'potential_reclaimable_bytes':sum(e['size_bytes'] for e in selected),
        'independent_backup_waiver':'https://github.com/lindkvistfoto-dot/alea-crusaders/issues/123',
        'hermes_bundle_sha256':'ecb00dd50723399e02ad4e5c32bf5128077abedf7a58f374436507ca647c20d9'}
    result['manifest_sha256']=digest(result)
    validate_manifest(result)
    attestation=attest_current_drive(result,native,revisions)
    return result, attestation, blocked


def issue(manifest, drive_attestation, token_file, descriptor_file, minutes=60, owner_approval=None):
    validate_manifest(manifest)
    now=datetime.now(timezone.utc)
    age=(now-stamp(drive_attestation['observed_at'])).total_seconds()
    if (not 1 <= minutes <= 60 or not 0 <= age <= 600
            or drive_attestation.get('manifest_sha256') != manifest['manifest_sha256']
            or drive_attestation.get('revision_set_sha256') != revision_set(manifest)
            or drive_attestation.get('all_permanent_ids_and_parents_checked') is not True):
        raise archive.k.Blocked('FRESH_CURRENT_DRIVE_REVISIONS_REQUIRED')
    if owner_approval is not None and (owner_approval.get('owner_approved') is not True
            or owner_approval.get('manifest_sha256') != manifest['manifest_sha256']
            or owner_approval.get('object_count') != len(manifest['entries'])):
        raise archive.k.Blocked('EXACT_BATCH_OWNER_APPROVAL_REQUIRED')
    token_file=access.safe_path(token_file,private=True);descriptor_file=access.safe_path(descriptor_file)
    if token_file.exists() or descriptor_file.exists():
        raise archive.k.Blocked('EXCLUSIVE_NEW_AUTHORIZATION_FILES_REQUIRED')
    token=secrets.token_urlsafe(32)
    descriptor={'enabled':True,'operation':'execute' if owner_approval else 'verify_only',
        'owner_approved_manifest_sha256':manifest['manifest_sha256'] if owner_approval else None,
        'manifest_sha256':manifest['manifest_sha256'],'token_sha256':hashlib.sha256(token.encode()).hexdigest(),
        'not_before':(now-timedelta(seconds=2)).isoformat(),'expires_at':(now+timedelta(minutes=minutes)-timedelta(seconds=2)).isoformat(),
        'drive_checked_at':drive_attestation['observed_at'],'drive_revision_set_sha256':revision_set(manifest)}
    with os.fdopen(os.open(token_file,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w') as f:
        f.write(token);f.flush();os.fsync(f.fileno())
    atomic_json(descriptor_file,descriptor)
    return descriptor


def atomic_json(path,value):
    path=Path(path);temp=path.with_name(path.name+'.'+secrets.token_hex(6)+'.tmp')
    with temp.open('x') as f:
        json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
    os.replace(temp,path)
    fd=os.open(path.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def deployment(manifest=None,descriptor=None):
    """Public, self-contained MCP deployment request; never includes a token/key.

    No arguments yields the disabled endpoint with an empty manifest. Deployment
    still requires the existing trusted project-management connector.
    """
    base=archive.ROOT/'supabase/functions'
    if manifest is not None:
        validate_manifest(manifest)
        if (descriptor.get('enabled') is not True
                or descriptor.get('manifest_sha256')!=manifest['manifest_sha256']
                or descriptor.get('operation') not in ['verify_only','execute']
                or (descriptor['operation']=='execute' and
                    descriptor.get('owner_approved_manifest_sha256')!=manifest['manifest_sha256'])):
            raise archive.k.Blocked('DEPLOYMENT_AUTHORIZATION_MISMATCH')
    names=['skylla-batch/index.ts','skylla-batch/deno.json','skylla-batch/folders.json',
           'skylla-verify/core.mjs','skylla-verify/batch.mjs']
    files=[{'name':name,'content':(base/name).read_text()} for name in names]
    files.extend([{'name':'skylla-batch/plan.json','content':json.dumps(manifest or {'schema':SCHEMA,'entries':[]})},
                  {'name':'skylla-batch/capability.json','content':json.dumps(descriptor or {'enabled':False})}])
    return {'project_id':PROJECT,'name':'skylla-batch','entrypoint_path':'skylla-batch/index.ts',
            'import_map_path':'skylla-batch/deno.json','verify_jwt':False,'files':files}


def transfer(token,manifest,entry,action,receipt=None):
    request=urllib.request.Request(ENDPOINT,data=canonical({'manifest_sha256':manifest['manifest_sha256'],
        'id':entry['id'],'action':action,'receipt':receipt}),method='POST',
        headers={'Content-Type':'application/json','X-SKYLLA-Capability':token})
    try:
        with urllib.request.build_opener(archive.k.NoRedirect()).open(request,timeout=60) as response:
            raw=response.read(65537)
            if response.status!=200 or len(raw)>65536:raise ValueError()
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        if error.code in (401,403,503):
            raise AuthorizationUnavailable('BATCH_AUTHORIZATION_UNAVAILABLE') from None
        raise archive.k.Blocked('TRANSPORT_OUTCOME_UNKNOWN') from None
    except Exception:
        raise archive.k.Blocked('TRANSPORT_OUTCOME_UNKNOWN') from None


def validate_result(result,entry,manifest):
    if (result.get('manifest_sha256')!=manifest['manifest_sha256'] or result.get('id')!=entry['id']
            or result.get('object_path')!=entry['object_path'] or result.get('size_bytes')!=entry['size_bytes']
            or result.get('sha256')!=entry['sha256'] or result.get('bucket')!=BUCKET
            or result.get('status') not in ['verified','deleted','absent','present','skipped','outcome_unknown']):
        raise archive.k.Blocked('SERVER_RESPONSE_IDENTITY_MISMATCH')
    if result['status'] in ('deleted','absent') and result.get('absence_verified') is not True:
        raise archive.k.Blocked('ABSENCE_NOT_VERIFIED')


class Journal:
    def __init__(self,directory,manifest):
        self.root=access.safe_path(directory,private=True)
        self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        if any((self.root/name).is_symlink() for name in ['lock','manifest-sha256','events.jsonl']):
            raise archive.k.Blocked('JOURNAL_SYMLINK_FORBIDDEN')
        self.lock=(self.root/'lock').open('a')
        try:fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise archive.k.Blocked('BATCH_ALREADY_RUNNING') from None
        try:self.open_files(manifest)
        except BaseException:
            fcntl.flock(self.lock,fcntl.LOCK_UN);self.lock.close()
            raise

    def open_files(self,manifest):
        self.hash=manifest['manifest_sha256'];self.events=[]
        path=self.root/'events.jsonl'
        if path.exists():
            data=path.read_bytes()
            # An incomplete final record can only result from interrupted write.
            # Preserve it separately, truncate only the torn tail; the preceding
            # durable intent forces a status reconciliation on resume.
            if data and not data.endswith(b'\n'):
                cut=data.rfind(b'\n')+1
                tail=self.root/('torn-tail-'+secrets.token_hex(4)+'.bin')
                with tail.open('xb') as f:f.write(data[cut:])
                with path.open('r+b') as f:f.truncate(cut);f.flush();os.fsync(f.fileno())
                data=data[:cut]
            self.events=[json.loads(line) for line in data.splitlines()]
            if any(e.get('manifest_sha256')!=self.hash for e in self.events):
                raise archive.k.Blocked('JOURNAL_BELONGS_TO_DIFFERENT_BATCH')
        marker=self.root/'manifest-sha256'
        if marker.exists() and marker.read_text()!=self.hash:
            raise archive.k.Blocked('JOURNAL_BELONGS_TO_DIFFERENT_BATCH')
        if not marker.exists():
            with marker.open('x') as f:f.write(self.hash);f.flush();os.fsync(f.fileno())
        self.stream=path.open('ab',buffering=0)

    def append(self,event):
        event={**event,'manifest_sha256':self.hash,'recorded_at':archive.k.now()}
        self.stream.write(canonical(event)+b'\n');os.fsync(self.stream.fileno());self.events.append(event)
        fd=os.open(self.root,os.O_RDONLY)
        try:os.fsync(fd)
        finally:os.close(fd)

    def close(self):
        self.stream.close();fcntl.flock(self.lock,fcntl.LOCK_UN);self.lock.close()


def run(manifest,token_file,journal_dir,verify_only=False,initial_receipts=None,send=transfer,token_loader=access.read_token):
    validate_manifest(manifest);token=token_loader(token_file)
    seeds={r['id']:r.get('verification_receipt') for r in (initial_receipts or [])}
    journal=Journal(journal_dir,manifest);interrupted=False;consecutive_transfer_failures=0
    results={}
    try:
        for entry in manifest['entries']:
            identity=entry['id'];events=[e for e in journal.events if e.get('id')==identity]
            prior=[e['result'] for e in events if e['kind']=='result']
            prior_receipt=next((p.get('verification_receipt') for p in reversed(prior) if p.get('verification_receipt')),seeds.get(identity))
            had_delete=any(e['kind']=='intent' and e.get('action')=='execute' for e in events)
            action='verify' if verify_only else 'execute'
            try:
                # An explicitly skipped, already-absent object cannot later be
                # attributed to our deletion merely because an intent was saved.
                if prior and prior[-1].get('reason')=='ALREADY_ABSENT_NO_DELETE_SENT':
                    results[identity]=prior[-1];continue
                # Every resumed deletion intent is reconciled, including a
                # previously successful result. Never send an unknown DELETE twice.
                if had_delete:
                    current=send(token,manifest,entry,'status',prior_receipt);validate_result(current,entry,manifest)
                    journal.append({'kind':'result','id':identity,'result':current})
                    if current['status']=='absent':
                        results[identity]=current;continue
                    if current['status']!='present' or not current.get('identity_unchanged'):
                        results[identity]={**current,'status':'skipped','reason':'CHANGED_OR_UNKNOWN_ON_RESUME'};continue
                    # Successful old deletion followed by object recreation is a
                    # new lifecycle, even if content matches. It needs new approval.
                    if any(p['status'] in ['deleted','absent'] for p in prior):
                        results[identity]={**current,'status':'skipped','reason':'RECREATED_AFTER_COMPLETION'};continue
                journal.append({'kind':'intent','id':identity,'action':action,'object_path':entry['object_path']})
                result=send(token,manifest,entry,action,prior_receipt);validate_result(result,entry,manifest)
                consecutive_transfer_failures=0
                journal.append({'kind':'result','id':identity,'result':result})
                results[identity]=result
            except AuthorizationUnavailable:
                result={'id':identity,'object_path':entry['object_path'],
                        'status':'outcome_unknown' if action=='execute' else 'skipped',
                        'reason':'BATCH_AUTHORIZATION_UNAVAILABLE','size_bytes':entry['size_bytes']}
                journal.append({'kind':'result','id':identity,'result':result});results[identity]=result
                break
            except archive.k.Blocked:
                consecutive_transfer_failures+=1
                result={'id':identity,'object_path':entry['object_path'],'status':'outcome_unknown',
                        'reason':'RECONCILE_ON_RESUME','size_bytes':entry['size_bytes']}
                journal.append({'kind':'result','id':identity,'result':result});results[identity]=result
                if consecutive_transfer_failures>=3:break
            # One summary replacement after each object; no need to wait for 100.
            write_report(journal,manifest,results,verify_only,False)
    except KeyboardInterrupt:
        interrupted=True
    finally:
        report=write_report(journal,manifest,results,verify_only,interrupted)
        journal.close()
    return report


def write_report(journal,manifest,results,verify_only,interrupted):
    removed=[r for r in results.values() if r['status'] in ('deleted','absent') and r.get('absence_verified')]
    # Count only objects from this batch's bound, existing baseline and only once.
    reclaimed=sum(r['size_bytes'] for r in removed) if not verify_only else 0
    report={'schema':'skylla-batch-report/v2','batch_id':manifest['batch_id'],
        'manifest_sha256':manifest['manifest_sha256'],'mode':'verify_only' if verify_only else 'execute',
        'observed_at':archive.k.now(),'interrupted':interrupted,'object_count':len(manifest['entries']),
        'results':list(results.values()),'verified':sum(r['status']=='verified' for r in results.values()),
        'confirmed_deleted_this_run':sum(r['status']=='deleted' for r in results.values()),
        'verified_absent_in_batch':len(removed),'reclaimed_object_bytes_verified':reclaimed,
        'skipped':sum(r['status']=='skipped' for r in results.values()),
        'unknown':sum(r['status']=='outcome_unknown' for r in results.values()),
        'not_attempted':len(manifest['entries'])-len(results),'further_deletion_authorized':False}
    atomic_json(journal.root/'REPORT.json',report)
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('prepare')
    for key in ['source_manifest','readbacks','snapshot','native','revisions','output']:p.add_argument('--'+key.replace('_','-'),type=Path,required=True)
    p.add_argument('--batch-id',required=True);p.add_argument('--limit',type=int,default=100)
    p=sub.add_parser('attest')
    for key in ['manifest','native','revisions','output']:p.add_argument('--'+key,type=Path,required=True)
    p=sub.add_parser('issue')
    for key in ['manifest','drive_attestation','token_file','descriptor_file']:p.add_argument('--'+key.replace('_','-'),type=Path,required=True)
    p.add_argument('--owner-approval',type=Path);p.add_argument('--minutes',type=int,default=60)
    p.add_argument('--deployment-output',type=Path)
    p=sub.add_parser('disable-bundle')
    p.add_argument('--output',type=Path,required=True)
    p=sub.add_parser('run')
    for key in ['manifest','token_file','journal']:p.add_argument('--'+key.replace('_','-'),type=Path,required=True)
    p.add_argument('--verify-only',action='store_true');p.add_argument('--receipts',type=Path)
    args=parser.parse_args()
    try:
        if args.command=='prepare':
            values=[load(getattr(args,k)) for k in ['source_manifest','readbacks','snapshot','native','revisions']]
            m,a,blocked=prepare(*values,args.batch_id,args.limit)
            args.output.mkdir(parents=True,exist_ok=False);atomic_json(args.output/'SKYLLA_BATCH_001.json',m)
            atomic_json(args.output/'DRIVE_ATTESTATION.json',a)
            print(json.dumps({'objects':len(m['entries']),'bytes':m['potential_reclaimable_bytes'],'manifest_sha256':m['manifest_sha256'],'owner_approved':False}))
        elif args.command=='attest':
            atomic_json(args.output,attest_current_drive(load(args.manifest),load(args.native),load(args.revisions)))
            print(json.dumps({'manifest_unchanged':True,'drive_identity_checked':True}))
        elif args.command=='issue':
            m=load(args.manifest)
            c=issue(m,load(args.drive_attestation),args.token_file,args.descriptor_file,args.minutes,
                    load(args.owner_approval) if args.owner_approval else None)
            if args.deployment_output:atomic_json(args.deployment_output,deployment(m,c))
            print(json.dumps({'operation':c['operation'],'expires_at':c['expires_at'],'secret_printed':False}))
        elif args.command=='disable-bundle':
            atomic_json(args.output,deployment());print(json.dumps({'deployment_enabled':False,'objects':0}))
        else:
            seed=load(args.receipts)['results'] if args.receipts else None
            r=run(load(args.manifest),args.token_file,args.journal,args.verify_only,seed)
            print(json.dumps({k:r[k] for k in ['mode','object_count','verified','verified_absent_in_batch','reclaimed_object_bytes_verified','skipped','unknown','not_attempted','interrupted']}))
    except Exception:
        parser.exit(2,'SKYLLA_BLOCKED:BATCH_CONFIGURATION_OR_TRANSPORT_FAILED\n')

// HERMES CORE -> existing HERMES ALEA archive worker job contract.
// This is a compatibility boundary, not a second queue or worker.
// The caller must create the job using the existing authorized hermes_alea_begin RPC.
export function createSharedArchiveJob({begin}) {
 if(typeof begin!=='function') throw new TypeError('Existing ALEA begin RPC required');
 return async function register({targetKind,targetId,revision,operation,sourceSha256,outputSha256,sourceMime,sourceBytes,outputBytes,idempotencyKey}) {
  // This adapter only supports targets registered in the current ALEA RPC.
  // Troferummet system assets require a reviewed server-side target adapter.
  if(!['definition','relief'].includes(targetKind)) throw new Error('Target not yet registered in shared ALEA archive RPC');
  if(!['CREATE','REPLACE'].includes(operation)) throw new Error('Unsupported archive operation');
  if(!/^[a-f0-9]{64}$/.test(sourceSha256)||!/^[a-f0-9]{64}$/.test(outputSha256))
   throw new Error('Invalid image digests');
  if(!['image/png','image/jpeg','image/webp'].includes(sourceMime)) throw new Error('Invalid source MIME');
  const job=await begin({request:{
   target_kind:targetKind,target_id:targetId,expected_revision:revision,operation,
   source_sha256:sourceSha256,output_sha256:outputSha256,source_mime:sourceMime,
   source_bytes:sourceBytes,output_bytes:outputBytes,idempotency_key:idempotencyKey
  }});
  if(!job?.id||job.target_kind!==targetKind||job.target_id!==targetId||
     !job.source_path||!job.output_path) throw new Error('Shared archive job not confirmed');
  return job;
 };
}

/** Run inside a trusted operator session using its existing Supabase client.
 * No key/token parameter, no new login, no storage writes or signed links.
 * Save the returned receipts locally; do not treat them as delete permission.
 */
export function createAleaSkyllaClient({getToken, getPublishableKey, fetcher = fetch}) {
  return {functions:{invoke:async (name, options) => {
    if (name !== 'skylla-verify' || Object.keys(options.body).sort().join(',') !== 'id,plan_sha256') {
      throw new Error('READ_ONLY_FIXED_VERIFIER_REQUIRED');
    }
    const token = await getToken();
    if (!token) throw new Error('OPERATOR_LOGIN_REQUIRED');
    const response = await fetcher('https://wbmosmkirsitkonejzpg.supabase.co/functions/v1/skylla-verify', {
      method:'POST', redirect:'error', signal:options.signal || AbortSignal.timeout(30000),
      headers:{authorization:'Bearer '+token,apikey:await getPublishableKey(),'content-type':'application/json'},
      body:JSON.stringify(options.body)});
    // Never reflect provider bodies/errors. A failed object gets a blocked receipt.
    if (!response.ok) return {data:null,error:{code:'VERIFIER_REQUEST_FAILED',
      stop_batch:response.status !== 422}};
    return {data:await response.json(),error:null};
  }}};
}

export async function verifySkyllaPlan(client, plan, {onReceipt = () => {}, signal} = {}) {
  if (plan.schema !== 'skylla-server-allowlist/v1' || plan.project_id !== 'wbmosmkirsitkonejzpg') {
    throw new Error('FIXED_SKYLLA_PLAN_REQUIRED');
  }
  const receipts = [];
  for (const entry of plan.entries) {
    if (signal?.aborted) break;
    let receipt, stopBatch = true;
    try {
      // functions.invoke attaches the caller's existing session. No service key
      // or 519 signed object URLs ever leave the Supabase project.
      const {data, error} = await client.functions.invoke('skylla-verify', {
        body:{id:entry.id, plan_sha256:plan.plan_sha256}, ...(signal ? {signal} : {})});
      if (error) { stopBatch = error.stop_batch !== false; throw new Error('VERIFIER_REQUEST_FAILED'); }
      if (error || !data || data.schema !== 'skylla-server-verification/v1' ||
          data.plan_sha256 !== plan.plan_sha256 || data.id !== entry.id ||
          data.project_id !== plan.project_id || data.bucket !== entry.bucket ||
          data.object_path !== entry.object_path || data.sha256 !== entry.sha256 ||
          data.drive_sha256 !== entry.sha256 || data.size_bytes !== entry.size_bytes ||
          data.permanent_drive_file_id !== entry.permanent_drive_file_id ||
          data.complete_decode !== true || data.status !== 'verified_complete' ||
          data.safe_to_delete !== false || data.deletion_authorized !== false ||
          !Number.isFinite(Date.parse(data.verified_at))) throw new Error('INVALID_VERIFICATION_RECEIPT');
      receipt = data;
      stopBatch = false;
    } catch {
      receipt = {id:entry.id, object_path:entry.object_path, status:'blocked',
        error:'OPERATOR_VERIFICATION_FAILED',safe_to_delete:false};
    }
    receipts.push(receipt);
    await onReceipt(receipt);
    // Stop access/expiry/transport failures; do not repeat them 519 times.
    if (stopBatch) break;
  }
  return {schema:'skylla-operator-receipts/v1',plan_sha256:plan.plan_sha256,
    receipts,safe_to_delete:false,deletion_authorized:false};
}

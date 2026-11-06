#!/usr/bin/env node
const PROJECT = 'wkiuyklzzroavclnsxna';
const SUPABASE = `https://${PROJECT}.supabase.co`;
const EXPECTED_EMAIL = 'alea-dev-e2e@alea-crusaders.test';
const email = (process.env.ALEA_DEV_TEST_EMAIL || EXPECTED_EMAIL).trim().toLowerCase();
const password = process.env.ALEA_DEV_TEST_PASSWORD || '';
const secretKey = process.env.ALEA_DEVELOPMENT_SUPABASE_SECRET_KEY || '';

function assert(ok, message) { if (!ok) throw new Error(message); }
async function request(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`DEV_ADMIN_API_${response.status}`);
  return response.status === 204 ? null : response.json();
}
const adminHeaders = () => ({
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json'
});
async function main() {
  assert(secretKey, 'MISSING_DEV_ADMIN_SECRET');
  assert(email === EXPECTED_EMAIL, 'UNEXPECTED_DEV_TEST_ACCOUNT');
  if (password && password.length < 16) throw new Error('DEV_TEST_PASSWORD_TOO_SHORT');

  const list = await request(SUPABASE + '/auth/v1/admin/users?page=1&per_page=1000', {
    headers: adminHeaders()
  });
  const user = list.users?.find(item => item.email?.toLowerCase() === EXPECTED_EMAIL);
  assert(user?.id, 'EXISTING_DEV_TEST_ACCOUNT_NOT_FOUND');

  const authUpdate = { ban_duration: 'none', email_confirm: true };
  if (password) authUpdate.password = password;
  await request(SUPABASE + '/auth/v1/admin/users/' + encodeURIComponent(user.id), {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(authUpdate)
  });

  const profileUrl = SUPABASE + '/rest/v1/profiles?select=id,is_admin&id=eq.' + encodeURIComponent(user.id);
  const profiles = await request(profileUrl, { headers: adminHeaders() });
  assert(Array.isArray(profiles) && profiles.length === 1, 'DEV_TEST_PROFILE_NOT_FOUND');
  if (profiles[0].is_admin !== true) {
    await request(SUPABASE + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id), {
      method: 'PATCH',
      headers: { ...adminHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({ is_admin: true })
    });
  }

  const verifiedProfiles = await request(profileUrl, { headers: adminHeaders() });
  const verifiedUsers = await request(SUPABASE + '/auth/v1/admin/users/' + encodeURIComponent(user.id), {
    headers: adminHeaders()
  });
  assert(verifiedProfiles?.[0]?.is_admin === true, 'DEV_ALEA_ADMIN_ROLE_NOT_SET');
  assert(!verifiedUsers?.banned_until, 'DEV_TEST_ACCOUNT_STILL_BANNED');
  console.log(JSON.stringify({ result: 'PASS', account: 'existing-dev-test-account', active: true, aleaAdmin: true }));
}
main().catch(error => {
  console.error(JSON.stringify({ result: 'FAIL', failure: String(error.message || 'PROVISION_FAILED').slice(0, 100) }));
  process.exitCode = 1;
});

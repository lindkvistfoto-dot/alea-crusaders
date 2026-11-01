import {describe,expect,it} from 'vitest';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {verifyGitHubActionsOidcToken} from '../supabase/functions/olympia-candidate-bridge/oidc.ts';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');

async function signedToken(audience='alea-olympia-candidate-pr') {
  const keyPair=await webcrypto.subtle.generateKey(
    {name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:Uint8Array.of(1,0,1),hash:'SHA-256'},
    true,
    ['sign','verify']
  );
  const jwk=await webcrypto.subtle.exportKey('jwk',keyPair.publicKey);
  jwk.kid='olympia-test-key';
  jwk.use='sig';
  const now=Math.floor(Date.now()/1000);
  const header=encode({alg:'RS256',typ:'JWT',kid:jwk.kid});
  const claims={
    iss:'https://token.actions.githubusercontent.com',
    aud:audience,
    exp:now+90,
    iat:now,
    nbf:now-1,
    repository:'lindkvistfoto-dot/alea-crusaders',
    repository_id:'1403008145',
    repository_owner:'lindkvistfoto-dot',
    event_name:'push',
    ref:'refs/heads/olympia/release-requests/decision-414',
    workflow_ref:'lindkvistfoto-dot/alea-crusaders/.github/workflows/olympia-release-candidate.yml@refs/heads/olympia/release-requests/decision-414',
    workflow_sha:'1521adfe75448465c0c18d1f6623ce143cf175eb',
    run_id:'123456',
    run_attempt:'1',
    sha:'f'.repeat(40)
  };
  const payload=encode(claims);
  const signingInput=header+'.'+payload;
  const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(signingInput));
  return {token:signingInput+'.'+Buffer.from(signature).toString('base64url'),jwk,claims};
}

describe('OLYMPIA GitHub candidate bridge authentication',()=>{
  it('verifies the GitHub signature and audience before returning workflow claims',async()=>{
    const previousFetch=globalThis.fetch;
    const {token,jwk,claims}=await signedToken();
    globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'content-type':'application/json'}});
    try{
      await expect(verifyGitHubActionsOidcToken(token,'alea-olympia-candidate-pr')).resolves.toMatchObject({
        repository:claims.repository,
        event_name:'push',
        workflow_ref:claims.workflow_ref
      });
    }finally{
      globalThis.fetch=previousFetch;
    }
  });

  it('rejects a valid GitHub token minted for another audience',async()=>{
    const previousFetch=globalThis.fetch;
    const {token,jwk}=await signedToken('different-service');
    globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'content-type':'application/json'}});
    try{
      await expect(verifyGitHubActionsOidcToken(token,'alea-olympia-candidate-pr')).rejects.toThrow('OIDC_CLAIMS_REJECTED');
    }finally{
      globalThis.fetch=previousFetch;
    }
  });

  it('reads the release request before matching its item ID to the decision',()=>{
    const bridge=read('supabase/functions/olympia-candidate-bridge/index.ts');
    const requestRead=bridge.indexOf('const request = decodedJson');
    const decisionCheck=bridge.indexOf('issueBody.includes("- Ärende-ID: " + request.itemId)');
    expect(requestRead).toBeGreaterThan(-1);
    expect(decisionCheck).toBeGreaterThan(requestRead);
  });

  it('keeps the OIDC callback isolated and pins the exact candidate workflow',()=>{
    const config=read('supabase/config.toml');
    const bridge=read('supabase/functions/olympia-candidate-bridge/index.ts');
    const workflow=read('.github/workflows/olympia-release-candidate.yml');
    expect(config).toContain('[functions.olympia-candidate-bridge]');
    expect(bridge).toContain('permissions: { contents: "read", issues: "read", pull_requests: "write" }');
    expect(config).toContain('verify_jwt = false');
    expect(bridge).toContain('verifyGitHubActionsOidcToken(bearer, OIDC_AUDIENCE)');
    expect(bridge).toContain('claims.workflow_ref !== expectedWorkflowRef');
    expect(bridge).toContain('workflow.sha !== workflowBlobSha');
    expect(bridge).toContain('claims.event_name !== "push"');
    expect(bridge).toContain('candidateTreeSha');
    expect(bridge).toContain('request.itemId');
    expect(bridge).toContain('validWorkItem(item)');
    expect(bridge).toContain('request.itemId.toLowerCase()');
    expect(bridge).not.toContain('request.itemId !== "PILOT-001"');
    expect(workflow).toContain('id-token: write');
  });
});

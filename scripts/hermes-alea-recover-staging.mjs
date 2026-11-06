import {recoverAbandonedStaging} from '../supabase/functions/hermes-alea/recovery.mjs';

const projectRef='wkiuyklzzroavclnsxna';
const owner='66e4fd1b-ccd1-49a5-bbed-2b7264981732';
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(url!=='https://'+projectRef+'.supabase.co')throw Error('Recovery script is fixed to the DEV project.');
if(!key)throw Error('Existing DEV service credential is unavailable.');
const result=await recoverAbandonedStaging({
 url,
 requesterId:owner,
 headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'}
});
console.log('Recovered '+result.recovered+' abandoned DEV jobs; released '+result.released_bytes+' reserved bytes.');
if(result.recovered<1)throw Error('No abandoned DEV reservation was recovered.');

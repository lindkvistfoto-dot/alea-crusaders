const REPOSITORY='lindkvistfoto-dot/alea-crusaders';
const TARGETS={
  'refs/heads/development':{name:'DEV',url:'https://wkiuyklzzroavclnsxna.supabase.co'},
  'refs/heads/main':{name:'LIVE',url:'https://wbmosmkirsitkonejzpg.supabase.co'},
};

/** Resolve the only allowed Supabase target for a trusted branch; fail closed on drift. */
export function resolveHermesPublicationEnvironment({repository,ref,targetEnv,url}){
  if(repository!==REPOSITORY)throw new Error('UNTRUSTED_CORE_ACTION');
  const target=TARGETS[ref];
  if(!target)throw new Error('UNTRUSTED_CORE_ACTION');
  if(targetEnv!==target.name)throw new Error('HERMES_TARGET_ENV_MISMATCH');
  if(url!==target.url)throw new Error('HERMES_SUPABASE_URL_MISMATCH');
  return target.name;
}

(function(root){
  const environments={
    development:{name:"development",url:"https://wkiuyklzzroavclnsxna.supabase.co",key:"sb_publishable_LEWEgrZpK5hktEw6UPCAog_zB2R83et",sessionKey:"alea_supabase_session_dev"},
    live:{name:"live",url:"https://wbmosmkirsitkonejzpg.supabase.co",key:"sb_publishable_Tai3eAutU7lDDc9GAy1_rA_elVB5x7o",sessionKey:"alea_supabase_session"}
  };
  const liveHosts=new Set(["alea-crusaders.pages.dev","lindkvistfoto-dot.github.io"]);
  const selected=liveHosts.has(String(root.location&&root.location.hostname||"").toLowerCase())?environments.live:environments.development;
  root.ALEA_SUPABASE_CONFIG=Object.freeze({
    ...selected,
    endpoint:function(path){const value=String(path||"");return selected.url+(value.startsWith("/")?"":"/")+value;}
  });
})(window);

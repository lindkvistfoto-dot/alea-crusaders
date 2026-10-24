export function createHonorsApi(dbJson, { campaignId, userId }) {
  if (typeof dbJson !== 'function') throw new Error('dbJson required');
  if (!userId) throw new Error('Signed-in user required');
  const esc = encodeURIComponent;
  return {
    async load() {
      const [definitions, characters] = await Promise.all([
        dbJson('honor_definitions?select=*&order=name.asc'),
        dbJson('characters?select=id,name,campaign_id&campaign_id=eq.'+esc(campaignId))
      ]);
      const grants = await dbJson('honor_grants?select=*&order=granted_at.desc');
      return {definitions:definitions||[],characters:characters||[],grants:grants||[]};
    },
    async save(data) {
      const payload={...data,created_by:userId,campaign_id:data.campaign_id||campaignId};
      delete payload.id;
      return dbJson('honor_definitions',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    },
    async grant({honorId,characterId,reason}) {
      return dbJson('honor_grants',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({
        honor_id:honorId,character_id:characterId,granted_by:userId,reason:reason||null
      })});
    }
  };
}

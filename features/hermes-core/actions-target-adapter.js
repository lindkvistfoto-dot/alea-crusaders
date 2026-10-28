// Database adapter shared by the trusted Actions publisher and its integration tests.
export function createCoreActionsTargetAdapter({db, prepared, registryKey}) {
const targetKind = prepared.target?.kind ?? "system";
const honorTable = targetKind === "honor-definition" ? "honor_definitions" : "honor_relief_variants";
function dbMetadata(metadata) {
  return {
    asset_path: metadata.path,
    app_sha256: metadata.sha256,
    app_bytes: metadata.bytes,
    width: metadata.width,
    height: metadata.height,
    alpha_preserved: metadata.alphaPreserved,
  };
}

async function readTarget(target) {
  if (targetKind !== "system") {
    const {data,error} = await db.from(honorTable).select(targetKind === "honor-relief"
      ? "id,honor_id,image_asset_id,image_revision,material" : "id,image_asset_id,image_revision").eq("id",target.id).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error("HONOR_TARGET_NOT_FOUND");
    if(targetKind==="honor-relief" && prepared.target.material !== data.material) throw new Error("RELIEF_MATERIAL_MISMATCH");
    return {key:data.image_asset_id??null,revision:Number(data.image_revision??0),row:data};
  }
  const {data, error} = await db.from("arcane_system_assets")
    .select("id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved,image_revision")
    .eq("asset_key", target.id).maybeSingle();
  if (error) throw error;
  return data ? {key: data.asset_path ?? null, revision: Number(data.image_revision ?? 0), row: data} : null;
}

async function activate(target, expectedRevision, expectedKey,
                        metadata, create) {
  if (targetKind !== "system") {
    if (create) throw new Error("HONOR_TARGET_MUST_EXIST");
    // Register the verified WebP as a normal system asset, then switch only the requested honor pointer.
    const {data: existing,error: lookupError} = await db.from("arcane_system_assets").select("id,asset_key,asset_path,app_sha256,image_revision").eq("asset_key",registryKey).maybeSingle();
    if(lookupError) throw lookupError;
    if (!existing) {
      const {error: insertError} = await db.from("arcane_system_assets").insert({
        id:crypto.randomUUID(),asset_key:registryKey,label:prepared.label
      });
      if(insertError && insertError.code!=="23505") throw insertError;
    }
    // INSERT is deliberately limited to identity columns. Existing grants allow
    // verified publication metadata only via UPDATE, for both system and honor images.
    const {data: registered,error: registeredError} = await db.from("arcane_system_assets")
      .select("id,asset_key,asset_path,app_sha256,image_revision").eq("asset_key",registryKey).single();
    if (registeredError) throw registeredError;
    if(registered.asset_path!==metadata.path || registered.app_sha256!==metadata.sha256) {
      const {data: changed,error: updateError} = await db.from("arcane_system_assets")
        .update(dbMetadata(metadata)).eq("asset_key",registryKey).eq("image_revision",registered.image_revision)
        .select("id").maybeSingle();
      if(updateError || !changed) throw new Error("REGISTRY_CONCURRENT_CHANGE");
    }
    let update = db.from(honorTable).update({image_asset_id:registryKey})
      .eq("id",target.id).eq("image_revision",expectedRevision);
    update = expectedKey===null ? update.is("image_asset_id",null) : update.eq("image_asset_id",expectedKey);
    const {data,error}=await update.select("image_asset_id,image_revision").maybeSingle();
    if(error) throw error;
    if(!data) {
      const current=await readTarget(target);
      if(current.key===registryKey) return {key:registryKey,revision:current.revision};
      throw new Error("HONOR_TARGET_CONCURRENT_CHANGE");
    }
    const confirmed = await readTarget(target);
    if (confirmed.key !== registryKey) throw new Error("HONOR_TARGET_READBACK_MISMATCH");
    return {key:confirmed.key,revision:confirmed.revision};
  }
  const values = dbMetadata(metadata);
  if (create) {
    const {error: insertError} = await db.from("arcane_system_assets").insert({
      id: crypto.randomUUID(), asset_key: target.id, label: target.label,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
  }
  let query = db.from("arcane_system_assets").update(values)
    .eq("asset_key", target.id).eq("image_revision", expectedRevision);
  query = expectedKey === null ? query.is("asset_path", null) : query.eq("asset_path", expectedKey);
  const {data, error} = await query.select("asset_path,image_revision").maybeSingle();
  if (error) throw error;
  if (!data) {
    const current = await readTarget(target);
    if (current && current.key === metadata.path && current.row?.app_sha256 === metadata.sha256) {
      return {key: current.key, revision: current.revision};
    }
    throw new Error("SYSTEM_IMAGE_CHANGED_DURING_PUBLICATION");
  }
  const confirmed = await readTarget(target);
  if (confirmed?.key !== metadata.path) throw new Error("SYSTEM_TARGET_READBACK_MISMATCH");
  return {key:confirmed.key,revision:confirmed.revision};
}


return {readTarget,activate};
}

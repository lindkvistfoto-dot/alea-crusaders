// Explicit ALEA application image targets supported by HERMES CORE.
// Queue data selects a profile but cannot provide SQL identifiers.
const TARGETS=Object.freeze({
 spell:{table:"rule_spells",lookupColumn:"spell_key",imageColumn:"icon_path",bucket:"alea-hermes-public"},
 "spell-cutout":{table:"rule_spells",lookupColumn:"spell_key",imageColumn:"cutout_path",bucket:"alea-spell-art"},
 "spell-illustration":{table:"rule_spells",lookupColumn:"spell_key",imageColumn:"illustration_path",bucket:"alea-spell-art"},
 "spell-illustration-wide":{table:"rule_spells",lookupColumn:"spell_key",imageColumn:"illustration_wide_path",bucket:"alea-spell-art"},
 symbol:{table:"rule_magic_symbols",lookupColumn:"symbol_key",imageColumn:"icon_path",bucket:"alea-hermes-public"},
 skill:{table:"rule_skills",lookupColumn:"id",imageColumn:"icon_path",bucket:"alea-hermes-public",normalizeKey:true},
 "skill-illustration":{table:"rule_skills",lookupColumn:"id",imageColumn:"illustration_path",bucket:"alea-skill-art",normalizeKey:true},
 "skill-illustration-wide":{table:"rule_skills",lookupColumn:"id",imageColumn:"illustration_wide_path",bucket:"alea-skill-art",normalizeKey:true}
});
export const CORE_APP_IMAGE_KINDS=Object.freeze(Object.keys(TARGETS));
export function resolveCoreAppImageTarget(kind){return Object.hasOwn(TARGETS,kind)?TARGETS[kind]:null;}
export function normalizeCoreAppImageKey(kind,key){
 const target=resolveCoreAppImageTarget(kind);
 if(!target)throw new Error("CORE_APP_IMAGE_KIND_UNSUPPORTED");
 if(typeof key!=="string"||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key))throw new Error("INVALID_CORE_APP_IMAGE_KEY");
 return target.normalizeKey?key.replaceAll("-","_"):key;
}
export function coreAppImagePath(kind,key,sha256){
 if(!resolveCoreAppImageTarget(kind)||typeof key!=="string"||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)||!/^[a-f0-9]{64}$/.test(sha256||""))
  throw new Error("INVALID_CORE_APP_IMAGE_PATH");
 return `hermes/core/${kind}/${key}/${sha256}.webp`;
}

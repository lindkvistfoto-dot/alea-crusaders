export const HONOR_TYPES = Object.freeze(['adventure','campaign','achievement','honor']);
export const HONOR_CATEGORIES = Object.freeze(['medal','award','badge']);
export const HONOR_STATUSES = Object.freeze(['draft','active','inactive']);
export const HONOR_VISIBILITY = Object.freeze(['public','silhouette','secret']);
export const HONOR_GRANT_MODES = Object.freeze(['manual','automatic','both']);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function honorCategory(definition) {
  if (HONOR_CATEGORIES.includes(definition?.category)) return definition.category;
  return definition?.type === 'adventure' ? 'medal' : 'award';
}

export function validateHonorDefinition(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['definition must be an object'];
  if (!nonempty(value.name)) errors.push('name is required');
  if (!HONOR_TYPES.includes(value.type)) errors.push('invalid type');
  if (!HONOR_CATEGORIES.includes(honorCategory(value))) errors.push('invalid category');
  if (value.status && !HONOR_STATUSES.includes(value.status)) errors.push('invalid status');
  if (!HONOR_VISIBILITY.includes(value.visibility)) errors.push('invalid visibility');
  if (!HONOR_GRANT_MODES.includes(value.grant_mode)) errors.push('invalid grant_mode');
  if (value.status === 'draft' && value.grant_mode !== 'manual') errors.push('drafts must be manual');
  if (value.type === 'adventure' && value.status !== 'draft' && !nonempty(value.adventure_id)) errors.push('adventure_id required');
  if (value.type === 'campaign' && value.status !== 'draft' && !nonempty(value.campaign_id)) errors.push('campaign_id required');
  if (value.tier_criteria != null && (typeof value.tier_criteria !== 'object' || Array.isArray(value.tier_criteria))) errors.push('tier_criteria must be an object');
  return errors;
}
export function canViewHonorDefinition(definition, context = {}) {
  if (!definition || definition.status !== 'active') return Boolean(context.isAdmin);
  if (context.isAdmin || context.hasGrant) return true;
  return definition.visibility !== 'secret';
}
export function publicHonorProjection(definition, context = {}) {
  if (!canViewHonorDefinition(definition, context)) return null;
  if (definition.visibility === 'silhouette' && !context.hasGrant && !context.isAdmin) {
    return { id: definition.id, visibility: 'silhouette', earned: false };
  }
  return { id: definition.id, name: definition.name, type: definition.type, category: honorCategory(definition),
    description: definition.description ?? '', requirement_text: definition.requirement_text ?? '',
    image_asset_id: definition.image_asset_id ?? null, visibility: definition.visibility,
    earned: Boolean(context.hasGrant) };
}
export function activeGrant(grants, honorId, characterId) {
  return grants.find(grant => grant.honor_id === honorId &&
    grant.character_id === characterId && !grant.revoked_at) ?? null;
}
export function grantHonor(grants, { honorId, characterId, grantedBy, at, reason = null, eventId = null, id }) {
  if (![honorId, characterId, grantedBy, id].every(nonempty)) throw new Error('Missing grant identifiers');
  if (activeGrant(grants, honorId, characterId)) return { grants, created: false };
  if (eventId && grants.some(grant => grant.source_event_id === eventId && grant.honor_id === honorId && grant.character_id === characterId)) {
    return { grants, created: false };
  }
  const grant = { id, honor_id: honorId, character_id: characterId, granted_by: grantedBy,
    granted_at: at ?? new Date().toISOString(), reason, source_event_id: eventId, revoked_at: null };
  return { grants: [...grants, grant], created: true, grant };
}
export function revokeHonor(grants, grantId, { revokedBy, reason, at }) {
  if (!nonempty(revokedBy)) throw new Error('revokedBy required');
  const grant = grants.find(item => item.id === grantId);
  if (!grant) throw new Error('Grant not found');
  if (grant.revoked_at) return grants;
  return grants.map(item => item.id === grantId ? { ...item, revoked_at: at ?? new Date().toISOString(),
    revoked_by: revokedBy, revocation_reason: reason ?? null } : item);
}

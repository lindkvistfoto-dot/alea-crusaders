-- v0.35.126: adopt images in active combats created before round artwork
-- was attached per combatant. Keep existing selections; do not touch history.
with backfill as (
 select cb.id,
        case when cb.source_type='character' and ch.round_background_path is not null
             then 'character' else 'library' end as art_source,
        case when cb.source_type='character' and ch.round_background_path is not null
             then ch.round_background_path
             else coalesce(
               (select b.image_path from public.rule_combat_round_backgrounds b
                where b.is_active and b.archived_at is null
                order by md5(cb.id::text || b.id::text) limit 1),
               'assets/combat/round-hero-battle-pilot.avif')
        end as art_path,
        case when cb.source_type='character' and ch.round_background_path is not null
             then null::uuid
             else (select b.id from public.rule_combat_round_backgrounds b
                   where b.is_active and b.archived_at is null
                   order by md5(cb.id::text || b.id::text) limit 1)
        end as art_id
 from public.combatants cb
 join public.combat_instances ci on ci.id=cb.combat_id
 left join public.characters ch on ch.id=cb.source_id
      and ch.campaign_id=cb.campaign_id and cb.source_type='character'
 where ci.status in ('active','paused','setup')
   and (cb.state->>'round_background_source') is null
)
update public.combatants cb
set state=coalesce(cb.state,'{}'::jsonb)||
    jsonb_build_object(
      'round_background_source',b.art_source,
      'round_background_path',b.art_path,
      'round_background_id',b.art_id)
from backfill b where cb.id=b.id;

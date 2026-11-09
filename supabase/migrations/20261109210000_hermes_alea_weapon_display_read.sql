-- Keep HERMES ALEA display assets private while letting signed-in ALEA
-- consumers resolve only currently active, globally visible weapon images.
-- Honor assets remain available only through their existing manager scope.

alter view public.hermes_alea_assets
  set (security_invoker = false, security_barrier = true);

create or replace view public.hermes_alea_assets as
select
  'hermes-alea:' || j.id::text as asset_key,
  j.output_path as asset_path,
  j.width,
  j.height,
  j.alpha_preserved,
  'published'::text as publication_status
from public.hermes_alea_jobs j
where j.state = 'activated'
  and j.output_deleted_at is null
  and j.output_delete_reserved_at is null
  and (
    (
      j.target_kind = 'weapon'
      and exists (
        select 1
        from public.rule_weapons w
        where w.id = j.target_id
          and w.image_asset_id = 'hermes-alea:' || j.id::text
      )
    )
    or private.hermes_alea_can_manage(j.target_kind, j.target_id)
  );

revoke all on public.hermes_alea_assets from public, anon;
grant select on public.hermes_alea_assets to authenticated;

-- Signing a URL runs the storage SELECT policy. Managers retain the existing
-- scoped access; other authenticated consumers may sign only a live weapon
-- display object that is still the active rule_weapons pointer.
create or replace function private.hermes_alea_storage_allowed(bucket text, path text, reading boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hermes_alea_jobs j
    where (
      private.hermes_alea_can_manage(j.target_kind, j.target_id)
      or (
        bucket = 'hermes-alea-display'
        and j.target_kind = 'weapon'
        and j.state = 'activated'
        and exists (
          select 1
          from public.rule_weapons w
          where w.id = j.target_id
            and w.image_asset_id = 'hermes-alea:' || j.id::text
        )
      )
    )
    and (
      (bucket = 'hermes-alea-originals' and path = j.source_path and j.requested_by = auth.uid())
      or (bucket = 'hermes-alea-display' and path = j.output_path)
    )
    and case
      when reading then
        j.output_delete_reserved_at is null
        and j.output_deleted_at is null
        and (
          bucket <> 'hermes-alea-display'
          or j.state = 'activated'
          or private.hermes_alea_can_manage(j.target_kind, j.target_id)
        )
      else
        private.hermes_alea_can_manage(j.target_kind, j.target_id)
        and j.requested_by = auth.uid()
        and j.state = 'uploading'
        and j.verified_at is null
        and j.created_at > now() - interval '24 hours'
        and (select enabled from private.hermes_alea_settings where singleton)
    end
  );
$$;

revoke all on function private.hermes_alea_storage_allowed(text, text, boolean) from public, anon;
grant execute on function private.hermes_alea_storage_allowed(text, text, boolean) to authenticated;

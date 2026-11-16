-- Bilbo: never archive a material currently presented or persistently shared.
-- Archiving never deletes bytes; it can be safely reversed in the library.
create or replace function public.bilbo_guard_material_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
 if new.archived_at is not null and old.archived_at is null then
   if exists (select 1 from public.campaign_material_shares s
       where s.campaign_id=old.campaign_id and s.material_id=old.id and s.revoked_at is null)
      or exists (select 1 from public.campaign_material_presentations p
       where p.campaign_id=old.campaign_id and p.material_id=old.id) then
      raise exception 'Material currently shared or presented must be withdrawn before archiving'
        using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;

drop trigger if exists bilbo_guard_material_archive_trigger on public.campaign_materials;
create trigger bilbo_guard_material_archive_trigger
before update of archived_at on public.campaign_materials
for each row execute function public.bilbo_guard_material_archive();

-- Player-readable descriptions are not GM secrets: SL notes stay separate in
-- campaign_material_gm_notes with its existing GM-only RLS.

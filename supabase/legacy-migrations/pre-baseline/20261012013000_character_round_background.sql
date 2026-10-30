-- Character-specific artwork for the round panel. Historic encounter snapshots
-- retain their own path when a character's current artwork changes.
alter table public.characters
  add column if not exists round_background_path text;
alter table public.characters
  drop constraint if exists character_round_background_scoped;
alter table public.characters
  add constraint character_round_background_scoped check (
    round_background_path is null or (
      round_background_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and split_part(round_background_path,'/',1)=campaign_id::text
      and split_part(round_background_path,'/',2)=id::text
    )
  );

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('alea-character-round-backgrounds','alea-character-round-backgrounds',false,6291456,
        array['image/webp'])
on conflict(id) do update set
 public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- All campaign members need to see the active combatant's image; only the
-- character owner, GM, or global admin may write. No overwrite operations:
-- previous files can still be referred to by an ongoing or archived battle.
create policy character_round_art_read on storage.objects
 for select to authenticated using (
   bucket_id='alea-character-round-backgrounds'
   and exists (
     select 1 from public.characters c
     where c.campaign_id::text=split_part(storage.objects.name,'/',1)
       and c.id::text=split_part(storage.objects.name,'/',2)
       and storage.objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
       and ((select private.is_admin()) or
            (select private.is_campaign_member(c.campaign_id)))
   )
 );
create policy character_round_art_upload on storage.objects
 for insert to authenticated with check (
   bucket_id='alea-character-round-backgrounds'
   and exists (
     select 1 from public.characters c
     where c.campaign_id::text=split_part(storage.objects.name,'/',1)
       and c.id::text=split_part(storage.objects.name,'/',2)
       and storage.objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
       and ((select private.is_admin()) or
            (select private.is_campaign_gm(c.campaign_id)) or
            (c.owner_id=(select auth.uid())))
   )
 );
-- Orphan cleanup only; never delete a file still named by a character or combat
-- snapshot, since archived combats may display it later.
create policy character_round_art_orphan_cleanup on storage.objects
 for delete to authenticated using (
   bucket_id='alea-character-round-backgrounds'
   and exists (
     select 1 from public.characters c
     where c.campaign_id::text=split_part(storage.objects.name,'/',1)
       and c.id::text=split_part(storage.objects.name,'/',2)
       and storage.objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
       and ((select private.is_admin()) or
            (select private.is_campaign_gm(c.campaign_id)) or
            (c.owner_id=(select auth.uid())))
       and not exists (select 1 from public.characters saved
                       where saved.round_background_path=storage.objects.name)
       and not exists (select 1 from public.combatants warrior
                       where warrior.state->>'round_background_source'='character'
                         and warrior.state->>'round_background_path'=storage.objects.name)
   )
 );
comment on column public.characters.round_background_path is
 'Campaign-scoped private WebP used when this character is the active combatant in the round panel.';

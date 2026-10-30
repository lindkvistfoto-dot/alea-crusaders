alter table public.campaign_npcs
  add column if not exists combat_icon_path text;

alter table public.campaign_monsters
  add column if not exists combat_icon_path text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'combat-icons',
  'combat-icons',
  false,
  5242880,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create policy "combat_icons_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id='combat-icons'
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (select private.is_admin())
    or (select private.is_campaign_member((split_part(name,'/',1))::uuid))
  )
);

create policy "combat_icons_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='combat-icons'
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name,'/',3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (select private.is_admin())
    or (select private.is_campaign_gm((split_part(name,'/',1))::uuid))
    or (
      split_part(name,'/',2)='character'
      and exists (
        select 1 from public.characters c
        where c.id=(split_part(name,'/',3))::uuid
          and c.campaign_id=(split_part(name,'/',1))::uuid
          and c.owner_id=(select auth.uid())
      )
    )
  )
);

create policy "combat_icons_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id='combat-icons'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (
        (select private.is_campaign_gm((split_part(name,'/',1))::uuid))
        or (
          split_part(name,'/',2)='character'
          and split_part(name,'/',3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and exists (
            select 1 from public.characters c
            where c.id=(split_part(name,'/',3))::uuid
              and c.campaign_id=(split_part(name,'/',1))::uuid
              and c.owner_id=(select auth.uid())
          )
        )
      )
    )
  )
)
with check (
  bucket_id='combat-icons'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (
        (select private.is_campaign_gm((split_part(name,'/',1))::uuid))
        or (
          split_part(name,'/',2)='character'
          and split_part(name,'/',3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and exists (
            select 1 from public.characters c
            where c.id=(split_part(name,'/',3))::uuid
              and c.campaign_id=(split_part(name,'/',1))::uuid
              and c.owner_id=(select auth.uid())
          )
        )
      )
    )
  )
);

create policy "combat_icons_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id='combat-icons'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (
        (select private.is_campaign_gm((split_part(name,'/',1))::uuid))
        or (
          split_part(name,'/',2)='character'
          and split_part(name,'/',3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and exists (
            select 1 from public.characters c
            where c.id=(split_part(name,'/',3))::uuid
              and c.campaign_id=(split_part(name,'/',1))::uuid
              and c.owner_id=(select auth.uid())
          )
        )
      )
    )
  )
);

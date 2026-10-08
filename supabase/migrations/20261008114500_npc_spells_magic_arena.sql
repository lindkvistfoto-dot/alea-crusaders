-- SLP magiarena: alla kända besvärjelser ligger på kampanjpersoner.
alter table public.campaign_npcs add column if not exists spells jsonb not null default '[]'::jsonb;
comment on column public.campaign_npcs.spells is 'Individuella besvärjelser för kampanj-SLP; poster med namn, FV, regel-id och magiskole-FV används i stridsmotorn.';

alter table public.campaign_npcs
  add column if not exists race text not null default '',
  add column if not exists gender text not null default '',
  add column if not exists profession text not null default '';

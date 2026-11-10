-- Finna dolda ting: one field per existing location SL note, no new table.
ALTER TABLE public.campaign_location_gm_notes
  ADD COLUMN IF NOT EXISTS hidden_discoveries text;

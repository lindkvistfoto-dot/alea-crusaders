-- v0.34.97: backfill existing shield master BV/BEP from the shop's
-- already-registered Grundregler 1988 shield entries.
-- The shop stores shield durability as metadata.abs (8, 12, 16).
-- BV is initialized from that same durability value for Alea, while
-- absorption stays independent and separately editable. This is NOT a
-- claim that Expert E55 prints a separate shield BV table.
-- Existing non-null overrides must never be replaced.
WITH shop_shields AS (
 SELECT CASE item_key
   WHEN 'shield_small' THEN 'small'
   WHEN 'shield_medium' THEN 'medium'
   WHEN 'shield_large' THEN 'large'
 END AS shield_key,
 bep,price_amount,price_currency,metadata
 FROM public.rule_shop_items
 WHERE item_key IN ('shield_small','shield_medium','shield_large')
 AND source_key='grundregler_1988'
)
UPDATE public.rule_shields AS r
SET absorption=coalesce(r.absorption,(s.metadata->>'abs')::integer),
    bv=coalesce(r.bv,(s.metadata->>'abs')::integer),
    bep=coalesce(r.bep,s.bep),
    price=coalesce(r.price,case when upper(s.price_currency)='SM' then s.price_amount else null end),
    updated_at=now()
FROM shop_shields AS s
WHERE r.shield_key=s.shield_key
  AND (r.absorption IS NULL OR r.bv IS NULL OR r.bep IS NULL OR r.price IS NULL);

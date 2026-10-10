-- One source of truth for general equipment (Targan's catalogue + characters).
ALTER TABLE public.rule_shop_items
  ADD COLUMN IF NOT EXISTS can_carry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_path text;

COMMENT ON COLUMN public.rule_shop_items.can_carry IS
 'Can be equipped in a hand slot in Aktuell utrustning (e.g. torch or lantern)';
COMMENT ON COLUMN public.rule_shop_items.image_path IS
 'Shared transparent inventory artwork: equipment/<item uuid>/<image uuid>.webp';

-- Enable the two existing canonical items, leaving other catalog rows unchanged.
UPDATE public.rule_shop_items
  SET can_carry=true
  WHERE item_key IN ('torch','lantern') AND purchase_kind='equipment';

DO $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.rule_shop_items'::regclass
    AND conname='rule_shop_items_image_path_check'
 ) THEN
  ALTER TABLE public.rule_shop_items
   ADD CONSTRAINT rule_shop_items_image_path_check CHECK(
    image_path IS NULL OR (
     image_path ~ '^equipment/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'
     AND split_part(image_path,'/',2)=id::text
    )
   );
 END IF;
END $$;

-- Reuse existing bucket and authorization without introducing public writes.
DROP POLICY IF EXISTS equipment_art_insert_admin ON storage.objects;
CREATE POLICY equipment_art_insert_admin ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='alea-equipment-art'
 AND (SELECT private.is_admin())
 AND (
  name ~ '^(weapon|armor|shield|equipment)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'
  OR name ~ '^armor/(head|arms|torso|legs)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'
  OR (
   name ~ '^projectile/[a-z][a-z0-9_]{1,50}/[0-9a-f-]{36}\.(webp|png)$'
   AND EXISTS (
     SELECT 1 FROM public.rule_projectile_types p
     WHERE p.projectile_key=split_part(storage.objects.name,'/',2)
   )
  )
 )
);

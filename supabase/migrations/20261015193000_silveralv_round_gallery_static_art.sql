-- Permit stable, committed round-art backgrounds in addition to private uploads.
-- Private upload paths, RLS and existing round artwork remain unchanged.
ALTER TABLE public.rule_combat_round_backgrounds
 DROP CONSTRAINT IF EXISTS round_background_image_path_check;
ALTER TABLE public.rule_combat_round_backgrounds
 ADD CONSTRAINT round_background_image_path_check CHECK (
   image_path = 'assets/combat/round-hero-battle-pilot.avif'
   OR image_path ~ '^assets/combat/round/[a-z0-9-]+\.webp$'
   OR (image_path ~ '^round/[0-9a-f-]{36}\.(webp|png|jpg|jpeg)$'
       AND split_part(split_part(image_path,'/',2),'.',1) = id::text)
 );
INSERT INTO public.rule_combat_round_backgrounds(id,title,image_path,is_active)
VALUES ('75e6111f-e313-45db-bb27-aa91e8f413fa',
        'Silveralv – Strid i luften',
        'assets/combat/round/silveralv-strid-i-luften.webp',
        true)
ON CONFLICT (id) DO NOTHING;

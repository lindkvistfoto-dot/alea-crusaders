alter table public.rule_armor_types add column if not exists icon_key text;
alter table public.rule_shields add column if not exists icon_key text;

update public.rule_armor_types set icon_key=case type_key
 when 'padded' then 'cloth'
 when 'soft_leather' then 'leather'
 when 'studded_leather' then 'studded-leather'
 when 'light_scale' then 'light-scale'
 when 'scale_lamellar' then 'scale'
 when 'chainmail' then 'chainmail'
 when 'reinforced_chainmail' then 'reinforced-chainmail'
 when 'plate' then 'plate'
 else coalesce(icon_key,'generic') end
where icon_key is null or icon_key='';

update public.rule_shields set icon_key=case shield_key
 when 'small' then 'shield-small'
 when 'medium' then 'shield-medium'
 when 'large' then 'shield-large'
 else coalesce(icon_key,'shield-medium') end
where icon_key is null or icon_key='';
update public.rule_shop_items
set name='Elddon', updated_at=now()
where item_key='tinderbox';

update public.rule_shop_items
set name=case item_key
  when 'tent_hide_2' then 'Skinntält, 2 personer'
  when 'tent_hide_4' then 'Skinntält, 4 personer'
  when 'tent_hide_8' then 'Skinntält, 8 personer'
end,
updated_at=now()
where item_key in ('tent_hide_2','tent_hide_4','tent_hide_8');

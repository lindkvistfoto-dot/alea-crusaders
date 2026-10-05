update public.rule_race_attributes
set roll_formula = case attribute_key
  when 'STO' then '2T6+6'
  else '3T6'
end,
updated_at = now()
where race_id = 'manniska'
  and attribute_key in ('STY','FYS','STO','SMI','INT','PSY','KAR');

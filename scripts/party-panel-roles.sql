begin;
select set_config('partytest.campaign',gen_random_uuid()::text,true),
       set_config('partytest.owner',gen_random_uuid()::text,true),
       set_config('partytest.peer',gen_random_uuid()::text,true),
       set_config('partytest.gm',gen_random_uuid()::text,true),
       set_config('partytest.character',gen_random_uuid()::text,true);
insert into auth.users(id,email) select current_setting('partytest.'||role)::uuid,gen_random_uuid()::text||'@example.invalid' from unnest(array['owner','peer','gm']) role;
insert into public.campaigns(id,name) values(current_setting('partytest.campaign')::uuid,'Rollback panelprov');
insert into public.campaign_members(campaign_id,user_id,role) select current_setting('partytest.campaign')::uuid,current_setting('partytest.'||role)::uuid,case when role='gm' then 'gm' else 'player' end from unnest(array['owner','peer','gm']) role;
insert into public.characters(id,campaign_id,owner_id,name) values(current_setting('partytest.character')::uuid,current_setting('partytest.campaign')::uuid,current_setting('partytest.owner')::uuid,'Provfigur');
set local role authenticated;
do $test$
declare who text; updated_rows integer; read_rows integer;
begin
  foreach who in array array['owner','peer','gm'] loop
    perform set_config('request.jwt.claim.sub',current_setting('partytest.'||who),true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('partytest.'||who),'role','authenticated')::text,true);
    select count(*) into read_rows from public.characters where id=current_setting('partytest.character')::uuid;
    if read_rows<>1 then raise exception 'Read failed for %',who; end if;
    update public.characters set name='Rollback panelprov' where id=current_setting('partytest.character')::uuid;
    get diagnostics updated_rows = row_count;
    if updated_rows<>(case when who='peer' then 0 else 1 end) then raise exception 'Update mismatch for %: %',who,updated_rows; end if;
  end loop;
end $test$;
select 'PASS: owner, peer and GM reads. Owner/GM write, peer read-only. Synthetic rows rolled back.' as outcome;
rollback;

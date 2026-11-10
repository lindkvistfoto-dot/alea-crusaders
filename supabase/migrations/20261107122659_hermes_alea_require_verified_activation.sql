create or replace function private.hermes_alea_require_verified_activation()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.state='activated' and new.operation<>'REMOVE' and new.verified_at is null then
  raise exception 'UPLOAD_NOT_VERIFIED';
 end if;
 return new;
end $$;
revoke all on function private.hermes_alea_require_verified_activation() from public,anon,authenticated;
create trigger hermes_alea_require_verified_activation
 before update of state on public.hermes_alea_jobs
 for each row execute function private.hermes_alea_require_verified_activation();

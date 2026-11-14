-- Make public trophy-room projections honor underlying RLS, without opening
-- medal definitions or any hidden/inactive honors to campaign members.

alter view public.arcane_trophy_public_definitions
  set (security_barrier = true, security_invoker = true);
alter view public.arcane_trophy_public_grants
  set (security_barrier = true, security_invoker = true);
alter view public.arcane_trophy_public_variants
  set (security_barrier = true, security_invoker = true);


-- No source-table policies are created or replaced by this projection migration.

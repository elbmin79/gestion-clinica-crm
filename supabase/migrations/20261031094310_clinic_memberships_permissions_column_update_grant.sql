-- Allow clinic administrators to persist customized member permissions.
-- Row-level policies still restrict membership updates to clinic admins.
grant update (role, permissions) on public.clinic_memberships to authenticated;

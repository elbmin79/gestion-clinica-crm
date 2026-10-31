-- Keep invitation history when Supabase Auth deletes an account. Invitations
-- must not prevent deleting recipients or former inviters.
alter table public.clinic_invitations
  alter column invited_by drop not null,
  drop constraint clinic_invitations_invited_by_fkey,
  drop constraint clinic_invitations_accepted_by_fkey,
  add constraint clinic_invitations_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete set null,
  add constraint clinic_invitations_accepted_by_fkey
    foreign key (accepted_by) references auth.users(id) on delete set null;

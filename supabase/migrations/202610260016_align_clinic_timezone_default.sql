-- Keep new clinic records aligned with the clinic's Tijuana UI and reminder
-- defaults. Existing clinics retain their explicitly stored timezone.
alter table public.clinics
  alter column timezone set default 'America/Tijuana';

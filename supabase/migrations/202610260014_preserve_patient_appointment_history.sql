-- Staff workflows deactivate patients and cancel appointments; they do not
-- hard-delete clinical or scheduling records from a browser session.
revoke delete on public.patients, public.appointments from public, anon, authenticated;

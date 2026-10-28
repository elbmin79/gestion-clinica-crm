-- Defense in depth for the service-role-only inbound confirmation table.
-- Client roles have no table grants; service_role bypasses RLS.
alter table public.appointment_confirmation_replies enable row level security;

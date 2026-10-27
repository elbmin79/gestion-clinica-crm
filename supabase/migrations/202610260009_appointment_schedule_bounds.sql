-- Keep shared bookings inside the day view's 06:00–00:00 schedule and on
-- quarter-hour starts, using the clinic's timezone rather than the server's.
create or replace function private.enforce_appointment_schedule_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  clinic_timezone text;
  local_start timestamp without time zone;
  local_end timestamp without time zone;
  local_day_end timestamp without time zone;
  start_offset_seconds integer;
begin
  if tg_op = 'UPDATE'
     and new.clinic_id is not distinct from old.clinic_id
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at
     and new.status = 'cancelled' then
    return new;
  end if;

  select clinic.timezone
    into clinic_timezone
    from public.clinics as clinic
   where clinic.id = new.clinic_id;

  if clinic_timezone is null then
    raise exception 'appointments_schedule_bounds: clinic timezone is not configured.'
      using errcode = '23514', constraint = 'appointments_schedule_bounds';
  end if;

  local_start := new.starts_at at time zone clinic_timezone;
  local_end := new.ends_at at time zone clinic_timezone;
  local_day_end := date_trunc('day', local_start) + interval '1 day';
  start_offset_seconds := extract(epoch from local_start - date_trunc('day', local_start))::integer;

  if local_start::time < time '06:00'
     or mod(start_offset_seconds, 900) <> 0
     or local_end > local_day_end then
    raise exception 'appointments_schedule_bounds: appointment must start at or after 06:00 on a quarter-hour and end by local midnight.'
      using errcode = '23514', constraint = 'appointments_schedule_bounds';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_appointment_schedule_bounds() from public, anon, authenticated;

create trigger appointments_enforce_schedule_bounds
  before insert or update of clinic_id, starts_at, ends_at, status on public.appointments
  for each row execute function private.enforce_appointment_schedule_bounds();

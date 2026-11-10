alter table public.appointments add column arrived_at timestamptz;

alter table public.staff_notifications drop constraint staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check
  check (kind in ('new_appointment', 'agenda_change', 'test', 'whatsapp_message', 'whatsapp_confirmation', 'patient_arrived'));
alter table public.staff_notifications drop constraint staff_notifications_message_check;
alter table public.staff_notifications add constraint staff_notifications_message_check
  check (message in (
    'Nueva cita registrada', 'Cita cancelada', 'Horario o asignación de cita actualizado',
    'Prueba de notificaciones', 'Nueva solicitud de cita', 'Nuevo mensaje de WhatsApp',
    'Cita confirmada por WhatsApp', 'Paciente en recepción'
  ));

create function private.guard_appointment_arrival() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.arrived_at is not null then
      raise exception 'Save the appointment before recording arrival' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.arrived_at is not distinct from old.arrived_at then return new; end if;
  if not private.has_clinic_permission(old.clinic_id, 'agenda.edit') then
    raise exception 'Appointment editing permission required' using errcode = '42501';
  end if;
  if old.arrived_at is not null or new.arrived_at is null
    or old.status not in ('pending', 'confirmed') or new.status not in ('pending', 'confirmed') then
    raise exception 'Arrival can only be recorded once for an open appointment' using errcode = '23514';
  end if;
  new.arrived_at := statement_timestamp();
  return new;
end $$;
revoke all on function private.guard_appointment_arrival() from public, anon, authenticated;

create trigger appointments_guard_arrival before insert or update of arrived_at on public.appointments
  for each row execute function private.guard_appointment_arrival();

create function private.notify_assigned_professional_of_arrival() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recipient_id uuid;
  push_enabled boolean;
  notification_id uuid;
begin
  select m.user_id, coalesce(p.push_enabled, true) into recipient_id, push_enabled
  from public.clinic_providers cp
  join public.clinic_memberships m on m.clinic_id = cp.clinic_id and m.user_id = cp.user_id
  left join public.staff_notification_preferences p on p.clinic_id = m.clinic_id and p.user_id = m.user_id
  where cp.id = new.provider_id and cp.clinic_id = new.clinic_id and cp.active;

  if recipient_id is null then return new; end if;

  insert into public.staff_notifications(clinic_id, user_id, appointment_id, kind, message)
  values (new.clinic_id, recipient_id, new.id, 'patient_arrived', 'Paciente en recepción')
  returning id into notification_id;

  if push_enabled then
    insert into private.staff_push_deliveries(notification_id, subscription_id)
    select notification_id, s.id from public.staff_push_subscriptions s
    where s.clinic_id = new.clinic_id and s.user_id = recipient_id;
  end if;
  return new;
end $$;
revoke all on function private.notify_assigned_professional_of_arrival() from public, anon, authenticated;

create trigger appointments_notify_arrival after update of arrived_at on public.appointments
  for each row when (old.arrived_at is null and new.arrived_at is not null)
  execute function private.notify_assigned_professional_of_arrival();

create function public.record_appointment_arrival(target_clinic_id uuid, target_appointment_id uuid)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare arrival timestamptz;
begin
  if not private.has_clinic_permission(target_clinic_id, 'agenda.edit') then
    raise exception 'Appointment editing permission required' using errcode = '42501';
  end if;

  update public.appointments
  set arrived_at = statement_timestamp()
  where clinic_id = target_clinic_id and id = target_appointment_id
    and arrived_at is null and status in ('pending', 'confirmed')
  returning arrived_at into arrival;

  if arrival is null then
    select a.arrived_at into arrival from public.appointments a
    where a.clinic_id = target_clinic_id and a.id = target_appointment_id;
  end if;
  if arrival is null then
    raise exception 'Appointment is unavailable for check-in' using errcode = '55000';
  end if;
  return arrival;
end $$;
revoke all on function public.record_appointment_arrival(uuid, uuid) from public, anon;
grant execute on function public.record_appointment_arrival(uuid, uuid) to authenticated;

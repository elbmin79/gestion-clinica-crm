import { createClient } from './client';

const statusToDatabase = {
  'Por confirmar': 'pending',
  Confirmada: 'confirmed',
  Completada: 'completed',
  Cancelada: 'cancelled',
};

const statusToUi = Object.fromEntries(Object.entries(statusToDatabase).map(([ui, database]) => [database, ui]));

function datePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

export function clinicDateTimeToIso(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = desiredUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observedDate = datePartsInZone(new Date(candidate), timeZone);
    const observedTime = timePartsInZone(new Date(candidate), timeZone);
    const [observedYear, observedMonth, observedDay] = observedDate.split('-').map(Number);
    const [observedHour, observedMinute] = observedTime.split(':').map(Number);
    const observedUtc = Date.UTC(observedYear, observedMonth - 1, observedDay, observedHour, observedMinute, 0);
    const difference = desiredUtc - observedUtc;
    candidate += difference;
    if (difference === 0) break;
  }
  return new Date(candidate).toISOString();
}

function rangeFor(date, period, timeZone) {
  const selected = new Date(`${date}T12:00:00`);
  let start = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 12);
  let end = new Date(start);
  if (period === 'Semana') {
    const offsetFromMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offsetFromMonday);
    end = new Date(start); end.setDate(end.getDate() + 7);
  } else if (period === 'Mes') {
    start = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
    end = new Date(selected.getFullYear(), selected.getMonth() + 1, 1, 12);
  } else if (period === 'Año') {
    start = new Date(selected.getFullYear(), 0, 1, 12);
    end = new Date(selected.getFullYear() + 1, 0, 1, 12);
  } else {
    end.setDate(end.getDate() + 1);
  }
  return {
    from: clinicDateTimeToIso(datePartsInZone(start, timeZone), '00:00', timeZone),
    to: clinicDateTimeToIso(datePartsInZone(end, timeZone), '00:00', timeZone),
  };
}

function durationLabel(start, end) {
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return `${minutes} min`;
}

function mapAppointment(row, catalogs, timeZone) {
  const patient = catalogs.patients.find(item => item.databaseId === row.patient_id);
  const branch = catalogs.branches.find(item => item.id === row.branch_id);
  const provider = catalogs.providers.find(item => item.id === row.provider_id);
  const business = catalogs.businesses.find(item => item.id === row.business_id);
  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);
  return {
    id: row.id,
    databasePatientId: row.patient_id,
    patientId: patient?.id || '',
    patient: patient?.name || 'Paciente sin expediente visible',
    initials: patient?.initials || '—',
    tone: patient?.tone || 'blue',
    date: datePartsInZone(startsAt, timeZone),
    time: timePartsInZone(startsAt, timeZone),
    service: row.service,
    clinician: provider?.name || 'Sin profesional asignado',
    providerId: row.provider_id,
    branch: branch?.name || 'Sin sucursal asignada',
    branchId: row.branch_id,
    business: business?.name || 'Negocio sin asignar',
    businessId: row.business_id,
    duration: durationLabel(row.starts_at, row.ends_at),
    modality: row.modality === 'virtual' ? 'Virtual' : 'Presencial',
    status: statusToUi[row.status] || 'Por confirmar',
    depositRequired: row.deposit_required || false,
    depositAmount: Number(row.deposit_amount || 0),
    note: row.note || '',
  };
}

function throwDatabaseError(result, label) {
  if (!result.error) return;
  const error = new Error(label);
  error.code = result.error.code;
  error.cause = result.error;
  throw error;
}

export function createClinicAgendaStore() {
  return {
    async load(clinicId, date, period, timeZone, catalogs) {
      const client = createClient();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const range = rangeFor(date, period, timeZone);
      const result = await client.from('appointments')
        .select('id, patient_id, business_id, branch_id, provider_id, starts_at, ends_at, service, modality, status, deposit_required, deposit_amount, note')
        .eq('clinic_id', clinicId)
        .gte('starts_at', range.from)
        .lt('starts_at', range.to)
        .order('starts_at', { ascending: true });
      throwDatabaseError(result, 'No se pudo cargar la agenda.');
      return (result.data || []).map(row => mapAppointment(row, catalogs, timeZone));
    },

    async create(clinicId, input, timeZone) {
      const client = createClient();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const startsAt = clinicDateTimeToIso(input.date, input.time, timeZone);
      const result = await client.from('appointments').insert({
        clinic_id: clinicId,
        patient_id: input.patient.databaseId,
        business_id: input.businessId,
        branch_id: input.branchId,
        provider_id: input.providerId,
        starts_at: startsAt,
        ends_at: new Date(new Date(startsAt).getTime() + input.durationMinutes * 60000).toISOString(),
        service: input.service.trim(),
        modality: input.modality === 'Virtual' ? 'virtual' : 'in_person',
        status: 'pending',
        deposit_required: input.depositRequired === true,
        deposit_amount: input.depositRequired === true ? Number(input.depositAmount) : 0,
        note: input.note.trim() || null,
      }).select('id').single();
      throwDatabaseError(result, 'No se pudo guardar la cita. Revisa el horario, la asignación del profesional y tus permisos.');
      return result.data;
    },

    async update(clinicId, appointment, input, timeZone) {
      const client = createClient();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const startsAt = clinicDateTimeToIso(input.date, input.time, timeZone);
      const durationMinutes = input.durationMinutes || Number.parseInt(appointment.duration, 10) || 45;
      const result = await client.from('appointments').update({
        business_id: input.businessId,
        branch_id: input.branchId,
        provider_id: input.providerId,
        starts_at: startsAt,
        ends_at: new Date(new Date(startsAt).getTime() + durationMinutes * 60000).toISOString(),
        service: input.service.trim(),
        modality: input.modality === 'Virtual' ? 'virtual' : 'in_person',
        status: statusToDatabase[input.status] || 'pending',
      }).eq('clinic_id', clinicId).eq('id', appointment.id).select('id').single();
      throwDatabaseError(result, 'No se pudo actualizar la cita. Revisa el horario y tus permisos.');
      return result.data;
    },
  };
}

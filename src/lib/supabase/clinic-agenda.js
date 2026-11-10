import { createClient } from './client.js';
import { fetchAllPages } from './paged-query.js';
import { agendaQueryRange, clinicDateTimeToIso, datePartsInZone, timePartsInZone } from '@elixir-clinic/crm-core/clinic-time';

export { agendaQueryRange, clinicDateTimeToIso } from '@elixir-clinic/crm-core/clinic-time';

const statusToDatabase = {
  'Por confirmar': 'pending',
  Confirmada: 'confirmed',
  Completada: 'completed',
  Cancelada: 'cancelled',
};

const statusToUi = Object.fromEntries(Object.entries(statusToDatabase).map(([ui, database]) => [database, ui]));
const appointmentColumns = 'id, patient_id, business_id, branch_id, provider_id, starts_at, ends_at, service, service_id, service_ids, service_snapshot, modality, status, deposit_required, deposit_amount, note';
const optionalAppointmentColumns = [
  { columns: 'session_price_amount, session_price_currency', pattern: /session_price_(amount|currency)/ },
  { columns: 'arrived_at', pattern: /arrived_at/ },
  { columns: 'package_id', pattern: /package_id/ },
];

function missingColumns(error, pattern) {
  return ['42703', 'PGRST204'].includes(error?.code) && pattern.test(error.message || '');
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
    arrivedAt: row.arrived_at || null,
    packageId: row.package_id || '',
    depositRequired: row.deposit_required || false,
    depositAmount: Number(row.deposit_amount || 0),
    sessionPrice: row.session_price_amount == null ? null : {
      amount: Number(row.session_price_amount),
      currency: row.session_price_currency,
    },
    note: row.note || '',
    serviceId: row.service_id || '',
    serviceIds: row.service_ids || (row.service_id ? [row.service_id] : []),
    serviceSnapshot: row.service_snapshot || null,
  };
}

function throwDatabaseError(result, label) {
  if (!result.error) return;
  if (missingColumns(result.error, optionalAppointmentColumns[0].pattern)) {
    const error = new Error('Actualiza la base compartida para guardar el costo de la sesión.');
    error.code = 'APPOINTMENT_PRICE_SCHEMA';
    throw error;
  }
  const error = new Error(label);
  error.code = result.error.code;
  error.cause = result.error;
  throw error;
}

function notifyGoogleCalendarSync(clinicId) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  void fetch('/api/integrations/google-calendar/sync', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicId }),
    keepalive: true,
  }).catch(() => {});
}

export function createClinicAgendaStore({ clientFactory = createClient } = {}) {
  return {
    async load(clinicId, date, period, timeZone, catalogs, listEnd) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const range = agendaQueryRange(date, period, timeZone, listEnd);
      const rows = [];
      const pageSize = 500;
      let available = optionalAppointmentColumns;
      const readPage = offset => client.from('appointments')
          .select([appointmentColumns, ...available.map(item => item.columns)].join(', '))
          .eq('clinic_id', clinicId)
          .gte('starts_at', range.from)
          .lt('starts_at', range.to)
          .order('starts_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
      for (let offset = 0; ; offset += pageSize) {
        let result = await readPage(offset);
        let missing;
        while (offset === 0 && (missing = available.find(item => missingColumns(result.error, item.pattern)))) {
          available = available.filter(item => item !== missing);
          result = await readPage(offset);
        }
        throwDatabaseError(result, 'No se pudo cargar la agenda.');
        rows.push(...(result.data || []));
        if ((result.data || []).length < pageSize) break;
      }
      return rows.map(row => mapAppointment(row, catalogs, timeZone));
    },

    async recordArrival(clinicId, appointmentId) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.rpc('record_appointment_arrival', {
        target_clinic_id: clinicId,
        target_appointment_id: appointmentId,
      });
      const label = ['PGRST202', '42883'].includes(result.error?.code)
        ? 'Actualiza la base compartida para registrar la llegada.'
        : 'No se pudo registrar la llegada. Revisa el estado de la cita y tus permisos.';
      throwDatabaseError(result, label);
      if (typeof result.data !== 'string' || !Number.isFinite(Date.parse(result.data))) throw new Error(label);
      return result.data;
    },

    async loadCompletedHistory(clinicId, patientId) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const cutoff = new Date().toISOString();
      const rows = await fetchAllPages(({ from, to, includeCount }) => client.from('appointments')
        .select('id, service, service_id, service_ids, service_snapshot, ends_at', includeCount ? { count: 'exact' } : undefined)
        .eq('clinic_id', clinicId)
        .eq('patient_id', patientId)
        .eq('status', 'completed')
        .lte('ends_at', cutoff)
        .order('id')
        .range(from, to));
      return rows.map(row => ({
        service: row.service, serviceId: row.service_id, serviceIds: row.service_ids,
        serviceSnapshot: row.service_snapshot, endsAt: row.ends_at,
      }));
    },

    async create(clinicId, input, timeZone) {
      const client = clientFactory();
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
        service_id: input.serviceId || null,
        service_ids: input.serviceIds || (input.serviceId ? [input.serviceId] : []),
        service_snapshot: input.serviceSnapshot || {},
        modality: input.modality === 'Virtual' ? 'virtual' : 'in_person',
        status: 'pending',
        deposit_required: input.depositRequired === true,
        deposit_amount: input.depositRequired === true ? Number(input.depositAmount) : 0,
        ...(input.packageId ? { package_id: input.packageId } : {}),
        ...(input.sessionPrice ? { session_price_amount: input.sessionPrice.amount, session_price_currency: input.sessionPrice.currency } : {}),
        note: input.note.trim() || null,
      }).select('id').single();
      throwDatabaseError(result, 'No se pudo guardar la cita. Revisa el horario, la asignación del profesional y tus permisos.');
      notifyGoogleCalendarSync(clinicId);
      return result.data;
    },

    async update(clinicId, appointment, input, timeZone) {
      const client = clientFactory();
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
        service_id: input.serviceId !== undefined ? (input.serviceId || null) : (appointment.serviceId || null),
        service_ids: input.serviceIds !== undefined ? input.serviceIds : (appointment.serviceIds || (appointment.serviceId ? [appointment.serviceId] : [])),
        service_snapshot: input.serviceSnapshot || appointment.serviceSnapshot || {},
        modality: input.modality === 'Virtual' ? 'virtual' : 'in_person',
        status: statusToDatabase[input.status] || 'pending',
        ...(input.note === undefined ? {} : { note: input.note.trim() || null }),
        ...(input.sessionPrice === undefined ? {} : {
          session_price_amount: input.sessionPrice?.amount ?? null,
          session_price_currency: input.sessionPrice?.currency ?? null,
        }),
      }).eq('clinic_id', clinicId).eq('id', appointment.id).select('id').single();
      throwDatabaseError(result, 'No se pudo actualizar la cita. Revisa el horario y tus permisos.');
      notifyGoogleCalendarSync(clinicId);
      return result.data;
    },
  };
}

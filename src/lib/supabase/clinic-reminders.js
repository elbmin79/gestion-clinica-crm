import { createClient } from './client';

const reminderKinds = {
  confirmation_2d: { label: 'Confirmación · 2 días antes', hours: 48 },
  reminder_1d: { label: 'Recordatorio · 1 día antes', hours: 24 },
  reminder_5h: { label: 'Recordatorio · 5 horas antes', hours: 5 },
};

function formatDateTime(value, timeZone) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function mapReminder(row, timeZone) {
  const kind = reminderKinds[row.kind] || { label: 'Mensaje de cita' };
  const deliveryEligible = row.delivery_eligible === true;
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    kind: row.kind,
    label: kind.label,
    scheduledAt: row.scheduled_at,
    scheduledLabel: formatDateTime(row.scheduled_at, timeZone),
    status: row.status === 'pending' && !deliveryEligible ? 'blocked' : row.status,
    deliveryEligible,
    deliveryBlockReason: row.delivery_block_reason || '',
    attemptCount: row.attempt_count || 0,
    patientName: row.patient_name,
    appointmentAt: row.appointment_at,
    appointmentLabel: formatDateTime(row.appointment_at, timeZone),
    service: row.service,
    providerName: row.provider_name,
    branchName: row.branch_name,
  };
}

export function createClinicRemindersStore() {
  return {
    async load(clinicId, timeZone) {
      const client = createClient();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const now = Date.now();
      const result = await client.rpc('get_appointment_reminders', {
        target_clinic_id: clinicId,
        window_start: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        window_end: new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (result.error) {
        const error = new Error('No se pudieron cargar los recordatorios.');
        error.code = result.error.code;
        error.cause = result.error;
        throw error;
      }
      return (result.data || []).map(row => mapReminder(row, timeZone));
    },
  };
}

export function createDemoAppointmentReminders(appointments, patients = [], now = new Date()) {
  const definitions = Object.entries(reminderKinds);
  return appointments.flatMap(appointment => {
    if (appointment.status !== 'Confirmada' || !appointment.date || !appointment.time) return [];
    const appointmentAt = new Date(`${appointment.date}T${appointment.time}:00`);
    if (Number.isNaN(appointmentAt.getTime())) return [];
    const patient = patients.find(item => item.id === appointment.patientId || item.name === appointment.patient);
    const hasPhone = /^\+[1-9]\d{7,14}$/.test(patient?.phone?.trim() || '');
    const deliveryEligible = patient?.whatsappOptIn === true && hasPhone;
    const deliveryBlockReason = !patient?.whatsappOptIn
      ? 'Sin autorización de WhatsApp'
      : !patient?.phone?.trim()
        ? 'Falta teléfono'
        : !hasPhone
          ? 'Teléfono inválido: usa formato internacional, por ejemplo +526641234567'
          : '';
    return definitions.map(([kind, definition]) => {
      const scheduledAt = new Date(appointmentAt.getTime() - definition.hours * 60 * 60 * 1000);
      return {
        id: `${appointment.id || appointment.date}-${kind}`,
        appointmentId: appointment.id,
        kind,
        label: definition.label,
        scheduledAt: scheduledAt.toISOString(),
        scheduledLabel: formatDateTime(scheduledAt, Intl.DateTimeFormat().resolvedOptions().timeZone),
        status: !deliveryEligible ? 'blocked' : scheduledAt > now ? 'pending' : 'skipped',
        attemptCount: 0,
        deliveryEligible,
        deliveryBlockReason,
        patientName: appointment.patient,
        appointmentAt: appointmentAt.toISOString(),
        appointmentLabel: formatDateTime(appointmentAt, Intl.DateTimeFormat().resolvedOptions().timeZone),
        service: appointment.service,
        providerName: appointment.clinician,
        branchName: appointment.branch,
      };
    });
  }).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

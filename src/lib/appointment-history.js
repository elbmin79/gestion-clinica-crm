import { clinicDateTimeToIso } from '@elixir-clinic/crm-core/clinic-time';

function normalizedName(name) {
  return String(name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX');
}

function matchesTreatment(visit, treatment) {
  const ids = visit.serviceIds?.length ? visit.serviceIds : [visit.serviceId].filter(Boolean);
  if (treatment.id && ids.length) return ids.includes(treatment.id);
  const services = visit.serviceSnapshot?.services;
  const names = Array.isArray(services) ? services.map(service => service?.name) : [];
  return [visit.service, ...names].some(name => normalizedName(name) === normalizedName(treatment.name));
}

function timestamp(date, time, timeZone) {
  if (!date || !time) return NaN;
  try { return Date.parse(clinicDateTimeToIso(date, time, timeZone)); }
  catch { return NaN; }
}

export function summarizeAppointmentHistory(visits, treatments, { date, time, timeZone, now = Date.now() }) {
  const bookingTime = timestamp(date, time, timeZone);
  const cutoff = Number.isFinite(bookingTime) ? Math.min(now, bookingTime) : now;
  const completed = visits.filter(visit => Date.parse(visit.endsAt) <= cutoff);
  return {
    completedVisits: completed.length,
    treatments: treatments.map(treatment => ({
      id: treatment.id,
      name: treatment.name,
      sessions: completed.filter(visit => matchesTreatment(visit, treatment)).length,
    })),
  };
}

export function demoCompletedVisits(appointments, patientId, timeZone) {
  return appointments.filter(appointment => appointment.patientId === patientId && appointment.status === 'Completada')
    .flatMap(appointment => {
      const start = timestamp(appointment.date, appointment.time, timeZone);
      if (!Number.isFinite(start)) return [];
      const duration = Number.parseInt(appointment.duration, 10) || 45;
      return [{ ...appointment, endsAt: new Date(start + duration * 60_000).toISOString() }];
    });
}

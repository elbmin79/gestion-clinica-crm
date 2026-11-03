import { createClient } from '@/lib/supabase';
import type { ClinicMembership } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import { loadAppointmentCatalog, loadPatientList, type AppointmentCatalog, type PatientListItem } from '@/lib/crm-data';

export type PublicAgendaSettings = { slug: string; published: boolean; min_notice_minutes: number; max_days: number; buffer_minutes: number; require_email: boolean };
export type PublicAgendaOffer = { id: string; service_id: string; branch_id: string; provider_id: string; duration_minutes: number | string; deposit_amount: number | string; saved: boolean };
export type PublicAgendaHour = { id: string; branch_id: string; provider_id: string; day_of_week: number | null; on_date: string | null; closed: boolean; opens_minute: number | null; closes_minute: number | null };
export type PublicBookingRequest = { id: string; offer_id: string; full_name: string; phone: string; email: string | null; starts_at: string; ends_at: string; service_name: string; deposit_amount: number; status: 'pending' | 'approved' | 'rejected'; appointment_id: string | null; created_at: string };
export type PublicAgendaWorkspace = { settings: PublicAgendaSettings; offers: PublicAgendaOffer[]; hours: PublicAgendaHour[]; requests: PublicBookingRequest[]; catalog: AppointmentCatalog; patients: PatientListItem[] };

function clientOrThrow() {
  const client = createClient();
  if (!client) throw new Error('La conexión de la clínica no está configurada.');
  return client;
}
function defaultSlug(name: string) { return (name || 'mi-clinica').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'mi-clinica'; }

export async function loadPublicAgendaWorkspace(clinic: ClinicMembership): Promise<PublicAgendaWorkspace> {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'public_agenda.view')) throw new Error('Tu cuenta no tiene permiso para consultar la agenda pública.');
  const client = clientOrThrow();
  const [settingsResult, offersResult, hoursResult, requestsResult, catalog, patients] = await Promise.all([
    client.from('public_agenda_settings').select('slug,published,min_notice_minutes,max_days,buffer_minutes,require_email').eq('clinic_id', clinic.clinicId).maybeSingle(),
    client.from('public_agenda_offers').select('id,service_id,branch_id,provider_id,duration_minutes,deposit_amount').eq('clinic_id', clinic.clinicId).eq('active', true).order('id'),
    client.from('public_agenda_hours').select('id,branch_id,provider_id,day_of_week,on_date,closed,opens_minute,closes_minute').eq('clinic_id', clinic.clinicId).order('day_of_week').order('on_date').order('opens_minute'),
    client.from('public_booking_requests').select('id,offer_id,full_name,phone,email,starts_at,ends_at,service_name,deposit_amount,status,appointment_id,created_at').eq('clinic_id', clinic.clinicId).order('created_at', { ascending: false }).limit(100),
    loadAppointmentCatalog(clinic, { includeInactive: true }),
    loadPatientList(clinic),
  ]);
  if (settingsResult.error || offersResult.error || hoursResult.error || requestsResult.error) throw new Error('No se pudo cargar la agenda pública. Revisa la conexión y la migración de este módulo.');
  const settings = settingsResult.data || { slug: defaultSlug(clinic.name), published: false, min_notice_minutes: 1440, max_days: 90, buffer_minutes: 0, require_email: false };
  return {
    settings: { ...settings, published: Boolean(settings.published), min_notice_minutes: Number(settings.min_notice_minutes), max_days: Number(settings.max_days), buffer_minutes: Number(settings.buffer_minutes), require_email: Boolean(settings.require_email) },
    offers: (offersResult.data || []).map(item => ({ ...item, duration_minutes: Number(item.duration_minutes), deposit_amount: Number(item.deposit_amount), saved: true })),
    hours: (hoursResult.data || []).map(item => ({ ...item, on_date: item.on_date || null, day_of_week: item.day_of_week == null ? null : Number(item.day_of_week), closed: Boolean(item.closed), opens_minute: item.opens_minute == null ? null : Number(item.opens_minute), closes_minute: item.closes_minute == null ? null : Number(item.closes_minute) })),
    requests: (requestsResult.data || []).map(item => ({ ...item, deposit_amount: Number(item.deposit_amount), status: item.status as PublicBookingRequest['status'] })),
    catalog,
    patients,
  };
}

export async function refreshPublicBookingRequests(clinic: ClinicMembership) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'public_agenda.view')) throw new Error('Tu cuenta no tiene permiso para consultar las solicitudes.');
  const result = await clientOrThrow().from('public_booking_requests')
    .select('id,offer_id,full_name,phone,email,starts_at,ends_at,service_name,deposit_amount,status,appointment_id,created_at')
    .eq('clinic_id', clinic.clinicId).order('created_at', { ascending: false }).limit(100);
  if (result.error) throw new Error('No se pudieron actualizar las solicitudes. Vuelve a intentarlo.');
  return (result.data || []).map(item => ({ ...item, deposit_amount: Number(item.deposit_amount), status: item.status as PublicBookingRequest['status'] }));
}

export async function savePublicAgenda(clinic: ClinicMembership, settings: PublicAgendaSettings, offers: PublicAgendaOffer[], hours: PublicAgendaHour[]) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'public_agenda.manage')) throw new Error('Tu cuenta no tiene permiso para editar la agenda pública.');
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(settings.slug)) throw new Error('El identificador debe tener de 3 a 60 caracteres en minúsculas, números y guiones.');
  if (!Number.isInteger(settings.min_notice_minutes) || settings.min_notice_minutes < 0 || settings.min_notice_minutes > 43200) throw new Error('La anticipación mínima debe estar entre 0 y 43,200 minutos.');
  if (!Number.isInteger(settings.max_days) || settings.max_days < 1 || settings.max_days > 365) throw new Error('Los días por adelantado deben estar entre 1 y 365.');
  if (!Number.isInteger(settings.buffer_minutes) || settings.buffer_minutes < 0 || settings.buffer_minutes > 120) throw new Error('La separación entre citas debe estar entre 0 y 120 minutos.');
  if (offers.length > 100 || hours.length > 300) throw new Error('La agenda permite hasta 100 opciones y 300 horarios.');
  const combos = offers.map(item => `${item.service_id}:${item.branch_id}:${item.provider_id}`);
  if (new Set(combos).size !== combos.length) throw new Error('No repitas la misma combinación de servicio, sucursal y profesional.');
  for (const offer of offers) {
    const duration = Number(offer.duration_minutes); const deposit = Number(offer.deposit_amount);
    if (!offer.service_id || !offer.branch_id || !offer.provider_id || !Number.isInteger(duration) || duration < 15 || duration > 720 || duration % 15 !== 0 || !Number.isFinite(deposit) || deposit <= 0) throw new Error('Completa cada opción con servicio, sucursal, profesional, duración en intervalos de 15 minutos y anticipo mayor que cero.');
  }
  for (const hour of hours) {
    const dateOkay = hour.on_date === null || /^\d{4}-\d{2}-\d{2}$/.test(hour.on_date);
    const dayOkay = hour.on_date !== null || Number.isInteger(hour.day_of_week) && Number(hour.day_of_week) >= 0 && Number(hour.day_of_week) <= 6;
    const timeOkay = hour.closed || Number.isInteger(hour.opens_minute) && Number.isInteger(hour.closes_minute) && Number(hour.opens_minute) >= 360 && Number(hour.opens_minute) < Number(hour.closes_minute) && Number(hour.closes_minute) <= 1440 && Number(hour.opens_minute) % 15 === 0 && Number(hour.closes_minute) % 15 === 0;
    if (!hour.branch_id || !hour.provider_id || !dateOkay || !dayOkay || !timeOkay) throw new Error('Revisa sucursal, profesional, fecha, día y horas de cada horario público.');
  }
  const result = await clientOrThrow().rpc('save_public_agenda', {
    p_clinic: clinic.clinicId,
    p_settings: settings,
    p_offers: offers.map(({ saved: _saved, ...offer }) => ({ ...offer, duration_minutes: Number(offer.duration_minutes), deposit_amount: Number(offer.deposit_amount) })),
    p_hours: hours,
  });
  if (result.error) throw new Error(result.error.message.includes('duplicate key') ? 'El enlace o una combinación de servicio, sucursal y profesional ya existe.' : result.error.message || 'No se pudo guardar la agenda pública.');
}

export async function reviewPublicBooking(clinic: ClinicMembership, requestId: string, action: 'approve' | 'reject', patientId: string | null) {
  const permission = action === 'approve' ? 'agenda.create' : 'agenda.cancel';
  if (!hasClinicPermission(clinic.role, clinic.permissions, permission)) throw new Error('Tu cuenta no tiene permiso para realizar esta acción de agenda.');
  const result = await clientOrThrow().rpc('review_public_booking', { p_request: requestId, p_action: action, p_patient: patientId });
  if (result.error) throw new Error(result.error.message || 'No se pudo revisar la solicitud.');
  return result.data as string | null;
}

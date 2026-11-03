import { datePartsInZone, timePartsInZone } from '@elixir-clinic/crm-core/clinic-time';
import { hasClinicPermission, normalizeClinicPermissions } from '@elixir-clinic/crm-core/permissions';
import { appointmentAgendaColor } from '@elixir-clinic/crm-core/agenda-colors';
import { createClinicAgendaStore } from '../../../../src/lib/supabase/clinic-agenda.js';
import { createPatientDirectoryStore } from '../../../../src/lib/supabase/patient-directory.js';
import { createClinicServicesStore } from '../../../../src/lib/supabase/clinic-services.js';
import { initialClinicServices, serviceCategories, serviceSetupState } from '../../../../src/lib/clinic-services.js';
import { createClinicPaymentsStore } from '../../../../src/lib/supabase/clinic-payments.js';
import { createClinicRemindersStore } from '../../../../src/lib/supabase/clinic-reminders.js';
import { createClinicAvailabilityStore } from '../../../../src/lib/supabase/clinic-availability.js';
import { visibleProviderFilter } from '../../../../src/lib/account-visibility.js';
import { validatePatientRecordFile, validatePatientRecordFileContent } from '../../../../src/lib/patient-record-files.js';

import type { ClinicMembership } from '@/providers/clinic-workspace-provider';
import { createClient } from '@/lib/supabase';

export type AgendaItem = {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  startsAt: string;
  time: string;
  service: string;
  status: string;
  duration: string;
  providerId: string;
  clinician: string;
  branchId: string;
  branch: string;
  businessId: string;
  business: string;
  modality: string;
  depositRequired: boolean;
  depositAmount: number;
  note: string;
  serviceId: string;
  serviceIds: string[];
  serviceSnapshot: Record<string, unknown> | null;
  agendaColor: string;
};

export type PatientListItem = {
  id: string;
  databaseId: string;
  recordNumber: string;
  name: string;
  service: string;
  status: string;
};

export type PatientRecord = PatientListItem & {
  email: string;
  phone: string;
  branchId: string;
  providerId: string;
  whatsappOptIn: boolean;
  whatsappOptInSource: string;
  branch: string;
  clinician: string;
  diagnosisAccepted: boolean;
  diagnosisSummary: string;
  clinicalHistory: { id: string; appointmentId: string; occurredAt: string; chiefComplaint: string; history: string; examination: string; assessment: string; plan: string }[];
  diagnosisHistory: { id: string; summary: string; status: string; acceptedAt: string | null; acceptedByLabel: string }[];
  activities: { id: string; type: string; note: string; createdAt: string; author: string }[];
  botoxTreatments: { id: string; appointmentId: string; clinicianId: string; performedAt: string; product: string; lotNumber: string; expirationDate: string; treatmentAreas: string; totalUnits: number; followUp: string; consentDocumentId: string; consentFileId: string; createdAt: string }[];
  recordFiles: { id: string; kind: string; title: string; signedAt: string; createdAt: string; mimeType: string; byteSize: number; storagePath: string }[];
  documents: { id: string; title: string; type: string; status: string; requestedAt: string | null; contentSnapshot: string; service: string }[];
  appointments: { id: string; date: string; time: string; service: string; status: string; modality: string; branch: string; clinician: string }[];
};

type SharedPatientRecord = Pick<PatientRecord, 'databaseId' | 'name' | 'service' | 'status' | 'email' | 'phone' | 'branchId' | 'providerId' | 'whatsappOptIn' | 'whatsappOptInSource' | 'branch' | 'clinician' | 'diagnosisAccepted' | 'diagnosisSummary' | 'diagnosisHistory' | 'clinicalHistory' | 'activities' | 'recordFiles' | 'botoxTreatments'> & {
  id: string;
  treatment: string;
  consentHistory: { id: string; title: string; type: string; status: string; requestedAt: string | null; contentSnapshot: string; service: string }[];
  contractHistory: { id: string; title: string; type: string; status: string; requestedAt: string | null; contentSnapshot: string; service: string }[];
};

function getClient() {
  const client = createClient();
  if (!client) throw new Error('La conexión con Supabase no está configurada.');
  return client;
}

function errorMessage(error: { message?: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

export async function loadAgendaForDate(clinic: ClinicMembership, date: string, period: 'Día' | 'Semana' | 'Mes' | 'Año' | 'Lista' = 'Día', listEnd?: string): Promise<AgendaItem[]> {
  const client = getClient();
  const [patientsResult, branchesResult, providersResult, providerBranchesResult, businessesResult] = await Promise.all([
    client.from('patients').select('id, record_number, full_name').eq('clinic_id', clinic.clinicId),
    client.from('branches').select('id, business_id, name').eq('clinic_id', clinic.clinicId),
    client.from('clinic_providers').select('id, name').eq('clinic_id', clinic.clinicId).or(visibleProviderFilter),
    client.from('provider_branches').select('provider_id, branch_id, agenda_color, agenda_service_colors').eq('clinic_id', clinic.clinicId),
    client.from('businesses').select('id, name').eq('clinic_id', clinic.clinicId),
  ]);
  errorMessage(patientsResult.error, 'No se pudieron cargar los nombres de pacientes.');
  errorMessage(branchesResult.error, 'No se pudieron cargar las sucursales.');
  errorMessage(providersResult.error, 'No se pudieron cargar los profesionales.');
  errorMessage(providerBranchesResult.error, 'No se pudo cargar la configuración de colores de agenda.');
  errorMessage(businessesResult.error, 'No se pudieron cargar los negocios.');
  const catalogs = {
    patients: (patientsResult.data || []).map(patient => ({ id: patient.record_number, databaseId: patient.id, name: patient.full_name, initials: patient.full_name?.trim()?.slice(0, 1) || '—', tone: 'blue' })),
    branches: (branchesResult.data || []).map(branch => ({ id: branch.id, businessId: branch.business_id, name: branch.name })),
    providers: (providersResult.data || []).map(provider => ({
      ...provider,
      branchSettings: Object.fromEntries((providerBranchesResult.data || [])
        .filter(item => item.provider_id === provider.id)
        .map(item => [item.branch_id, { color: item.agenda_color || '', serviceColors: item.agenda_service_colors || {} }])),
    })),
    businesses: businessesResult.data || [],
  };
  const rows = await createClinicAgendaStore().load(clinic.clinicId, date, period, clinic.timeZone, catalogs, listEnd);
  return rows.map(row => ({
    id: row.id,
    patientId: row.databasePatientId,
    patientName: row.patient,
    date: row.date,
    startsAt: `${row.date}T${row.time}`,
    time: row.time,
    service: row.service,
    status: row.status,
    duration: row.duration,
    providerId: row.providerId,
    clinician: row.clinician,
    branchId: row.branchId,
    branch: row.branch,
    businessId: row.businessId,
    business: row.business,
    modality: row.modality,
    depositRequired: row.depositRequired,
    depositAmount: row.depositAmount,
    note: row.note,
    serviceId: row.serviceId,
    serviceIds: row.serviceIds,
    serviceSnapshot: row.serviceSnapshot,
    agendaColor: appointmentAgendaColor({ providerId: row.providerId, branchId: row.branchId, service: row.service }, catalogs.providers),
  }));
}

export async function loadTodayAgenda(clinic: ClinicMembership): Promise<AgendaItem[]> {
  return loadAgendaForDate(clinic, datePartsInZone(new Date(), clinic.timeZone));
}

export async function loadClinicAppointment(clinic: ClinicMembership, appointmentId: string): Promise<AgendaItem | null> {
  const result = await getClient().from('appointments').select('starts_at')
    .eq('clinic_id', clinic.clinicId).eq('id', appointmentId).maybeSingle();
  errorMessage(result.error, 'No se pudo cargar la cita.');
  if (!result.data) return null;
  const date = datePartsInZone(new Date(result.data.starts_at), clinic.timeZone);
  return (await loadAgendaForDate(clinic, date)).find(item => item.id === appointmentId) || null;
}

export async function loadPatientList(clinic: ClinicMembership): Promise<PatientListItem[]> {
  const client = getClient();
  if (clinic.role === 'billing') {
    const result = await client.rpc('get_finance_patients', { target_clinic_id: clinic.clinicId });
    errorMessage(result.error, 'No se pudo cargar el directorio de pagos.');
    return (result.data || []).map((row: { patient_id: string; record_number: string; full_name: string }) => ({
      id: row.patient_id,
      databaseId: row.patient_id,
      recordNumber: row.record_number,
      name: row.full_name,
      service: '—',
      status: 'Activo',
    }));
  }
  const result = await client.from('patients')
    .select('id, record_number, full_name, service_summary, status')
    .eq('clinic_id', clinic.clinicId)
    .neq('status', 'inactive')
    .order('created_at', { ascending: false })
    .range(0, 99);
  errorMessage(result.error, 'No se pudo cargar el directorio de pacientes.');
  const statuses: Record<string, string> = { active: 'Activo', follow_up: 'Seguimiento', new: 'Nuevo' };
  return (result.data || []).map(row => ({
    id: row.id,
    databaseId: row.id,
    recordNumber: row.record_number,
    name: row.full_name,
    service: row.service_summary || 'Por definir',
    status: statuses[row.status] || 'Activo',
  }));
}

export type AppointmentCatalog = {
  businesses: { id: string; name: string }[];
  branches: { id: string; businessId: string; name: string }[];
  providers: { id: string; name: string; branchIds: string[] }[];
  services: { id: string; code?: string; name: string; durationMin?: number; durationMax?: number; active?: boolean; branchIds?: string[]; providerIds?: string[] }[];
};

export type AgendaFilterCatalog = {
  branches: { id: string; name: string }[];
  providers: { id: string; name: string; branchSettings: Record<string, { color: string; serviceColors: Record<string, string> }> }[];
};

export async function loadAgendaFilterCatalog(clinic: ClinicMembership): Promise<AgendaFilterCatalog> {
  const client = getClient();
  const [branches, providers, assignments] = await Promise.all([
    client.from('branches').select('id, name').eq('clinic_id', clinic.clinicId).eq('active', true).order('name'),
    client.from('clinic_providers').select('id, name').eq('clinic_id', clinic.clinicId).eq('active', true).or(visibleProviderFilter).order('name'),
    client.from('provider_branches').select('provider_id, branch_id, agenda_color, agenda_service_colors').eq('clinic_id', clinic.clinicId),
  ]);
  errorMessage(branches.error, 'No se pudieron cargar las sucursales.');
  errorMessage(providers.error, 'No se pudieron cargar los profesionales.');
  errorMessage(assignments.error, 'No se pudo cargar la configuración de colores de agenda.');
  const branchSettings = new Map<string, Record<string, { color: string; serviceColors: Record<string, string> }>>();
  for (const assignment of assignments.data || []) {
    const settings = branchSettings.get(assignment.provider_id) || {};
    settings[assignment.branch_id] = { color: assignment.agenda_color || '', serviceColors: assignment.agenda_service_colors || {} };
    branchSettings.set(assignment.provider_id, settings);
  }
  return {
    branches: branches.data || [],
    providers: (providers.data || []).map(provider => ({ ...provider, branchSettings: branchSettings.get(provider.id) || {} })),
  };
}

export type ClinicPaymentsWorkspace = {
  patients: { id: string; databaseId: string; name: string; initials: string; treatment: string; branch: string; branchId: string; clinician: string; providerId: string; status: string; tone: string }[];
  appointments: { id: string; patientId: string; patient: string; date: string; time: string; service: string; duration: string; branchId: string; branch: string; providerId: string; clinician: string; businessId: string; business: string; modality: string; status: string; depositRequired: boolean; depositAmount: number }[];
  payments: { id: string; patientId: string; patientNameSnapshot: string; appointmentId: string; date: string; direction: 'Ingreso' | 'Reembolso'; amount: number; method: string; note: string; branchId: string; providerId: string; businessId: string; branchName: string; providerName: string; businessName: string; createdAt: string }[];
};

export type ClinicReminder = {
  id: string; appointmentId: string; kind: string; label: string; scheduledAt: string; scheduledLabel: string;
  status: string; deliveryEligible: boolean; deliveryBlockReason: string; simulated: boolean; attemptCount: number;
  patientName: string; appointmentAt: string; appointmentLabel: string; service: string; providerName: string; branchName: string;
};

export type ClinicService = {
  id?: string; code: string; category: string; name: string; description?: string;
  durationMin: number | string | null; durationMax: number | string | null;
  offers: { kind: 'single' | 'package'; amount: number | string; currency: string; sessions?: number | null; label?: string }[];
  variants: string[]; notes: string; source: string; status: string; active: boolean;
  branchIds: string[]; providerIds: string[];
};

export type ClinicServiceWorkspace = {
  services: ClinicService[];
  branches: { id: string; name: string }[];
  providers: { id: string; name: string; branchIds: string[] }[];
};

export async function loadClinicServiceWorkspace(clinic: ClinicMembership): Promise<ClinicServiceWorkspace> {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'services.manage')) throw new Error('Tu cuenta no tiene permiso para administrar el catálogo de servicios.');
  const client = getClient();
  const [services, branches, providers, providerBranches] = await Promise.all([
    createClinicServicesStore().load(clinic.clinicId),
    client.from('branches').select('id, name').eq('clinic_id', clinic.clinicId).eq('active', true).order('name'),
    client.from('clinic_providers').select('id, name').eq('clinic_id', clinic.clinicId).eq('active', true).or(visibleProviderFilter).order('name'),
    client.from('provider_branches').select('provider_id, branch_id').eq('clinic_id', clinic.clinicId),
  ]);
  errorMessage(branches.error, 'No se pudieron cargar las sucursales.');
  errorMessage(providers.error, 'No se pudieron cargar los profesionales.');
  errorMessage(providerBranches.error, 'No se pudieron cargar las asignaciones de profesionales.');
  const branchIdsByProvider = new Map<string, string[]>();
  for (const link of providerBranches.data || []) branchIdsByProvider.set(link.provider_id, [...(branchIdsByProvider.get(link.provider_id) || []), link.branch_id]);
  return {
    services: services as ClinicService[],
    branches: branches.data || [],
    providers: (providers.data || []).map(row => ({ ...row, branchIds: branchIdsByProvider.get(row.id) || [] })),
  };
}

export async function saveClinicService(clinic: ClinicMembership, service: ClinicService) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'services.manage')) throw new Error('Tu cuenta no tiene permiso para modificar el catálogo de servicios.');
  if (!service.name.trim()) throw new Error('Escribe el nombre del servicio.');
  const min = service.durationMin === '' ? null : service.durationMin == null ? null : Number(service.durationMin);
  const max = service.durationMax === '' ? min : service.durationMax == null ? min : Number(service.durationMax);
  if (min != null && (!Number.isFinite(min) || min < 15 || min > 720)) throw new Error('La duración mínima debe estar entre 15 y 720 minutos.');
  if (max != null && (!Number.isFinite(max) || max < (min || 15) || max > 720)) throw new Error('La duración máxima debe ser igual o mayor que la mínima, hasta 720 minutos.');
  const offers = service.offers.filter(item => item.amount !== '' && item.amount != null).map(item => ({ ...item, amount: Number(item.amount) }));
  if (offers.some(item => !Number.isFinite(item.amount) || item.amount <= 0)) throw new Error('Los precios deben ser mayores que cero.');
  const normalized = {
    ...service,
    code: service.code || `custom-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    name: service.name.trim(), durationMin: min, durationMax: max, offers,
    status: min && offers.length && offers.every(item => item.currency !== 'UNRESOLVED') ? 'ready' : 'setup_needed',
  };
  return createClinicServicesStore().save(clinic.clinicId, normalized);
}

export async function seedClinicServices(clinic: ClinicMembership) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'services.manage')) throw new Error('Tu cuenta no tiene permiso para preparar el catálogo de servicios.');
  return createClinicServicesStore().seed(clinic.clinicId);
}

export { initialClinicServices, serviceCategories, serviceSetupState };

export type AvailabilityBlock = { id: string; title: string; scope: 'clinic' | 'branch' | 'provider'; branch_id: string | null; provider_id: string | null; starts_at: string; ends_at: string; created_at: string };
export type ClinicAvailabilityWorkspace = {
  allowProviderOverlaps: boolean;
  blocks: AvailabilityBlock[];
  branches: { id: string; name: string; active: boolean }[];
  providers: { id: string; userId: string; name: string; active: boolean }[];
};

function availabilityScope(clinic: ClinicMembership) {
  return normalizeClinicPermissions(clinic.permissions, clinic.role)['availability.scope'];
}

export async function loadClinicAvailability(clinic: ClinicMembership): Promise<ClinicAvailabilityWorkspace> {
  const canManage = ['availability.manage_clinic', 'availability.manage_branch', 'availability.manage_self'].some(permission => hasClinicPermission(clinic.role, clinic.permissions, permission));
  if (!canManage) throw new Error('Tu cuenta no tiene permiso para administrar la disponibilidad.');
  const client = getClient();
  const [availability, branches, providers] = await Promise.all([
    createClinicAvailabilityStore().load(clinic.clinicId),
    client.from('branches').select('id, name, active').eq('clinic_id', clinic.clinicId).eq('active', true).order('name'),
    client.from('clinic_providers').select('id, user_id, name, active').eq('clinic_id', clinic.clinicId).or(visibleProviderFilter).order('name'),
  ]);
  errorMessage(branches.error, 'No se pudieron cargar las sucursales.');
  errorMessage(providers.error, 'No se pudieron cargar los profesionales.');
  return {
    ...availability,
    blocks: availability.blocks as AvailabilityBlock[],
    branches: branches.data || [],
    providers: (providers.data || []).map(row => ({ id: row.id, userId: row.user_id || '', name: row.name, active: row.active !== false })),
  };
}

export async function saveClinicProviderOverlaps(clinic: ClinicMembership, value: boolean) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_clinic')) throw new Error('Solo un administrador de la disponibilidad de la clínica puede cambiar esta regla.');
  return createClinicAvailabilityStore().saveProviderOverlaps(clinic.clinicId, value);
}

export async function createClinicAvailabilityBlock(clinic: ClinicMembership, userId: string, input: { title: string; scope: 'clinic' | 'branch' | 'provider'; branchId?: string; providerId?: string; startDate: string; startTime: string; endDate: string; endTime: string }) {
  const permissionScope = availabilityScope(clinic);
  let providerId = input.providerId;
  if (!input.title.trim() || input.title.trim().length > 100) throw new Error('Escribe un motivo de hasta 100 caracteres.');
  if (input.scope === 'clinic') {
    if (!hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_clinic')) throw new Error('Tu cuenta no puede bloquear horarios de toda la clínica.');
  } else if (input.scope === 'branch') {
    if (!hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_branch')) throw new Error('Tu cuenta no puede administrar bloqueos de sucursales.');
    if (!input.branchId) throw new Error('Selecciona una sucursal para este bloqueo.');
  } else {
    if (!hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_self')) throw new Error('Tu cuenta no puede administrar bloqueos profesionales.');
    if (permissionScope === 'self') {
      const provider = await getClient().from('clinic_providers').select('id').eq('clinic_id', clinic.clinicId).eq('user_id', userId).eq('active', true).maybeSingle();
      errorMessage(provider.error, 'No se pudo verificar tu perfil profesional.');
      providerId = provider.data?.id;
      if (!providerId) throw new Error('Tu cuenta aún no está vinculada a un perfil profesional activo.');
    } else if (!providerId) throw new Error('Selecciona un profesional para este bloqueo.');
  }
  const today = datePartsInZone(new Date(), clinic.timeZone);
  if (input.startDate < today || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.endDate < input.startDate) throw new Error('Elige un rango de fechas válido desde hoy en la zona horaria de la clínica.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime)) throw new Error('Usa horas válidas en formato de 24 horas.');
  return createClinicAvailabilityStore().createBlock(clinic.clinicId, { ...input, title: input.title.trim(), providerId }, clinic.timeZone, userId);
}

export async function deleteClinicAvailabilityBlock(clinic: ClinicMembership, block: AvailabilityBlock, userId: string) {
  const permissionScope = availabilityScope(clinic);
  let canManage = hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_clinic')
    || permissionScope === 'branch' && block.scope === 'branch' && hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_branch');
  if (!canManage && permissionScope === 'self' && block.scope === 'provider' && hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_self')) {
    const provider = await getClient().from('clinic_providers').select('id').eq('clinic_id', clinic.clinicId).eq('user_id', userId).eq('active', true).maybeSingle();
    errorMessage(provider.error, 'No se pudo verificar tu perfil profesional.');
    canManage = Boolean(provider.data?.id && block.provider_id === provider.data.id);
  }
  if (!canManage) throw new Error('Tu cuenta no puede eliminar este bloqueo.');
  return createClinicAvailabilityStore().deleteBlock(clinic.clinicId, block.id);
}

export async function loadAppointmentCatalog(clinic: ClinicMembership, options: { includeInactive?: boolean } = {}): Promise<AppointmentCatalog> {
  const client = getClient();
  const [businesses, branches, providers, providerBranches, services] = await Promise.all([
    client.from('businesses').select('id, name').eq('clinic_id', clinic.clinicId).eq('active', true).order('name'),
    client.from('branches').select('id, business_id, name').eq('clinic_id', clinic.clinicId).eq('active', true).order('name'),
    client.from('clinic_providers').select('id, name').eq('clinic_id', clinic.clinicId).eq('active', true).or(visibleProviderFilter).order('name'),
    client.from('provider_branches').select('provider_id, branch_id').eq('clinic_id', clinic.clinicId),
    createClinicServicesStore().load(clinic.clinicId),
  ]);
  errorMessage(businesses.error, 'No se pudieron cargar los negocios.');
  errorMessage(branches.error, 'No se pudieron cargar las sucursales.');
  errorMessage(providers.error, 'No se pudieron cargar los profesionales.');
  errorMessage(providerBranches.error, 'No se pudo cargar la asignación de profesionales.');
  const branchIdsByProvider = new Map<string, string[]>();
  for (const link of providerBranches.data || []) branchIdsByProvider.set(link.provider_id, [...(branchIdsByProvider.get(link.provider_id) || []), link.branch_id]);
  return {
    businesses: businesses.data || [],
    branches: (branches.data || []).map(row => ({ id: row.id, businessId: row.business_id, name: row.name })),
    providers: (providers.data || []).map(row => ({ id: row.id, name: row.name, branchIds: branchIdsByProvider.get(row.id) || [] })),
    services: (services as AppointmentCatalog['services']).filter(row => options.includeInactive || row.active !== false),
  };
}

export async function createClinicPatient(clinic: ClinicMembership, input: { name: string; email?: string; phone?: string; treatment?: string; branchId?: string; providerId?: string }) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'patients.create')) throw new Error('Tu cuenta no tiene permiso para crear pacientes.');
  return createPatientDirectoryStore().create(clinic.clinicId, input);
}

export async function updateClinicPatient(clinic: ClinicMembership, patient: { databaseId: string }, input: { name: string; email: string; phone: string; treatment: string; branchId: string; providerId: string; status: string; whatsappOptIn: boolean; whatsappOptInSource: string }) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'patients.edit')) throw new Error('Tu cuenta no tiene permiso para editar pacientes.');
  if (input.whatsappOptIn && !['written', 'verbal', 'electronic'].includes(input.whatsappOptInSource)) throw new Error('Indica cómo autorizó el paciente los avisos por WhatsApp.');
  if (input.whatsappOptIn && !/^\+[1-9]\d{7,14}$/.test(input.phone.trim())) throw new Error('Para avisos por WhatsApp, usa el teléfono internacional, por ejemplo +526641234567.');
  return createPatientDirectoryStore().update(clinic.clinicId, patient, input);
}

export async function createClinicEncounter(clinic: ClinicMembership, patient: { databaseId: string; providerId: string }, input: { appointmentId?: string; occurredAt: string; chiefComplaint: string; history: string; examination: string; assessment: string; plan: string }) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'clinical.create')) throw new Error('Tu cuenta no tiene permiso para agregar información clínica.');
  if (!input.chiefComplaint.trim()) throw new Error('Escribe el motivo de consulta.');
  return createPatientDirectoryStore().createEncounter(clinic.clinicId, patient, input);
}

export async function createClinicPatientActivity(clinic: ClinicMembership, patient: { databaseId: string }, input: { type: string; note: string }) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'clinical.create')) throw new Error('Tu cuenta no tiene permiso para agregar notas de seguimiento.');
  if (!input.note.trim()) throw new Error('Escribe una nota de seguimiento.');
  return createPatientDirectoryStore().addActivity(clinic.clinicId, patient, input);
}

export async function createClinicBotoxTreatment(clinic: ClinicMembership, patient: { databaseId: string; providerId: string }, input: { appointmentId?: string; performedAt: string; product: string; lotNumber: string; expirationDate?: string; treatmentAreas: string; totalUnits: number; followUp: string; consentDocumentId?: string; consentFileId?: string }) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'clinical.create')) throw new Error('Tu cuenta no tiene permiso para registrar tratamientos clínicos.');
  if (!input.product.trim() || !input.lotNumber.trim() || !input.treatmentAreas.trim()) throw new Error('Completa producto, lote y áreas tratadas.');
  if (!Number.isFinite(input.totalUnits) || input.totalUnits <= 0 || input.totalUnits > 10000) throw new Error('Las unidades deben ser mayores que cero.');
  return createPatientDirectoryStore().createBotoxTreatment(clinic.clinicId, patient, { ...input, product: input.product.trim(), lotNumber: input.lotNumber.trim(), treatmentAreas: input.treatmentAreas.trim(), followUp: input.followUp.trim() });
}

export async function uploadClinicPatientFile(clinic: ClinicMembership, patient: { databaseId: string }, input: { file: { type: string; size: number; slice: (start?: number, end?: number) => { arrayBuffer: () => Promise<ArrayBuffer> } }; body?: unknown; title: string; kind: string; signedAt?: string }) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'clinical.create')) throw new Error('Tu cuenta no tiene permiso para adjuntar archivos clínicos.');
  if (!input.title.trim()) throw new Error('Escribe el nombre del documento.');
  const validationError = validatePatientRecordFile(input.file);
  if (validationError) throw new Error(validationError);
  const contentError = await validatePatientRecordFileContent(input.file);
  if (contentError) throw new Error(contentError);
  return createPatientDirectoryStore().uploadPatientFile(clinic.clinicId, patient, { ...input, title: input.title.trim() });
}

export async function acceptClinicDiagnosis(clinic: ClinicMembership, patient: { databaseId: string }, summary: string) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'clinical.edit')) throw new Error('Tu cuenta no tiene permiso para aceptar diagnósticos.');
  if (!summary.trim()) throw new Error('Agrega un resumen clínico antes de aceptar el diagnóstico.');
  return createPatientDirectoryStore().acceptDiagnosis(clinic.clinicId, patient, summary);
}

export async function loadClinicDocumentTemplates(clinic: ClinicMembership) {
  const result = await getClient().from('document_templates').select('id, kind, title, category, content, version')
    .eq('clinic_id', clinic.clinicId).eq('active', true).order('created_at', { ascending: false });
  errorMessage(result.error, 'No se pudieron cargar los formatos de documentos.');
  return (result.data || []).map(row => ({ id: row.id, kind: row.kind === 'contract' ? 'contract' as const : 'consent' as const, title: row.title, type: row.category || '', content: row.content || '', version: `v${row.version}` }));
}

export type ClinicConsentDocument = {
  id: string;
  patientId: string;
  title: string;
  status: 'Pendiente' | 'Firmado' | 'Cancelado' | 'Reemplazado';
  requestedAt: string | null;
  signedAt: string | null;
  contentSnapshot: string;
  service: string;
};

export async function loadClinicConsentDocuments(clinic: ClinicMembership): Promise<ClinicConsentDocument[]> {
  const result = await getClient().from('patient_documents')
    .select('id, patient_id, title, status, requested_at, signed_at, content_snapshot, service')
    .eq('clinic_id', clinic.clinicId).eq('kind', 'consent').order('requested_at', { ascending: false }).limit(500);
  errorMessage(result.error, 'No se pudieron cargar los consentimientos.');
  const statuses: Record<string, ClinicConsentDocument['status']> = { pending: 'Pendiente', signed: 'Firmado', cancelled: 'Cancelado', replaced: 'Reemplazado' };
  return (result.data || []).map(row => ({
    id: row.id,
    patientId: row.patient_id,
    title: row.title,
    status: statuses[row.status] || 'Pendiente',
    requestedAt: row.requested_at,
    signedAt: row.signed_at,
    contentSnapshot: row.content_snapshot || '',
    service: row.service || '',
  }));
}

export async function createClinicDocumentTemplate(clinic: ClinicMembership, input: { title: string; type: string; content: string }) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'documents.manage_templates')) throw new Error('Tu cuenta no tiene permiso para administrar formatos.');
  if (!input.title.trim() || !input.content.trim()) throw new Error('Completa el nombre y el texto aprobado del formato.');
  return createPatientDirectoryStore().createTemplate(clinic.clinicId, 'consent', input);
}

export async function prepareClinicPatientDocument(clinic: ClinicMembership, patient: { databaseId: string; treatment: string }, kind: 'consent' | 'contract', template: { id: string }, service = '') {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'documents.create')) throw new Error('Tu cuenta no tiene permiso para preparar documentos clínicos.');
  return createPatientDirectoryStore().createPatientDocument(clinic.clinicId, patient, { kind, template, service: kind === 'contract' ? service.trim() || patient.treatment : '' });
}

export async function loadPatientRecord(clinic: ClinicMembership, databaseId: string): Promise<PatientRecord | null> {
  if (clinic.role === 'billing') {
    const patient = (await loadPatientList(clinic)).find(item => item.databaseId === databaseId);
    return patient ? { ...patient, email: '', phone: '', branchId: '', providerId: '', whatsappOptIn: false, whatsappOptInSource: '', branch: '', clinician: '', diagnosisAccepted: false, diagnosisSummary: '', diagnosisHistory: [], clinicalHistory: [], activities: [], botoxTreatments: [], recordFiles: [], documents: [], appointments: [] } : null;
  }
  const [patient, appointmentsResult, branchResult, providerResult] = await Promise.all([
    createPatientDirectoryStore().loadPatient(clinic.clinicId, clinic.role, databaseId) as Promise<SharedPatientRecord | null>,
    getClient().from('appointments').select('id, starts_at, service, status, branch_id, provider_id, modality').eq('clinic_id', clinic.clinicId).eq('patient_id', databaseId).order('starts_at', { ascending: false }).limit(50),
    getClient().from('branches').select('id, name').eq('clinic_id', clinic.clinicId),
    getClient().from('clinic_providers').select('id, name').eq('clinic_id', clinic.clinicId).or(visibleProviderFilter),
  ]);
  errorMessage(appointmentsResult.error, 'No se pudieron cargar las citas del expediente.');
  errorMessage(branchResult.error, 'No se pudo cargar el nombre de la sucursal.');
  errorMessage(providerResult.error, 'No se pudo cargar el nombre del profesional.');
  if (!patient) return null;
  const branches = new Map((branchResult.data || []).map(item => [item.id, item.name]));
  const providers = new Map((providerResult.data || []).map(item => [item.id, item.name]));
  const appointmentRows = (appointmentsResult.data || []).map(row => ({
    id: row.id,
    date: datePartsInZone(new Date(row.starts_at), clinic.timeZone),
    time: timePartsInZone(new Date(row.starts_at), clinic.timeZone),
    service: row.service,
    status: row.status,
    modality: row.modality,
    branch: branches.get(row.branch_id) || 'Sin sucursal',
    clinician: providers.get(row.provider_id) || 'Sin profesional',
  }));
  return {
    id: patient.databaseId,
    databaseId: patient.databaseId,
    recordNumber: patient.id,
    name: patient.name,
    service: patient.treatment,
    status: patient.status,
    email: patient.email,
    phone: patient.phone,
    branchId: patient.branchId,
    providerId: patient.providerId,
    whatsappOptIn: patient.whatsappOptIn,
    whatsappOptInSource: patient.whatsappOptInSource,
    branch: patient.branch,
    clinician: patient.clinician,
    diagnosisAccepted: patient.diagnosisAccepted,
    diagnosisSummary: patient.diagnosisSummary,
    diagnosisHistory: patient.diagnosisHistory || [],
    clinicalHistory: patient.clinicalHistory || [],
    recordFiles: (patient.recordFiles || []).map(file => ({ id: file.id, kind: file.kind, title: file.title, signedAt: file.signedAt || '', createdAt: file.createdAt, mimeType: file.mimeType, byteSize: Number(file.byteSize || 0), storagePath: file.storagePath })),
    activities: patient.activities || [],
    botoxTreatments: patient.botoxTreatments || [],
    documents: [...(patient.consentHistory || []), ...(patient.contractHistory || [])].map(document => ({ id: document.id, title: document.title, type: document.type, status: document.status, requestedAt: document.requestedAt, contentSnapshot: document.contentSnapshot || '', service: document.service || '' })),
    appointments: appointmentRows,
  };
}

export async function openPatientRecordFile(storagePath: string) {
  return createPatientDirectoryStore().openPatientFile(storagePath);
}

export async function loadClinicPayments(clinic: ClinicMembership) {
  const catalog = await loadAppointmentCatalog(clinic);
  return createClinicPaymentsStore().load(clinic.clinicId, clinic.timeZone, catalog) as Promise<ClinicPaymentsWorkspace>;
}

export type ClinicAppointmentPayment = {
  id: string;
  date: string;
  direction: 'Ingreso' | 'Reembolso';
  amount: number;
  method: string;
};

export async function loadClinicAppointmentPayments(clinic: ClinicMembership, appointmentId: string): Promise<ClinicAppointmentPayment[]> {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'payments.view')) {
    throw new Error('Tu cuenta no tiene permiso para ver los pagos de esta cita.');
  }
  const result = await getClient().from('payments')
    .select('id, direction, amount, method, transaction_date')
    .eq('clinic_id', clinic.clinicId)
    .eq('appointment_id', appointmentId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  errorMessage(result.error, 'No se pudo cargar el historial de pagos de esta cita.');
  const directions: Record<string, ClinicAppointmentPayment['direction']> = { income: 'Ingreso', refund: 'Reembolso' };
  const methods: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' };
  return (result.data || []).map(row => ({
    id: row.id,
    date: row.transaction_date,
    direction: directions[row.direction] || 'Ingreso',
    amount: Number(row.amount),
    method: methods[row.method] || 'Otro',
  }));
}

export async function createClinicPayment(clinic: ClinicMembership, patient: { databaseId: string }, appointment: { id: string } | null, input: { direction: 'Ingreso' | 'Reembolso'; amount: number; method: string; date: string; note: string }) {
  const permission = input.direction === 'Reembolso' ? 'payments.refund' : 'payments.create';
  if (!hasClinicPermission(clinic.role, clinic.permissions, permission)) throw new Error('Tu cuenta no tiene permiso para registrar este movimiento.');
  return createClinicPaymentsStore().create(clinic.clinicId, patient, appointment, input);
}

export async function loadClinicReminders(clinic: ClinicMembership) {
  return createClinicRemindersStore().load(clinic.clinicId, clinic.timeZone) as Promise<ClinicReminder[]>;
}

export async function createClinicAppointment(clinic: ClinicMembership, input: Parameters<ReturnType<typeof createClinicAgendaStore>['create']>[1]) {
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'agenda.create')) throw new Error('Tu cuenta no tiene permiso para crear citas.');
  return createClinicAgendaStore().create(clinic.clinicId, input, clinic.timeZone);
}

export async function updateClinicAppointment(clinic: ClinicMembership, appointment: AgendaItem, input: Parameters<ReturnType<typeof createClinicAgendaStore>['update']>[2]) {
  const permission = input.status === 'Cancelada' ? 'agenda.cancel' : 'agenda.edit';
  if (!hasClinicPermission(clinic.role, clinic.permissions, permission)) throw new Error('Tu cuenta no tiene permiso para actualizar esta cita.');
  return createClinicAgendaStore().update(clinic.clinicId, appointment, input, clinic.timeZone);
}

export async function loadPatientCount(clinic: ClinicMembership) {
  const client = getClient();
  if (clinic.role === 'billing') {
    const result = await client.rpc('get_finance_patients', { target_clinic_id: clinic.clinicId });
    errorMessage(result.error, 'No se pudo cargar el resumen financiero.');
    return (result.data || []).length;
  }
  const result = await client.from('patients').select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinic.clinicId).neq('status', 'inactive');
  errorMessage(result.error, 'No se pudo cargar el total de pacientes.');
  return result.count || 0;
}

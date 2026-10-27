"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '../lib/supabase/config';
import { createPatientDirectoryStore } from '../lib/supabase/patient-directory';
import { createClinicAgendaStore } from '../lib/supabase/clinic-agenda';
import { createClinicPaymentsStore } from '../lib/supabase/clinic-payments';
import { usePatientDirectory } from '../lib/supabase/use-patient-directory';
import { useClinicAgenda } from '../lib/supabase/use-clinic-agenda';
import { useClinicPayments } from '../lib/supabase/use-clinic-payments';
import { useClinicReminders } from '../lib/supabase/use-clinic-reminders';
import { createDemoAppointmentReminders } from '../lib/supabase/clinic-reminders';
import { signOut } from './login/actions';
import {
  Activity, ArrowDown, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Building2,
  Bell, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, ClipboardCheck, Clock3, Command, FileCheck2,
  FilePlus2, FileText, Filter, LayoutDashboard, ListFilter, MoreHorizontal,
  Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  UserRound, UsersRound, X, Menu, Printer, Video, DollarSign, Moon, Sun
} from 'lucide-react';

const initialPatients = [
  { id: 'CN-2481', name: 'Valeria Mendoza', initials: 'VM', treatment: 'Consulta de valoración', branch: 'Elixir Clinic', clinician: 'Dra. Sofía Reyes', last: 'Hoy, 09:10', status: 'Activo', contract: 'Firmado', consent: 'Pendiente', tone: 'violet' },
  { id: 'CN-2480', name: 'Lucía Fernández', initials: 'LF', treatment: 'Limpieza facial', branch: 'Macristy - Elixir Clinic Spa', clinician: 'Dr. Mateo Cruz', last: 'Ayer, 17:42', status: 'Activo', contract: 'Firmado', consent: 'Firmado', tone: 'peach' },
  { id: 'CN-2479', name: 'Camila Ortega', initials: 'CO', treatment: 'Consulta de valoración', branch: 'Elixir Clinic', clinician: 'Dra. Sofía Reyes', last: 'Ayer, 16:18', status: 'Seguimiento', contract: 'Pendiente', consent: 'Pendiente', tone: 'mint' },
  { id: 'CN-2478', name: 'Renata Castillo', initials: 'RC', treatment: 'Tratamiento facial', branch: 'Macristy - Florezen', clinician: 'Dra. Elena Ruiz', last: '26 oct, 12:05', status: 'Activo', contract: 'Firmado', consent: 'Firmado', tone: 'blue' },
  { id: 'CN-2477', name: 'Daniela Torres', initials: 'DT', treatment: 'Consulta de valoración', branch: 'Macristy - Elixir Clinic Spa', clinician: 'Dra. Sofía Reyes', last: '25 oct, 10:36', status: 'Nuevo', contract: 'Pendiente', consent: 'Pendiente', tone: 'rose' },
  { id: 'CN-2476', name: 'Mariana Salas', initials: 'MS', treatment: 'Seguimiento', branch: 'Elixir Clinic', clinician: 'Dr. Mateo Cruz', last: '24 oct, 15:20', status: 'Activo', contract: 'Firmado', consent: 'Firmado', tone: 'sand' },
];
const initialBusinesses = [
  { id: 'business-elixir', name: 'Elixir Clinic', active: true },
  { id: 'business-clinic', name: 'Elixir Clinic Spa', active: true },
  { id: 'business-aesthetics', name: 'Florezen', active: true },
];
const initialBranches = [
  { id: 'branch-polanco', name: 'Elixir Clinic', businessId: 'business-elixir', address: 'Mexicali, Baja California', phone: '686 308 6854', hours: 'Lunes a sábados de 9:00 a.m. a 2:00 p.m.', active: true },
  { id: 'branch-roma', name: 'Macristy - Elixir Clinic Spa', businessId: 'business-clinic', address: 'Mexicali, Baja California', phone: '686 308 6854', hours: 'Lunes a viernes de 11:00 a.m. a 7:00 p.m. y sábados de 9:00 a.m. a 2:00 p.m.', active: true },
  { id: 'branch-santa-fe', name: 'Macristy - Florezen', businessId: 'business-aesthetics', address: 'Mexicali, Baja California', phone: '686 308 6854', hours: 'Lunes a sábados de 9:00 a.m. a 7:00 p.m.', active: true },
  { id: 'branch-zaragoza-spa', name: 'Zaragoza - Elixir Clinic Spa', businessId: 'business-clinic', address: 'Mexicali, Baja California', phone: '686 308 6854', hours: 'Lunes a viernes de 10:00 a.m. a 6:00 p.m. y sábados de 9:00 a.m. a 2:00 p.m.', active: true },
  { id: 'branch-zaragoza-florezen', name: 'Zaragoza - Florezen', businessId: 'business-aesthetics', address: 'Mexicali, Baja California', phone: '686 308 6854', hours: 'Lunes a sábados de 9:00 a.m. a 7:00 p.m.', active: true },
];
const initialProviders = [
  { id: 'provider-sofia', name: 'Dra. Sofía Reyes', role: 'Medicina estética · Administradora', branchIds: ['branch-polanco', 'branch-roma'], tone: 'lavender', active: true },
  { id: 'provider-mateo', name: 'Dr. Mateo Cruz', role: 'Medicina estética · Profesional', branchIds: ['branch-polanco', 'branch-roma'], tone: 'mint', active: true },
  { id: 'provider-elena', name: 'Dra. Elena Ruiz', role: 'Medicina estética · Profesional', branchIds: ['branch-santa-fe'], tone: 'peach', active: true },
];
const initialAppointments = [
  { date: '2026-10-26', time: '09:00', patient: 'Valeria Mendoza', initials: 'VM', service: 'Consulta de valoración', clinician: 'Dra. Sofía Reyes', branch: 'Elixir Clinic', duration: '45 min', status: 'Confirmada', tone: 'violet' },
  { date: '2026-10-26', time: '10:00', patient: 'Lucía Fernández', initials: 'LF', service: 'Limpieza facial', clinician: 'Dr. Mateo Cruz', branch: 'Macristy - Elixir Clinic Spa', duration: '60 min', status: 'Confirmada', tone: 'peach' },
  { date: '2026-10-26', time: '11:30', patient: 'Camila Ortega', initials: 'CO', service: 'Consulta de valoración', clinician: 'Dra. Sofía Reyes', branch: 'Elixir Clinic', duration: '45 min', status: 'Por confirmar', tone: 'mint' },
  { date: '2026-10-26', time: '13:00', patient: 'Renata Castillo', initials: 'RC', service: 'Tratamiento facial', clinician: 'Dra. Elena Ruiz', branch: 'Macristy - Florezen', duration: '90 min', status: 'Confirmada', tone: 'blue' },
  { date: '2026-10-26', time: '15:00', patient: 'Daniela Torres', initials: 'DT', service: 'Consulta de valoración', clinician: 'Dra. Sofía Reyes', branch: 'Macristy - Elixir Clinic Spa', duration: '45 min', status: 'Por confirmar', tone: 'rose' },
  { date: '2026-10-26', time: '16:30', patient: 'Mariana Salas', initials: 'MS', service: 'Seguimiento', clinician: 'Dr. Mateo Cruz', branch: 'Elixir Clinic', duration: '30 min', status: 'Confirmada', tone: 'sand' },
].map(appointment => {
  const patient = initialPatients.find(item => item.name === appointment.patient);
  const branch = initialBranches.find(item => item.name === appointment.branch);
  const provider = initialProviders.find(item => item.name === appointment.clinician);
  return { ...appointment, modality: appointment.modality || 'Presencial', id: `appointment-${appointment.date}-${appointment.time}-${patient?.id||'demo'}`, patientId: patient?.id, branchId: branch?.id, businessId: branch?.businessId, providerId: provider?.id, business: initialBusinesses.find(item => item.id === branch?.businessId)?.name };
});
const legacyDemoBranchNames = {
  Polanco: 'Elixir Clinic',
  'Roma Norte': 'Macristy - Elixir Clinic Spa',
  'Santa Fe': 'Macristy - Florezen',
};
function migrateDemoPatients(items) {
  return items.map(patient => legacyDemoBranchNames[patient.branch] ? { ...patient, branch: legacyDemoBranchNames[patient.branch] } : patient);
}
function migrateDemoAppointments(items) {
  const migrated = items.map(appointment => {
    const branchName = legacyDemoBranchNames[appointment.branch];
    const branch = branchName ? initialBranches.find(item => item.name === branchName) : initialBranches.find(item => item.id === appointment.branchId);
    if (!branch) return appointment;
    const business = initialBusinesses.find(item => item.id === branch.businessId);
    return { ...appointment, branch: branch.name, branchId: branch.id, businessId: branch.businessId, business: business?.name || appointment.business };
  });
  return rebaseUntouchedDemoAppointments(migrated);
}
function migrateDemoPayments(items) {
  return items.map(payment => {
    const branchName = legacyDemoBranchNames[payment.branchName];
    const branch = branchName ? initialBranches.find(item => item.name === branchName) : initialBranches.find(item => item.id === payment.branchId);
    if (!branch) return payment;
    return { ...payment, branchId: branch.id, branchName: branch.name, businessId: branch.businessId, businessName: initialBusinesses.find(item => item.id === branch.businessId)?.name || payment.businessName };
  });
}
function migrateDemoBusinesses(items) {
  const legacyNames = { 'Negocio demo · Clínica': 'Elixir Clinic Spa', 'Negocio demo · Estética': 'Florezen' };
  const migrated = items.map(business => legacyNames[business.name] ? { ...business, name: legacyNames[business.name] } : business);
  if (!migrated.some(business => business.id === 'business-elixir')) migrated.unshift(initialBusinesses[0]);
  return migrated;
}
function migrateDemoBranches(items) {
  const legacySeeds = { 'branch-polanco': ['Polanco', initialBranches[0]], 'branch-roma': ['Roma Norte', initialBranches[1]], 'branch-santa-fe': ['Santa Fe', initialBranches[2]] };
  const migrated = items.map(branch => {
    const legacy = legacySeeds[branch.id];
    if (!legacy || branch.name !== legacy[0]) return branch;
    return { ...branch, ...legacy[1], active: branch.active !== false };
  });
  const knownIds = new Set(migrated.map(branch => branch.id));
  return [...migrated, ...initialBranches.filter(branch => !knownIds.has(branch.id))];
}
const consentLibrary = [
  { title: 'Consentimiento informado', type: 'Documento clínico', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UN CONSENTIMIENTO REAL. No describe procedimientos, riesgos ni alternativas. Sustituye íntegramente este texto por la versión revisada y aprobada por la clínica antes de solicitar una firma.', isDemoPlaceholder: true, initials: 'CI', color: 'lavender' },
  { title: 'Aviso de privacidad', type: 'Protección de datos', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UN AVISO DE PRIVACIDAD. No describe tratamientos de datos ni derechos. Sustituye íntegramente este texto por el aviso revisado y aprobado por la clínica antes de solicitar una firma.', isDemoPlaceholder: true, initials: 'AP', color: 'mint' },
  { title: 'Autorización de uso de imagen', type: 'Autorización', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UNA AUTORIZACIÓN. No concede permiso para captar ni usar imágenes. Sustituye íntegramente este texto por el formato revisado y aprobado por la clínica antes de solicitar una firma.', isDemoPlaceholder: true, initials: 'AI', color: 'peach' },
];
const initialContractTemplates = [{
  id: 'contract-template-demo-services',
  title: 'Prestación de servicios · muestra',
  type: 'Prestación de servicios',
  version: 'demo',
  content: 'MUESTRA DE FLUJO — NO ES UN CONTRATO. No contiene cláusulas ni condiciones comerciales. Sustituye íntegramente este texto por el documento revisado y aprobado por la clínica antes de preparar un contrato.',
  active: true,
  isDemoPlaceholder: true,
}];

const pageRoutes = {
  overview: "/",
  agenda: "/agenda",
  payments: "/pagos",
  reminders: "/recordatorios",
  patients: "/pacientes",
  consents: "/consentimientos",
  contracts: "/contratos",
  team: "/equipo",
};
const routePages = Object.fromEntries(
  Object.entries(pageRoutes).map(([page, route]) => [route, page]),
);

function usePersistentList(key, initialValue, enabled = true, migrateStoredValue) {
  const [value, setValue] = useState(typeof initialValue === 'function' ? [] : initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (!enabled) { setIsHydrated(false); return; }
    let loadedStoredValue = false;
    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue) {
        const parsedValue = JSON.parse(storedValue);
        if (Array.isArray(parsedValue)) {
          setValue(migrateStoredValue ? migrateStoredValue(parsedValue) : parsedValue);
          loadedStoredValue = true;
        }
      }
    } catch {
      // Invalid or unavailable local storage falls back to synthetic demo data.
    }
    if (!loadedStoredValue && typeof initialValue === 'function') setValue(initialValue());
    setIsHydrated(true);
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled || !isHydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The CRM remains usable for this session when storage is unavailable.
    }
  }, [enabled, isHydrated, key, value]);

  return [value, setValue];
}

function migrateDemoConsentTemplates(templates) {
  return templates.map(template => {
    const demoSample = consentLibrary.find(seed => seed.title === template.title);
    if (template.content?.trim() || !demoSample) return template;
    return { ...template, content: demoSample.content, version: 'demo', uses: 'Muestra de flujo', isDemoPlaceholder: true };
  });
}

function migrateDemoContractTemplates(templates) {
  return templates.length ? templates : initialContractTemplates;
}

function formatRecordDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function formatCurrencyMXN(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(value) || 0);
}
function summarizeRefundAvailability(patientId, patientName, appointment, appointments, payments) {
  const balance = payments
    .filter(payment => appointment ? payment.appointmentId === appointment.id : payment.patientId === patientId)
    .reduce((total, payment) => total + (payment.direction === 'Reembolso' ? -Number(payment.amount) : Number(payment.amount)), 0);
  const isConfirmed = item => ['Confirmada', 'confirmed'].includes(item.status);
  const protectedDeposits = appointment
    ? isConfirmed(appointment) && appointment.depositRequired ? Number(appointment.depositAmount || 0) : 0
    : appointments
      .filter(item => (item.patientId === patientId || item.patient === patientName) && isConfirmed(item) && item.depositRequired)
      .reduce((total, item) => total + Number(item.depositAmount || 0), 0);
  return { balance, protectedDeposits, available: Math.max(0, balance - protectedDeposits) };
}
function dateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
}
function createCurrentDemoAppointments() {
  const date = dateKeyInTimeZone(new Date(), 'America/Tijuana');
  return initialAppointments.map(appointment => ({
    ...appointment,
    date,
    id: String(appointment.id).replace(appointment.date, date),
  }));
}
function rebaseUntouchedDemoAppointments(appointments) {
  if (appointments.length !== initialAppointments.length) return appointments;
  const isUntouchedSeed = appointments.every((appointment, index) => {
    const { id: expectedId, date: expectedDate, ...expectedFields } = initialAppointments[index];
    const { id: actualId, date: actualDate, ...actualFields } = appointment;
    return actualId === expectedId && actualDate === expectedDate
      && JSON.stringify(actualFields) === JSON.stringify(expectedFields);
  });
  return isUntouchedSeed ? createCurrentDemoAppointments() : appointments;
}
function timeToMinutes(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}
function latestAppointmentStart(durationMinutes) {
  const latestMinute = Math.floor((24 * 60 - Number(durationMinutes)) / 15) * 15;
  return `${String(Math.floor(latestMinute / 60)).padStart(2, '0')}:${String(latestMinute % 60).padStart(2, '0')}`;
}
function isValidAppointmentTime(time, durationMinutes) {
  const start = timeToMinutes(time);
  return Number.isInteger(start) && start >= 6 * 60 && start % 15 === 0 && start + Number(durationMinutes) <= 24 * 60;
}
function isScheduleBoundsError(error) {
  const cause = error?.cause || {};
  return [error?.constraint, cause.constraint, cause.message, cause.details].some(value => String(value || '').includes('appointments_schedule_bounds'));
}
function documentHistory(patient, kind) {
  const key = kind === 'contract' ? 'contractHistory' : 'consentHistory';
  if (Array.isArray(patient?.[key])) return patient[key];
  const status = patient?.[kind];
  if (!['Pendiente', 'Firmado', 'Reemplazado'].includes(status)) return [];
  const isContract = kind === 'contract';
  return [{
    id: `legacy-${kind}-${patient.id}`,
    diagnosisId: isContract ? patient?.contractDiagnosisId || '' : '',
    title: isContract ? (patient.contractTemplateTitle || patient.contractType || 'Contrato de prestación de servicios') : (patient.consentDocument || 'Consentimiento informado'),
    type: isContract ? (patient.contractType || 'Prestación de servicios') : 'Consentimiento informado',
    contentSnapshot: isContract ? (patient.contractContent || '') : (patient.consentContentSnapshot || ''),
    service: patient.contractService || patient.treatment || '',
    status,
    requestedAt: isContract ? patient.contractRequestedAt || null : patient.consentRequestedAt || null,
    signedAt: isContract ? patient.contractSignedAt || null : patient.consentSignedAt || null,
    legacy: true,
  }];
}
function latestDocumentRecord(patient, kind) {
  const records = documentHistory(patient, kind).slice().sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
  return records.find(record => record.status !== 'Reemplazado') || records[0] || null;
}
function IconButton({ children, className = '', ...props }) { return <button className={`icon-button ${className}`} {...props}>{children}</button>; }
function Avatar({ initials, tone = 'violet', size = '' }) { return <span className={`avatar ${tone} ${size}`}>{initials}</span>; }
function Badge({ children, variant = '' }) { return <span className={`badge ${variant}`}>{children}</span>; }
function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-title-action">{action}</div>}</div>;
}

function PatientDirectoryGate({ status, memberships, chooseClinic, retry, title = 'Pacientes' }) {
  const copy = {
    loading: ['Conectando con la clínica', 'Estamos cargando el directorio compartido.'],
    signed_out: ['Sesión no disponible', 'Inicia sesión para consultar el directorio.'],
    no_membership: ['Falta asignar una clínica', 'Tu usuario todavía no tiene una membresía de clínica. Un administrador debe vincularlo.'],
    no_patient_access: ['Acceso no habilitado', 'Tu rol no tiene permiso para consultar expedientes de pacientes.'],
    error: ['No se pudo cargar el directorio', 'La conexión o los permisos de la base compartida no respondieron. Puedes reintentar.'],
    not_configured: ['Conexión pendiente', 'Configura el proyecto Supabase para cargar expedientes compartidos.'],
    choose_clinic: ['Selecciona tu clínica', 'Elige el espacio de trabajo que quieres consultar.'],
  };
  const pageTitle = title === 'Agenda' ? 'Agenda del espacio clínico seleccionado.' : 'Expedientes del espacio clínico seleccionado.';
  const [heading, message] = copy[status] || ['Conectando con la clínica', 'Estamos cargando los datos compartidos.'];
  return <><PageTitle eyebrow={title==='Agenda'?'AGENDA COMPARTIDA':'DIRECTORIO COMPARTIDO'} title={title} description={pageTitle}/><section className="panel shared-module-panel"><div className="shared-module-icon"><UsersRound size={20}/></div><h2>{heading}</h2><p>{message}</p>{status==='choose_clinic'&&<label className="shared-clinic-select">Clínica<select defaultValue="" onChange={event=>chooseClinic(event.target.value)}><option value="" disabled>Seleccionar clínica…</option>{memberships.map(item=><option key={item.clinicId} value={item.clinicId}>{item.name}</option>)}</select></label>}{status==='error'&&<button className="button primary" onClick={retry}>Reintentar</button>}</section></>;
}

function AgendaDataGate({ status, retry, title='Agenda' }) {
  const overview = title === 'Resumen';
  return <><PageTitle eyebrow={overview?'RESUMEN COMPARTIDO':'AGENDA COMPARTIDA'} title={title} description={overview?'Indicadores del espacio clínico seleccionado.':'Citas del espacio clínico seleccionado.'}/><section className="panel shared-module-panel"><div className="shared-module-icon">{overview?<LayoutDashboard size={20}/>:<CalendarDays size={20}/>}</div><h2>{status==='error'?(overview?'No se pudo cargar el resumen':'No se pudo cargar la agenda'):(overview?'Preparando resumen compartido':'Cargando agenda compartida')}</h2><p>{status==='error'?'La conexión o los permisos de la base no respondieron.':'Estamos consultando los datos del periodo seleccionado.'}</p>{status==='error'&&<button className="button primary" onClick={retry}>Reintentar</button>}</section></>;
}

function FinanceWorkspaceGate({ status, retry, memberships, chooseClinic }) {
  const messages = {
    loading: ['Cargando finanzas', 'Consultando el historial financiero del espacio clínico.'],
    error: ['No se pudo cargar el historial', 'La conexión o los permisos de pagos no respondieron. Puedes reintentar.'],
    no_access: ['Acceso no habilitado', 'Tu rol no puede consultar el historial financiero.'],
    signed_out: ['Sesión no disponible', 'Inicia sesión para consultar el historial financiero.'],
    no_membership: ['Falta asignar una clínica', 'Un administrador debe vincular tu usuario a una clínica.'],
    not_configured: ['Conexión pendiente', 'Configura el proyecto Supabase para cargar los movimientos compartidos.'],
  };
  const [heading, message] = messages[status] || ['Selecciona una clínica', 'Elige el espacio financiero que quieres consultar.'];
  return <><PageTitle eyebrow="FINANZAS COMPARTIDAS" title="Pagos" description="Movimientos del espacio clínico seleccionado."/><section className="panel shared-module-panel"><div className="shared-module-icon"><DollarSign size={20}/></div><h2>{heading}</h2><p>{message}</p>{status==='choose_clinic'&&<label className="shared-clinic-select">Clínica<select defaultValue="" onChange={event=>chooseClinic(event.target.value)}><option value="" disabled>Seleccionar clínica…</option>{memberships.map(item=><option key={item.clinicId} value={item.clinicId}>{item.name}</option>)}</select></label>}{status==='error'&&<button className="button primary" onClick={retry}>Reintentar</button>}</section></>;
}

function ReminderDataGate({ status, retry }) {
  const messages = {
    loading: ['Cargando el calendario', 'Consultando los recordatorios de citas confirmadas.'],
    error: ['No se pudo cargar el calendario', 'La conexión o los permisos de recordatorios no respondieron. Puedes reintentar.'],
    no_access: ['Acceso no habilitado', 'Tu rol no puede consultar el calendario de recordatorios.'],
  };
  const [heading, message] = messages[status] || ['Conexión pendiente', 'Configura Supabase para cargar los recordatorios compartidos.'];
  return <><PageTitle eyebrow="RECORDATORIOS COMPARTIDOS" title="Recordatorios" description="Mensajes programados alrededor de cada cita confirmada."/><section className="panel shared-module-panel"><div className="shared-module-icon"><Bell size={20}/></div><h2>{heading}</h2><p>{message}</p>{status==='error'&&<button className="button primary" onClick={retry}>Reintentar</button>}</section></>;
}

function App({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const isStandaloneRoute = pathname === '/login' || pathname === '/setup';
  const supabaseConfigured = isSupabaseConfigured();
  const sharedDirectory = usePatientDirectory(supabaseConfigured && !isStandaloneRoute);
  const sharedMode = supabaseConfigured && !isStandaloneRoute;
  const clinicTimeZone = sharedMode ? sharedDirectory.timeZone : 'America/Tijuana';
  const [clinicProfileName, setClinicProfileName] = useState('Mi clínica');
  const [clinicProfileLoaded, setClinicProfileLoaded] = useState(false);
  const [theme, setTheme] = useState('light');
  const [themeLoaded, setThemeLoaded] = useState(false);
  useEffect(() => {
    let savedTheme = 'light';
    try {
      if (window.localStorage.getItem('crm-theme-v1') === 'dark') savedTheme = 'dark';
    } catch {
      // The default theme remains available when browser storage is unavailable.
    }
    document.documentElement.dataset.theme = savedTheme;
    setTheme(savedTheme);
    setThemeLoaded(true);
  }, []);
  useEffect(() => {
    if (!themeLoaded) return;
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('crm-theme-v1', theme);
    } catch {
      // Theme selection remains active for this session.
    }
  }, [theme, themeLoaded]);
  useEffect(() => {
    try {
      const savedName = window.localStorage.getItem('crm-demo-clinic-name-v1')?.trim();
      if (savedName) setClinicProfileName(savedName);
    } catch {
      // The demo keeps its default clinic name if browser storage is unavailable.
    }
    setClinicProfileLoaded(true);
  }, []);
  useEffect(() => {
    if (!clinicProfileLoaded || sharedMode) return;
    try {
      window.localStorage.setItem('crm-demo-clinic-name-v1', clinicProfileName);
    } catch {
      // The demo remains usable for this session when storage is unavailable.
    }
  }, [clinicProfileName, clinicProfileLoaded, sharedMode]);
  const activeClinicName = sharedMode
    ? sharedDirectory.memberships.find(item => item.clinicId === sharedDirectory.clinicId)?.name || 'Clínica compartida'
    : clinicProfileName;
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const patientSearchRef = useRef(null);
  const [focusPatientSearch, setFocusPatientSearch] = useState(false);
  const page = routePages[pathname] || 'overview';
  const setPage = (nextPage) => {
    const route = pageRoutes[nextPage];
    setMobileNavOpen(false);
    if (route && route !== pathname) router.push(route);
  };
  const openPatientSearch = () => {
    setFocusPatientSearch(true);
    setPage('patients');
  };
  useEffect(() => {
    if (page !== 'patients' || !focusPatientSearch) return;
    patientSearchRef.current?.focus();
    setFocusPatientSearch(false);
  }, [page, focusPatientSearch]);
  useEffect(() => {
    const handleSearchShortcut = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      openPatientSearch();
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  });
  const [demoPatients, setDemoPatients] = usePersistentList('crm-demo-patients-v1', sharedMode ? [] : initialPatients, !sharedMode && !isStandaloneRoute, migrateDemoPatients);
  const [demoAppointments, setDemoAppointments] = usePersistentList('crm-demo-appointments-v1', sharedMode ? [] : createCurrentDemoAppointments, !sharedMode && !isStandaloneRoute, migrateDemoAppointments);
  const [demoPayments, setPayments] = usePersistentList('crm-demo-payments-v1', [], !sharedMode && !isStandaloneRoute, migrateDemoPayments);
  const [demoBusinesses, setDemoBusinesses] = usePersistentList('crm-demo-businesses-v1', sharedMode ? [] : initialBusinesses, !sharedMode && !isStandaloneRoute, migrateDemoBusinesses);
  const [demoBranches, setDemoBranches] = usePersistentList('crm-demo-branches-v1', sharedMode ? [] : initialBranches, !sharedMode && !isStandaloneRoute, migrateDemoBranches);
  const [demoProviders, setDemoProviders] = usePersistentList('crm-demo-providers-v1', sharedMode ? [] : initialProviders, !sharedMode && !isStandaloneRoute);
  const [consentTemplates, setConsentTemplates] = usePersistentList('crm-demo-consent-templates-v1', sharedMode ? [] : consentLibrary, !sharedMode && !isStandaloneRoute, migrateDemoConsentTemplates);
  const [contractTemplates, setContractTemplates] = usePersistentList('crm-demo-contract-templates-v1', sharedMode ? [] : initialContractTemplates, !sharedMode && !isStandaloneRoute, migrateDemoContractTemplates);
  const [demoPatientActivities, setDemoPatientActivities] = usePersistentList('crm-demo-patient-activities-v1', [], !sharedMode && !isStandaloneRoute);
  const patients = sharedMode ? sharedDirectory.patients : demoPatients;
  const setPatients = setDemoPatients;
  const consentTemplatesForPage = sharedMode ? sharedDirectory.templates.filter(template => template.kind === 'consent') : consentTemplates.filter(template => template.active !== false);
  const contractTemplatesForPage = sharedMode ? sharedDirectory.templates.filter(template => template.kind === 'contract') : contractTemplates.filter(template => template.active !== false);
  const businesses = sharedMode ? sharedDirectory.businesses : demoBusinesses;
  const branches = sharedMode ? sharedDirectory.branches : demoBranches;
  const providers = sharedMode ? sharedDirectory.providers : demoProviders;
  const patientActivities = sharedMode ? sharedDirectory.activities : demoPatientActivities;
  const [agendaDate, setAgendaDate] = useState('2026-10-26');
  useEffect(() => {
    const today = dateKeyInTimeZone(new Date(), clinicTimeZone);
    setAgendaDate(today);
    setAppointmentDefaults(current => ({ ...current, date: today }));
    setPaymentDefaults(current => ({ ...current, date: today }));
  }, [clinicTimeZone]);
  const [appointmentDefaults, setAppointmentDefaults] = useState({ date: '2026-10-26', time: '17:00', patientId: '' });
  const [paymentDefaults, setPaymentDefaults] = useState({ date: '2026-10-26', appointmentId: '' });
  const [contractDefaults, setContractDefaults] = useState({ patientId: '' });
  const [consentDefaults, setConsentDefaults] = useState({ patientId: '', templateId: '' });
  const [contractTemplateReturn, setContractTemplateReturn] = useState(null);
  const [consentTemplateReturn, setConsentTemplateReturn] = useState(null);
  const [consentTemplateDraft, setConsentTemplateDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [businessFilter, setBusinessFilter] = useState('');
  const [period, setPeriod] = useState('Día');
  const sharedAgenda = useClinicAgenda(sharedMode && (page === 'agenda' || page === 'overview') && sharedDirectory.status === 'ready', sharedDirectory.clinicId, agendaDate, page === 'overview' ? 'Mes' : period, sharedDirectory.timeZone, { patients, branches, providers, businesses });
  const appointments = sharedMode ? sharedAgenda.appointments : demoAppointments;
  const canReadSharedPayments = ['admin', 'receptionist'].includes(sharedDirectory.role);
  const sharedPaymentWorkspace = useClinicPayments(sharedMode && (page === 'payments' || (page === 'agenda' && canReadSharedPayments)), sharedDirectory.clinicId, sharedDirectory.role, sharedDirectory.timeZone, { branches, providers, businesses });
  const sharedReminderWorkspace = useClinicReminders(sharedMode && page === 'reminders' && sharedDirectory.status === 'ready', sharedDirectory.clinicId, sharedDirectory.role, sharedDirectory.timeZone);
  const payments = sharedMode ? sharedPaymentWorkspace.payments : demoPayments;
  const demoReminders = useMemo(() => createDemoAppointmentReminders(appointments, patients), [appointments, patients]);
  const reminders = sharedMode ? sharedReminderWorkspace.reminders : demoReminders;
  const paymentPatients = sharedMode ? sharedPaymentWorkspace.patients : patients;
  const paymentAppointments = sharedMode ? sharedPaymentWorkspace.appointments : appointments;
  const setAppointments = setDemoAppointments;
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedBranchRecord, setSelectedBranchRecord] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [selectedConsent, setSelectedConsent] = useState('Consentimiento informado');
  const [selectedConsentRecordId, setSelectedConsentRecordId] = useState('');
  const [selectedContractRecordId, setSelectedContractRecordId] = useState('');
  const [modalReturn, setModalReturn] = useState(null);

  const openNewAppointment = (date = agendaDate, time = '17:00', patientId = '') => {
    setAppointmentDefaults({ date, time, patientId });
    setModal('new-appointment');
  };
  const openPaymentModal = (appointmentId = '') => {
    const date = dateKeyInTimeZone(new Date(), clinicTimeZone);
    setPaymentDefaults({ date, appointmentId });
    setModalReturn(modal === 'appointment' ? 'appointment' : 'payments');
    setModal('new-payment');
  };
  const openContractPreparation = (patientId = '', returnTo = null) => {
    setContractDefaults({ patientId });
    setModalReturn(returnTo);
    setModal('new-contract');
  };
  const openConsentPreparation = (patientId = '', returnTo = null, templateId = '') => {
    setConsentDefaults({ patientId, templateId });
    setModalReturn(returnTo);
    setConsentTemplateReturn(returnTo);
    setModal('send-consent');
  };
  const closeContractPreparation = () => {
    setModal(modalReturn || null);
    setModalReturn(null);
  };
  const closeConsentPreparation = () => {
    setModal(modalReturn || null);
    setModalReturn(null);
    setConsentTemplateReturn(null);
  };
  const openContractTemplateCreation = (returnTo = null) => {
    setContractTemplateReturn(returnTo);
    setModal('new-contract-template');
  };
  const closeContractTemplateCreation = () => {
    setModal(contractTemplateReturn || null);
    setContractTemplateReturn(null);
  };
  const openConsentTemplateCreation = (returnTo = null, template = null) => {
    setConsentTemplateReturn(returnTo);
    setConsentTemplateDraft(template);
    setModal('new-consent-template');
  };
  const closeConsentTemplateCreation = () => {
    setModal(consentTemplateReturn || null);
    setConsentTemplateReturn(null);
    setConsentTemplateDraft(null);
  };

  useEffect(() => {
    if (!appointments.some(appointment => !appointment.patientId && patients.some(patient => patient.name === appointment.patient))) return;
    setAppointments(previous => previous.map(appointment => appointment.patientId ? appointment : { ...appointment, patientId: patients.find(patient => patient.name === appointment.patient)?.id }));
  }, [appointments, patients, setAppointments]);
  useEffect(() => {
    if (!appointments.some(appointment => !appointment.id)) return;
    setAppointments(previous => previous.map(appointment => appointment.id ? appointment : { ...appointment, id: `appointment-${appointment.date}-${appointment.time}-${appointment.patientId || appointment.patient}` }));
  }, [appointments, setAppointments]);
  useEffect(() => {
    const legacy = appointments.filter(appointment => Number(appointment.amountPaid) > 0 && !payments.some(payment => payment.legacyAppointmentId === appointment.id));
    if (!legacy.length) return;
    setPayments(previous => {
      const migratedAppointmentIds = new Set(previous.map(payment => payment.legacyAppointmentId).filter(Boolean));
      const pending = legacy.filter(appointment => !migratedAppointmentIds.has(appointment.id));
      if (!pending.length) return previous;
      return [...previous, ...pending.map(appointment => ({ id: `payment-legacy-${appointment.id}`, legacyAppointmentId: appointment.id, appointmentId: appointment.id, patientId: appointment.patientId || patients.find(patient => patient.name === appointment.patient)?.id || '', patientNameSnapshot: appointment.patient, date: appointment.date, direction: 'Ingreso', amount: Number(appointment.amountPaid), method: 'Otro', note: 'Importado del monto registrado en la cita', branchId: appointment.branchId || '', businessId: appointment.businessId || '', providerId: appointment.providerId || '', branchName: appointment.branch || '', providerName: appointment.clinician || '', businessName: appointment.business || '' }))];
    });
  }, [appointments, payments, patients, setPayments]);

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const saveClinicName = (event) => {
    event.preventDefault();
    const nextName = String(new FormData(event.currentTarget).get('clinicName') || '').trim();
    if (!nextName) { notify('Escribe el nombre de la clínica.'); return; }
    setClinicProfileName(nextName.slice(0, 80));
    setModal(null);
    notify('Nombre de la clínica actualizado');
  };
  const addPatientActivity = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patientId = String(form.get('patientId') || '');
    const patient = patients.find(item => item.id === patientId);
    const note = String(form.get('note') || '').trim();
    if (!patient || !note) return;
    if (sharedMode) {
      if (sharedDirectory.status !== 'ready' || !sharedDirectory.clinicId) { notify('El directorio no está listo. Actualiza la página e inténtalo de nuevo.'); return; }
      try {
        await createPatientDirectoryStore().addActivity(sharedDirectory.clinicId, patient, { type: String(form.get('type') || 'Otro'), note });
        sharedDirectory.refresh();
        setModal('patient');
        notify('Nota guardada en el expediente compartido');
      } catch {
        notify('No se pudo guardar la nota. Revisa tus permisos e inténtalo de nuevo.');
      }
      return;
    }
    const activity = { id: `activity-${Date.now()}`, patientId, type: String(form.get('type') || 'Seguimiento'), note, createdAt: new Date().toISOString(), author: patient.clinician || 'Equipo clínico' };
    setPatientActivities(items => [activity, ...items]);
    setPatients(items => items.map(item => item.id === patientId ? { ...item, last: 'Actividad registrada hace un momento' } : item));
    setSelectedPatient(current => current?.id === patientId ? { ...current, last: 'Actividad registrada hace un momento' } : current);
    setModal('patient');
    notify('Nota de seguimiento guardada');
  };
  const filteredPatients = useMemo(() => patients.filter(p => `${p.name} ${p.id} ${p.treatment} ${p.clinician} ${p.branch} ${p.email||''} ${p.phone||''}`.toLowerCase().includes(query.toLowerCase())), [patients, query]);
  const businessOptions = useMemo(() => [{ id: '', name: 'Todos los negocios' }, ...businesses.filter(business => business.active).map(business => ({ id: business.id, name: business.name }))], [businesses]);
  const branchOptions = useMemo(() => {
    const activeBranches = branches.filter(branch => branch.active);
    const nameCounts = new Map();
    activeBranches.forEach(branch => nameCounts.set(branch.name, (nameCounts.get(branch.name) || 0) + 1));
    return [
      { id: '', name: 'Todas las sucursales' },
      ...activeBranches
        .filter(branch => !businessFilter || branch.businessId === businessFilter)
        .map(branch => ({
          id: branch.id,
          businessId: branch.businessId,
          name: nameCounts.get(branch.name) > 1
            ? `${branch.name} · ${businesses.find(business => business.id === branch.businessId)?.name || 'Negocio'}`
            : branch.name,
        })),
    ];
  }, [branches, businessFilter, businesses]);
  const providerOptions = useMemo(() => {
    const relevantBranchIds = new Set(branches
      .filter(branch => branch.active && (branchFilter ? branch.id === branchFilter : !businessFilter || branch.businessId === businessFilter))
      .map(branch => branch.id));
    return [
      { id: '', name: 'Todas las personas', branchIds: [] },
      ...providers
        .filter(provider => provider.active && (!provider.branchIds?.length || provider.branchIds.some(id => relevantBranchIds.has(id))))
        .map(provider => ({ id: provider.id, name: provider.name, branchIds: provider.branchIds || [] })),
    ];
  }, [providers, branches, branchFilter, businessFilter]);
  const updateAgendaBranchFilter = branchId => {
    setBranchFilter(branchId);
    const selectedProvider = providers.find(provider => provider.id === providerFilter);
    if (branchId && selectedProvider?.branchIds?.length && !selectedProvider.branchIds.includes(branchId)) setProviderFilter('');
  };
  const updateAgendaBusinessFilter = businessId => {
    setBusinessFilter(businessId);
    setBranchFilter('');
    const selectedProvider = providers.find(provider => provider.id === providerFilter);
    if (businessId && selectedProvider?.branchIds?.length && !selectedProvider.branchIds.some(id => branches.some(branch => branch.id === id && branch.businessId === businessId))) setProviderFilter('');
  };
  const filteredAppointments = useMemo(() => appointments.filter(appointment => {
    const branchId = appointment.branchId || branches.find(branch => branch.name === appointment.branch)?.id;
    const providerId = appointment.providerId || providers.find(provider => provider.name === appointment.clinician)?.id;
    const businessId = appointment.businessId || branches.find(branch => branch.id === branchId)?.businessId || businesses.find(business => business.name === appointment.business)?.id;
    return (!providerFilter || providerId === providerFilter)
      && (!branchFilter || branchId === branchFilter)
      && (!businessFilter || businessId === businessFilter);
  }), [appointments, providerFilter, branchFilter, businessFilter, branches, providers, businesses]);
  const pendingDocs = patients.reduce((total, patient) => total + Number(patient.contract === 'Pendiente') + Number(patient.consent === 'Pendiente'), 0);

  const addPatient = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const treatment = String(form.get('treatment') || 'Por definir').trim();
    const branchId = String(form.get('branchId') || '');
    const providerId = String(form.get('providerId') || '');
    const branch = branches.find(item => item.id === branchId);
    const provider = providers.find(item => item.id === providerId);
    if (!name) return;
    if (sharedMode) {
      if (sharedDirectory.status !== 'ready' || !sharedDirectory.clinicId) { notify('El directorio compartido no está listo. Actualiza la página e inténtalo de nuevo.'); return; }
      try {
        await createPatientDirectoryStore().create(sharedDirectory.clinicId, { name, email, phone, treatment, branchId, providerId });
        sharedDirectory.refresh();
        setModal(null); setQuery(''); setPage('patients');
        notify('Expediente guardado en el directorio compartido');
      } catch {
        notify('No se pudo guardar el expediente. Revisa los campos y tus permisos.');
      }
      return;
    }
    const parts = name.split(/\s+/);
    const initials = parts.slice(0, 2).map(v => v[0]).join('').toUpperCase();
    const p = { id: `CN-${2482 + patients.length - initialPatients.length}`, name, initials, email, phone, treatment, branch: branch?.name || 'Sin sucursal asignada', branchId, clinician: provider?.name || 'Sin profesional asignado', providerId, last: 'Recién agregado', status: 'Nuevo', contract: 'Por preparar', consent: 'Por preparar', tone: 'blue' };
    setPatients(prev => [p, ...prev]); setModal(null); setQuery(''); setPage('patients'); notify('Paciente agregado al directorio');
  };
  const updatePatient = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('id') || '');
    const previous = patients.find(patient => patient.id === id);
    const name = String(form.get('name') || '').trim();
    const branchId = String(form.get('branchId') || '');
    const providerId = String(form.get('providerId') || '');
    const whatsappOptIn = form.get('whatsappOptIn') === 'on';
    const whatsappOptInSource = whatsappOptIn ? String(form.get('whatsappOptInSource') || '') : '';
    const phone = String(form.get('phone') || '').trim();
    const branch = branches.find(item => item.id === branchId);
    const provider = providers.find(item => item.id === providerId);
    if (!previous || !name) return;
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    if (whatsappOptIn && !['written', 'verbal', 'electronic'].includes(whatsappOptInSource)) { notify('Indica cómo autorizó el paciente los avisos por WhatsApp.'); return; }
    if (whatsappOptIn && !/^\+[1-9]\d{7,14}$/.test(phone)) { notify('Para avisos por WhatsApp, usa el teléfono internacional sin espacios, por ejemplo +526641234567.'); return; }
    const consentChanged = whatsappOptIn !== Boolean(previous.whatsappOptIn) || (whatsappOptIn && whatsappOptInSource !== previous.whatsappOptInSource);
    const whatsappConsent = { whatsappOptIn, whatsappOptInSource: whatsappOptIn ? whatsappOptInSource : '', whatsappOptInAt: whatsappOptIn ? (consentChanged ? new Date().toISOString() : previous.whatsappOptInAt || null) : null };
    const update = { name, initials, email: String(form.get('email') || '').trim(), phone, treatment: String(form.get('treatment') || '').trim() || 'Por definir', branch: branch?.name || 'Sin sucursal asignada', branchId, clinician: provider?.name || 'Sin profesional asignado', providerId, status: String(form.get('status') || previous.status), ...whatsappConsent, last: 'Actualizado recientemente' };
    if (sharedMode) {
      if (sharedDirectory.status !== 'ready' || !sharedDirectory.clinicId) { notify('El directorio compartido no está listo. Actualiza la página e inténtalo de nuevo.'); return; }
      try {
        await createPatientDirectoryStore().update(sharedDirectory.clinicId, previous, update);
        sharedDirectory.refresh();
        setSelectedPatient(current => current?.id === id ? { ...current, ...update } : current);
        setModal('patient');
        notify('Expediente actualizado en la base compartida');
      } catch {
        notify('No se pudo actualizar el expediente. Revisa tus permisos e inténtalo de nuevo.');
      }
      return;
    }
    setPatients(current => current.map(patient => patient.id === id ? { ...patient, ...update } : patient));
    setAppointments(current => current.map(appointment => appointment.patientId === id || (!appointment.patientId && appointment.patient === previous.name) ? { ...appointment, patient: name, initials } : appointment));
    setSelectedPatient(current => current?.id === id ? { ...current, ...update } : current);
    setModal('patient'); notify('Expediente actualizado');
  };
  const createAppointment = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const patientId = String(form.get('patientId') || '');
    const patientRecord = patients.find(item => item.id === patientId);
    if (!patientRecord) { notify('Selecciona un paciente del directorio antes de agendar.'); return; }
    const patient = patientRecord.name;
    const providerId = String(form.get('providerId') || providers[0]?.id || '');
    const branchId = String(form.get('branchId') || branches[0]?.id || '');
    const businessId = String(form.get('businessId') || businesses[0]?.id || '');
    const clinician = providers.find(provider => provider.id === providerId)?.name || 'Sin profesional asignado';
    const branch = branches.find(item => item.id === branchId)?.name || 'Sin sucursal asignada';
    const business = businesses.find(item => item.id === businessId)?.name || 'Negocio de demostración';
    const date = String(form.get('date') || agendaDate);
    const time = String(form.get('time') || '09:00');
    const modality = String(form.get('modality') || 'Presencial');
    const durationMinutes = Number(form.get('durationMinutes') || 45);
    if (![15, 30, 45, 60, 75, 90, 120].includes(durationMinutes)) { notify('Selecciona una duración válida para la cita.'); return; }
    const depositRequired = true;
    const depositAmount = Number(form.get('depositAmount') || 0);
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) { notify('Indica un monto de anticipo mayor a cero.'); return; }
    if (!isValidAppointmentTime(time, durationMinutes)) { notify(`El horario debe iniciar entre 06:00 y ${latestAppointmentStart(durationMinutes)} para esta duración.`); return; }
    const start=timeToMinutes(time);
    const minutes = timeToMinutes;
    const collision=appointments.find(existing=>{
      if(existing.status==='Cancelada'||existing.date!==date) return false;
      const existingProviderId=existing.providerId||providers.find(item=>item.name===existing.clinician)?.id;
      const existingPatientId=existing.patientId||patients.find(item=>item.name===existing.patient)?.id;
      const sameResource=existingProviderId===providerId||existingPatientId===patientId;
      if(!sameResource||!existing.time) return false;
      const duration=Number.parseInt(existing.duration,10)||45;
      const existingStart=minutes(existing.time);
      return start<existingStart+duration&&existingStart<start+durationMinutes;
    });
    if(collision){
      const collisionProviderId=collision.providerId||providers.find(item=>item.name===collision.clinician)?.id;
      notify(collisionProviderId===providerId?`${clinician} ya tiene una cita en ese horario.`:`${patient} ya tiene una cita en ese horario.`);
      return;
    }
    const service = String(form.get('service') || '').trim();
    if (!service) { notify('Agrega el nombre del servicio para la cita.'); return; }
    if (sharedMode) {
      try {
        await createClinicAgendaStore().create(sharedDirectory.clinicId, { patient: patientRecord, businessId, branchId, providerId, date, time, modality, service, depositRequired, depositAmount, durationMinutes, note: '' }, sharedDirectory.timeZone);
        sharedAgenda.refresh();
        setAgendaDate(date); setModal(null); setPage('agenda'); setProviderFilter(''); setBranchFilter(''); setBusinessFilter(''); notify('Cita guardada en la agenda compartida');
      } catch (error) {
        notify(error?.code === '23P01' ? 'El paciente o profesional ya tiene una cita en ese horario.' : isScheduleBoundsError(error) ? 'La cita debe iniciar a partir de las 06:00, en intervalos de 15 minutos, y terminar a más tardar a medianoche.' : 'No se pudo guardar la cita. Revisa la asignación de sucursal y tus permisos.');
      }
      return;
    }
    setAppointments(prev => [...prev, { id: `appointment-${Date.now()}`, date, time, patient, patientId, initials: patientRecord.initials, service, clinician, providerId, branch, branchId, business, businessId, modality, depositRequired, depositAmount, duration: `${durationMinutes} min`, status: 'Por confirmar', tone: patientRecord.tone||'blue' }].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)));
    setAgendaDate(date); setModal(null); setPage('agenda'); setProviderFilter(''); setBranchFilter(''); setBusinessFilter(''); notify('Cita agregada a la agenda');
  };
  const updateAppointment = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('id') || '');
    const date = String(form.get('date') || '');
    const time = String(form.get('time') || '');
    const status = String(form.get('status') || 'Por confirmar');
    const businessId = String(form.get('businessId') || '');
    const branchId = String(form.get('branchId') || '');
    const providerId = String(form.get('providerId') || '');
    const current = appointments.find(item => item.id === id);
    if (!current) return;
    const service = String(form.get('service') || current.service || '').trim();
    if (!service) { notify('Agrega el nombre del servicio para la cita.'); return; }
    const selectedBusiness = businesses.find(item => item.id === businessId && item.active !== false);
    const selectedBranch = branches.find(item => item.id === branchId && item.active !== false);
    const selectedProvider = providers.find(item => item.id === providerId && item.active !== false);
    if (!selectedBusiness || !selectedBranch || selectedBranch.businessId !== businessId || !selectedProvider || (selectedProvider.branchIds?.length && !selectedProvider.branchIds.includes(branchId))) {
      notify('Selecciona un negocio, sucursal y profesional compatibles.');
      return;
    }
    const currentDuration = Number.parseInt(current.duration, 10) || 45;
    const durationMinutes = Number(form.get('durationMinutes') || currentDuration);
    if (![15, 30, 45, 60, 75, 90, 120].includes(durationMinutes) && durationMinutes !== currentDuration) { notify('Selecciona una duración válida para la cita.'); return; }
    if (!sharedMode && current.depositRequired && ['Confirmada', 'Completada'].includes(status)) {
      const received = payments.filter(payment => payment.appointmentId === current.id).reduce((total, payment) => total + (payment.direction === 'Reembolso' ? -Number(payment.amount) : Number(payment.amount)), 0);
      if (received + 0.001 < Number(current.depositAmount || 0)) { notify(`Registra el anticipo de ${formatCurrencyMXN(current.depositAmount)} antes de confirmar esta cita.`); return; }
    }
    const modality = String(form.get('modality') || current.modality || 'Presencial');
    if (status !== 'Cancelada' && !isValidAppointmentTime(time, durationMinutes)) { notify(`El horario debe iniciar entre 06:00 y ${latestAppointmentStart(durationMinutes)} para esta duración.`); return; }
    const minutes = timeToMinutes;
    if (status !== 'Cancelada') {
      const patientId = current.patientId || patients.find(item => item.name === current.patient)?.id;
      const collision = appointments.find(item => {
        if (item.id === id || item.status === 'Cancelada' || item.date !== date || !item.time) return false;
        const otherProviderId = item.providerId || providers.find(provider => provider.name === item.clinician)?.id;
        const otherPatientId = item.patientId || patients.find(patient => patient.name === item.patient)?.id;
        if (otherProviderId !== providerId && otherPatientId !== patientId) return false;
        const duration = Number.parseInt(item.duration, 10) || 45;
        const otherStart = minutes(item.time);
        return minutes(time) < otherStart + duration && otherStart < minutes(time) + durationMinutes;
      });
      if (collision) { notify('Ese horario se cruza con otra cita del paciente o profesional.'); return; }
    }
    if (sharedMode) {
      try {
        await createClinicAgendaStore().update(sharedDirectory.clinicId, current, { date, time, status, modality, durationMinutes, businessId, branchId, providerId, service }, sharedDirectory.timeZone);
        sharedAgenda.refresh();
      } catch (error) {
        notify(error?.code === '23P01' ? 'El paciente o profesional ya tiene una cita en ese horario.' : isScheduleBoundsError(error) ? 'La cita debe iniciar a partir de las 06:00, en intervalos de 15 minutos, y terminar a más tardar a medianoche.' : error?.code === '23514' ? `Registra el anticipo de ${formatCurrencyMXN(current.depositAmount)} antes de confirmar esta cita.` : 'No se pudo actualizar la cita. Revisa el horario y tus permisos.');
        return;
      }
    } else {
      setAppointments(items => items.map(item => item.id === id ? { ...item, date, time, status, modality, service, duration: `${durationMinutes} min`, businessId, business: selectedBusiness.name, branchId, branch: selectedBranch.name, providerId, clinician: selectedProvider.name } : item).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)));
    }
    setAgendaDate(date); setSelectedAppointment(null); setModal(null); notify('Cita actualizada');
  };
  const createPayment = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const appointmentId = String(form.get('appointmentId') || '');
    const appointment = paymentAppointments.find(item => item.id === appointmentId) || (selectedAppointment?.id === appointmentId ? selectedAppointment : null);
    let patientId = String(form.get('patientId') || '');
    if (appointment) patientId = appointment.patientId || paymentPatients.find(patient => patient.name === appointment.patient)?.id || patientId;
    const patient = paymentPatients.find(item => item.id === patientId);
    const amount = Number(form.get('amount') || 0);
    const direction = String(form.get('direction') || 'Ingreso');
    const date = String(form.get('date') || '');
    if (!patient || !date || !Number.isFinite(amount) || amount <= 0) { notify('Selecciona un paciente, una fecha y un monto mayor a cero.'); return; }
    const balance = payments.filter(payment => appointment ? payment.appointmentId === appointment.id : payment.patientId === patient.id).reduce((total, payment) => total + (payment.direction === 'Reembolso' ? -Number(payment.amount) : Number(payment.amount)), 0);
    if (direction === 'Reembolso' && amount > balance + 0.001) { notify('El reembolso no puede superar los ingresos registrados para este expediente o cita.'); return; }
    if (direction === 'Reembolso') {
      const availability = summarizeRefundAvailability(patient.id, patient.name, appointment, paymentAppointments, payments);
      if (amount > availability.available + 0.001) {
        notify(appointment
          ? 'Ese reembolso dejaría una cita confirmada por debajo del anticipo requerido.'
          : 'Ese reembolso usaría fondos reservados para anticipos de citas confirmadas. Vincúlalo a otra cita o reduce el monto.');
        return;
      }
    }
    const branchId = appointment?.branchId || patient.branchId || branches.find(branch => branch.name === patient.branch)?.id || '';
    const providerId = appointment?.providerId || patient.providerId || providers.find(provider => provider.name === patient.clinician)?.id || '';
    const businessId = appointment?.businessId || branches.find(branch => branch.id === branchId)?.businessId || '';
    if (sharedMode) {
      try {
        await createClinicPaymentsStore().create(sharedDirectory.clinicId, patient, appointment, { direction, amount, method: String(form.get('method') || 'Otro'), date, note: String(form.get('note') || '').trim() });
        sharedPaymentWorkspace.refresh();
        setModal(modalReturn === 'appointment' ? 'appointment' : null);
        setModalReturn(null);
        notify(direction === 'Reembolso' ? 'Reembolso guardado en el historial compartido' : 'Pago guardado en el historial compartido');
      } catch (error) {
        const databaseDetail = [error?.cause?.constraint, error?.cause?.message, error?.cause?.details].filter(Boolean).join(' ');
        notify(databaseDetail.includes('payments_refund_preserves_appointment_deposit')
          ? 'Ese reembolso dejaría una cita confirmada por debajo del anticipo requerido.'
          : databaseDetail.includes('payments_refund_preserves_patient_deposits')
            ? 'Ese reembolso usaría fondos reservados para anticipos de citas confirmadas. Vincula el reembolso a una cita o reduce el monto.'
          : error?.code === '23514' ? 'El reembolso supera el saldo disponible.' : error.message || 'No se pudo registrar el movimiento. Revisa tus permisos.');
      }
      return;
    }
    const payment = { id: `payment-${Date.now()}`, patientId: patient.id, patientNameSnapshot: patient.name, appointmentId: appointment?.id || '', date, direction, amount, method: String(form.get('method') || 'Otro'), note: String(form.get('note') || '').trim(), branchId, providerId, businessId, branchName: appointment?.branch || patient.branch || '', providerName: appointment?.clinician || patient.clinician || '', businessName: appointment?.business || businesses.find(item => item.id === businessId)?.name || '', createdAt: new Date().toISOString() };
    setPayments(previous => [...previous, payment].sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||'').localeCompare(String(a.createdAt||''))));
    setModal(modalReturn === 'appointment' ? 'appointment' : null);
    setModalReturn(null);
    notify(direction === 'Reembolso' ? 'Reembolso registrado' : 'Pago registrado');
  };
  const openPatientFromAppointment = () => {
    const patient = patients.find(item => item.id === selectedAppointment?.patientId || item.name === selectedAppointment?.patient);
    if (!patient) { notify('No se encontró el expediente vinculado.'); return; }
    setSelectedAppointment(null); setSelectedPatient(patient); setModal('patient');
  };
  const createBusiness = async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') || '').trim();
    if (!name) return;
    if (sharedMode) {
      try {
        await createPatientDirectoryStore().createBusiness(sharedDirectory.clinicId, name);
        sharedDirectory.refresh(); setModal(null); notify('Negocio guardado en el espacio compartido');
      } catch (error) { notify(error.message || 'No se pudo guardar el negocio.'); }
      return;
    }
    const id = `business-${Date.now()}`;
    setBusinesses(previous => [...previous, { id, name, active: true }]);
    setModal(null); notify('Negocio agregado al espacio de demostración');
  };
  const createBranch = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const businessId = String(form.get('businessId') || '');
    const address = String(form.get('address') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const hours = String(form.get('hours') || '').trim();
    if (!name || !businessId) return;
    if (sharedMode) {
      try {
        await createPatientDirectoryStore().createBranch(sharedDirectory.clinicId, { name, businessId, address });
        sharedDirectory.refresh(); setModal(null); notify('Sucursal guardada en el espacio compartido');
      } catch (error) { notify(error.message || 'No se pudo guardar la sucursal.'); }
      return;
    }
    setBranches(previous => [...previous, { id: `branch-${Date.now()}`, name, businessId, address, phone, hours, active: true }]);
    setModal(null); notify('Sucursal agregada al espacio de demostración');
  };
  const updateBranch = async (event) => {
    event.preventDefault();
    if (!selectedBranchRecord) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const address = String(form.get('address') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const hours = String(form.get('hours') || '').trim();
    if (!name) { notify('Escribe el nombre de la sucursal.'); return; }
    if (sharedMode) {
      if (!['admin', 'receptionist'].includes(sharedDirectory.role)) { notify('Tu rol no puede editar sucursales.'); return; }
      try {
        await createPatientDirectoryStore().updateBranch(sharedDirectory.clinicId, selectedBranchRecord, { name, address });
        sharedDirectory.refresh(); setModal(null); setSelectedBranchRecord(null); notify('Sucursal actualizada');
      } catch (error) { notify(error.message || 'No se pudo actualizar la sucursal.'); }
      return;
    }
    setBranches(previous => previous.map(branch => branch.id === selectedBranchRecord.id ? { ...branch, name, address, phone, hours } : branch));
    setModal(null); setSelectedBranchRecord(null); notify('Sucursal actualizada en el catálogo de demostración');
  };
  const createProvider = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const role = String(form.get('role') || 'Profesional').trim();
    const branchIds = form.getAll('branchIds').map(String);
    if (!name) return;
    if (sharedMode) {
      try {
        await createPatientDirectoryStore().createProvider(sharedDirectory.clinicId, { name, role, branchIds });
        sharedDirectory.refresh(); setModal(null); notify('Profesional agregado y asignado a sus sucursales');
      } catch (error) { notify(error.message || 'No se pudo guardar el profesional.'); }
      return;
    }
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    setProviders(previous => [...previous, { id: `provider-${Date.now()}`, name, role, branchIds, initials, tone: 'blue', active: true }]);
    setModal(null); notify('Profesional agregado al equipo de demostración');
  };
  const updateProvider = async (event) => {
    event.preventDefault();
    if (!selectedProvider) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    const role = String(form.get('role') || 'Profesional').trim();
    const branchIds = [...new Set(form.getAll('branchIds').map(String))];
    if (!name || branchIds.some(id => !branches.some(branch => branch.id === id && branch.active !== false))) {
      notify('Revisa el nombre y las sucursales seleccionadas.');
      return;
    }
    if (sharedMode) {
      if (sharedDirectory.role !== 'admin') { notify('Solo una persona administradora puede editar profesionales.'); return; }
      try {
        await createPatientDirectoryStore().updateProvider(sharedDirectory.clinicId, selectedProvider, { name, role, branchIds });
        sharedDirectory.refresh(); setModal(null); setSelectedProvider(null); notify('Profesional actualizado');
      } catch (error) { notify(error.message || 'No se pudo actualizar el profesional.'); }
      return;
    }
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    setProviders(previous => previous.map(provider => provider.id === selectedProvider.id ? { ...provider, name, role, branchIds, initials } : provider));
    setModal(null); setSelectedProvider(null); notify('Profesional actualizado en el equipo de demostración');
  };
  const createConsentTemplate = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    const type = String(form.get('type') || 'Documento clínico');
    const content = String(form.get('content') || '').trim();
    if (!title || !content) return;
    if (sharedMode) {
      if (sharedDirectory.role !== 'admin') { notify('Solo una persona administradora puede guardar formatos compartidos.'); return; }
      try {
        await createPatientDirectoryStore().createTemplate(sharedDirectory.clinicId, 'consent', { title, type, content });
        sharedDirectory.refresh();
        setModal(consentTemplateReturn || null); setConsentTemplateReturn(null); setConsentTemplateDraft(null);
        notify(consentTemplateDraft ? 'Nueva versión de consentimiento guardada en la biblioteca compartida' : 'Formato de consentimiento guardado en la biblioteca compartida');
      } catch (error) {
        notify(error.message || 'No se pudo guardar el formato compartido.');
      }
      return;
    }
    const sameTitle = template => template.title.trim().toLocaleLowerCase('es-MX') === title.toLocaleLowerCase('es-MX');
    const previousVersions = consentTemplates.filter(sameTitle);
    const version = previousVersions.reduce((highest, template) => Math.max(highest, Number(String(template.version || '').match(/^v(\d+)/)?.[1] || 0)), 0) + 1;
    const initials = title.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    setConsentTemplates(previous => [...previous.map(template => sameTitle(template) ? { ...template, active: false } : template), { id: `consent-template-${Date.now()}`, title, type, content, version: `v${version}`, active: true, uses: '0 expedientes vinculados', initials, color: 'blue' }]);
    setModal(consentTemplateReturn || null); setConsentTemplateReturn(null); setConsentTemplateDraft(null); notify(`Versión v${version} guardada en este navegador`);
  };
  const createContractTemplate = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    const type = String(form.get('type') || 'Prestación de servicios');
    const content = String(form.get('content') || '').trim();
    if (!title || !content) return;
    if (sharedMode) {
      if (sharedDirectory.role !== 'admin') { notify('Solo una persona administradora puede guardar formatos compartidos.'); return; }
      try {
        await createPatientDirectoryStore().createTemplate(sharedDirectory.clinicId, 'contract', { title, type, content });
        sharedDirectory.refresh();
        setModal(contractTemplateReturn || null); setContractTemplateReturn(null);
        notify('Formato de contrato guardado en la biblioteca compartida');
      } catch (error) {
        notify(error.message || 'No se pudo guardar el formato compartido.');
      }
      return;
    }
    const sameTitle = template => template.title.trim().toLocaleLowerCase('es-MX') === title.toLocaleLowerCase('es-MX');
    const previousVersions = contractTemplates.filter(sameTitle);
    const version = previousVersions.reduce((highest, template) => Math.max(highest, Number(String(template.version || '').match(/^v(\d+)/)?.[1] || 0)), 0) + 1;
    setContractTemplates(previous => [...previous.map(template => sameTitle(template) ? { ...template, active: false } : template), { id: `contract-template-${Date.now()}`, title, type, content, version: `v${version}`, active: true, createdAt: new Date().toISOString() }]);
    setModal(contractTemplateReturn || null); setContractTemplateReturn(null); notify(`Versión v${version} guardada en este navegador`);
  };
  const prepareConsent = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patientId = String(form.get('patient') || '');
    const templateId = String(form.get('templateId') || '');
    if (!patientId) return;
    const requestedAt = new Date().toISOString();
    const patientRecord = patients.find(patient => patient.id === patientId);
    if (!patientRecord) return;
    const template = consentTemplatesForPage.find(item => String(item.id || item.title) === templateId);
    const document = template?.title || '';
    if (!template?.content?.trim()) {
      notify('Agrega el texto oficial aprobado por la clínica antes de preparar una solicitud.');
      return;
    }
    if (sharedMode) {
      if (!['admin', 'clinician'].includes(sharedDirectory.role)) { notify('Tu rol no permite preparar documentos clínicos.'); return; }
      try {
        const result = await createPatientDirectoryStore().createPatientDocument(sharedDirectory.clinicId, patientRecord, { kind: 'consent', template });
        const consentRecord = { id: result.id, title: result.title || document, type: template.type || 'Consentimiento informado', templateVersion: String(result.templateVersion || ''), createdByLabel: result.createdByLabel, contentSnapshot: result.contentSnapshot, status: 'Pendiente', requestedAt: result.requestedAt || requestedAt, signedAt: null };
        const update = { consent: 'Pendiente', consentDocument: consentRecord.title, consentRequestedAt: consentRecord.requestedAt, consentContentSnapshot: consentRecord.contentSnapshot, consentHistory: [...documentHistory(patientRecord, 'consent').map(record => record.status === 'Pendiente' ? { ...record, status: 'Reemplazado', replacedAt: consentRecord.requestedAt, replacedBy: consentRecord.id } : record), consentRecord] };
        setSelectedPatient({ ...patientRecord, ...update });
        setSelectedConsent(document); setSelectedConsentRecordId(consentRecord.id); setModal('consent-view');
        sharedDirectory.refresh();
        notify('Consentimiento preparado y guardado como pendiente de firma');
      } catch (error) {
        notify(error.message || 'No se pudo preparar el consentimiento.');
      }
      return;
    }
    const consentRecord = { id: `consent-${Date.now()}`, title: document, type: template.type || 'Consentimiento informado', templateVersion: String(template.version || '').match(/\d+(?:\.\d+)?/)?.[0] || '', createdByLabel: 'Equipo clínico · demostración', contentSnapshot: template.content, status: 'Pendiente', requestedAt, signedAt: null };
    const consentHistory = [...documentHistory(patientRecord, 'consent').map(record => record.status === 'Pendiente' ? { ...record, status: 'Reemplazado', replacedAt: requestedAt, replacedBy: consentRecord.id } : record), consentRecord];
    const update = { consent: 'Pendiente', consentDocument: document, consentRequestedAt: requestedAt, consentContentSnapshot: consentRecord.contentSnapshot, consentHistory };
    setSelectedPatient({ ...patientRecord, ...update });
    setSelectedConsent(document);
    setSelectedConsentRecordId(consentRecord.id);
    setPatients(previous => previous.map(patient => patient.id === patientId ? { ...patient, ...update } : patient));
    setModal('consent-view'); notify('Solicitud de demostración preparada para revisión');
  };
  const prepareContract = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patientId = String(form.get('patient') || '');
    const contractService = String(form.get('service') || '').trim();
    const contractTemplateTitle = String(form.get('contractTemplate') || '');
    const contractTemplate = contractTemplatesForPage.find(template => template.id === contractTemplateTitle);
    const contractType = contractTemplate?.type || 'Prestación de servicios';
    if (!patientId) return;
    const patientRecord = patients.find(patient => patient.id === patientId);
    if (!patientRecord) return;
    if (!patientRecord.diagnosisAccepted || !patientRecord.diagnosisId) {
      notify('Primero registra y acepta el diagnóstico del expediente.');
      return;
    }
    if (!contractTemplate?.content?.trim()) {
      notify('Elige un formato oficial con contenido antes de preparar el contrato.');
      return;
    }
    if (sharedMode) {
      if (!['admin', 'clinician'].includes(sharedDirectory.role)) { notify('Tu rol no permite preparar contratos.'); return; }
      try {
        const result = await createPatientDirectoryStore().createPatientDocument(sharedDirectory.clinicId, patientRecord, { kind: 'contract', template: contractTemplate, service: contractService || patientRecord.treatment });
        const requestedAt = new Date().toISOString();
        const contractRecord = { id: result.id, diagnosisId: result.diagnosisId || patientRecord.diagnosisId, title: result.title || contractTemplate.title, type: contractType, templateTitle: result.title || contractTemplate.title, templateVersion: String(result.templateVersion || ''), createdByLabel: result.createdByLabel, contentSnapshot: result.contentSnapshot, service: result.service || contractService || patientRecord.treatment || '', diagnosisAccepted: true, status: 'Pendiente', requestedAt: result.requestedAt || requestedAt, signedAt: null };
        const contractHistory = [...documentHistory(patientRecord, 'contract').map(record => record.status === 'Pendiente' ? { ...record, status: 'Reemplazado', replacedAt: contractRecord.requestedAt, replacedBy: contractRecord.id } : record), contractRecord];
        const update = { contract: 'Pendiente', contractType, contractRequestedAt: contractRecord.requestedAt, contractTemplateTitle: contractRecord.title, contractContent: contractRecord.contentSnapshot, contractService: contractRecord.service, contractDiagnosisId: contractRecord.diagnosisId, contractHistory };
        setSelectedPatient({ ...patientRecord, ...update });
        setSelectedContractRecordId(contractRecord.id);
        setModal('contract-view');
        sharedDirectory.refresh();
        notify('Contrato preparado y guardado como pendiente de firma');
      } catch (error) {
        notify(error.message || 'No se pudo preparar el contrato.');
      }
      return;
    }
    const requestedAt = new Date().toISOString();
    const contractRecord = { id: `contract-${Date.now()}`, diagnosisId: patientRecord.diagnosisId || '', title: contractTemplate?.title || contractType, type: contractType, templateTitle: contractTemplate?.title || '', templateVersion: String(contractTemplate?.version || '').match(/\d+(?:\.\d+)?/)?.[0] || '', createdByLabel: 'Equipo clínico · demostración', contentSnapshot: contractTemplate?.content || '', service: contractService || patientRecord.treatment || '', diagnosisAccepted: Boolean(patientRecord.diagnosisAccepted), status: 'Pendiente', requestedAt, signedAt: null };
    const contractHistory = [...documentHistory(patientRecord, 'contract').map(record => record.status === 'Pendiente' ? { ...record, status: 'Reemplazado', replacedAt: requestedAt, replacedBy: contractRecord.id } : record), contractRecord];
    const update = { contract: 'Pendiente', contractType, contractRequestedAt: requestedAt, contractTemplateTitle: contractTemplate?.title || '', contractContent: contractTemplate?.content || '', contractDiagnosisId: contractRecord.diagnosisId, contractHistory, ...(contractService ? { contractService } : {}) };
    setSelectedPatient(previous => previous?.id === patientId ? { ...previous, ...update } : patients.find(patient => patient.id === patientId) ? { ...patients.find(patient => patient.id === patientId), ...update } : previous);
    setSelectedContractRecordId(contractRecord.id);
    setPatients(previous => previous.map(patient => patient.id === patientId ? { ...patient, ...update } : patient));
    setModal('contract-view'); notify('Contrato de demostración preparado para revisión');
  };
  const acceptDiagnosis = async (event) => {
    if (!selectedPatient) return;
    event?.preventDefault?.();
    const summary = String(new FormData(event.currentTarget).get('summary') || '').trim();
    if (!summary) { notify('Agrega un resumen clínico antes de aceptar el diagnóstico.'); return; }
    const currentDiagnosisSummary = String(selectedPatient.diagnosisSummary || (!sharedMode && selectedPatient.diagnosisAccepted ? 'Diagnóstico de demostración aceptado' : '')).trim();
    if (selectedPatient.diagnosisAccepted && summary === currentDiagnosisSummary) {
      setModal('patient');
      notify('El diagnóstico no tuvo cambios; no se creó una versión duplicada.');
      return;
    }
    if (sharedMode) {
      if (!['admin', 'clinician'].includes(sharedDirectory.role)) { notify('Tu rol no permite aceptar diagnósticos.'); return; }
      try {
        const result = await createPatientDirectoryStore().acceptDiagnosis(sharedDirectory.clinicId, selectedPatient, summary);
        const requestedAt = new Date().toISOString();
        const contractHistory = documentHistory(selectedPatient, 'contract').map(record => record.status === 'Pendiente' ? { ...record, status: 'Reemplazado', replacedAt: requestedAt } : record);
        const diagnosisHistory = [...(selectedPatient.diagnosisHistory || []).map(record => record.status === 'accepted' ? { ...record, status: 'superseded' } : record), { id: result.id, summary, status: 'accepted', acceptedAt: requestedAt, acceptedBy: result.acceptedBy, acceptedByLabel: result.acceptedByLabel, createdAt: requestedAt }];
        const update = { diagnosisAccepted: true, diagnosisId: result.id, diagnosisSummary: summary, diagnosisHistory, contractHistory, ...(selectedPatient.contract === 'Pendiente' ? { contract: 'Reemplazado' } : {}) };
        setSelectedPatient(current => current ? { ...current, ...update } : current);
        sharedDirectory.refresh();
        setModalReturn('patient'); setModal('contract-prompt');
        notify('Diagnóstico aceptado y registrado en el expediente compartido');
      } catch (error) {
        notify(error.message || 'No se pudo registrar el diagnóstico.');
      }
      return;
    }
    const diagnosisId = `diagnosis-${Date.now()}`;
    const requestedAt = new Date().toISOString();
    const contractHistory = documentHistory(selectedPatient, 'contract').map(record => record.status === 'Pendiente' ? { ...record, status: 'Reemplazado', replacedAt: requestedAt } : record);
    const diagnosisHistory = [...(selectedPatient.diagnosisHistory || []).map(record => record.status === 'accepted' ? { ...record, status: 'superseded' } : record), { id: diagnosisId, summary, status: 'accepted', acceptedAt: requestedAt, acceptedByLabel: 'Equipo clínico', createdAt: requestedAt }];
    const update = { diagnosisAccepted: true, diagnosisId, diagnosisSummary: summary, diagnosisHistory, contractHistory, ...(selectedPatient.contract === 'Pendiente' ? { contract: 'Reemplazado' } : {}) };
    setPatients(previous => previous.map(patient => patient.id === selectedPatient.id ? { ...patient, ...update } : patient));
    setSelectedPatient(previous => previous ? { ...previous, ...update } : previous);
    setSelectedContractRecordId(latestDocumentRecord({ ...selectedPatient, ...update }, 'contract')?.id || '');
    setModalReturn('patient');
    setModal('contract-prompt');
    notify('Diagnóstico aceptado en la demostración');
  };
  const simulateSignature = (kind) => {
    if (!selectedPatient || sharedMode) return;
    const signedAt = new Date().toISOString();
    const historyKey = kind === 'contract' ? 'contractHistory' : 'consentHistory';
    const history = documentHistory(selectedPatient, kind);
    const selectedRecordId = kind === 'contract' ? selectedContractRecordId : selectedConsentRecordId;
    const selectedIndex = history.findIndex(record => record.id === selectedRecordId);
    const signingIndex = selectedIndex >= 0 ? selectedIndex : history.length - 1;
    const isLatestRecord = signingIndex === history.length - 1;
    const nextHistory = history.length ? history.map((record, index) => index === signingIndex ? { ...record, status: 'Firmado', signedAt } : record) : history;
    const update = kind === 'contract'
      ? { ...(isLatestRecord ? { contract: 'Firmado', contractSignedAt: signedAt } : {}), [historyKey]: nextHistory }
      : { ...(isLatestRecord ? { consent: 'Firmado', consentSignedAt: signedAt } : {}), [historyKey]: nextHistory };
    setPatients(previous => previous.map(patient => patient.id === selectedPatient.id ? { ...patient, ...update } : patient));
    setSelectedPatient(previous => previous ? { ...previous, ...update } : previous);
    setModal(modalReturn || null);
    notify(kind === 'contract' ? 'Firma de contrato simulada; no tiene validez legal.' : 'Firma de consentimiento simulada; no tiene validez legal.');
  };
  const openPatientDocument = (patient, kind, returnTo = null) => {
    setSelectedPatient(patient);
    setModalReturn(returnTo);
    const record = latestDocumentRecord(patient, kind);
    if (kind === 'consent') {
      setSelectedConsent(record?.title || patient.consentDocument || 'Consentimiento informado');
      setSelectedConsentRecordId(record?.id || '');
    } else {
      setSelectedContractRecordId(record?.id || '');
    }
    setModal(kind === 'consent' ? 'consent-view' : 'contract-view');
  };
  const openPatientDocumentRecord = (patient, record, returnTo = 'patient') => {
    if (!patient || !record || !['contract', 'consent'].includes(record.kind)) return;
    setSelectedPatient(patient);
    setModalReturn(returnTo);
    if (record.kind === 'consent') {
      setSelectedConsent(record.title || 'Consentimiento informado');
      setSelectedConsentRecordId(record.id || '');
      setModal('consent-view');
    } else {
      setSelectedContractRecordId(record.id || '');
      setModal('contract-view');
    }
  };
  const selectedConsentRecord = selectedPatient
    ? documentHistory(selectedPatient, 'consent').find(record => record.id === selectedConsentRecordId)
      || documentHistory(selectedPatient, 'consent').slice().sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || ''))).find(record => record.title === selectedConsent && record.status !== 'Reemplazado')
    : null;
  const selectedContractRecord = selectedPatient
    ? documentHistory(selectedPatient, 'contract').find(record => record.id === selectedContractRecordId) || latestDocumentRecord(selectedPatient, 'contract')
    : null;
  const viewedContractPatient = selectedPatient && selectedContractRecord ? {
    ...selectedPatient,
    contract: selectedContractRecord.status || selectedPatient.contract,
    contractType: selectedContractRecord.type || selectedPatient.contractType,
    contractTemplateTitle: selectedContractRecord.title || selectedPatient.contractTemplateTitle,
    contractContent: selectedContractRecord.contentSnapshot ?? '',
    contractService: selectedContractRecord.service || '',
    contractDiagnosisId: selectedContractRecord.diagnosisId || '',
    contractSignedAt: selectedContractRecord.signedAt || null,
    ...(typeof selectedContractRecord.diagnosisAccepted === 'boolean' ? { diagnosisAccepted: selectedContractRecord.diagnosisAccepted } : selectedContractRecord.diagnosisId ? { diagnosisAccepted: true } : {}),
  } : selectedPatient;

  const nav = [
    { section: 'PRINCIPAL', links: [{ id: 'overview', label: 'Resumen', icon: LayoutDashboard }, { id: 'agenda', label: 'Agenda', icon: CalendarDays, count: String(appointments.filter(a => !a.date || a.date === agendaDate).length) }, { id: 'patients', label: 'Pacientes', icon: UsersRound }] },
    { section: 'OPERACIÓN', links: [{ id: 'payments', label: 'Pagos', icon: DollarSign }, { id: 'reminders', label: 'Recordatorios', icon: Bell }] },
    { section: 'GESTIÓN CLÍNICA', links: [{ id: 'consents', label: 'Consentimientos', icon: FileCheck2, count: String(patients.filter(p => p.consent === 'Pendiente').length) }, { id: 'contracts', label: 'Contratos', icon: FileText }, { id: 'team', label: 'Equipo y sucursales', icon: UserRound }] },
  ];

  if (isStandaloneRoute) return <>{children}</>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen?'mobile-open':''}`}>
      <div className="brand"><Image className="brand-logo" src={theme==='dark'?'/elixirclinic-logo-dark.png':'/elixirclinic-logo.png'} alt="Logo de Elixir Clinic" width={1374} height={1145} unoptimized/><button className="org-switch" onClick={()=>notify('Organización activa')}><ChevronDown size={14}/></button></div>
      <div className="workspace-chip" title={activeClinicName}><span className="online-dot"/> <span>{activeClinicName}</span> <ChevronDown size={14}/></div>
      <nav className="side-nav">{nav.map(group=><div className="nav-group" key={group.section}><div className="nav-caption">{group.section}</div>{group.links.map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}><item.icon size={17}/><span>{item.label}</span>{item.count&&<span className="nav-count">{item.count}</span>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={()=>setModal('clinic-settings')}><Settings2 size={17}/><span>Configuración</span></button>{supabaseConfigured?<form action={signOut}><button className="profile-row" type="submit" title="Cerrar sesión"><Avatar initials="AD" tone="navy"/><span className="profile-copy"><strong>Administrador</strong><small>Cerrar sesión</small></span><MoreHorizontal size={18}/></button></form>:<button className="profile-row" onClick={()=>notify('Perfil de administrador')}><Avatar initials="AD" tone="navy"/><span className="profile-copy"><strong>Administrador</strong><small>Equipo clínico</small></span><MoreHorizontal size={18}/></button>}</div>
    </aside>
    {mobileNavOpen&&<button className="mobile-nav-backdrop" aria-label="Cerrar navegación" onClick={()=>setMobileNavOpen(false)}/>}
    <main className="main-shell">
      <header className="topbar"><button className="mobile-menu-button" aria-label="Abrir navegación" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(open=>!open)}><Menu size={18}/></button><div className="breadcrumbs"><span>{activeClinicName}</span><ChevronRight size={14}/><strong>{({overview:'Resumen',agenda:'Agenda',payments:'Pagos',reminders:'Recordatorios',patients:'Pacientes',consents:'Consentimientos',contracts:'Contratos',team:'Equipo y sucursales'})[page]}</strong></div><div className="topbar-actions"><button className="search-shortcut" onClick={openPatientSearch}><Search size={15}/><span>Buscar</span><kbd>⌘ K</kbd></button><span className="topbar-divider"/><IconButton className="theme-toggle-button" aria-label={theme==='dark'?'Activar modo claro':'Activar modo oscuro'} aria-pressed={theme==='dark'} title={theme==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro'} onClick={()=>setTheme(current=>current==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</IconButton><IconButton aria-label="Ayuda" onClick={()=>notify('Centro de ayuda')}><CircleHelp size={18}/></IconButton><IconButton className="notification-button" aria-label="Notificaciones" onClick={()=>notify('No tienes notificaciones nuevas')}><Bell size={18}/><i/></IconButton><Avatar initials="AD" tone="navy"/></div></header>
    <div className="content-area">
        {sharedMode
          ? <div className="demo-storage-banner" role="status"><ShieldCheck size={15}/> Datos compartidos de la clínica. La firma electrónica y el envío de recordatorios aún requieren sus proveedores aprobados.</div>
          : <div className="demo-storage-banner" role="status"><ShieldCheck size={15}/> Modo de demostración: usa solo datos ficticios. Los cambios se guardan en este navegador; no es un sistema seguro para información real de pacientes. Conecta el proyecto Supabase de la clínica antes de usarlo en operación.</div>}
        {!sharedMode&&page==='overview' && <Overview patients={patients} appointments={appointments} patientActivities={patientActivities} pendingDocs={pendingDocs} setPage={setPage} setModal={setModal} notify={notify} onOpenPatient={patient=>{setSelectedPatient(patient);setModalReturn(null);setModal('patient')}} onOpenDocument={openPatientDocument}/>}
        {sharedMode&&page==='overview'&&sharedDirectory.status!=='ready'&&<PatientDirectoryGate status={sharedDirectory.status} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedDirectory.refresh} title="Resumen"/>}
        {sharedMode&&page==='overview'&&sharedDirectory.status==='ready'&&sharedAgenda.status!=='ready'&&<AgendaDataGate status={sharedAgenda.status} retry={sharedAgenda.refresh} title="Resumen"/>}
        {sharedMode&&page==='overview'&&sharedDirectory.status==='ready'&&sharedAgenda.status==='ready'&&<Overview sharedMode timeZone={sharedDirectory.timeZone} patients={patients} appointments={appointments} patientActivities={patientActivities} pendingDocs={pendingDocs} setPage={setPage} setModal={setModal} notify={notify} onOpenPatient={patient=>{setSelectedPatient(patient);setModalReturn(null);setModal('patient')}} onOpenDocument={openPatientDocument}/>}
        {page==='patients' && sharedMode && sharedDirectory.status !== 'ready' && <PatientDirectoryGate status={sharedDirectory.status} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedDirectory.refresh}/>}
        {page==='patients' && (!sharedMode || sharedDirectory.status==='ready') && <PatientsPage patients={filteredPatients} allPatients={patients} query={query} setQuery={setQuery} searchRef={patientSearchRef} setModal={setModal} onOpen={p=>{setSelectedPatient(p);setModalReturn(null);setModal('patient')}}/>}
        {!sharedMode&&page==='agenda' && <AgendaPage timeZone={clinicTimeZone} appointments={filteredAppointments} payments={payments} providerFilter={providerFilter} setProviderFilter={setProviderFilter} providerOptions={providerOptions} branchFilter={branchFilter} setBranchFilter={updateAgendaBranchFilter} branchOptions={branchOptions} businessFilter={businessFilter} setBusinessFilter={updateAgendaBusinessFilter} businessOptions={businessOptions} period={period} setPeriod={setPeriod} onNewAppointment={openNewAppointment} notify={notify} agendaDate={agendaDate} setAgendaDate={setAgendaDate} onOpenAppointment={appointment=>{setSelectedAppointment(appointment);setModal('appointment')}}/>}
        {sharedMode&&page==='agenda'&&sharedDirectory.status!=='ready'&&<PatientDirectoryGate status={sharedDirectory.status} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedDirectory.refresh} title="Agenda"/>}
        {sharedMode&&page==='agenda'&&sharedDirectory.status==='ready'&&sharedAgenda.status!=='ready'&&<AgendaDataGate status={sharedAgenda.status} retry={sharedAgenda.refresh}/>}
        {sharedMode&&page==='agenda'&&sharedDirectory.status==='ready'&&sharedAgenda.status==='ready'&&<AgendaPage timeZone={clinicTimeZone} appointments={filteredAppointments} payments={[]} sharedMode providerFilter={providerFilter} setProviderFilter={setProviderFilter} providerOptions={providerOptions} branchFilter={branchFilter} setBranchFilter={updateAgendaBranchFilter} branchOptions={branchOptions} businessFilter={businessFilter} setBusinessFilter={updateAgendaBusinessFilter} businessOptions={businessOptions} period={period} setPeriod={setPeriod} onNewAppointment={openNewAppointment} notify={notify} agendaDate={agendaDate} setAgendaDate={setAgendaDate} onOpenAppointment={appointment=>{setSelectedAppointment(appointment);setModal('appointment')}}/>}
        {!sharedMode&&page==='payments' && <PaymentsPage payments={payments} appointments={appointments} patients={patients} onNewPayment={()=>openPaymentModal()}/>}
        {sharedMode&&page==='payments'&&sharedPaymentWorkspace.status!=='ready'&&<FinanceWorkspaceGate status={!sharedDirectory.clinicId&&sharedDirectory.status!=='no_patient_access'?sharedDirectory.status:sharedPaymentWorkspace.status} retry={sharedPaymentWorkspace.refresh} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic}/>}
        {sharedMode&&page==='payments'&&sharedPaymentWorkspace.status==='ready'&&<PaymentsPage sharedMode payments={payments} appointments={paymentAppointments} patients={paymentPatients} onNewPayment={()=>openPaymentModal()}/>}
        {!sharedMode&&page==='reminders'&&<RemindersPage reminders={reminders}/>}
        {sharedMode&&page==='reminders'&&sharedDirectory.status!=='ready'&&<PatientDirectoryGate status={sharedDirectory.status} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedDirectory.refresh} title="Recordatorios"/>}
        {sharedMode&&page==='reminders'&&sharedDirectory.status==='ready'&&sharedReminderWorkspace.status!=='ready'&&<ReminderDataGate status={sharedReminderWorkspace.status} retry={sharedReminderWorkspace.refresh}/>}
        {sharedMode&&page==='reminders'&&sharedDirectory.status==='ready'&&sharedReminderWorkspace.status==='ready'&&<RemindersPage sharedMode reminders={reminders}/>}
        {sharedMode&&page==='consents'&&sharedDirectory.status!=='ready'&&<PatientDirectoryGate status={sharedDirectory.status} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedDirectory.refresh} title="Consentimientos"/>}
        {(!sharedMode||sharedDirectory.status==='ready')&&page==='consents'&&<ConsentsPage patients={patients} templates={consentTemplatesForPage} notify={notify} onOpenDocument={openPatientDocument} onPrepareConsent={template=>openConsentPreparation('',null,template?.id||template?.title||'')} onNewTemplate={()=>openConsentTemplateCreation()} onNewVersion={template=>openConsentTemplateCreation(null, template)} sharedMode={sharedMode} canPrepare={!sharedMode||['admin','clinician'].includes(sharedDirectory.role)} canManageTemplates={!sharedMode||sharedDirectory.role==='admin'}/>}
        {sharedMode&&page==='contracts'&&sharedDirectory.status!=='ready'&&<PatientDirectoryGate status={sharedDirectory.status} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedDirectory.refresh} title="Contratos"/>}
        {(!sharedMode||sharedDirectory.status==='ready')&&page==='contracts'&&<ContractsPage patients={patients} templates={contractTemplatesForPage} setModal={setModal} notify={notify} onOpenDocument={openPatientDocument} onNewContract={()=>openContractPreparation()} onNewTemplate={()=>openContractTemplateCreation()} sharedMode={sharedMode} canPrepare={!sharedMode||['admin','clinician'].includes(sharedDirectory.role)} canManageTemplates={!sharedMode||sharedDirectory.role==='admin'}/>}
        {!sharedMode&&page==='team' && <TeamPage businesses={businesses} branches={branches} providers={providers} setModal={setModal} notify={notify} onEditBranch={branch=>{setSelectedBranchRecord(branch);setModal('edit-branch')}} onEditProvider={provider=>{setSelectedProvider(provider);setModal('edit-provider')}}/>}
        {sharedMode&&page==='team'&&sharedDirectory.status!=='ready'&&<PatientDirectoryGate status={sharedDirectory.status} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedDirectory.refresh} title="Equipo y sucursales"/>}
        {sharedMode&&page==='team'&&sharedDirectory.status==='ready'&&<TeamPage sharedMode businesses={businesses} branches={branches} providers={providers} setModal={setModal} notify={notify} onEditBranch={branch=>{setSelectedBranchRecord(branch);setModal('edit-branch')}} onEditProvider={provider=>{setSelectedProvider(provider);setModal('edit-provider')}} canManageBusinesses={['admin','receptionist'].includes(sharedDirectory.role)} canManageProviders={sharedDirectory.role==='admin'}/>}
      </div>
    </main>
    {modal==='patient' && selectedPatient && <PatientModal patient={selectedPatient} appointments={appointments} activities={patientActivities.filter(activity=>activity.patientId===selectedPatient.id)} sharedMode={sharedMode} canDiagnose={!sharedMode||['admin','clinician'].includes(sharedDirectory.role)} canPrepareContract={!sharedMode||['admin','clinician'].includes(sharedDirectory.role)} canPrepareConsent={!sharedMode||['admin','clinician'].includes(sharedDirectory.role)} close={()=>setModal(null)} notify={notify} onAddActivity={()=>setModal('new-patient-activity')} onEdit={()=>setModal('edit-patient')} onDiagnosis={()=>setModal('diagnosis')} onNewAppointment={()=>openNewAppointment(agendaDate,'17:00',selectedPatient.id)} onPrepareContract={()=>openContractPreparation(selectedPatient.id,'patient')} onPrepareConsent={()=>openConsentPreparation(selectedPatient.id,'patient')} onOpenContract={()=>openPatientDocument(selectedPatient,'contract','patient')} onOpenConsent={()=>openPatientDocument(selectedPatient,'consent','patient')} onOpenDocumentRecord={record=>openPatientDocumentRecord(selectedPatient,record,'patient')}/>}
    {modal==='appointment' && selectedAppointment && <AppointmentModal sharedMode={sharedMode} canManagePayments={!sharedMode||canReadSharedPayments} paymentDataReady={!sharedMode||sharedPaymentWorkspace.status==='ready'} appointment={selectedAppointment} businesses={businesses} branches={branches} providers={providers} payments={payments.filter(payment=>payment.appointmentId===selectedAppointment.id)} close={()=>{setModal(null);setSelectedAppointment(null)}} onSubmit={updateAppointment} onOpenPatient={openPatientFromAppointment} onAddPayment={()=>openPaymentModal(selectedAppointment.id)}/>}
    {modal==='new-payment' && <PaymentModal close={()=>{setModal(modalReturn==='appointment'?'appointment':null);setModalReturn(null)}} onSubmit={createPayment} defaultDate={paymentDefaults.date} defaultAppointmentId={paymentDefaults.appointmentId} patients={paymentPatients} appointments={selectedAppointment?[...paymentAppointments.filter(item=>item.id!==selectedAppointment.id),selectedAppointment]:paymentAppointments} payments={payments}/>}
    {modal==='new-patient-activity' && selectedPatient && <Modal title="Registrar seguimiento" subtitle={`${selectedPatient.name} · Expediente ${selectedPatient.id}`} close={()=>setModal('patient')}><form onSubmit={addPatientActivity} className="form-stack"><input type="hidden" name="patientId" value={selectedPatient.id}/><label>Tipo de actividad<select name="type" defaultValue="Seguimiento"><option>Seguimiento</option><option>Llamada</option><option>Mensaje</option><option>Administrativa</option><option>Otro</option></select></label><label>Nota<textarea name="note" rows="4" maxLength="1000" placeholder="Resumen de llamada, acuerdo o pendiente. No agregues datos clínicos sensibles." required autoFocus/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Nota guardada en la base compartida del consultorio.':'Nota interna de demostración, guardada solo en este navegador.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal('patient')}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar nota</button></div></form></Modal>}
    {modal==='diagnosis' && selectedPatient && <DiagnosisModal patient={selectedPatient} sharedMode={sharedMode} close={()=>setModal('patient')} onAccept={acceptDiagnosis}/>}
    {modal==='contract-prompt' && selectedPatient && <ContractPromptModal patient={selectedPatient} close={()=>setModal('patient')} onViewContract={()=>{setSelectedContractRecordId(latestDocumentRecord(selectedPatient,'contract')?.id || '');setModal('contract-view')}} onPrepareContract={()=>openContractPreparation(selectedPatient.id, 'patient')}/>}
    {modal==='contract-view' && selectedPatient && <ContractViewerModal sharedMode={sharedMode} patient={viewedContractPatient || selectedPatient} close={()=>setModal(modalReturn || null)} onPrint={()=>window.print()} onDiagnosis={()=>setModal('diagnosis')} onSign={()=>simulateSignature('contract')} onPrepare={()=>openContractPreparation(selectedPatient.id, modalReturn)}/>}
    {modal==='consent-view' && selectedPatient && <ConsentViewerModal sharedMode={sharedMode} patient={selectedPatient} document={selectedConsent} content={selectedConsentRecord?.contentSnapshot ?? ''} status={selectedConsentRecord?.status || selectedPatient.consent} signedAt={selectedConsentRecord?.signedAt || null} close={()=>setModal(modalReturn || null)} onPrint={()=>window.print()} onSign={()=>simulateSignature('consent')}/>}
    {modal==='new-patient' && <Modal title="Agregar paciente" subtitle="Crea un expediente para dar seguimiento a la atención." close={()=>setModal(null)}><form onSubmit={addPatient} className="form-stack"><label>Nombre completo<input name="name" autoFocus placeholder="Ej. Andrea García" required/></label><div className="form-grid"><label>Correo electrónico<input name="email" type="email" placeholder="correo@ejemplo.com"/></label><label>Teléfono<input name="phone" placeholder="Teléfono de contacto"/></label></div><label>Tratamiento o servicio<input name="treatment" placeholder="Por definir"/></label><div className="form-grid"><label>Sucursal<select name="branchId" defaultValue={branches.find(item=>item.active)?.id||''}><option value="">Sin asignar</option>{branches.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Profesional<select name="providerId" defaultValue={providers.find(item=>item.active)?.id||''}><option value="">Sin asignar</option>{providers.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="form-note"><ShieldCheck size={15}/> {sharedMode?"Se guardará en el directorio compartido del consultorio.":"Prototipo de demostración: no ingreses datos reales de pacientes."}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary" type="submit"><Plus size={16}/> Crear expediente</button></div></form></Modal>}
    {modal==='edit-patient' && selectedPatient && <Modal title="Editar expediente" subtitle={`${selectedPatient.id} · Actualiza sus datos de contacto y atención.`} close={()=>setModal('patient')}><form onSubmit={updatePatient} className="form-stack"><input type="hidden" name="id" value={selectedPatient.id}/><label>Nombre completo<input name="name" defaultValue={selectedPatient.name} autoFocus required/></label><div className="form-grid"><label>Correo electrónico<input name="email" type="email" defaultValue={selectedPatient.email||''} placeholder="correo@ejemplo.com"/></label><label>Teléfono<input name="phone" defaultValue={selectedPatient.phone||''} placeholder="Teléfono de contacto"/></label></div><label>Tratamiento o servicio<input name="treatment" defaultValue={selectedPatient.treatment||''} placeholder="Por definir"/></label><div className="form-grid"><label>Sucursal<select name="branchId" defaultValue={branches.find(item=>item.name===selectedPatient.branch)?.id||selectedPatient.branchId||''}><option value="">Sin asignar</option>{branches.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Profesional<select name="providerId" defaultValue={providers.find(item=>item.name===selectedPatient.clinician)?.id||selectedPatient.providerId||''}><option value="">Sin asignar</option>{providers.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><label>Estado<select name="status" defaultValue={selectedPatient.status}><option>Activo</option><option>Seguimiento</option><option>Nuevo</option><option>Inactivo</option></select></label><label className="whatsapp-opt-in"><input type="checkbox" name="whatsappOptIn" defaultChecked={Boolean(selectedPatient.whatsappOptIn)}/> Autoriza avisos de citas por WhatsApp</label><label>Origen de la autorización<select name="whatsappOptInSource" defaultValue={selectedPatient.whatsappOptInSource||''}><option value="">Seleccionar si autoriza…</option><option value="written">Consentimiento escrito</option><option value="verbal">Autorización verbal</option><option value="electronic">Consentimiento electrónico</option></select></label><div className="form-note"><ShieldCheck size={15}/> Registra solo una autorización ya otorgada por el paciente. Esto no envía mensajes.</div><div className="form-note"><ShieldCheck size={15}/> {sharedMode?"Cambios guardados en el directorio compartido.":"Datos guardados solo en este navegador de demostración."}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal('patient')}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar cambios</button></div></form></Modal>}    {modal==='new-appointment' && <NewAppointmentModal sharedMode={sharedMode} close={()=>setModal(null)} onSubmit={createAppointment} defaultDate={appointmentDefaults.date} defaultTime={appointmentDefaults.time} defaultPatientId={appointmentDefaults.patientId} patients={patients} businesses={businesses} branches={branches} providers={providers} appointments={appointments}/>}
    {modal==='new-business' && <Modal title="Agregar negocio" subtitle="Crea un negocio para organizar sus sucursales y agenda." close={()=>setModal(null)}><form className="form-stack" onSubmit={createBusiness}><label>Nombre del negocio<input name="name" placeholder={sharedMode?'Nombre del negocio':'Nombre de demostración'} required autoFocus/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Se guardará en el catálogo compartido.':'Solo se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary"><Plus size={15}/> Agregar negocio</button></div></form></Modal>}
    {modal==='new-branch' && <Modal title="Agregar sucursal" subtitle="Asigna la nueva ubicación a uno de tus negocios." close={()=>setModal(null)}><form className="form-stack" onSubmit={createBranch}><label>Negocio<select name="businessId" required defaultValue=""><option value="" disabled>Seleccionar negocio…</option>{businesses.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nombre de sucursal<input name="name" placeholder={sharedMode?'Nombre de sucursal':'Nombre de demostración'} required/></label><label>Dirección<input name="address" placeholder={sharedMode?'Dirección de la sucursal':'Dirección de demostración'}/></label>{!sharedMode&&<><label>Teléfono<input name="phone" placeholder="686 308 6854"/></label><label>Horario de atención<input name="hours" placeholder="Lunes a sábados, 9:00 a.m. a 7:00 p.m."/></label></>}<div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Se guardará en el catálogo compartido.':'Solo se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary" type="submit" disabled={!businesses.some(item=>item.active)}><Plus size={15}/> Agregar sucursal</button></div></form></Modal>}
    {modal==='edit-branch' && selectedBranchRecord && <Modal title="Editar sucursal" subtitle={`${businesses.find(item=>item.id===selectedBranchRecord.businessId)?.name||'Negocio'} · La sucursal seguirá asociada a este negocio.`} close={()=>{setModal(null);setSelectedBranchRecord(null)}}><form className="form-stack" onSubmit={updateBranch}><label>Nombre de sucursal<input name="name" defaultValue={selectedBranchRecord.name} required autoFocus/></label><label>Dirección<input name="address" defaultValue={selectedBranchRecord.address||''} placeholder="Dirección de la sucursal"/></label>{!sharedMode&&<><label>Teléfono<input name="phone" defaultValue={selectedBranchRecord.phone||''} placeholder="686 308 6854"/></label><label>Horario de atención<input name="hours" defaultValue={selectedBranchRecord.hours||''} placeholder="Lunes a sábados, 9:00 a.m. a 7:00 p.m."/></label></>}<div className="form-note"><ShieldCheck size={15}/> {sharedMode?'El cambio se guarda en el catálogo compartido.':'El cambio se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>{setModal(null);setSelectedBranchRecord(null)}}>Cancelar</button><button className="button primary"><Check size={15}/> Guardar cambios</button></div></form></Modal>}
    {modal==='new-provider' && <Modal title="Agregar profesional" subtitle="Registra quién realiza las citas y en qué sucursales atiende." close={()=>setModal(null)}><form className="form-stack" onSubmit={createProvider}><label>Nombre<input name="name" placeholder={sharedMode?'Nombre del profesional':'Nombre de demostración'} required autoFocus/></label><label>Rol<input name="role" placeholder="Profesional"/></label><fieldset className="branch-picker"><legend>Sucursales de atención</legend>{branches.filter(item=>item.active).map(item=><label key={item.id}><input type="checkbox" name="branchIds" value={item.id}/>{item.name}</label>)}</fieldset><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Se guardará con las sucursales seleccionadas en el directorio compartido.':'Solo se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary"><Plus size={15}/> Agregar profesional</button></div></form></Modal>}
    {modal==='edit-provider' && selectedProvider && <Modal title="Editar profesional" subtitle="Actualiza su perfil y las sucursales donde puede atender." close={()=>{setModal(null);setSelectedProvider(null)}}><form className="form-stack" onSubmit={updateProvider}><label>Nombre<input name="name" defaultValue={selectedProvider.name} required autoFocus/></label><label>Rol<input name="role" defaultValue={selectedProvider.role||'Profesional'}/></label><fieldset className="branch-picker"><legend>Sucursales de atención</legend>{branches.filter(item=>item.active!==false).map(item=><label key={item.id}><input type="checkbox" name="branchIds" value={item.id} defaultChecked={selectedProvider.branchIds?.includes(item.id)}/>{item.name}</label>)}</fieldset><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'El cambio se guarda en el directorio compartido.':'El cambio se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>{setModal(null);setSelectedProvider(null)}}>Cancelar</button><button className="button primary"><Check size={15}/> Guardar cambios</button></div></form></Modal>}
    {modal==='new-consent-template' && <Modal title={consentTemplateDraft?'Nueva versión de consentimiento':'Crear formato de consentimiento'} subtitle={consentTemplateDraft?'Actualiza el texto aprobado; los documentos ya preparados conservan su copia y versión.':'Agrega el texto oficial que proporcione y valide la clínica.'} close={closeConsentTemplateCreation}><form className="form-stack" onSubmit={createConsentTemplate}><label>Nombre del formato<input name="title" defaultValue={consentTemplateDraft?.title||''} placeholder="Ej. Consentimiento para tratamiento" required autoFocus/></label><label>Tipo<select name="type" defaultValue={consentTemplateDraft?.type||'Documento clínico'}><option>Documento clínico</option><option>Protección de datos</option><option>Autorización</option></select></label><label>Contenido del documento<textarea name="content" defaultValue={consentTemplateDraft?.content||''} rows="8" placeholder="Pega aquí el texto revisado por la clínica. No agregues datos de pacientes." required/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'El formato se comparte con el equipo clínico y queda versionado.':'El formato queda guardado solo en este navegador.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={closeConsentTemplateCreation}>Cancelar</button><button className="button primary" disabled={sharedMode&&sharedDirectory.role!=='admin'}><Plus size={15}/> {consentTemplateDraft?'Guardar nueva versión':'Guardar formato'}</button></div></form></Modal>}
    {modal==='send-consent' && <Modal title="Preparar consentimiento" subtitle="Guarda una copia del documento en el expediente. La firma electrónica requiere una integración posterior." close={closeConsentPreparation}><form className="form-stack" onSubmit={prepareConsent}><label>Paciente<select name="patient" defaultValue={consentDefaults.patientId} required><option value="" disabled>Seleccionar paciente…</option>{patients.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Documento<select name="templateId" required defaultValue={consentDefaults.templateId}><option value="" disabled>Seleccionar formato…</option>{consentTemplatesForPage.filter(template=>template.content?.trim()).map(template=><option key={template.id||template.title} value={template.id||template.title}>{template.title}{template.version?` · ${template.version}`:''}</option>)}</select></label>{!consentTemplatesForPage.some(template=>template.content?.trim())&&<div className="form-note"><FileText size={15}/> No hay formatos con texto oficial. Agrega el documento validado por la clínica antes de solicitar una firma. <button type="button" className="text-link" onClick={()=>openConsentTemplateCreation('send-consent')}>Crear formato</button></div>}<div className="form-note"><ShieldCheck size={15}/> El contenido se guarda como copia inmutable en el expediente; no se envía para firma.</div><div className="modal-actions"><button type="button" className="button secondary" onClick={closeConsentPreparation}>Cancelar</button><button className="button primary" disabled={!consentTemplatesForPage.some(template=>template.content?.trim())||(sharedMode&&!['admin','clinician'].includes(sharedDirectory.role))}><FileCheck2 size={16}/> Preparar documento</button></div></form></Modal>}
    {modal==='new-contract-template' && <Modal title="Crear formato de contrato" subtitle="Agrega el texto oficial que proporcione y valide la clínica." close={closeContractTemplateCreation}><form className="form-stack" onSubmit={createContractTemplate}><label>Nombre del formato<input name="title" placeholder="Ej. Prestación de servicios" required autoFocus/></label><label>Tipo<select name="type"><option>Prestación de servicios</option><option>Plan de tratamiento</option><option>Otro</option></select></label><label>Contenido del contrato<textarea name="content" rows="10" placeholder="Pega el texto oficial revisado por la clínica." required/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'El formato se comparte con el equipo clínico y queda versionado.':'Se guarda localmente. La plantilla no añade ni valida cláusulas legales.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={closeContractTemplateCreation}>Cancelar</button><button className="button primary" disabled={sharedMode&&sharedDirectory.role!=='admin'}><FilePlus2 size={15}/> Guardar formato</button></div></form></Modal>}
    {modal==='new-contract' && <NewContractModal sharedMode={sharedMode} canPrepare={!sharedMode||['admin','clinician'].includes(sharedDirectory.role)} close={closeContractPreparation} onSubmit={prepareContract} onReviewDiagnosis={patientId=>{const patient=patients.find(item=>item.id===patientId);if(patient){setSelectedPatient(patient);setModalReturn('new-contract');setModal('diagnosis')}}} onAddTemplate={()=>openContractTemplateCreation('new-contract')} patients={patients} templates={contractTemplatesForPage} defaultPatientId={contractDefaults.patientId} canManageTemplates={!sharedMode||sharedDirectory.role==='admin'}/>}
    {modal==='clinic-settings'&&<Modal title="Configuración de la clínica" subtitle={sharedMode?'Identidad del consultorio compartido.':'Personaliza el nombre que aparece en este espacio de demostración.'} close={()=>setModal(null)}>{sharedMode?<><div className="document-preview"><div className="preview-section"><strong>Clínica</strong><span>{activeClinicName}</span></div><p>El nombre del espacio compartido proviene de la configuración de la clínica.</p></div><div className="modal-actions"><button className="button primary" onClick={()=>setModal(null)}>Listo</button></div></>:<form className="form-stack" onSubmit={saveClinicName}><label>Nombre de la clínica<input name="clinicName" defaultValue={clinicProfileName} maxLength={80} placeholder="Ej. Clínica del Valle" required autoFocus/></label><div className="form-note"><ShieldCheck size={15}/> Este nombre se guarda solo en este navegador de demostración y aparece en la navegación del CRM.</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar cambios</button></div></form>}</Modal>}
    {toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')} aria-label="Cerrar"><X size={15}/></button></div>}
    {children}
  </div>;
}

function Overview({patients,appointments,patientActivities,pendingDocs,setPage,setModal,notify,onOpenPatient,onOpenDocument,sharedMode=false,timeZone='America/Tijuana'}) {
  const dateParts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const todayKey=`${dateParts.find(part=>part.type==='year')?.value}-${dateParts.find(part=>part.type==='month')?.value}-${dateParts.find(part=>part.type==='day')?.value}`;
  const todayLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date()).toUpperCase();
  const todayAppointments=appointments.filter(appointment=>appointment.date===todayKey&&appointment.status!=='Cancelada').sort((a,b)=>a.time.localeCompare(b.time));
  const activePatients=patients.filter(patient=>patient.status==='Activo').length;
  const monthAppointments=appointments.filter(appointment=>appointment.date?.startsWith(todayKey.slice(0,7))&&appointment.status!=='Cancelada').length;
  const recentActivities=[...patientActivities].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  const pendingTasks=patients.flatMap(patient=>[
    ...(patient.contract==='Pendiente'?[{icon:FileText,tint:'peach',title:patient.contractType||'Contrato de prestación',subtitle:`${patient.name} · ${patient.treatment}`,patient,kind:'contract'}]:[]),
    ...(patient.consent==='Pendiente'?[{icon:FileCheck2,tint:'lavender',title:patient.consentDocument||'Consentimiento informado',subtitle:`${patient.name} · ${patient.treatment}`,patient,kind:'consent'}]:[]),
  ]).slice(0,3);
  return <><div className="welcome-line"><div className="date-pill"><span/> {todayLabel}</div><div className="demo-pill"><CircleHelp size={14}/> {sharedMode?'Datos compartidos':'Datos de demostración'}</div></div><PageTitle eyebrow="VISTA GENERAL" title="Buenos días" description="Aquí tienes el pulso de tu clínica para hoy." action={<button className="button primary" onClick={()=>onNewAppointment?.()}><Plus size={16}/> Nueva cita</button>}/>
    <div className="metric-grid"><MetricCard label="Citas de hoy" value={String(todayAppointments.length).padStart(2,'0')} change={`${todayAppointments.filter(item=>item.status==='Por confirmar').length} por confirmar`} icon={CalendarDays} tint="lavender" trend="up"/><MetricCard label="Pacientes activos" value={String(activePatients)} change={`${patients.length} expedientes en este navegador`} icon={UsersRound} tint="mint" trend="up"/><MetricCard label="Firmas pendientes" value={String(pendingDocs).padStart(2,'0')} change="Requieren seguimiento" icon={FileCheck2} tint="peach" trend="attention"/><MetricCard label="Citas este mes" value={String(monthAppointments)} change="Registradas en la agenda" icon={Activity} tint="blue" trend="up"/></div>
    <div className="dashboard-grid"><section className="panel agenda-panel"><div className="panel-heading"><div><div className="panel-title">Agenda de hoy <span className="live-pill"><span/> EN CURSO</span></div><p className="panel-subtitle">La actividad de tu equipo clínico</p></div><button className="text-link" onClick={()=>setPage('agenda')}>Ver agenda <ArrowRight size={14}/></button></div><div className="appointment-list">{todayAppointments.slice(0,4).map((a,i)=><div className={`appointment-row ${i===0?'current':''}`} key={`${a.patient}-${a.time}`}><div className="time-col"><strong>{a.time}</strong><span>{a.duration}</span></div><div className="timeline-mark"><i/></div><Avatar initials={a.initials} tone={a.tone}/><div className="appointment-info"><strong>{a.patient}</strong><span>{a.service} <i>·</i> {a.clinician}</span></div><Badge variant={a.status==='Confirmada'?'confirmed':'pending'}><span className="badge-dot"/>{a.status}</Badge></div>)}{todayAppointments.length===0&&<div className="empty-inline">No hay citas registradas para hoy.</div>}</div><button className="panel-footer-link" onClick={()=>setPage('agenda')}>Ver las {todayAppointments.length} citas de hoy <ArrowRight size={14}/></button></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><div className="panel-title">Pendientes por atender</div><p className="panel-subtitle">Documentos listos para seguimiento</p></div></div><div className="task-list">{pendingTasks.map((task,index)=><TaskItem key={`${task.kind}-${task.subtitle}-${index}`} icon={task.icon} tint={task.tint} title={task.title} subtitle={task.subtitle} time="Pendiente" action="Revisar" onClick={()=>onOpenDocument(task.patient,task.kind)}/>)}{pendingTasks.length===0&&<div className="empty-inline">No hay documentos pendientes.</div>}</div><button className="panel-footer-link" onClick={()=>setPage('consents')}>Ir al centro de documentos <ArrowRight size={14}/></button></section>
    </div><div className="bottom-grid"><section className="panel patient-panel"><div className="panel-heading"><div><div className="panel-title">Pacientes recientes</div><p className="panel-subtitle">Últimos expedientes con actividad</p></div><button className="text-link" onClick={()=>setPage('patients')}>Ver pacientes <ArrowRight size={14}/></button></div><div className="mini-patients">{patients.slice(0,4).map(p=><button className="mini-patient" key={p.id} onClick={()=>onOpenPatient(p)}><Avatar initials={p.initials} tone={p.tone}/><div><strong>{p.name}</strong><span>{p.treatment}</span></div><span className="mini-date">{p.last.split(',')[0]}</span><ChevronRight size={15} className="muted-icon"/></button>)}</div></section><section className="panel recent-activity-panel"><div className="panel-heading"><div><div className="panel-title">Seguimientos recientes</div><p className="panel-subtitle">Últimas notas del equipo</p></div><button className="text-link" onClick={()=>setPage('patients')}>Ver expedientes <ArrowRight size={14}/></button></div><div className="recent-activity-list">{recentActivities.map(activity=>{const patient=patients.find(item=>item.id===activity.patientId);if(!patient)return null;return <button className="recent-activity-item" key={activity.id} onClick={()=>onOpenPatient(patient)}><span className="recent-activity-icon"><FileText size={15}/></span><span className="recent-activity-copy"><strong>{patient.name} · {activity.type}</strong><span>{activity.note}</span></span><time>{new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(new Date(activity.createdAt))}</time><ChevronRight size={14}/></button>})}{recentActivities.length===0&&<div className="empty-inline recent-activity-empty">Las notas de seguimiento aparecerán aquí.</div>}</div></section></div>
  </>;
}
function MetricCard({label,value,change,icon:Icon,tint,trend}) { return <div className="metric-card"><div className={`metric-icon ${tint}`}><Icon size={18}/></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className={`metric-change ${trend==='attention'?'attention':''}`}>{trend==='up'?<ArrowUpRight size={14}/>:<span className="attention-dot"/>}{change}</div><div className="metric-sparkline"><svg viewBox="0 0 94 32" preserveAspectRatio="none"><path d="M1 26 C13 26 12 18 23 19 S34 28 42 19 S55 12 61 16 S72 4 80 11 S87 8 93 2"/></svg></div></div>; }
function TaskItem({icon:Icon,tint,title,subtitle,time,action,onClick}) { return <div className="task-item"><div className={`task-icon ${tint}`}><Icon size={16}/></div><div className="task-copy"><strong>{title}</strong><span>{subtitle}</span><small><Clock3 size={11}/>{time}</small></div><button onClick={onClick}>{action}<ChevronRight size={14}/></button></div>; }

function PatientsPage({patients,allPatients,query,setQuery,searchRef,setModal,onOpen}) {
 const [filter,setFilter]=useState('Todos');
 const [documentFilter,setDocumentFilter]=useState('Todos');
 const [branchFilter,setBranchFilter]=useState('Todas las sucursales');
 const [providerFilter,setProviderFilter]=useState('Todas las personas');
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [page,setPage]=useState(1);
 const [pageSize,setPageSize]=useState(20);
 useEffect(()=>setPage(1),[filter,documentFilter,branchFilter,providerFilter,query,pageSize]);
 const branches=[...new Set(allPatients.map(patient=>patient.branch).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
 const providers=[...new Set(allPatients.map(patient=>patient.clinician).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
 const matchesFilter=patient=>filter==='Todos'||(filter==='Activos'?patient.status==='Activo':filter==='Nuevos'?patient.status==='Nuevo':patient.contract==='Pendiente'||patient.consent==='Pendiente');
 const matchesDocumentFilter=patient=>documentFilter==='Todos'||(documentFilter==='Contrato pendiente'?patient.contract==='Pendiente':documentFilter==='Consentimiento pendiente'?patient.consent==='Pendiente':patient.contract==='Pendiente'&&patient.consent==='Pendiente');
 const matchesBranch=patient=>branchFilter==='Todas las sucursales'||patient.branch===branchFilter;
 const matchesProvider=patient=>providerFilter==='Todas las personas'||patient.clinician===providerFilter;
 const filtered=patients.filter(patient=>matchesFilter(patient)&&matchesDocumentFilter(patient)&&matchesBranch(patient)&&matchesProvider(patient));
 const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
 const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 const pendingPatients=allPatients.filter(patient=>patient.contract==='Pendiente'||patient.consent==='Pendiente').length;
 const clearFilters=()=>{setQuery('');setFilter('Todos');setDocumentFilter('Todos');setBranchFilter('Todas las sucursales');setProviderFilter('Todas las personas');};
 return <><PageTitle eyebrow="DIRECTORIO CLÍNICO" title="Pacientes" description="Expedientes, documentos y seguimiento en un solo lugar." action={<button className="button primary" onClick={()=>setModal('new-patient')}><Plus size={16}/> Agregar paciente</button>}/><div className="summary-strip patient-directory-summary"><div><UsersRound size={16}/><strong>{allPatients.length}</strong><span>pacientes en el directorio</span></div><i/><div><span className="summary-dot green"/><strong>{allPatients.filter(patient=>patient.status==='Activo').length}</strong><span>activos</span></div><i/><div><span className="summary-dot orange"/><strong>{pendingPatients}</strong><span>expedientes con documentos pendientes</span></div><div className="summary-side-note"><ShieldCheck size={14}/> Datos de demostración</div></div><section className="panel data-panel patients-directory-table"><div className="table-toolbar"><div className="filter-tabs">{['Todos','Activos','Nuevos','Docs pendientes'].map(label=><button className={filter===label?'selected':''} onClick={()=>setFilter(label)} key={label}>{label}{label==='Todos'?<span>{allPatients.length}</span>:label==='Docs pendientes'?<span>{pendingPatients}</span>:null}</button>)}</div><div className="table-actions"><label className="input-search"><Search size={15}/><input ref={searchRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar nombre, expediente, correo…"/><kbd>⌘ K</kbd></label><button className="button outline compact" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(open=>!open)}><SlidersHorizontal size={15}/> Filtros</button><button className="icon-button outline" onClick={clearFilters} aria-label="Limpiar búsqueda y filtros"><ListFilter size={16}/></button></div></div>{filtersOpen&&<div className="agenda-filter-panel patient-filter-panel"><label className="select-filter"><Activity size={15}/><select aria-label="Filtrar pacientes por sucursal" value={branchFilter} onChange={event=>setBranchFilter(event.target.value)}><option>Todas las sucursales</option>{branches.map(branch=><option key={branch}>{branch}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><UserRound size={15}/><select aria-label="Filtrar pacientes por profesional" value={providerFilter} onChange={event=>setProviderFilter(event.target.value)}><option>Todas las personas</option>{providers.map(provider=><option key={provider}>{provider}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><FileCheck2 size={15}/><select aria-label="Filtrar pacientes por documento" value={documentFilter} onChange={event=>setDocumentFilter(event.target.value)}><option>Todos</option><option>Contrato pendiente</option><option>Consentimiento pendiente</option><option>Ambos pendientes</option></select><ChevronDown size={14}/></label><span className="panel-subtitle">Los filtros se combinan con la búsqueda, el estado y los documentos.</span></div>}<div className="table-wrap"><table><thead><tr><th>PACIENTE</th><th>ÚLTIMA ACTIVIDAD</th><th>TRATAMIENTO</th><th>CONTRATO</th><th>CONSENTIMIENTO</th><th>ESTADO</th><th></th></tr></thead><tbody>{shown.map(patient=><tr key={patient.id} onClick={()=>onOpen(patient)} className="clickable-row"><td><div className="patient-cell"><Avatar initials={patient.initials} tone={patient.tone}/><div><strong>{patient.name}</strong><span>{patient.id}</span></div></div></td><td className="last-cell">{patient.last}</td><td><span className="treatment-cell">{patient.treatment}</span></td><td><DocStatus status={patient.contract}/></td><td><DocStatus status={patient.consent}/></td><td><Badge variant={patient.status==='Activo'?'active':patient.status==='Nuevo'?'new':'followup'}><span className="badge-dot"/>{patient.status}</Badge></td><td><button className="row-more" aria-label={`Abrir expediente de ${patient.name}`} onClick={event=>{event.stopPropagation();onOpen(patient)}}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{shown.length===0&&<div className="empty-state"><Search size={20}/><strong>No encontramos pacientes</strong><span>Prueba con otros filtros o limpia la búsqueda.</span></div>}</div><div className="table-bottom"><span>Mostrando <strong>{filtered.length?((page-1)*pageSize)+1:0}–{Math.min(page*pageSize,filtered.length)}</strong> de <strong>{filtered.length}</strong> resultados</span><div className="pagination"><button aria-label="Página anterior" disabled={page<=1} onClick={()=>setPage(current=>Math.max(1,current-1))}><ChevronLeft size={15}/></button><span className="page-number active">{page} de {pageCount}</span><button aria-label="Página siguiente" disabled={page>=pageCount} onClick={()=>setPage(current=>Math.min(pageCount,current+1))}><ChevronRight size={15}/></button></div><label className="per-page">Filas por página <select aria-label="Filas por página" value={pageSize} onChange={event=>setPageSize(Number(event.target.value))}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label></div></section></>;
}
function agendaSlotTime(index) {
  const totalMinutes = 6 * 60 + index * 15;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}
function DocStatus({status}){return <span className={`doc-status ${status==='Firmado'?'signed':status==='Reemplazado'?'replaced':'waiting'}`}><span className="status-icon">{status==='Firmado'?<Check size={11}/>:status==='Reemplazado'?<X size={11}/>:<Clock3 size={11}/>}</span>{status}</span>;}

function AppointmentModal({appointment,payments,businesses,branches,providers,sharedMode=false,canManagePayments=!sharedMode,paymentDataReady=true,close,onSubmit,onOpenPatient,onAddPayment}) {
  const netReceived=payments.reduce((total,payment)=>total+(payment.direction==='Reembolso'?-Number(payment.amount):Number(payment.amount)),0);
  const currentDuration=Number.parseInt(appointment.duration,10)||45;
  const [time,setTime]=useState(appointment.time);
  const [durationMinutes,setDurationMinutes]=useState(String(currentDuration));
  const activeBusinesses=businesses.filter(item=>item.active!==false);
  const activeBranches=branches.filter(item=>item.active!==false);
  const activeProviders=providers.filter(item=>item.active!==false);
  const currentBranch=activeBranches.find(item=>item.id===appointment.branchId||item.name===appointment.branch);
  const [businessId,setBusinessId]=useState(appointment.businessId||currentBranch?.businessId||activeBusinesses.find(item=>item.name===appointment.business)?.id||activeBusinesses[0]?.id||'');
  const branchesForBusiness=activeBranches.filter(item=>item.businessId===businessId);
  const [branchId,setBranchId]=useState(currentBranch?.businessId===businessId?currentBranch.id:branchesForBusiness[0]?.id||'');
  const providersForBranch=activeProviders.filter(item=>!item.branchIds?.length||item.branchIds.includes(branchId));
  const currentProvider=activeProviders.find(item=>item.id===appointment.providerId||item.name===appointment.clinician);
  const [providerId,setProviderId]=useState(currentProvider&&( !currentProvider.branchIds?.length||currentProvider.branchIds.includes(branchId))?currentProvider.id:providersForBranch[0]?.id||'');
  const updateDuration=next=>{setDurationMinutes(next);if(timeToMinutes(time)>timeToMinutes(latestAppointmentStart(next)))setTime(latestAppointmentStart(next))};
  return <Modal title="Detalle de la cita" subtitle={`${appointment.patient} · ${appointment.service}`} close={close}>
    <form onSubmit={onSubmit} className="form-stack">
      <input type="hidden" name="id" value={appointment.id}/>
      <div className="form-note"><CalendarDays size={15}/>{appointment.clinician} · {appointment.branch} · {appointment.duration||'45 min'} · {appointment.modality||'Presencial'}</div>
      {appointment.depositRequired&&<div className="form-note"><DollarSign size={15}/>{sharedMode&&!canManagePayments?`Anticipo requerido: ${formatCurrencyMXN(appointment.depositAmount)}. El sistema validará el pago antes de confirmar.`:sharedMode&&!paymentDataReady?`Anticipo requerido: ${formatCurrencyMXN(appointment.depositAmount)} · Actualizando pagos registrados…`:`Anticipo requerido: ${formatCurrencyMXN(appointment.depositAmount)} · Registrado: ${formatCurrencyMXN(netReceived)}.`}</div>}
      <label>Negocio<select name="businessId" value={businessId} onChange={event=>{const nextBusinessId=event.target.value;setBusinessId(nextBusinessId);const nextBranch=activeBranches.find(item=>item.businessId===nextBusinessId);setBranchId(nextBranch?.id||'');const nextProvider=activeProviders.find(item=>!item.branchIds?.length||item.branchIds.includes(nextBranch?.id));setProviderId(nextProvider?.id||'')}} required>{activeBusinesses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="form-grid"><label>Profesional<select name="providerId" value={providerId} onChange={event=>setProviderId(event.target.value)} required>{providersForBranch.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sucursal<select name="branchId" value={branchId} onChange={event=>{const nextBranchId=event.target.value;setBranchId(nextBranchId);const nextProvider=activeProviders.find(item=>!item.branchIds?.length||item.branchIds.includes(nextBranchId));setProviderId(nextProvider?.id||'')}} required>{branchesForBusiness.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <section className="appointment-reminder-card"><div className="appointment-reminder-heading"><strong>Avisos de la cita</strong><span>{appointment.status==='Confirmada'?'Programados':appointment.status==='Cancelada'?'Cancelados':appointment.status==='Completada'?'Cita completada':'Al confirmar'}</span></div><div className="appointment-reminder-row"><span>Confirmación</span><strong>2 días antes</strong></div><div className="appointment-reminder-row"><span>Recordatorio</span><strong>1 día antes</strong></div><div className="appointment-reminder-row"><span>Recordatorio del día</span><strong>5 horas antes</strong></div><p>La agenda de avisos se actualiza al confirmar, reprogramar o cancelar. El envío automático requiere conectar un proveedor.</p></section>
      <div className="form-grid"><label>Fecha<input name="date" type="date" defaultValue={appointment.date} required/></label><label>Hora<input name="time" type="time" value={time} onChange={event=>setTime(event.target.value)} min="06:00" max={latestAppointmentStart(durationMinutes)} step="900" required/></label></div>
      <div className="form-grid"><label>Duración<select name="durationMinutes" value={durationMinutes} onChange={event=>updateDuration(event.target.value)}>{![15,30,45,60,75,90,120].includes(currentDuration)&&<option value={String(currentDuration)}>{currentDuration} minutos · duración actual</option>}<option value="15">15 minutos</option><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">1 hora</option><option value="75">1 hora 15 minutos</option><option value="90">1 hora 30 minutos</option><option value="120">2 horas</option></select></label><label>Modalidad<select name="modality" defaultValue={appointment.modality||'Presencial'}><option>Presencial</option><option>Virtual</option></select></label></div>
      <label>Servicio<input name="service" defaultValue={appointment.service||''} list="clinic-service-suggestions" maxLength="120" required/></label><datalist id="clinic-service-suggestions"><option value="Consulta de valoración"/><option value="Limpieza facial"/><option value="Tratamiento facial"/><option value="Seguimiento"/></datalist>
      <label>Estado<select name="status" defaultValue={appointment.status||'Por confirmar'}><option>Por confirmar</option><option>Confirmada</option><option>Completada</option><option>Cancelada</option></select></label>
      {canManagePayments&&<section className="appointment-payment-card"><div className="appointment-payment-heading"><div><strong>Pagos de esta cita</strong><span>{paymentDataReady?`Saldo neto registrado: ${formatCurrencyMXN(netReceived)}`:'Cargando el historial de pagos…'}</span></div><button type="button" className="button outline compact" disabled={!paymentDataReady} onClick={onAddPayment}><Plus size={14}/> Registrar pago</button></div>{paymentDataReady&&payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(payment=><div className="appointment-payment-row" key={payment.id}><span>{formatRecordDate(payment.date)} · {payment.method}</span><strong className={payment.direction==='Reembolso'?'refund-text':''}>{payment.direction==='Reembolso'?'−':'+'}{formatCurrencyMXN(payment.amount)}</strong></div>)}{paymentDataReady&&payments.length===0&&<p className="appointment-payment-empty">Todavía no hay movimientos para esta cita.</p>}</section>}
      <div className="modal-actions appointment-modal-actions"><button type="button" className="button outline compact" onClick={onOpenPatient}><UsersRound size={15}/> Ver expediente</button><span/><button type="button" className="button secondary" onClick={close}>Cerrar</button><button className="button primary" type="submit"><Check size={15}/> Guardar cita</button></div>
    </form>
  </Modal>;
}
function NewAppointmentModal({close,onSubmit,defaultDate,defaultTime,defaultPatientId='',patients,businesses,branches,providers,appointments=[],sharedMode=false}) {
  const [time,setTime]=useState(defaultTime);
  const [durationMinutes,setDurationMinutes]=useState('45');
  const [service,setService]=useState('');
  const [depositAmount,setDepositAmount]=useState('');
  const updateDuration=next=>{setDurationMinutes(next);if(timeToMinutes(time)>timeToMinutes(latestAppointmentStart(next)))setTime(latestAppointmentStart(next))};
  const [patientId,setPatientId]=useState(defaultPatientId);
  const preferredPatient=patients.find(patient=>patient.id===defaultPatientId);
  const activeBusinesses=businesses.filter(item=>item.active);
  const activeBranches=branches.filter(item=>item.active);
  const activeProviders=providers.filter(item=>item.active);
  const preferredBranch=activeBranches.find(item=>item.id===preferredPatient?.branchId||item.name===preferredPatient?.branch);
  const preferredProvider=activeProviders.find(item=>item.id===preferredPatient?.providerId||item.name===preferredPatient?.clinician);
  const initialBusinessId=activeBusinesses.find(item=>item.id===preferredBranch?.businessId)?.id||activeBusinesses[0]?.id||'';
  const [businessId,setBusinessId]=useState(initialBusinessId);
  const branchesForBusiness=activeBranches.filter(item=>item.businessId===businessId);
  const initialBranchId=branchesForBusiness.some(item=>item.id===preferredBranch?.id)?preferredBranch.id:branchesForBusiness[0]?.id||'';
  const [branchId,setBranchId]=useState(initialBranchId);
  const servicePresetsByName=new Map();
  appointments.slice().sort((a,b)=>`${b.date||''} ${b.time||''}`.localeCompare(`${a.date||''} ${a.time||''}`)).forEach(appointment=>{
    const appointmentBranch=branches.find(item=>item.id===appointment.branchId||item.name===appointment.branch);
    const appointmentBranchId=appointment.branchId||appointmentBranch?.id;
    const appointmentBusinessId=appointment.businessId||appointmentBranch?.businessId;
    if(appointmentBranchId!==branchId||appointmentBusinessId!==businessId) return;
    const name=String(appointment.service||'').trim();
    const key=name.toLocaleLowerCase('es-MX');
    if(name&&!servicePresetsByName.has(key)) servicePresetsByName.set(key,appointment);
  });
  const servicePresets=[...servicePresetsByName.values()];
  const applyServicePreset=value=>{
    const preset=servicePresetsByName.get(String(value||'').trim().toLocaleLowerCase('es-MX'));
    if(!preset) { updateDuration('45'); setDepositAmount(''); return; }
    const presetDuration=Number.parseInt(preset.duration,10);
    if([15,30,45,60,75,90,120].includes(presetDuration)) updateDuration(String(presetDuration));
    setDepositAmount(Number(preset.depositAmount)>0?String(preset.depositAmount):'');
  };
  const providersForBranch=activeProviders.filter(item=>!item.branchIds?.length||item.branchIds.includes(branchId));
  const initialProviderId=providersForBranch.some(item=>item.id===preferredProvider?.id)?preferredProvider.id:providersForBranch[0]?.id||'';
  const [providerId,setProviderId]=useState(initialProviderId);
  return <Modal title="Nueva cita" subtitle="Vincula la cita con un expediente y asigna negocio, profesional y sucursal." close={close}>
    <form onSubmit={onSubmit} className="form-stack">
      <label>Paciente<select name="patientId" required value={patientId} onChange={event=>setPatientId(event.target.value)}><option value="" disabled>Seleccionar paciente…</option>{patients.map(patient=><option key={patient.id} value={patient.id}>{patient.name} · {patient.id}</option>)}</select></label>
      {patients.length===0&&<div className="form-note"><UsersRound size={15}/> Agrega primero el expediente del paciente desde Pacientes.</div>}
      <div className="form-grid"><label>Fecha<input name="date" type="date" defaultValue={defaultDate} required/></label><label>Hora<input name="time" type="time" value={time} onChange={event=>setTime(event.target.value)} min="06:00" max={latestAppointmentStart(durationMinutes)} step="900" required/></label></div>
      <label>Servicio<input name="service" value={service} onChange={event=>setService(event.target.value)} onBlur={event=>applyServicePreset(event.target.value)} list="clinic-service-suggestions" placeholder="Escribe el servicio" maxLength="120" required/></label><datalist id="clinic-service-suggestions">{[...new Set(['Consulta de valoración','Limpieza facial','Tratamiento facial','Seguimiento',...servicePresets.map(appointment=>appointment.service)].filter(Boolean))].map(name=><option key={name} value={name}/>)}</datalist>
      <label>Duración<select name="durationMinutes" value={durationMinutes} onChange={event=>updateDuration(event.target.value)}><option value="15">15 minutos</option><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">1 hora</option><option value="75">1 hora 15 minutos</option><option value="90">1 hora 30 minutos</option><option value="120">2 horas</option></select></label>
      <label>Modalidad<select name="modality" defaultValue="Presencial"><option>Presencial</option><option>Virtual</option></select></label>
      <label>Negocio<select name="businessId" required value={businessId} onChange={event=>{const nextBusinessId=event.target.value;setBusinessId(nextBusinessId);const nextBranch=activeBranches.find(item=>item.businessId===nextBusinessId);setBranchId(nextBranch?.id||'');const nextProvider=activeProviders.find(item=>!item.branchIds?.length||item.branchIds.includes(nextBranch?.id));setProviderId(nextProvider?.id||'')}}>{activeBusinesses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="form-grid"><label>Profesional<select name="providerId" required value={providerId} onChange={event=>setProviderId(event.target.value)}>{providersForBranch.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sucursal<select name="branchId" required value={branchId} onChange={event=>{const nextBranchId=event.target.value;setBranchId(nextBranchId);const nextProvider=activeProviders.find(item=>!item.branchIds?.length||item.branchIds.includes(nextBranchId));setProviderId(nextProvider?.id||'')}}>{branchesForBusiness.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <label>Monto del anticipo requerido (MXN)<input name="depositAmount" type="number" min="0.01" step="0.01" value={depositAmount} onChange={event=>setDepositAmount(event.target.value)} placeholder="Ej. 500" required/></label>
      <div className="form-note"><Bell size={15}/> {sharedMode?"La base compartida verificará el anticipo registrado antes de permitir confirmar.":"La cita no podrá marcarse como confirmada hasta que el anticipo esté registrado en Pagos."}</div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit" disabled={!patients.length||!activeBusinesses.length||!branchesForBusiness.length||!providersForBranch.length}><CalendarDays size={16}/> Agendar cita</button></div>
    </form>
  </Modal>;
}

function NewContractModal({close,onSubmit,onReviewDiagnosis,onAddTemplate,patients,templates,defaultPatientId,sharedMode=false,canPrepare=true}) {
  const [patientId,setPatientId]=useState(defaultPatientId||'');
  const readyTemplates = templates.filter(template => template.content?.trim());
  const eligiblePatients = sharedMode ? patients.filter(patient => patient.diagnosisAccepted && patient.diagnosisId) : patients;
  const selectedPatient = eligiblePatients.find(patient => patient.id === patientId);
  const diagnosisAccepted = Boolean(selectedPatient?.diagnosisAccepted && selectedPatient?.diagnosisId);
  return <Modal title="Nuevo contrato de servicios" subtitle="Prepara un contrato para revisar con el paciente." close={close}>
    <form className="form-stack" onSubmit={onSubmit}>
      <label>Paciente<select name="patient" value={patientId} onChange={event=>setPatientId(event.target.value)} required><option value="" disabled>Seleccionar paciente…</option>{eligiblePatients.map(patient=><option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></label>
      <label>Formato oficial<select name="contractTemplate" defaultValue="" required><option value="" disabled>Seleccionar formato…</option>{readyTemplates.map(template=><option key={template.id} value={template.id}>{template.title}{template.version?` · ${template.version}`:''} · {template.type}</option>)}</select></label>
      <label>Servicio o tratamiento<input name="service" placeholder="Describe el servicio"/></label>
      {readyTemplates.length===0&&<div className="form-note"><FileText size={14}/> Agrega un formato oficial con contenido antes de preparar el documento. <button type="button" className="text-link" onClick={onAddTemplate}>Crear formato oficial</button></div>}
      {eligiblePatients.length===0&&<div className="form-note"><ClipboardCheck size={14}/> Primero registra y acepta un diagnóstico desde el expediente del paciente.</div>}
      {selectedPatient&&!diagnosisAccepted&&<div className="form-note"><ClipboardCheck size={14}/> Acepta el diagnóstico de {selectedPatient.name} antes de preparar el contrato. <button type="button" className="text-link" onClick={()=>onReviewDiagnosis?.(selectedPatient.id)}>Revisar diagnóstico</button></div>}
      <div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Se guarda una copia inmutable para revisión; la firma electrónica aún no está conectada.':'La vista y firma son de demostración; no se envían ni tienen validez legal.'}</div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" disabled={!canPrepare||!readyTemplates.length||!eligiblePatients.length||!diagnosisAccepted}><FilePlus2 size={16}/> Preparar contrato</button></div>
    </form>
  </Modal>;
}

function PaymentModal({close,onSubmit,defaultDate,defaultAppointmentId,patients,appointments,payments}) {
  const initialAppointment=appointments.find(item=>item.id===defaultAppointmentId);
  const initialPatientId=initialAppointment?.patientId||patients.find(patient=>patient.name===initialAppointment?.patient)?.id||patients[0]?.id||'';
  const [patientId,setPatientId]=useState(initialPatientId);
  const [appointmentId,setAppointmentId]=useState(defaultAppointmentId||'');
  const [direction,setDirection]=useState('Ingreso');
  const patient=patients.find(item=>item.id===patientId);
  const appointmentOptions=appointments.filter(item=>item.patientId===patientId||item.patient===patient?.name);
  const linkedAppointment=appointments.find(item=>item.id===appointmentId);
  const refundAvailability=patient?summarizeRefundAvailability(patient.id,patient.name,linkedAppointment,appointments,payments):{balance:0,protectedDeposits:0,available:0};
  return <Modal title="Registrar movimiento" subtitle="Guarda un ingreso o reembolso como un registro independiente." close={close}><form onSubmit={onSubmit} className="form-stack"><label>Paciente<select name="patientId" required value={patientId} onChange={event=>{setPatientId(event.target.value);setAppointmentId('')}}>{patients.map(item=><option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label><label>Cita vinculada<select name="appointmentId" value={appointmentId} onChange={event=>setAppointmentId(event.target.value)}><option value="">Sin cita vinculada</option>{appointmentOptions.map(item=><option key={item.id} value={item.id}>{item.date} · {item.time} · {item.service}</option>)}</select></label><div className="form-grid"><label>Tipo<select name="direction" value={direction} onChange={event=>setDirection(event.target.value)}><option>Ingreso</option><option>Reembolso</option></select></label><label>Monto (MXN)<input name="amount" type="number" min="0.01" max={direction==='Reembolso'?refundAvailability.available:undefined} step="0.01" placeholder="0.00" required/></label></div><div className="form-grid"><label>Fecha<input name="date" type="date" defaultValue={defaultDate} required/></label><label>Método<select name="method" defaultValue="Transferencia"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Otro</option></select></label></div><label>Nota opcional<input name="note" maxLength="240" placeholder="Referencia, concepto o motivo"/></label>{direction==='Reembolso'&&patient&&<div className="form-note"><CalendarDays size={15}/>{linkedAppointment?`${linkedAppointment.service} · ${linkedAppointment.date}`:`Saldo del expediente de ${patient.name}`} · Saldo: {formatCurrencyMXN(refundAvailability.balance)} · Anticipos reservados: {formatCurrencyMXN(refundAvailability.protectedDeposits)} · Disponible para reembolso: {formatCurrencyMXN(refundAvailability.available)}</div>}<div className="form-note"><ShieldCheck size={15}/> Los movimientos se conservan en el historial. Para corregir un ingreso registra un reembolso, no edites el movimiento.</div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit"><DollarSign size={15}/> Guardar movimiento</button></div></form></Modal>;
}

function RemindersPage({ reminders, sharedMode = false }) {
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [kindFilter, setKindFilter] = useState('Todos');
  const pending = reminders.filter(item => (item.status === 'pending' || item.status === 'sending') && item.deliveryEligible).length;
  const blocked = reminders.filter(item => item.status === 'blocked' || (['pending', 'failed'].includes(item.status) && !item.deliveryEligible)).length;
  const sent = reminders.filter(item => item.status === 'sent').length;
  const attention = reminders.filter(item => item.status === 'failed' || item.status === 'unknown').length;
  const statusLabels = { pending: 'Pendiente', sending: 'En preparación', sent: 'Enviado', failed: 'Error', unknown: 'Entrega incierta · revisar', blocked: 'Bloqueado', skipped: 'Omitido', cancelled: 'Cancelado' };
  const sorted = reminders.filter(item => {
    const statusMatches = statusFilter === 'Todos'
      || (statusFilter === 'Pendientes' && ['pending', 'sending'].includes(item.status) && item.deliveryEligible)
      || (statusFilter === 'Bloqueados' && (item.status === 'blocked' || (['pending', 'failed'].includes(item.status) && !item.deliveryEligible)))
      || (statusFilter === 'Enviados' && item.status === 'sent')
      || (statusFilter === 'Requieren atención' && ['failed', 'unknown'].includes(item.status))
      || (statusFilter === 'Omitidos o cancelados' && ['skipped', 'cancelled'].includes(item.status));
    return statusMatches && (kindFilter === 'Todos' || item.kind === kindFilter);
  }).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return <>
    <PageTitle eyebrow="OPERACIÓN CLÍNICA" title="Recordatorios" description="Programa la confirmación y los avisos previos de cada cita confirmada."/>
    <div className="reminder-summary-grid">
      <div className="reminder-summary-card"><span>Mensajes programados</span><strong>{reminders.length}</strong></div>
      <div className="reminder-summary-card"><span>Pendientes autorizados</span><strong>{pending}</strong></div>
      <div className="reminder-summary-card"><span>Bloqueados por autorización o teléfono</span><strong>{blocked}</strong></div><div className="reminder-summary-card"><span>Enviados</span><strong>{sent}</strong></div>
      <div className="reminder-summary-card"><span>Requieren atención</span><strong>{attention}</strong></div>
    </div>
    <section className="panel reminder-ledger">
      <div className="panel-heading"><div><div className="panel-title">Calendario de mensajes</div><p className="panel-subtitle">Confirmación 2 días antes · recordatorio 1 día antes · aviso 5 horas antes</p></div></div>
      <div className="reminder-delivery-note"><Bell size={15}/><span>{sharedMode ? 'La programación se guarda en la clínica. Solo pacientes con autorización explícita y teléfono válido serán elegibles; aún no hay un canal de envío conectado.' : 'Vista de demostración: muestra cuándo tocaría cada aviso; todavía no se envían mensajes.'}</span></div>
      <div className="agenda-filter-panel">
        <label className="select-filter"><Filter size={15}/><select aria-label="Filtrar recordatorios por tipo" value={kindFilter} onChange={event=>setKindFilter(event.target.value)}><option value="Todos">Todos los tipos</option><option value="confirmation_2d">Confirmación · 2 días antes</option><option value="reminder_1d">Recordatorio · 1 día antes</option><option value="reminder_5h">Recordatorio · 5 horas antes</option></select><ChevronDown size={14}/></label>
        <label className="select-filter"><Clock3 size={15}/><select aria-label="Filtrar recordatorios por estado" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option>Todos</option><option>Pendientes</option><option>Bloqueados</option><option>Enviados</option><option>Requieren atención</option><option>Omitidos o cancelados</option></select><ChevronDown size={14}/></label>
        {(kindFilter!=='Todos'||statusFilter!=='Todos')&&<button className="text-link" onClick={()=>{setKindFilter('Todos');setStatusFilter('Todos')}}>Limpiar filtros <X size={13}/></button>}
        <span className="panel-subtitle">{sorted.length} de {reminders.length} mensajes</span>
      </div>
      <div className="table-wrap"><table><thead><tr><th>MENSAJE</th><th>PROGRAMADO PARA</th><th>PACIENTE</th><th>CITA</th><th>ESTADO</th></tr></thead><tbody>
        {sorted.map(item => <tr key={item.id}>
          <td><div className="reminder-kind"><span className="reminder-icon"><Clock3 size={15}/></span><strong>{item.label}</strong></div></td>
          <td>{item.scheduledLabel}</td>
          <td><div className="reminder-person"><strong>{item.patientName || 'Paciente'}</strong><span>{item.service || 'Cita clínica'}</span></div></td>
          <td><div className="reminder-person"><strong>{item.appointmentLabel}</strong><span>{[item.providerName, item.branchName].filter(Boolean).join(' · ') || 'Equipo clínico'}</span></div></td>
          <td><span className={`reminder-status ${item.status || 'pending'}`}><i/>{statusLabels[item.status] || 'Pendiente'}</span>{!item.deliveryEligible&&item.deliveryBlockReason&&<small className="reminder-block-reason">{item.deliveryBlockReason}</small>}</td>
        </tr>)}
      </tbody></table>
        {sorted.length === 0 && <div className="empty-state"><Bell size={20}/><strong>No hay avisos programados</strong><span>Las citas aparecerán aquí cuando estén confirmadas.</span></div>}
      </div>
    </section>
  </>;
}

function PaymentsPage({payments,appointments,patients,onNewPayment,sharedMode=false}) {
  const sortedPayments=payments.slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||''));
  const income=payments.filter(payment=>payment.direction==='Ingreso').reduce((total,payment)=>total+Number(payment.amount||0),0);
  const refunds=payments.filter(payment=>payment.direction==='Reembolso').reduce((total,payment)=>total+Number(payment.amount||0),0);
  const net=income-refunds;
  return <><PageTitle eyebrow="ADMINISTRACIÓN" title="Pagos" description="Registra ingresos y reembolsos vinculados a pacientes y citas." action={<button className="button primary" onClick={onNewPayment}><Plus size={16}/> Registrar movimiento</button>}/><div className="payment-summary-grid"><div className="payment-summary-card"><span>Ingresos registrados</span><strong>{formatCurrencyMXN(income)}</strong></div><div className="payment-summary-card refund"><span>Reembolsos</span><strong>{formatCurrencyMXN(refunds)}</strong></div><div className="payment-summary-card net"><span>Neto registrado</span><strong>{formatCurrencyMXN(net)}</strong></div></div><section className="panel payment-ledger"><div className="panel-heading"><div><div className="panel-title">Historial de movimientos</div><p className="panel-subtitle">{payments.length} movimientos · cada ingreso y reembolso conserva su propio registro</p></div></div><div className="table-wrap"><table><thead><tr><th>FECHA</th><th>PACIENTE</th><th>CITA</th><th>TIPO</th><th>MÉTODO</th><th>NOTA</th><th>MONTO</th></tr></thead><tbody>{sortedPayments.map(payment=>{const patient=patients.find(item=>item.id===payment.patientId);const appointment=appointments.find(item=>item.id===payment.appointmentId);return <tr key={payment.id}><td>{formatRecordDate(payment.date)}</td><td><div className="patient-cell"><Avatar initials={patient?.initials||payment.patientNameSnapshot?.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'PA'} tone={patient?.tone||'blue'}/><div><strong>{patient?.name||payment.patientNameSnapshot||'Paciente'}</strong><span>{patient?.id||'Expediente'}</span></div></div></td><td>{appointment?`${appointment.date} · ${appointment.time} · ${appointment.service}`:'Sin cita vinculada'}</td><td><span className={`payment-type ${payment.direction==='Reembolso'?'refund':''}`}>{payment.direction}</span></td><td>{payment.method}</td><td>{payment.note||'—'}</td><td className={`payment-amount ${payment.direction==='Reembolso'?'refund-text':''}`}>{payment.direction==='Reembolso'?'−':'+'}{formatCurrencyMXN(payment.amount)}</td></tr>})}</tbody></table>{sortedPayments.length===0&&<div className="empty-state"><DollarSign size={20}/><strong>Aún no hay movimientos</strong><span>Registra un ingreso o un reembolso para empezar el historial.</span><button className="button primary compact" onClick={onNewPayment}><Plus size={14}/> Registrar movimiento</button></div>}</div></section><p className="payment-demo-note"><ShieldCheck size={14}/>{sharedMode?'Movimientos compartidos y de solo alta; confirma la conciliación bancaria por separado.':'Movimientos guardados localmente para demostración; no sustituyen una conciliación contable.'}</p></>;
}

function AgendaEventCard({ appointment, variant = 'calendar-event', compact = false, style, onOpen }) {
  const duration = appointment.duration || '45 min';
  const status = appointment.status || 'Por confirmar';
  const modality = appointment.modality || 'Presencial';
  const details = [
    appointment.date,
    appointment.time,
    duration,
    appointment.patient,
    appointment.service,
    status,
    modality,
    appointment.clinician,
    appointment.branch,
  ].filter(Boolean).join(' · ');
  const isPending = status === 'Por confirmar';
  const isCancelled = status === 'Cancelada';

  return <button
    type="button"
    className={`agenda-event-card ${variant} ${isPending ? 'is-pending' : ''} ${isCancelled ? 'is-cancelled' : ''} ${compact ? 'is-compact' : ''} tone-${appointment.tone}`}
    style={style}
    onClick={() => onOpen(appointment)}
    aria-label={`Abrir cita: ${details}`}
    title={details}
  >
    <span className="event-main">
      <strong className="event-patient">{appointment.patient}</strong>
      <span className="event-time">{appointment.time}<i> · {duration}</i></span>
    </span>
    <span className="event-sub">
      <span className="event-service">{appointment.service}</span>
      <span className="event-status">{status}</span>
    </span>
    {!compact && <small className="event-meta">{[appointment.clinician, appointment.branch, modality].filter(Boolean).join(' · ')}</small>}
  </button>;
}

function AgendaPage({appointments,payments,sharedMode=false,timeZone='America/Tijuana',providerFilter,setProviderFilter,providerOptions,branchFilter,setBranchFilter,branchOptions,businessFilter,setBusinessFilter,businessOptions,period,setPeriod,onNewAppointment,notify,agendaDate,setAgendaDate,onOpenAppointment}) {
  const dayStartHour=6;
  const dayEndHour=24;
  const daySlotCount=((dayEndHour-dayStartHour)*60-45)/15+1;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [statusFilter,setStatusFilter]=useState('Todos los estados');
  const [currentTime,setCurrentTime]=useState(null);
  useEffect(()=>{const updateTime=()=>setCurrentTime(new Date());updateTime();const timer=window.setInterval(updateTime,60000);return()=>window.clearInterval(timer)},[]);
  const providers=providerOptions;
  const branches=branchOptions;
  const activeFilterCount=[Boolean(providerFilter),Boolean(branchFilter),Boolean(businessFilter),statusFilter!=='Todos los estados'].filter(Boolean).length;
  const selectedDate=new Date(`${agendaDate}T12:00:00Z`);
  const weekStart=new Date(selectedDate);
  weekStart.setUTCDate(weekStart.getUTCDate()-((weekStart.getUTCDay()+6)%7));
  const monthStart=new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth(),1,12));
  const yearStart=new Date(Date.UTC(selectedDate.getUTCFullYear(),0,1,12));
  const rangeStart=period==='Semana'?weekStart:period==='Mes'?monthStart:period==='Año'?yearStart:selectedDate;
  const rangeEnd=period==='Semana'?new Date(Date.UTC(weekStart.getUTCFullYear(),weekStart.getUTCMonth(),weekStart.getUTCDate()+7,12)):period==='Mes'?new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth()+1,1,12)):period==='Año'?new Date(Date.UTC(selectedDate.getUTCFullYear()+1,0,1,12)):new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth(),selectedDate.getUTCDate()+1,12));
  const dateKey=(date)=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
  const todayKey=currentTime?dateKeyInTimeZone(currentTime,timeZone):'';
  const clockParts=currentTime?new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(currentTime):[];
  const currentHour=Number(clockParts.find(part=>part.type==='hour')?.value);
  const currentMinute=Number(clockParts.find(part=>part.type==='minute')?.value);
  const currentMinutes=currentTime?currentHour*60+currentMinute:null;
  const currentTimeLabel=currentTime?`${String(currentHour).padStart(2,'0')}:${String(currentMinute).padStart(2,'0')}`:'';
  const currentTimeOffset=currentTime?(currentHour-dayStartHour)+currentMinute/60:0;
  const dateFormatter=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'});
  const weekdayFormatter=new Intl.DateTimeFormat('es-MX',{weekday:'short',timeZone:'UTC'});
  const appointmentsInRange=appointments.filter(item=>{const date=new Date(`${item.date||agendaDate}T12:00:00Z`);return date>=rangeStart&&date<rangeEnd&&(statusFilter==='Todos los estados'||item.status===statusFilter);});
  const showCurrentTimeLine=agendaDate===todayKey&&currentMinutes>=dayStartHour*60&&currentMinutes<dayEndHour*60;
  const appointmentsFor=(key)=>appointmentsInRange.filter(item=>(item.date||agendaDate)===key).sort((a,b)=>a.time.localeCompare(b.time));
  const paymentsInRange=payments.filter(payment=>{
    const date=new Date(`${payment.date}T12:00:00Z`);
    const providerId=payment.providerId||providers.find(provider=>provider.name===payment.providerName)?.id;
    const branchId=payment.branchId||branches.find(branch=>branch.name===payment.branchName||branch.name.startsWith(`${payment.branchName} ·`))?.id;
    const businessId=payment.businessId||businessOptions.find(business=>business.name===payment.businessName)?.id;
    return date>=rangeStart&&date<rangeEnd&&(!providerFilter||providerId===providerFilter)&&(!branchFilter||branchId===branchFilter)&&(!businessFilter||businessId===businessFilter);
  });
  const confirmedCount=appointmentsInRange.filter(item=>item.status==='Confirmada').length;
  const pendingCount=appointmentsInRange.filter(item=>item.status==='Por confirmar').length;
  const virtualCount=appointmentsInRange.filter(item=>(item.modality||'Presencial')==='Virtual').length;
  const incomeTotal=paymentsInRange.reduce((total,payment)=>total+(payment.direction==='Reembolso'?-Number(payment.amount):Number(payment.amount)),0);
  const moneyLabel=sharedMode?'—':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(incomeTotal);
  let dateLabel=new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(selectedDate);
  if(period==='Semana') dateLabel=`${dateFormatter.format(weekStart)} – ${dateFormatter.format(new Date(Date.UTC(weekStart.getUTCFullYear(),weekStart.getUTCMonth(),weekStart.getUTCDate()+6,12)))} de ${selectedDate.getUTCFullYear()}`;
  if(period==='Mes') dateLabel=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(selectedDate);
  if(period==='Año') dateLabel=String(selectedDate.getUTCFullYear());
  const changeDate=(direction)=>{
    const nextDate=new Date(selectedDate);
    if(period==='Semana') nextDate.setUTCDate(nextDate.getUTCDate()+7*direction);
    else if(period==='Mes') nextDate.setUTCMonth(nextDate.getUTCMonth()+direction,1);
    else if(period==='Año') nextDate.setUTCFullYear(nextDate.getUTCFullYear()+direction,0,1);
    else nextDate.setUTCDate(nextDate.getUTCDate()+direction);
    setAgendaDate(dateKey(nextDate));
  };
  const goToToday=()=>setAgendaDate(dateKeyInTimeZone(new Date(),timeZone));
  const clearFilters=()=>{setProviderFilter('');setBranchFilter('');setBusinessFilter('');setStatusFilter('Todos los estados');};
  const weekDays=Array.from({length:7},(_,index)=>{const date=new Date(weekStart);date.setUTCDate(date.getUTCDate()+index);return date;});
  const monthOffset=(monthStart.getUTCDay()+6)%7;
  const monthLength=new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth()+1,0,12)).getUTCDate();
  const monthCells=Array.from({length:Math.ceil((monthOffset+monthLength)/7)*7},(_,index)=>index-monthOffset+1);
  const yearMonths=Array.from({length:12},(_,month)=>new Date(Date.UTC(selectedDate.getUTCFullYear(),month,1,12)));
  return <><PageTitle eyebrow="OPERACIÓN CLÍNICA" title="Agenda" description="Coordina las citas de cada profesional, sucursal y negocio." action={<button className="button primary" onClick={()=>onNewAppointment()}><Plus size={16}/> Nueva cita</button>}/><section className="panel calendar-panel"><div className="calendar-toolbar"><div className="calendar-left"><div className="date-navigator"><button aria-label="Periodo anterior" onClick={()=>changeDate(-1)}><ChevronLeft size={17}/></button><label className="agenda-date-picker"><CalendarDays size={14}/><span>{dateLabel}</span><input type="date" aria-label="Elegir fecha de agenda" value={agendaDate} onChange={event=>setAgendaDate(event.target.value)}/></label><button aria-label="Periodo siguiente" onClick={()=>changeDate(1)}><ChevronRight size={17}/></button></div><button className="button outline compact" onClick={goToToday}>Hoy</button></div><div className="calendar-right"><button className="button outline compact agenda-print-button" onClick={()=>window.print()}><Printer size={14}/> Imprimir</button><button className="button outline compact agenda-filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(open=>!open)}><Filter size={14}/> Filtrar{activeFilterCount>0&&<span className="filter-count">{activeFilterCount}</span>}</button><div className="period-toggle">{['Día','Semana','Mes','Año','Lista'].map(x=><button onClick={()=>setPeriod(x)} className={period===x?'active':''} key={x}>{x}</button>)}</div><div className="agenda-options"><button type="button" className="icon-button outline" aria-label="Opciones de agenda" aria-expanded={optionsOpen} onClick={()=>setOptionsOpen(open=>!open)}><MoreHorizontal size={18}/></button>{optionsOpen&&<div className="agenda-options-menu"><button type="button" onClick={()=>{goToToday();setPeriod('Día');clearFilters();setOptionsOpen(false)}}><CalendarDays size={14}/> Restablecer vista</button></div>}</div></div></div>{filtersOpen&&<div className="agenda-filter-panel"><label className="select-filter"><UserRound size={15}/><select aria-label="Filtrar por profesional" value={providerFilter} onChange={e=>setProviderFilter(e.target.value)}>{providers.map(p=><option key={p.id || p.name} value={p.id}>{p.name}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><Activity size={15}/><select aria-label="Filtrar por sucursal" value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}>{branches.map(b=><option key={b.id || b.name} value={b.id}>{b.name}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><Building2 size={15}/><select aria-label="Filtrar por negocio" value={businessFilter} onChange={e=>{setBusinessFilter(e.target.value);setBranchFilter("")}}>{businessOptions.map(b=><option key={b.id || b.name} value={b.id}>{b.name}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><ListFilter size={15}/><select aria-label="Filtrar citas por estado" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option>Todos los estados</option><option>Por confirmar</option><option>Confirmada</option><option>Completada</option><option>Cancelada</option></select><ChevronDown size={14}/></label><button className="text-link" onClick={clearFilters}>Limpiar filtros <X size={13}/></button></div>}<div className="agenda-metric-grid"><div className="agenda-metric"><div className="agenda-metric-icon calendar"><CalendarDays size={15}/></div><span>Total citas</span><strong>{appointmentsInRange.length}</strong></div><div className="agenda-metric"><div className="agenda-metric-icon confirmed"><CheckCircle2 size={15}/></div><span>Confirmadas</span><strong>{confirmedCount}</strong></div><div className="agenda-metric"><div className="agenda-metric-icon pending"><Clock3 size={15}/></div><span>Pendientes</span><strong>{pendingCount}</strong></div><div className="agenda-metric"><div className="agenda-metric-icon virtual"><Video size={15}/></div><span>Virtuales</span><strong>{virtualCount}</strong></div><div className="agenda-metric"><div className="agenda-metric-icon income"><DollarSign size={15}/></div><span>{sharedMode?'Pagos sin conexión':'Ingresos registrados'}</span><strong>{moneyLabel}</strong></div></div><div className="agenda-summary"><div className="day-summary"><div className="day-number">{period==='Día'||period==='Lista'?new Intl.DateTimeFormat('es-MX',{day:'2-digit',timeZone:'UTC'}).format(selectedDate):period==='Semana'?`${weekStart.getUTCDate()}–${new Date(Date.UTC(weekStart.getUTCFullYear(),weekStart.getUTCMonth(),weekStart.getUTCDate()+6,12)).getUTCDate()}`:period==='Mes'?new Intl.DateTimeFormat('es-MX',{month:'short',timeZone:'UTC'}).format(selectedDate):selectedDate.getUTCFullYear()}</div><div><strong>{period==='Día'||period==='Lista'?new Intl.DateTimeFormat('es-MX',{weekday:'long',timeZone:'UTC'}).format(selectedDate):period==='Semana'?'Semana seleccionada':period==='Mes'?'Mes seleccionado':'Año seleccionado'}</strong><span>{period==='Semana'?dateLabel:period==='Día'||period==='Lista'?new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(selectedDate):''}</span></div><Badge variant="active"><span className="badge-dot"/>{appointmentsInRange.length} citas</Badge></div><div className="agenda-legend"><span><i className="legend-dot confirmed-dot"/>Confirmada</span><span><i className="legend-dot pending-dot"/>Por confirmar</span><span><i className="legend-dot completed-dot"/>Completada</span></div></div>
  {period==='Día'&&<div className="calendar-grid"><div className="time-gutter">{Array.from({length:dayEndHour-dayStartHour},(_,index)=>`${String(index+dayStartHour).padStart(2,'0')}:00`).map(t=><div key={t}>{t}</div>)}</div><div className="day-column" style={{height:`calc(var(--hour) * ${dayEndHour-dayStartHour})`}}>{Array.from({length:daySlotCount},(_,index)=>{const time=agendaSlotTime(index);return <button type="button" className="calendar-slot" key={time} aria-label={`Agendar cita el ${dateLabel} a las ${time}`} onClick={()=>onNewAppointment(agendaDate,time)} style={{top:index*19.5,height:19.5}}>+ Agendar cita</button>})}{showCurrentTimeLine&&<div className="now-line" style={{top:`calc(${currentTimeOffset} * var(--hour))`}}><span>{currentTimeLabel}</span></div>}{Array.from({length:dayEndHour-6},(_,i)=><div className="hour-line" key={i}/>)}{appointmentsInRange.map((a)=>{const top=+(a.time.split(':')[0])-dayStartHour;const min=+a.time.split(':')[1];const durationMinutes=Number.parseInt(a.duration,10)||45;return <AgendaEventCard appointment={a} variant="calendar-event" compact={durationMinutes<=30} onOpen={onOpenAppointment} key={a.id||`${a.date}-${a.patient}-${a.time}`} style={{top:`calc(${top} * var(--hour) + ${min/60} * var(--hour) + 2px)`,height:`${Math.max(14,durationMinutes/60*78-4)}px`}}/>})}</div></div>}
  {period==='Semana'&&<div className="agenda-week">{weekDays.map(date=>{const dayAppointments=appointmentsFor(dateKey(date));return <section className={`week-day ${dateKey(date)===agendaDate?'selected':''}`} key={dateKey(date)}><button className="week-day-heading" onClick={()=>{setAgendaDate(dateKey(date));setPeriod('Día')}}><span>{weekdayFormatter.format(date)}</span><strong>{date.getUTCDate()}</strong></button><div className="week-day-events">{dayAppointments.map(item=><AgendaEventCard appointment={item} variant="week-event" compact onOpen={onOpenAppointment} key={item.id||`${item.date}-${item.time}-${item.patient}`}/>)}{!dayAppointments.length&&<span className="week-empty">Sin citas</span>}</div></section>})}</div>}
  {period==='Mes'&&<div className="agenda-month"><div className="month-weekdays">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><span key={day}>{day}</span>)}</div><div className="month-grid">{monthCells.map((day,index)=>{const valid=day>0&&day<=monthLength;const date=valid?new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth(),day,12)):null;const dayAppointments=date?appointmentsFor(dateKey(date)):[];return <button key={index} disabled={!valid} className={`month-cell ${valid?'':'outside'} ${valid&&dateKey(date)===agendaDate?'selected':''} ${valid&&dayAppointments.length?'has-events':''}`} onClick={()=>{if(date){setAgendaDate(dateKey(date));setPeriod('Día')}}}>{valid&&<><strong>{day}</strong>{dayAppointments.slice(0,3).map(item=><span className={`month-event tone-${item.tone}`} key={`${item.time}-${item.patient}`}>{item.time} {item.patient}</span>)}{dayAppointments.length>3&&<small>+{dayAppointments.length-3} más</small>}</>}</button>})}</div></div>}
  {period==='Año'&&<div className="agenda-year">{yearMonths.map(date=>{const monthAppointments=appointmentsInRange.filter(item=>{const itemDate=new Date(`${item.date||agendaDate}T12:00:00Z`);return itemDate.getUTCMonth()===date.getUTCMonth()});return <button className="year-month" key={date.getUTCMonth()} onClick={()=>{setAgendaDate(dateKey(date));setPeriod('Mes')}}><strong>{new Intl.DateTimeFormat('es-MX',{month:'long',timeZone:'UTC'}).format(date)}</strong><span>{monthAppointments.length} {monthAppointments.length===1?'cita':'citas'}</span><i>{monthAppointments.length?`${new Set(monthAppointments.map(item=>item.date)).size} días con actividad`:'Sin actividad registrada'}</i></button>})}</div>}
  {period==='Lista'&&<div className="agenda-list-wrap"><table className="agenda-list-table"><thead><tr><th>HORA</th><th>PACIENTE</th><th>SERVICIO</th><th>PROFESIONAL</th><th>SUCURSAL</th><th>ESTADO</th><th></th></tr></thead><tbody>{appointmentsInRange.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(appointment=><tr key={appointment.id||`${appointment.date}-${appointment.time}-${appointment.patient}`} onClick={()=>onOpenAppointment(appointment)} className="clickable-row"><td><strong>{appointment.time}</strong><span>{appointment.duration||'45 min'}</span></td><td><div className="patient-cell"><Avatar initials={appointment.initials} tone={appointment.tone}/><div><strong>{appointment.patient}</strong><span>{appointment.date}</span></div></div></td><td>{appointment.service}</td><td>{appointment.clinician}</td><td>{appointment.branch}</td><td><Badge variant={appointment.status==='Confirmada'?'confirmed':appointment.status==='Completada'?'active':appointment.status==='Cancelada'?'':'pending'}><span className="badge-dot"/>{appointment.status||'Por confirmar'}</Badge></td><td><button className="row-action" aria-label={`Abrir cita de ${appointment.patient}`} onClick={event=>{event.stopPropagation();onOpenAppointment(appointment)}}>Abrir <ArrowRight size={13}/></button></td></tr>)}</tbody></table>{appointmentsInRange.length===0&&<div className="empty-state"><CalendarDays size={20}/><strong>Sin citas para estos filtros</strong><span>Prueba otro estado o fecha, o agrega una cita.</span><button className="button primary compact" onClick={()=>onNewAppointment()}><Plus size={14}/> Nueva cita</button></div>}</div>}
  <div className="calendar-bottom"><span>Mostrando <strong>{appointmentsInRange.length}</strong> citas en este periodo según tus filtros</span><button className="text-link" onClick={clearFilters}>Limpiar filtros <X size={13}/></button></div></section></>;
}
function ConsentsPage({patients,templates,notify,onOpenDocument,onPrepareConsent,onNewTemplate,onNewVersion,sharedMode=false,canPrepare=true,canManageTemplates=true}) {
  const pending=patients.filter(patient=>patient.consent==='Pendiente');
  const signed=patients.filter(patient=>patient.consent==='Firmado');
  const readyTemplates=templates.filter(template=>template.content?.trim());
  return <>
    <PageTitle eyebrow="DOCUMENTACIÓN DIGITAL" title="Consentimientos" description="Gestiona formatos, solicitudes de firma y documentos informados." action={<button className="button primary" disabled={!canPrepare} onClick={()=>onPrepareConsent()}><Plus size={16}/> Preparar documento</button>}/>
    <div className="document-stats">
      <div className="doc-stat"><div className="metric-icon lavender"><FileCheck2 size={18}/></div><div><span>Firmas pendientes</span><strong>{String(pending.length).padStart(2,'0')}</strong></div><small>Expedientes que necesitan seguimiento</small></div>
      <div className="doc-stat"><div className="metric-icon mint"><CheckCircle2 size={18}/></div><div><span>Firmados</span><strong>{String(signed.length).padStart(2,'0')}</strong></div><small>Según los expedientes guardados aquí</small></div>
      <div className="doc-stat"><div className="metric-icon peach"><FileText size={18}/></div><div><span>Formatos con contenido</span><strong>{String(readyTemplates.length).padStart(2,'0')}</strong></div><small>Con texto guardado para preparar solicitudes</small></div>
    </div>
    <div className="section-heading"><div><h2>Biblioteca de formatos</h2><p>{sharedMode?'Formatos de la clínica, con una copia de su contenido guardada al preparar cada expediente.':templates.some(template=>template.isDemoPlaceholder)?'Las muestras sirven para recorrer el flujo; sustitúyelas por texto aprobado por la clínica antes de usarlas.' : 'Agrega el texto oficial aprobado por la clínica. Los formatos sin contenido no se pueden solicitar ni firmar.'}</p></div>{canManageTemplates&&<button className="button outline compact" onClick={onNewTemplate}><Plus size={15}/> Crear formato</button>}</div>
    <div className="consent-grid">{templates.map(template=>{const linked=patients.filter(patient=>patient.consentDocument===template.title).length;const ready=Boolean(template.content?.trim());return <div className="panel consent-card" key={template.id||template.title}><div className="consent-card-top"><div className={`consent-file-icon ${template.color||'blue'}`}><FileText size={20}/></div><button className="more-button" aria-label={`Solicitar ${template.title}`} title={ready?'Solicitar firma':'Agrega texto oficial antes de solicitar'} disabled={!ready} onClick={()=>onPrepareConsent(template)}><MoreHorizontal size={18}/></button></div><span className="document-type">{template.type}{template.version?` · ${template.version}`:''}</span><h3>{template.title}</h3><span className="document-version">{!ready?'Falta agregar el texto oficial aprobado por la clínica':template.isDemoPlaceholder?'Muestra de flujo únicamente; no es texto legal.':'Texto disponible para revisión'}</span><div className="consent-card-bottom"><span><UsersRound size={13}/>{linked} expedientes vinculados</span>{canManageTemplates&&<button onClick={()=>onNewVersion(template)}>Nueva versión</button>}<button disabled={!ready||!canPrepare} title={ready?(template.isDemoPlaceholder&&!sharedMode?'Probar flujo de demostración':'Solicitar firma'):'Agrega texto oficial antes de solicitar'} onClick={()=>onPrepareConsent(template)}>{template.isDemoPlaceholder&&!sharedMode?'Probar flujo':'Solicitar firma'} <ArrowRight size={13}/></button></div></div>})}{templates.length===0&&<div className="empty-inline">Aún no hay formatos. Agrega el documento validado por la clínica.</div>}</div>
    <section className="panel pending-docs-panel"><div className="panel-heading"><div><div className="panel-title">Firmas que requieren atención</div><p className="panel-subtitle">Solicitudes pendientes en los expedientes</p></div><span className="panel-subtitle">{pending.length} pendientes</span></div><div className="pending-rows">{pending.map(patient=><div className="pending-row" key={patient.id}><Avatar initials={patient.initials} tone={patient.tone}/><div><strong>{patient.name}</strong><span>{patient.id} · {patient.treatment}</span></div><div className="pending-doc-name"><FileCheck2 size={15}/>{patient.consentDocument||'Consentimiento informado'}</div><Badge variant="pending"><span className="badge-dot"/>Esperando firma</Badge><button className="row-action" onClick={()=>onOpenDocument(patient,'consent')}>Revisar <ArrowRight size={13}/></button></div>)}{pending.length===0&&<div className="empty-inline"><CheckCircle2 size={17}/> Todo está al día, no hay firmas pendientes.</div>}</div></section>
  </>;
}

function ContractsPage({patients,templates,setModal,notify,onOpenDocument,onNewContract,onNewTemplate,sharedMode=false,canPrepare=true,canManageTemplates=true}) {
  const [filterOpen,setFilterOpen]=useState(false);
  const [statusFilter,setStatusFilter]=useState('Todos');
  const waiting=patients.filter(patient=>patient.contract==='Pendiente');
  const signed=patients.filter(patient=>patient.contract==='Firmado');
  const shown=patients.filter(patient=>statusFilter==='Todos'||patient.contract===statusFilter);
  return <><PageTitle eyebrow="ACUERDOS DE SERVICIO" title="Contratos" description="Prepara y da seguimiento a los contratos de prestación de servicios." action={<button className="button primary" disabled={!canPrepare} onClick={onNewContract}><Plus size={16}/> Nuevo contrato</button>}/><div className="contract-intro"><div className="contract-intro-icon"><FileText size={21}/></div><div><h3>Contratos claros, atención confiable.</h3><p>Usa el formato aprobado por la clínica al preparar el documento de cada expediente.</p></div><span className="demo-pill"><ShieldCheck size={14}/>{sharedMode?'Firma electrónica por conectar':'Firma de demostración'}</span></div><div className="document-stats"><div className="doc-stat"><div className="metric-icon peach"><Clock3 size={18}/></div><div><span>Pendientes de firma</span><strong>{String(waiting.length).padStart(2,'0')}</strong></div><small>Expedientes que necesitan seguimiento</small></div><div className="doc-stat"><div className="metric-icon mint"><CheckCircle2 size={18}/></div><div><span>Firmados</span><strong>{String(signed.length).padStart(2,'0')}</strong></div><small>Según los expedientes guardados aquí</small></div><div className="doc-stat"><div className="metric-icon lavender"><FileText size={18}/></div><div><span>{sharedMode?'Formatos activos':'Formatos guardados'}</span><strong>{String(templates.length).padStart(2,'0')}</strong></div><small>{sharedMode?'Versiones activas en la clínica':'Texto guardado en este navegador'}</small></div></div><section className="panel contract-template-library"><div className="panel-heading padded"><div><div className="panel-title">Biblioteca de contratos</div><p className="panel-subtitle">Guarda el texto oficial validado para usarlo en nuevos contratos.</p></div>{canManageTemplates&&<button className="button outline compact" onClick={onNewTemplate}><Plus size={15}/> Agregar formato</button>}</div><div className="contract-template-list">{templates.map(template=><article className="contract-template-row" key={template.id}><div className="contract-template-icon"><FileText size={17}/></div><div className="contract-template-copy"><strong>{template.title}</strong><span>{template.isDemoPlaceholder?'Muestra de flujo · texto no legal':`${template.type} · ${template.content.length.toLocaleString('es-MX')} caracteres`}</span></div><span className={template.isDemoPlaceholder ? "demo-pill" : "template-ready"}>{template.isDemoPlaceholder ? <><ShieldCheck size={14}/> Muestra de flujo</> : <><CheckCircle2 size={14}/> Disponible</>}</span></article>)}{templates.length===0&&<div className="empty-inline"><FileText size={17}/> Aún no hay formatos. Agrega el documento proporcionado y revisado por la clínica antes de preparar contratos.</div>}</div></section><section className="panel data-panel contract-table-panel"><div className="panel-heading padded"><div><div className="panel-title">Contratos por expediente</div><p className="panel-subtitle">{shown.length} registros según el filtro seleccionado</p></div><button className="button outline compact" aria-expanded={filterOpen} onClick={()=>setFilterOpen(value=>!value)}><Filter size={15}/> Filtrar</button></div>{filterOpen&&<div className="agenda-filter-panel"><label className="select-filter"><FileCheck2 size={15}/><select aria-label="Filtrar contratos por estado" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option>Todos</option><option>Pendiente</option><option>Firmado</option></select><ChevronDown size={14}/></label><button className="text-link" onClick={()=>setStatusFilter('Todos')}>Limpiar filtros <X size={13}/></button></div>}<div className="table-wrap"><table><thead><tr><th>PACIENTE</th><th>DOCUMENTO</th><th>FECHA DE ESTADO</th><th>ESTADO</th><th>RESPONSABLE</th><th></th></tr></thead><tbody>{shown.map(patient=><tr key={patient.id}><td><div className="patient-cell"><Avatar initials={patient.initials} tone={patient.tone}/><div><strong>{patient.name}</strong><span>{patient.id}</span></div></div></td><td><span className="contract-doc"><FileText size={15}/>{patient.contractTemplateTitle||patient.contractType||'Prestación de servicios'}</span></td><td className="last-cell">{formatRecordDate(patient.contractSignedAt||patient.contractRequestedAt)}</td><td><DocStatus status={patient.contract}/></td><td className="responsible-cell"><Avatar initials={(patient.clinician||'').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'—'} tone="lavender" size="xs"/> {patient.clinician||'Sin asignar'}</td><td><button className="row-more" aria-label={`Ver contrato de ${patient.name}`} onClick={()=>onOpenDocument(patient,'contract')}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{shown.length===0&&<div className="empty-state"><FileText size={20}/><strong>No hay contratos para este filtro</strong><span>Elige otro estado para ver registros.</span></div>}</div><div className="table-bottom"><span>Mostrando <strong>{shown.length}</strong> de <strong>{patients.length}</strong> expedientes</span><span className="per-page">{sharedMode?'Documentos compartidos del consultorio':'Los cambios se guardan en este navegador'}</span></div></section></>;
}
function TeamPage({businesses,branches,providers,setModal,notify,onEditBranch,onEditProvider,sharedMode=false,canManageBusinesses=true,canManageProviders=true}) {
  const branchNamesForProvider=(provider)=>provider.branchIds?.map(id=>branches.find(branch=>branch.id===id)?.name).filter(Boolean).join(', ')||'Sin sucursal asignada';
  return <><PageTitle eyebrow="OPERACIÓN CLÍNICA" title="Equipo y sucursales" description="Administra los negocios, ubicaciones y profesionales que aparecen en la agenda." action={canManageProviders&&<button className="button primary" onClick={()=>setModal('new-provider')}><Plus size={16}/> Agregar profesional</button>}/><div className="team-layout"><section className="panel team-panel"><div className="panel-heading padded"><div><div className="panel-title">Equipo clínico</div><p className="panel-subtitle">{providers.filter(item=>item.active).length} profesionales activos</p></div>{canManageProviders&&<button className="more-button" onClick={()=>setModal('new-provider')} aria-label="Agregar profesional"><Plus size={18}/></button>}</div><div className="team-list">{providers.filter(item=>item.active).map(provider=><div className="team-member" key={provider.id}><Avatar initials={provider.initials||provider.name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()} tone={provider.tone||'blue'} size="large"/><div className="team-person"><strong>{provider.name}</strong><span>{provider.role}</span><small><Activity size={12}/>{branchNamesForProvider(provider)}</small></div><span className="team-presence"><i/> Activo</span>{canManageProviders&&<button className="row-more" onClick={()=>onEditProvider(provider)} aria-label={`Editar profesional ${provider.name}`}><MoreHorizontal size={17}/></button>}</div>)}</div></section><section className="panel team-panel branch-panel"><div className="panel-heading padded"><div><div className="panel-title">Sucursales</div><p className="panel-subtitle">{branches.filter(item=>item.active).length} ubicaciones habilitadas</p></div>{canManageBusinesses&&<button className="icon-button outline" onClick={()=>setModal('new-branch')} aria-label="Agregar sucursal"><Plus size={16}/></button>}</div>{branches.filter(item=>item.active).map((branch,index)=><div className="branch-row" key={branch.id}><div className={`branch-icon branch-${index%3}`}><Activity size={16}/></div><div><strong>{branch.name}</strong><span>{branch.address||'Dirección pendiente'}</span>{branch.phone&&<small>{branch.phone}</small>}{branch.hours&&<small>{branch.hours}</small>}</div><span className="branch-active"><i/>Activa</span>{canManageBusinesses&&<button className="row-more" onClick={()=>onEditBranch(branch)} aria-label={`Editar sucursal ${branch.name}`}><Settings2 size={15}/></button>}</div>)}</section><section className="panel team-panel business-panel"><div className="panel-heading padded"><div><div className="panel-title">Negocios</div><p className="panel-subtitle">Agendas y sucursales agrupadas por negocio</p></div>{canManageBusinesses&&<button className="button outline compact" onClick={()=>setModal('new-business')}><Plus size={15}/> Agregar negocio</button>}</div><div className="business-list">{businesses.filter(item=>item.active).map(business=>{const count=branches.filter(branch=>branch.active&&branch.businessId===business.id).length;return <div className="business-row" key={business.id}><div className="branch-icon"><Building2 size={16}/></div><div><strong>{business.name}</strong><span>{count} {count===1?'sucursal activa':'sucursales activas'}</span></div><Badge variant="active"><span className="badge-dot"/>Activo</Badge></div>})}{businesses.filter(item=>item.active).length===0&&<div className="empty-inline">Aún no hay negocios. Agrega uno para empezar.</div>}</div></section></div></>;
}

function PatientModal({patient,appointments,activities,sharedMode=false,canDiagnose=true,canPrepareContract=true,canPrepareConsent=true,close,notify,onAddActivity,onEdit,onDiagnosis,onNewAppointment,onPrepareContract,onPrepareConsent,onOpenContract,onOpenConsent,onOpenDocumentRecord}) {
  const patientAppointments=appointments.filter(appointment=>appointment.patientId===patient.id||appointment.patient===patient.name).sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const sortedActivities=[...activities].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const documentRecords=[...documentHistory(patient,'contract').map(record=>({...record,kind:'contract'})),...documentHistory(patient,'consent').map(record=>({...record,kind:'consent'}))].sort((a,b)=>(b.requestedAt||'').localeCompare(a.requestedAt||''));
  const diagnosisRecords=[...(patient.diagnosisHistory||[])].sort((a,b)=>(b.acceptedAt||b.createdAt||'').localeCompare(a.acceptedAt||a.createdAt||''));
  const diagnosisAccepted=Boolean(patient.diagnosisAccepted&&patient.diagnosisId);
  const contractMatchesDiagnosis=Boolean(diagnosisAccepted&&patient.contractDiagnosisId&&patient.contractDiagnosisId===patient.diagnosisId);
  const contractReady=contractMatchesDiagnosis&&patient.contract==='Pendiente'&&Boolean(patient.contractContent?.trim());
  const contractSignedCurrent=contractMatchesDiagnosis&&patient.contract==='Firmado';
  const contractStatus=contractReady?'Pendiente de firma':contractSignedCurrent?'Firmado':patient.contract==='Firmado'?(diagnosisAccepted?'Versión anterior':'Histórico firmado'):'Por preparar';
  const contractDescription=contractReady?'Hay un contrato preparado para esta valoración.':patient.contract==='Firmado'&&!contractSignedCurrent?(diagnosisAccepted?'El contrato firmado corresponde a una valoración anterior. Prepara la versión actual.':'El contrato firmado se conserva en el historial; acepta un diagnóstico para continuar.'):diagnosisAccepted?'Prepara el contrato con el formato de servicios de la clínica.':'Disponible después de aceptar el diagnóstico.';
  const consentReady=patient.consent==='Pendiente'&&Boolean(patient.consentContentSnapshot?.trim());
  return <Modal title={patient.name} subtitle={`Expediente ${patient.id} · ${patient.status}`} close={close} className="patient-record-modal"><div className="patient-modal-profile"><Avatar initials={patient.initials} tone={patient.tone} size="large"/><div><strong>{patient.treatment}</strong><span>Última actividad: {patient.last}</span><small>{patient.clinician} · {patient.branch}</small><small>{patient.phone||'Sin teléfono'}{patient.email?` · ${patient.email}`:''}</small><small>Avisos por WhatsApp: {patient.whatsappOptIn?'Autorizados':'No autorizados'}{patient.whatsappOptInAt?' · '+formatRecordDate(patient.whatsappOptInAt):''}</small></div><button className="button outline compact" onClick={onNewAppointment}><CalendarPlus size={14}/> Agendar cita</button><button className="button outline compact" onClick={onEdit}><Settings2 size={14}/> Editar</button>{canDiagnose&&<button className="button outline compact" onClick={onDiagnosis}><ClipboardCheck size={14}/> Diagnóstico</button>}</div>
  <section className="patient-workflow-progress" aria-label="Progreso de diagnóstico y documentos">
    <article className={diagnosisAccepted?'complete':''}><div><span className="patient-workflow-number">1</span><strong>Diagnóstico</strong><Badge variant={diagnosisAccepted?'confirmed':'pending'}><span className="badge-dot"/>{diagnosisAccepted?'Aceptado':'Pendiente'}</Badge></div><p>{diagnosisAccepted?'El expediente tiene un diagnóstico vigente.':'Registra y acepta el diagnóstico para habilitar el contrato.'}{canDiagnose&&<button type="button" className="text-link" onClick={onDiagnosis}>{diagnosisAccepted?'Revisar':'Registrar diagnóstico'}</button>}</p></article>
    <article className={contractReady||contractSignedCurrent?'complete':''}><div><span className="patient-workflow-number">2</span><strong>Contrato</strong><Badge variant={contractReady?'pending':contractSignedCurrent?'confirmed':patient.contract==='Firmado'?'new':'pending'}><span className="badge-dot"/>{contractStatus}</Badge></div><p>{contractDescription}{canPrepareContract&&diagnosisAccepted&&<button type="button" className="text-link" onClick={contractReady?onOpenContract:onPrepareContract}>{contractReady?'Revisar contrato':'Preparar contrato'}</button>}</p></article>
    <article className={consentReady?'complete':''}><div><span className="patient-workflow-number">3</span><strong>Consentimiento</strong><Badge variant={patient.consent==='Firmado'?'confirmed':consentReady?'pending':'pending'}><span className="badge-dot"/>{patient.consent==='Firmado'?'Firmado':consentReady?'Pendiente de firma':'Por preparar'}</Badge></div><p>{consentReady?'Hay un consentimiento preparado para este expediente.':'Prepara el consentimiento informado que corresponda.'}{canPrepareConsent&&<button type="button" className="text-link" onClick={consentReady?onOpenConsent:onPrepareConsent}>{consentReady?'Revisar consentimiento':'Preparar consentimiento'}</button>}</p></article>
  </section>
  <section className="patient-appointments"><div className="panel-title">Citas del expediente <span>{patientAppointments.length}</span></div>{patientAppointments.map(appointment=><div className="patient-appointment-row" key={`${appointment.date}-${appointment.time}-${appointment.patient}`}><div><strong>{appointment.time}</strong><span>{appointment.date?new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${appointment.date}T12:00:00`)):'Fecha pendiente'}</span></div><div><strong>{appointment.service}</strong><span>{appointment.clinician} · {appointment.branch}</span></div><Badge variant={appointment.status==='Confirmada'?'confirmed':'pending'}><span className="badge-dot"/>{appointment.status}</Badge></div>)}{patientAppointments.length===0&&<div className="empty-inline">Este expediente aún no tiene citas.</div>}</section>
  {canDiagnose&&<section className="patient-activity-box"><div className="panel-title"><span>Historial de diagnósticos</span><span>{diagnosisRecords.length}</span></div>{diagnosisRecords.map(record=><article className="patient-activity-row" key={record.id}><div className="patient-activity-meta"><strong>{record.status==='accepted'?'Vigente':record.status==='superseded'?'Sustituido':'Borrador'}</strong><time dateTime={record.acceptedAt||record.createdAt}>{(record.acceptedAt||record.createdAt)?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(record.acceptedAt||record.createdAt)):'Fecha no registrada'}</time></div><p>{record.summary}</p><small>Aceptado por: {record.acceptedByLabel||'Usuario no identificado'}</small></article>)}{diagnosisRecords.length===0&&<div className="empty-inline">Aún no hay diagnósticos en el historial.</div>}</section>}
  <section className="patient-activity-box"><div className="panel-title"><span>Seguimiento</span><button className="button outline compact" onClick={onAddActivity}><Plus size={13}/> Agregar nota</button></div>{sortedActivities.slice(0,8).map(activity=><article className="patient-activity-row" key={activity.id}><div className="patient-activity-meta"><strong>{activity.type}</strong><time dateTime={activity.createdAt}>{new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(activity.createdAt))}</time></div><p>{activity.note}</p><small>{activity.author}</small></article>)}{sortedActivities.length===0&&<div className="empty-inline">Aún no hay seguimientos registrados.</div>}</section>
  <section className="patient-document-history"><div className="panel-title"><span>Historial de documentos</span><span>{documentRecords.length}</span></div>{documentRecords.map(record=><details className="patient-document-record" key={record.id}><summary><span><strong>{record.kind==='contract'?'Contrato':'Consentimiento'} · {record.title}</strong><small>{record.templateVersion?`Formato v${record.templateVersion} · `:''}{record.requestedAt?formatRecordDate(record.requestedAt):'Fecha anterior no registrada'}{record.legacy?' · Registro anterior':''}</small></span><DocStatus status={record.status}/></summary><div className="patient-document-record-content">{record.service&&<p><strong>Servicio:</strong> {record.service}</p>}{record.createdByLabel&&<p><strong>Preparado por:</strong> {record.createdByLabel}</p>}{record.signedByLabel&&<p><strong>Firmado por:</strong> {record.signedByLabel}</p>}{record.contentSnapshot?<div className="template-content">{record.contentSnapshot}</div>:<p>Este documento anterior no tenía texto de plantilla guardado.</p>}{record.signedAt&&<small>{sharedMode?"Firma registrada":"Firma simulada registrada"} · {new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(record.signedAt))}</small>}<button type="button" className="button outline compact" onClick={()=>onOpenDocumentRecord?.(record)}><ArrowUpRight size={14}/> Abrir esta versión</button></div></details>)}{documentRecords.length===0&&<div className="empty-inline">Aún no hay documentos preparados.</div>}</section><div className={sharedMode?"patient-doc-box shared-readonly-docs":"patient-doc-box"}><div className="panel-title">Documentación del expediente</div><div><FileText size={16}/><span><strong>{patient.contractTemplateTitle||patient.contractType||'Contrato de prestación de servicios'}</strong><small>Contrato de servicios</small></span><DocStatus status={patient.contract}/><button className="icon-button" aria-label={documentHistory(patient,'contract').length?'Ver contrato':'Contrato aún no preparado'} disabled={!documentHistory(patient,'contract').length} onClick={onOpenContract}><ArrowUpRight size={15}/></button></div><div><FileCheck2 size={16}/><span><strong>{patient.consentDocument||'Consentimiento informado'}</strong><small>Documento clínico</small></span><DocStatus status={patient.consent}/><button className="icon-button" aria-label={documentHistory(patient,'consent').length?'Ver consentimiento':'Consentimiento aún no preparado'} disabled={!documentHistory(patient,'consent').length} onClick={onOpenConsent}><ArrowUpRight size={15}/></button></div></div><div className="modal-actions"><button className="button secondary" onClick={close}>Cerrar</button></div></Modal>;
}function DiagnosisModal({patient,sharedMode=false,close,onAccept}){
  const initialSummary=patient.diagnosisSummary||(patient.diagnosisAccepted&&!sharedMode?'Diagnóstico de demostración aceptado':'');
  const [summary,setSummary]=useState(initialSummary);
  const unchanged=Boolean(patient.diagnosisAccepted)&&summary.trim()===initialSummary.trim();
  return <Modal title={patient.diagnosisAccepted?'Revisar diagnóstico aceptado':'Diagnóstico'} subtitle={`${patient.name} · ${patient.treatment}`} close={close}>
    <form className="form-stack" onSubmit={onAccept}>
      <div className="workflow-stepper"><span className="step done">1 <small>Diagnóstico</small></span><i/><span className="step">2 <small>Contrato</small></span><i/><span className="step">3 <small>Firma</small></span></div>
      <div className="document-preview"><span className="eyebrow">{sharedMode?'REGISTRO CLÍNICO':'RESUMEN CLÍNICO DE DEMOSTRACIÓN'}</span><h3>{patient.treatment}</h3><label>Resumen del diagnóstico<textarea name="summary" rows="5" maxLength="4000" value={summary} onChange={event=>setSummary(event.target.value)} placeholder="Escribe el resumen clínico que revisaste y aceptas." required/></label></div>
      <div className="form-note"><ShieldCheck size={15}/>{patient.diagnosisAccepted?'Puedes guardar una versión revisada; la versión anterior quedará en el historial.':sharedMode?'El resumen se guardará en el expediente compartido y será visible para personal clínico autorizado.':'Contenido de demostración: no agregues información clínica real.'}</div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Volver al expediente</button><button className="button primary" type="submit" disabled={unchanged}><Check size={15}/>{patient.diagnosisAccepted?'Guardar nueva versión':'Aceptar diagnóstico'}</button></div>
    </form>
  </Modal>;
}
function ContractPromptModal({patient,close,onViewContract,onPrepareContract}) {
  const hasCurrentContract=patient.contract==='Pendiente'&&Boolean(patient.contractContent?.trim())&&(!patient.diagnosisId||patient.contractDiagnosisId===patient.diagnosisId);
  return <Modal title={hasCurrentContract?"Contrato pendiente de firma":"Preparar contrato de servicios"} subtitle={`${patient.name} · ${patient.contractType || 'Prestación de servicios'}`} close={close}>
    <div className="document-preview"><div className="workflow-stepper"><span className="step done">1 <small>Diagnóstico</small></span><i/><span className="step done">2 <small>Aceptado</small></span><i/><span className="step current">3 <small>Firma</small></span></div><p>{hasCurrentContract?'El diagnóstico quedó aceptado. Revisa el contrato preparado para esta valoración.':'El diagnóstico quedó aceptado. Prepara el contrato usando un formato oficial para esta valoración.'}</p></div>
    <div className="form-note"><FileText size={15}/>{hasCurrentContract?'La firma real requiere un proveedor de firma electrónica.':'No hay un contrato pendiente vinculado a este diagnóstico; se conservarán las versiones anteriores en el historial.'}</div>
    <div className="modal-actions"><button className="button secondary" onClick={close}>Más tarde</button><button className="button primary" onClick={hasCurrentContract?onViewContract:onPrepareContract}>{hasCurrentContract?<><FileText size={15}/> Ver contrato</>:<><FilePlus2 size={15}/> Preparar contrato</>}</button></div>
  </Modal>;
}

function ContractViewerModal({patient,close,onPrint,onDiagnosis,onSign,onPrepare,sharedMode=false}) {
  const signed=patient.contract==='Firmado';
  const hasOfficialText=Boolean(patient.contractContent?.trim());
  const diagnosisMismatch=Boolean(patient.diagnosisId&&patient.contractDiagnosisId!==patient.diagnosisId);
  const needsDiagnosis=!signed&&!patient.diagnosisAccepted;
  const canSign=!signed&&patient.contract==='Pendiente'&&patient.diagnosisAccepted&&hasOfficialText&&!diagnosisMismatch;
  return <Modal title="Contrato de servicios" subtitle={`${patient.name} · Expediente ${patient.id}`} close={close} printable>
    <div className="document-preview"><span className="eyebrow">VISTA PREVIA · {patient.contractType || 'PRESTACIÓN DE SERVICIOS'}</span><h3>{patient.contractTemplateTitle || 'Acuerdo de prestación de servicios'}</h3><div className="preview-section"><strong>Paciente</strong><span>{patient.name}</span></div><div className="preview-section"><strong>Servicio o tratamiento</strong><span>{patient.contractService || patient.treatment || 'Por definir'}</span></div><div className="preview-section"><strong>Estado del diagnóstico</strong><span>{patient.diagnosisAccepted ? 'Aceptado' : 'Pendiente de revisión'}</span></div>{hasOfficialText?<div className="template-content">{patient.contractContent}</div>:<p>Este expediente no tiene un contrato preparado con texto oficial. Prepara uno desde un formato revisado por la clínica antes de firmar.</p>}<p className="demo-legal-note">{sharedMode?'Copia guardada en el expediente. No se envía ni registra una firma electrónica.':'Vista de demostración: no se envía ni constituye una firma electrónica válida.'}</p></div>
    {signed&&<div className="signature-box"><CheckCircle2 size={16}/> {sharedMode?'Firma registrada':'Firma simulada registrada'}{patient.contractSignedAt?` · ${new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(patient.contractSignedAt))}`:''}</div>}
    {needsDiagnosis&&<div className="form-note"><ClipboardCheck size={15}/> Primero revisa y acepta el diagnóstico del paciente.</div>}
    {diagnosisMismatch&&<div className="form-note"><ClipboardCheck size={15}/> Este contrato corresponde a una valoración anterior. Prepara uno nuevo antes de continuar con el diagnóstico actual.</div>}
    {sharedMode&&!signed&&patient.contract==='Pendiente'&&<div className="form-note"><ShieldCheck size={15}/> El documento está guardado y pendiente. La firma electrónica no está conectada.</div>}
    {signed?<div className="modal-actions"><button className="button secondary" onClick={close}>Cerrar</button><button className="button outline" onClick={onPrint}><Printer size={15}/> Imprimir contrato</button>{diagnosisMismatch&&<button className="button outline" onClick={onPrepare}><FilePlus2 size={15}/> Preparar contrato actual</button>}<button className="button primary" onClick={close}><CheckCircle2 size={15}/> Listo</button></div>:<div className="modal-actions"><button className="button secondary" onClick={close}>Cerrar</button><button className="button outline" onClick={onPrint}><Printer size={15}/> Imprimir contrato</button>{needsDiagnosis?<button className="button primary" onClick={onDiagnosis}><ClipboardCheck size={15}/> Ir a diagnóstico</button>:diagnosisMismatch||!hasOfficialText?<button className="button primary" onClick={onPrepare}><FilePlus2 size={15}/> Preparar contrato</button>:canSign&&!sharedMode?<button className="button primary" onClick={onSign}><FileCheck2 size={15}/> Simular firma</button>:null}</div>}
  </Modal>;
}

function ConsentViewerModal({patient,document,content,status,signedAt,close,onPrint,onSign,sharedMode=false}) {
  const signed=status==='Firmado';
  const canSign=status==='Pendiente'&&Boolean(content?.trim());
  return <Modal title={document} subtitle={`${patient.name} · Expediente ${patient.id}`} close={close} printable>
    <div className="document-preview"><span className="eyebrow">{sharedMode?'COPIA DEL DOCUMENTO':'DOCUMENTO INFORMATIVO · DEMOSTRACIÓN'}</span><h3>{document}</h3><div className="preview-section"><strong>Paciente</strong><span>{patient.name}</span></div>{content?.trim()?<div className="template-content">{content}</div>:<p>Esta solicitud no conserva texto oficial. Agrega y valida el formato en la biblioteca antes de solicitar una firma.</p>}<p className="demo-legal-note">{sharedMode?'Esta copia quedó guardada en el expediente. No se envía ni captura una firma electrónica.':'Documento de demostración: no se envía, no captura una firma electrónica y no tiene validez legal.'}</p></div>
    {signed&&<div className="signature-box"><CheckCircle2 size={16}/> {sharedMode?'Firma registrada':'Firma simulada registrada'}{signedAt?` · ${new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(signedAt))}`:''}</div>}
    {status==='Pendiente'&&!content?.trim()&&<div className="form-note"><ShieldCheck size={15}/> La firma está deshabilitada hasta que exista texto oficial en la solicitud.</div>}
    {sharedMode&&status==='Pendiente'&&<div className="form-note"><ShieldCheck size={15}/> La solicitud queda pendiente hasta que se conecte un proveedor de firma.</div>}
    <div className="modal-actions"><button className="button secondary" onClick={close}>Cerrar</button><button className="button outline" onClick={onPrint}><Printer size={15}/> Imprimir consentimiento</button>{canSign&&!sharedMode&&<button className="button primary" onClick={onSign}><FileCheck2 size={15}/> Simular firma</button>}</div>
  </Modal>;
}function Modal({title,subtitle,close,children,printable=false,className=''}){
  useEffect(()=>{
    if(!printable)return undefined;
    document.body.classList.add('print-document-mode');
    return()=>document.body.classList.remove('print-document-mode');
  },[printable]);
  return <div className={`modal-backdrop ${printable?'printable-document-modal':''}`} onMouseDown={e=>e.target===e.currentTarget&&close()}><div className={`modal ${className}`}><div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={close}><X size={19}/></button></div>{children}</div></div>;
}

export default App;

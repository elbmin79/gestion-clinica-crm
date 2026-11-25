"use client";

import React, { useEffect, useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { procedureAnatomy, procedureFaceZoom } from './procedure-anatomy';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '../lib/supabase/config';
import { createPatientDirectoryStore } from '../lib/supabase/patient-directory';
import { createClinicAgendaStore } from '../lib/supabase/clinic-agenda';
import { createClinicPaymentsStore } from '../lib/supabase/clinic-payments';
import { createPatientPackageStore } from '../lib/supabase/patient-packages';
import { buildPatientRecallQueue } from '../lib/patient-recall';
import ClinicServicesSettings from './clinic-services-settings';
import ClinicPromotionsSettings from './clinic-promotions-settings';
import ClinicExpenseLedger from './clinic-expense-ledger';
import CurrencyConverter, { confirmReferenceRate, ExchangeRatePreview, useReferenceRate } from './exchange-rate-controls';
import { convertCurrency, paymentExchangeLabel } from '../lib/exchange-rates';
import AppointmentSessionPrice from './appointment-session-price';
import AppointmentHistory from './appointment-history';
import PatientPackagePanel from './patient-package-panel';
import { usePatientPackages } from './use-patient-packages';
import { demoPackageBalances } from '../lib/patient-packages';
import { parseSessionPrice } from '../lib/appointment-pricing';
import { calculateServiceDeposit, parseFixedDeposit } from '../lib/service-deposits';
import { quoteSessionPrice } from '../lib/clinic-promotions';
import { createClinicPromotionsStore } from '../lib/supabase/clinic-promotions';
import ClinicAvailabilitySettings from './clinic-availability-settings';
import WhatsAppSettings from './whatsapp-settings';
import GoogleCalendarSettings from './google-calendar-settings';
import WhatsAppInbox from './whatsapp-inbox';
import SocialInbox from './social-inbox';
import { fillDocumentPlaceholders, suggestConsentTemplate } from '../lib/document-placeholders';
import { ClinicDateField, ClinicTimeField, localISODate } from './clinic-date-field';
import { demoClinicServices, eligibleServiceProviders, serviceCategories } from '../lib/clinic-services';
import { createClinicServicesStore } from '../lib/supabase/clinic-services';
import { usePatientDirectory } from '../lib/supabase/use-patient-directory';
import { useClinicAgenda } from '../lib/supabase/use-clinic-agenda';
import { useClinicPayments } from '../lib/supabase/use-clinic-payments';
import { useClinicReminders } from '../lib/supabase/use-clinic-reminders';
import { createDemoAppointmentReminders } from '../lib/supabase/clinic-reminders';
import { buildClinicGroups, filterByWorkspace, normalizeWorkspaceSelection } from '../lib/clinic-workspace';
import { hasClinicPermission } from '../lib/clinic-permissions.js';
import { compressClinicalPhoto, openDemoRecordFile, saveDemoRecordFile, validatePatientRecordFile, validatePatientRecordFileContent } from '../lib/patient-record-files';
import { signOut } from './login/actions';
import { createClient as createSupabaseBrowserClient } from '../lib/supabase/client';
import { profileBirthCountries, profileStaffTypes } from '../lib/profile-options';
import ClinicAccessManager from './clinic-access/manager';
import AgendaIdentityFilters from './agenda-identity-filters';
import AgendaCompact from './agenda-compact';
import { compactAgendaColors } from '../lib/agenda-compact';
import { AgendaAvailabilityControls, AgendaFreeBlock, useAgendaAvailability } from './agenda-availability';
import { agendaFreeBlocks, agendaWorkingHours, defaultAgendaHours } from '../lib/agenda-availability';
import { agendaPalette, appointmentAgendaColor, colorStyle, filterAgendaAppointments, sortAgendaAppointments } from '../lib/agenda-colors';
import ProfessionalEditor, { useProfessionalAccounts } from './professional-editor';
import NotificationCenter, { useNotificationFeed } from './notification-center';
import PushSettings from './push-settings';
import MobileInstallLink from './mobile-install-link';
import PublicAgendaSettings from './public-agenda-settings';
import { addDemoAppointmentAlert, unlinkPushOnSignOut } from '../lib/staff-notifications';
import {
  Activity, ArrowDown, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Building2,
  Bell, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ClipboardCheck, Clock3, Command, FileCheck2,
  FilePlus2, FileText, Filter, LayoutDashboard, ListFilter, MoreHorizontal,
  Plus, Search, Settings, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  Download, Maximize2, PenLine, Trash2, Upload,
  UserRound, UsersRound, X, Menu, Printer, Video, DollarSign, Moon, Sun, Link2, MessageCircle, Smartphone, Camera, SwitchCamera, AtSign
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
  { title: 'Consentimiento · Toxina botulínica', type: 'Procedimiento estético', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UN CONSENTIMIENTO REAL. Sustituye por el documento específico de toxina botulínica revisado y aprobado por la clínica.', isDemoPlaceholder: true, initials: 'TB', color: 'lavender' },
  { title: 'Consentimiento · Relleno con ácido hialurónico', type: 'Procedimiento estético', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UN CONSENTIMIENTO REAL. Sustituye por el documento específico de relleno con ácido hialurónico revisado y aprobado por la clínica.', isDemoPlaceholder: true, initials: 'AH', color: 'peach' },
  { title: 'Consentimiento · Endolift', type: 'Procedimiento estético', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UN CONSENTIMIENTO REAL. Sustituye por el documento específico de Endolift revisado y aprobado por la clínica.', isDemoPlaceholder: true, initials: 'EL', color: 'mint' },
  { title: 'Aviso de privacidad', type: 'Protección de datos', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UN AVISO DE PRIVACIDAD. No describe tratamientos de datos ni derechos. Sustituye íntegramente este texto por el aviso revisado y aprobado por la clínica antes de solicitar una firma.', isDemoPlaceholder: true, initials: 'AP', color: 'mint' },
  { title: 'Autorización de uso de imagen', type: 'Autorización', version: 'demo', uses: 'Muestra de flujo', content: 'MUESTRA DE FLUJO — NO ES UNA AUTORIZACIÓN. No concede permiso para captar ni usar imágenes. Sustituye íntegramente este texto por el formato revisado y aprobado por la clínica antes de solicitar una firma.', isDemoPlaceholder: true, initials: 'AI', color: 'peach' },
];
const clinicalHistoryPrompts = [
  ['allergies','Alergias'],['chronicConditions','Enfermedades crónicas'],['medications','Medicamentos actuales'],
  ['surgeries','Cirugías / hospitalizaciones'],['priorTreatments','Tratamientos estéticos previos'],['familyHistory','Antecedentes familiares'],
  ['tobaccoAlcohol','Tabaco, alcohol u otras sustancias'],['exercise','Actividad física'],['reproductiveHistory','Antecedentes ginecoobstétricos'],
];
const clinicalHistoryStateLabels = { not_asked:'Sin preguntar', reports:'Paciente refiere', denies:'Paciente niega', unknown:'No lo sabe', not_applicable:'No aplica' };
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
  recall: "/seguimiento",
  whatsapp: "/whatsapp",
  messages: "/mensajes",
  patients: "/pacientes",
  consents: "/consentimientos",
  contracts: "/contratos",
  team: "/equipo",
  settings: "/configuracion",
  profile: "/perfil",
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
  const migrated=templates.map(template => {
    const demoSample = consentLibrary.find(seed => seed.title === template.title);
    if (template.content?.trim() || !demoSample) return template;
    return { ...template, content: demoSample.content, version: 'demo', uses: 'Muestra de flujo', isDemoPlaceholder: true };
  });
  const existingTitles=new Set(migrated.map(template=>template.title.trim().toLocaleLowerCase('es-MX')));
  return [...migrated,...consentLibrary.filter(template=>!existingTitles.has(template.title.trim().toLocaleLowerCase('es-MX')))];
}

function migrateDemoContractTemplates(templates) {
  return templates.length ? templates : initialContractTemplates;
}

function formatRecordDate(value) {
  if (!value) return '—';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function formatCurrencyMXN(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(Number(value) || 0);
}
function summarizeRefundAvailability(patientId, patientName, appointment, appointments, payments) {
  const balance = payments
    .filter(payment => appointment ? payment.appointmentId === appointment.id : payment.patientId === patientId && !payment.packageId)
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
function Avatar({ initials, tone = 'violet', size = '', imageUrl = '' }) {
  return <span className={`avatar ${tone} ${size}${imageUrl ? ' has-image' : ''}`} style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined} aria-hidden="true">{imageUrl ? '' : initials}</span>;
}
function Badge({ children, variant = '' }) { return <span className={`badge ${variant}`}>{children}</span>; }
function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-title-action">{action}</div>}</div>;
}

function SharedDataStatus({ status, memberships, chooseClinic, retry }) {
  if (!status || status === 'ready' || status === 'idle' || status === 'loading') return null;
  const messages = {
    error: 'No se pudieron cargar los datos. Puedes reintentar.',
    signed_out: 'La sesión no está disponible. Inicia sesión para consultar los datos.',
    no_membership: 'Tu usuario todavía no tiene una clínica asignada.',
    no_patient_access: 'Tu rol no tiene permiso para consultar estos datos.',
    no_access: 'Tu rol no tiene permiso para consultar estos datos.',
    not_configured: 'La conexión de la clínica todavía no está configurada.',
    choose_clinic: 'Selecciona la clínica que quieres consultar.',
  };
  return <div className={`shared-data-status ${status === 'error' ? 'is-error' : ''}`} role="status" aria-live="polite">
    <span className="shared-data-status-dot" aria-hidden="true" />
    <span>{messages[status] || 'Selecciona una clínica para continuar.'}</span>
    {status === 'choose_clinic' && <label>Clínica<select defaultValue="" onChange={event => chooseClinic(event.target.value)}><option value="" disabled>Seleccionar clínica…</option>{memberships.map(item => <option key={item.clinicId} value={item.clinicId}>{item.name}</option>)}</select></label>}
    {status === 'error' && <button type="button" className="text-link" onClick={retry}>Reintentar</button>}
  </div>;
}

function BrandSwitch({ theme }) {
  const [open, setOpen] = useState(false);
  return <div className="brand-switch">
    <button type="button" className="brand" aria-expanded={open} aria-label="Elegir CRM o landing" onClick={() => setOpen(value => !value)}>
      <Image className="brand-logo" src={theme === 'dark' ? '/elixirclinic-logo-dark.png' : '/elixirclinic-logo.png'} alt="Elixir Clinic" width={1374} height={1145} unoptimized />
    </button>
    {open && <div className="brand-switch-menu" role="menu"><Link href="/" onClick={() => setOpen(false)}>CRM</Link><Link href="/landing" onClick={() => setOpen(false)}>Landing</Link></div>}
  </div>;
}
function App({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const isStandaloneRoute = pathname === '/login' || pathname === '/setup';
  const supabaseConfigured = isSupabaseConfigured();
  const sharedDirectory = usePatientDirectory(supabaseConfigured && !isStandaloneRoute);
  const sharedMode = supabaseConfigured && !isStandaloneRoute;
  const [sharedServiceCatalog, setSharedServiceCatalog] = useState([]);
  const [demoServiceCatalog, setDemoServiceCatalog] = usePersistentList('crm-demo-service-catalog-v1', demoClinicServices, !sharedMode);
  const serviceCatalog = sharedMode ? sharedServiceCatalog : demoServiceCatalog;
  const setServiceCatalog = sharedMode ? setSharedServiceCatalog : setDemoServiceCatalog;
  useEffect(() => {
    let active = true;
    if (!sharedMode) return;
    if (sharedDirectory.status !== 'ready' || !sharedDirectory.clinicId) { setSharedServiceCatalog([]); return; }
    createClinicServicesStore().load(sharedDirectory.clinicId).then(rows => { if (active) setSharedServiceCatalog(rows); }).catch(() => { if (active) setSharedServiceCatalog([]); });
    return () => { active = false; };
  }, [sharedMode, sharedDirectory.clinicId, sharedDirectory.status]);
  const clinicTimeZone = sharedMode ? sharedDirectory.timeZone : 'America/Tijuana';
  const [demoPromotions, setDemoPromotions] = usePersistentList('crm-demo-promotions-v1', [], !sharedMode && !isStandaloneRoute);
  const [sharedPromotions, setSharedPromotions] = useState(null);
  const promotionClinicId = sharedDirectory.clinicId;
  useEffect(() => {
    if (!sharedMode || sharedDirectory.status !== 'ready' || !promotionClinicId) return;
    let active = true;
    createClinicPromotionsStore().load(promotionClinicId).then(
      rows => { if (active) setSharedPromotions({ clinicId: promotionClinicId, status: 'ready', rows }); },
      () => { if (active) setSharedPromotions({ clinicId: promotionClinicId, status: 'error', rows: [] }); },
    );
    return () => { active = false; };
  }, [sharedMode, sharedDirectory.status, promotionClinicId]);
  const promotionData = sharedMode
    ? sharedPromotions && sharedPromotions.clinicId === promotionClinicId ? sharedPromotions : { status: 'loading', rows: [] }
    : { status: 'ready', rows: demoPromotions };
  const [sharedRecallPackageState, setSharedRecallPackageState] = useState({ clinicId: '', status: 'idle', rows: [] });
  const [sharedRecallReload, setSharedRecallReload] = useState(0);
  useEffect(() => {
    if (!sharedMode) { setSharedRecallPackageState({ clinicId: '', status: 'idle', rows: [] }); return; }
    if (sharedDirectory.status !== 'ready' || !sharedDirectory.clinicId) { setSharedRecallPackageState({ clinicId: sharedDirectory.clinicId || '', status: 'loading', rows: [] }); return; }
    let active = true;
    setSharedRecallPackageState({ clinicId: sharedDirectory.clinicId, status: 'loading', rows: [] });
    createPatientPackageStore().listForClinic(sharedDirectory.clinicId).then(
      rows => { if (active) setSharedRecallPackageState({ clinicId: sharedDirectory.clinicId, status: 'ready', rows }); },
      () => { if (active) setSharedRecallPackageState({ clinicId: sharedDirectory.clinicId, status: 'error', rows: [] }); },
    );
    return () => { active = false; };
  }, [sharedMode, sharedDirectory.status, sharedDirectory.clinicId, sharedRecallReload]);
  const [clinicProfileName, setClinicProfileName] = useState('Mi clínica');
  const [clinicProfileLoaded, setClinicProfileLoaded] = useState(false);
  const [theme, setTheme] = useState('light');
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState({ name: 'Equipo clínico', email: '', metadata: {}, userId: '' });
  const [profileLoaded, setProfileLoaded] = useState(false);
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
    if (!sharedMode) {
      try {
        const stored = JSON.parse(window.localStorage.getItem('crm-demo-user-profile-v1') || '{}');
      setUserProfile({ name: stored.name || 'Equipo clínico', email: stored.email || '', metadata: stored, userId: '', avatarUrl: stored.avatarUrl || '', signatureUrl: stored.signatureUrl || '' });
      } catch { setUserProfile({ name: 'Equipo clínico', email: '', metadata: {}, userId: '' }); }
      setProfileLoaded(true);
      return;
    }
    let active = true;
    const supabase = createSupabaseBrowserClient();
    supabase?.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data?.user;
      const metadata = user?.user_metadata || {};
      const name = [metadata.names, metadata.firstLastName, metadata.secondLastName].filter(Boolean).join(' ') || metadata.full_name || metadata.name || user?.email || 'Usuario';
      const avatarPath = typeof metadata.avatar_path === 'string' ? metadata.avatar_path : '';
      const avatarUrl = avatarPath ? supabase.storage.from('profile-avatars').getPublicUrl(avatarPath).data.publicUrl : '';
      const signaturePath = typeof metadata.signature_path === 'string' ? metadata.signature_path : '';
      setUserProfile({ name, email: user?.email || '', metadata, userId: user?.id || '', avatarPath, avatarUrl, signaturePath, signatureUrl: '' });
      if (signaturePath) {
        supabase.storage.from('profile-signatures').createSignedUrl(signaturePath, 3600).then(({ data: signed }) => {
          if (active && signed?.signedUrl) setUserProfile(current => ({ ...current, signatureUrl: signed.signedUrl }));
        });
      }
      setProfileLoaded(true);
    }).catch(() => { if (active) setProfileLoaded(true); });
    return () => { active = false; };
  }, [sharedMode]);
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
  const metadataUserName = [userProfile.metadata?.names, userProfile.metadata?.firstLastName, userProfile.metadata?.secondLastName].filter(Boolean).join(' ') || userProfile.metadata?.full_name || userProfile.metadata?.name;
  const displayUserName = sharedMode
    ? metadataUserName || sharedDirectory.providers.find(provider => provider.userId && provider.userId === userProfile.userId)?.name || userProfile.name
    : userProfile.name;
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceSwitcherRef = useRef(null);
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const closeOnOutsideClick = event => {
      if (!workspaceSwitcherRef.current?.contains(event.target)) setWorkspaceMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setWorkspaceMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [workspaceMenuOpen]);
  const patientSearchRef = useRef(null);
  const [focusPatientSearch, setFocusPatientSearch] = useState(false);
  const page = routePages[pathname] || 'overview';
  const can = permission => !sharedMode || hasClinicPermission(sharedDirectory.role, sharedDirectory.permissions, permission);
  async function saveClinicPromotion(promotion) {
    if (!can('services.manage')) throw new Error('No tienes permiso para gestionar promociones.');
    const update = (rows, saved) => [saved, ...rows.filter(item => item.id !== saved.id)];
    if (sharedMode) {
      const saved = await createClinicPromotionsStore().save(promotionClinicId, promotion);
      setSharedPromotions(current => current?.clinicId === promotionClinicId
        ? { ...current, rows: update(current.rows, saved) } : current);
    } else {
      const saved = { ...promotion, id: promotion.id || crypto.randomUUID(), createdAt: promotion.createdAt || new Date().toISOString() };
      setDemoPromotions(rows => update(rows, saved));
    }
  }
  useEffect(() => {
    if (sharedMode && sharedDirectory.status === 'ready' && page === 'whatsapp' && !can('whatsapp.view')) router.replace('/');
  }, [sharedMode, sharedDirectory.status, sharedDirectory.role, sharedDirectory.permissions, page, router]);
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
  const [demoBills, setDemoBills] = usePersistentList('crm-demo-monthly-bills-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoExpenses, setDemoExpenses] = usePersistentList('crm-demo-expenses-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoPackages, setDemoPackages] = usePersistentList('crm-demo-packages-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoBusinesses, setDemoBusinesses] = usePersistentList('crm-demo-businesses-v1', sharedMode ? [] : initialBusinesses, !sharedMode && !isStandaloneRoute, migrateDemoBusinesses);
  const [demoBranches, setDemoBranches] = usePersistentList('crm-demo-branches-v1', sharedMode ? [] : initialBranches, !sharedMode && !isStandaloneRoute, migrateDemoBranches);
  const [demoProviders, setDemoProviders] = usePersistentList('crm-demo-providers-v1', sharedMode ? [] : initialProviders, !sharedMode && !isStandaloneRoute);
  const [consentTemplates, setConsentTemplates] = usePersistentList('crm-demo-consent-templates-v1', sharedMode ? [] : consentLibrary, !sharedMode && !isStandaloneRoute, migrateDemoConsentTemplates);
  const [contractTemplates, setContractTemplates] = usePersistentList('crm-demo-contract-templates-v1', sharedMode ? [] : initialContractTemplates, !sharedMode && !isStandaloneRoute, migrateDemoContractTemplates);
  const [demoPatientActivities, setDemoPatientActivities] = usePersistentList('crm-demo-patient-activities-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoClinicalHistory, setDemoClinicalHistory] = usePersistentList('crm-demo-clinical-history-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoClinicalBackgrounds, setDemoClinicalBackgrounds] = usePersistentList('crm-demo-clinical-backgrounds-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoBotoxTreatments, setDemoBotoxTreatments] = usePersistentList('crm-demo-botox-treatments-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoProcedures, setDemoProcedures] = usePersistentList('crm-demo-procedures-v1', [], !sharedMode && !isStandaloneRoute);
  const [demoRecordFiles, setDemoRecordFiles] = usePersistentList('crm-demo-record-files-v1', [], !sharedMode && !isStandaloneRoute);
  const patients = sharedMode ? sharedDirectory.patients : demoPatients;
  const setPatients = setDemoPatients;
  const consentTemplatesForPage = sharedMode ? sharedDirectory.templates.filter(template => template.kind === 'consent') : consentTemplates.filter(template => template.active !== false);
  const contractTemplatesForPage = sharedMode ? sharedDirectory.templates.filter(template => template.kind === 'contract') : contractTemplates.filter(template => template.active !== false);
  const businesses = sharedMode ? sharedDirectory.businesses : demoBusinesses;
  const branches = sharedMode ? sharedDirectory.branches : demoBranches;
  const providers = sharedMode ? sharedDirectory.providers : demoProviders;
  const patientActivities = sharedMode ? sharedDirectory.activities : demoPatientActivities;
  const workspaceStorageKey = `crm-selected-workspace-v1:${sharedMode ? sharedDirectory.clinicId || 'pending' : 'demo'}`;
  const [workspaceSelection, setWorkspaceSelection] = useState({ businessId: '', branchId: '' });
  const workspaceGroups = useMemo(() => buildClinicGroups(businesses, branches), [businesses, branches]);
  const activeWorkspaceSelection = normalizeWorkspaceSelection(workspaceSelection, businesses, branches);
  const activeWorkspaceBusiness = businesses.find(business => business.id === activeWorkspaceSelection.businessId);
  const activeWorkspaceBranch = branches.find(branch => branch.id === activeWorkspaceSelection.branchId);
  const canSwitchWorkspace = workspaceGroups.length > 0;
  const workspaceLabel = activeWorkspaceBranch
    ? `${activeWorkspaceBusiness?.name || ''} · ${activeWorkspaceBranch.name.split(/\s*[-–]\s*/)[0]}`
    : activeWorkspaceBusiness?.name || activeClinicName;
  useEffect(() => {
    let savedSelection = { businessId: '', branchId: '' };
    try {
      savedSelection = JSON.parse(window.sessionStorage.getItem(workspaceStorageKey) || '{"businessId":"","branchId":""}');
    } catch { /* Keep the unfiltered workspace when session storage is unavailable. */ }
    setWorkspaceSelection(normalizeWorkspaceSelection(savedSelection, businesses, branches));
  }, [workspaceStorageKey, businesses, branches]);
  const chooseWorkspace = (businessId = '', branchId = '') => {
    const selection = normalizeWorkspaceSelection({ businessId, branchId }, businesses, branches);
    setWorkspaceSelection(selection);
    try { window.sessionStorage.setItem(workspaceStorageKey, JSON.stringify(selection)); } catch { /* The selection remains active in memory. */ }
    setBusinessFilter('');
    setBranchFilter('');
    setProviderFilter('');
    setWorkspaceMenuOpen(false);
  };
  const [agendaDate, setAgendaDate] = useState('2026-10-26');
  const [agendaListEnd, setAgendaListEnd] = useState('');
  useEffect(() => {
    const today = dateKeyInTimeZone(new Date(), clinicTimeZone);
    setAgendaDate(today);
    setAppointmentDefaults(current => ({ ...current, date: today }));
    setPaymentDefaults(current => ({ ...current, date: today }));
  }, [clinicTimeZone]);
  const [appointmentDefaults, setAppointmentDefaults] = useState({ date: '2026-10-26', time: '17:00', patientId: '', providerId: '', packageId: '', serviceId: '', serviceName: '' });
  const [paymentDefaults, setPaymentDefaults] = useState({ date: '2026-10-26', appointmentId: '' });
  const [contractDefaults, setContractDefaults] = useState({ patientId: '' });
  const [consentDefaults, setConsentDefaults] = useState({ patientId: '', templateId: '', service: '' });
  const [contractTemplateReturn, setContractTemplateReturn] = useState(null);
  const [consentTemplateReturn, setConsentTemplateReturn] = useState(null);
  const [consentTemplateDraft, setConsentTemplateDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [businessFilter, setBusinessFilter] = useState('');
  const [period, setPeriod] = useState('Día');
  const sharedAgenda = useClinicAgenda(sharedMode && (page === 'agenda' || page === 'overview') && sharedDirectory.status === 'ready', sharedDirectory.clinicId, agendaDate, page === 'overview' ? 'Mes' : period, sharedDirectory.timeZone, { patients, branches, providers, businesses }, page === 'agenda' && period === 'Lista' ? (agendaListEnd >= agendaDate ? agendaListEnd : agendaDate) : null);
  const appointments = sharedMode ? sharedAgenda.appointments : demoAppointments;
  const canReadSharedPayments = can('payments.view');
  const sharedPaymentWorkspace = useClinicPayments(sharedMode && canReadSharedPayments && (page === 'payments' || page === 'overview' || page === 'agenda'), sharedDirectory.clinicId, sharedDirectory.role, sharedDirectory.timeZone, { branches, providers, businesses }, sharedDirectory.permissions);
  const sharedReminderWorkspace = useClinicReminders(sharedMode && (page === 'reminders' || page === 'whatsapp') && sharedDirectory.status === 'ready' && can('reminders.view'), sharedDirectory.clinicId, sharedDirectory.role, sharedDirectory.timeZone, sharedDirectory.permissions);
  const sharedPageStatus = !sharedMode ? 'idle' : sharedDirectory.status !== 'ready' ? sharedDirectory.status
    : (page === 'overview' || page === 'agenda') ? (sharedAgenda.status === 'idle' ? 'loading' : sharedAgenda.status)
      : page === 'payments' ? (sharedPaymentWorkspace.status === 'idle' ? 'loading' : sharedPaymentWorkspace.status)
        : page === 'reminders' || page === 'whatsapp' ? (sharedReminderWorkspace.status === 'idle' ? 'loading' : sharedReminderWorkspace.status) : 'ready';
  const sharedPageRetry = sharedDirectory.status !== 'ready' ? sharedDirectory.refresh
    : page === 'agenda' || page === 'overview' ? sharedAgenda.refresh
      : page === 'payments' ? sharedPaymentWorkspace.refresh
      : page === 'reminders' || page === 'whatsapp' ? sharedReminderWorkspace.refresh : sharedDirectory.refresh;
  const payments = sharedMode ? sharedPaymentWorkspace.payments : demoPayments;
  const demoReminders = useMemo(() => createDemoAppointmentReminders(appointments, patients), [appointments, patients]);
  const reminders = sharedMode ? sharedReminderWorkspace.reminders : demoReminders;
  const paymentPatients = sharedMode ? sharedPaymentWorkspace.patients : patients;
  const paymentAppointments = sharedMode ? sharedPaymentWorkspace.appointments : appointments;
  const workspaceBusinesses = businesses.filter(business => business.active !== false && (!activeWorkspaceSelection.businessId || business.id === activeWorkspaceSelection.businessId));
  const workspaceBranches = useMemo(() => filterByWorkspace(branches, activeWorkspaceSelection, branches), [branches, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId]);
  const workspaceProviders = useMemo(() => filterByWorkspace(providers, activeWorkspaceSelection, branches), [providers, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId, branches]);
  const workspacePatients = useMemo(() => filterByWorkspace(patients, activeWorkspaceSelection, branches), [patients, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId, branches]);
  const workspaceAppointments = useMemo(() => filterByWorkspace(appointments, activeWorkspaceSelection, branches), [appointments, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId, branches]);
  const demoRecallPackages = useMemo(() => workspacePatients.flatMap(patient => demoPackageBalances(demoPackages, patient.id, workspaceAppointments, demoPayments)), [workspacePatients, demoPackages, workspaceAppointments, demoPayments]);
  const recallPackages = sharedMode
    ? sharedRecallPackageState.clinicId === sharedDirectory.clinicId && sharedRecallPackageState.status === 'ready' ? sharedRecallPackageState.rows : []
    : demoRecallPackages;
  const workspacePayments = useMemo(() => filterByWorkspace(payments, activeWorkspaceSelection, branches), [payments, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId, branches]);
  const workspaceReminders = useMemo(() => filterByWorkspace(reminders, activeWorkspaceSelection, branches), [reminders, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId, branches]);
  const workspacePaymentPatients = useMemo(() => filterByWorkspace(paymentPatients, activeWorkspaceSelection, branches), [paymentPatients, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId, branches]);
  const workspacePaymentAppointments = useMemo(() => filterByWorkspace(paymentAppointments, activeWorkspaceSelection, branches), [paymentAppointments, activeWorkspaceSelection.businessId, activeWorkspaceSelection.branchId, branches]);
  const workspacePatientIds = new Set(workspacePatients.map(patient => patient.id));
  const workspacePatientActivities = patientActivities.filter(activity => workspacePatientIds.has(activity.patientId));
  const setAppointments = setDemoAppointments;
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const notificationScope = sharedMode ? `${userProfile.userId}:${sharedDirectory.clinicId || 'pending'}` : 'demo';
  const notificationFeed = useNotificationFeed(notificationScope, sharedMode ? sharedDirectory.clinicId : null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [pendingProcedureDeletion, setPendingProcedureDeletion] = useState(null);
  const procedureDeletionDialog = useRef(null);
  const cancelProcedureDeletion = useRef(null);
  useEffect(() => {
    if (pendingProcedureDeletion && procedureDeletionDialog.current && !procedureDeletionDialog.current.open) {
      procedureDeletionDialog.current.showModal();
      cancelProcedureDeletion.current?.focus();
    }
  }, [pendingProcedureDeletion]);
  const [patientRecordTab,setPatientRecordTab]=useState('overview');
  const patientRecordReturnTab=useRef('overview');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedBranchRecord, setSelectedBranchRecord] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const handledNotificationLink=useRef('');
  const notificationClinicRef=useRef(sharedDirectory.clinicId);
  notificationClinicRef.current=sharedDirectory.clinicId;
  const [pendingNotificationAppointment,setPendingNotificationAppointment]=useState('');
  useEffect(()=>{
    if(page!=='agenda')return;
    const params=new URL(window.location.href).searchParams;
    const id=params.get('appointment');
    if(!id || handledNotificationLink.current===id)return;
    if(!sharedMode){
      const appointment=appointments.find(item=>item.id===id);
      if(appointment){handledNotificationLink.current=id;setAgendaDate(appointment.date);setSelectedAppointment(appointment);setModal('appointment');}
      return;
    }
    if(sharedDirectory.status!=='ready' || params.get('clinic')!==sharedDirectory.clinicId || !/^[\da-f-]{36}$/i.test(id))return;
    handledNotificationLink.current=id;
    void createSupabaseBrowserClient().from('appointments').select('starts_at').eq('clinic_id',sharedDirectory.clinicId).eq('id',id).maybeSingle().then(({data,error})=>{
      if(notificationClinicRef.current!==sharedDirectory.clinicId)return;
      if(error || !data){setToast('La cita ya no está disponible o no tienes acceso.');return;}
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:sharedDirectory.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(data.starts_at));
      setAgendaDate(date);setPendingNotificationAppointment(id);
    });
  },[page,sharedMode,sharedDirectory.status,sharedDirectory.clinicId,sharedDirectory.timeZone,appointments]);
  useEffect(()=>{
    if(!pendingNotificationAppointment)return;
    const appointment=appointments.find(item=>item.id===pendingNotificationAppointment);
    if(appointment){setSelectedAppointment(appointment);setModal('appointment');setPendingNotificationAppointment('');}
  },[appointments,pendingNotificationAppointment]);

  const [selectedConsent, setSelectedConsent] = useState('Consentimiento informado');
  const [selectedConsentRecordId, setSelectedConsentRecordId] = useState('');
  const [selectedContractRecordId, setSelectedContractRecordId] = useState('');
  const [modalReturn, setModalReturn] = useState(null);
  const openPatientRecordModal = (nextModal) => {
    patientRecordReturnTab.current = patientRecordTab;
    setModal(nextModal);
  };
  const returnToPatientRecord = () => {
    setPatientRecordTab(patientRecordReturnTab.current);
    setModal('patient');
  };
  useEffect(() => {
    if (!isStandaloneRoute) return;
    setModal(null);
    setModalReturn(null);
  }, [isStandaloneRoute]);

  const openNewAppointment = (date = agendaDate, time = '17:00', patientId = '', providerId = '', packageId = '', serviceId = '', serviceName = '', availability = null) => {
    if (!can('agenda.create')) { notify('No tienes permiso para crear citas.'); return; }
    setAppointmentDefaults({ date, time, patientId, providerId, packageId, serviceId, serviceName, availability });
    setModal('new-appointment');
  };
  const openPaymentModal = (appointmentId = '') => {
    const date = dateKeyInTimeZone(new Date(), clinicTimeZone);
    setPaymentDefaults({ date, appointmentId });
    setModalReturn(modal === 'appointment' ? 'appointment' : 'payments');
    setModal('new-payment');
  };
  const openContractPreparation = (patientId = '', returnTo = null) => {
    if (returnTo === 'patient') patientRecordReturnTab.current = patientRecordTab;
    setContractDefaults({ patientId });
    setModalReturn(returnTo);
    setModal('new-contract');
  };
  const signConsentForService = service => {
    const patient = selectedPatient;
    if (!patient || !service) return;
    const existing = [...documentHistory(patient, 'consent')].reverse().find(item => item.status !== 'Reemplazado' && item.service === service);
    if (existing?.status === 'Firmado') return;
    if (existing) {
      openPatientDocumentRecord(patient, { ...existing, kind: 'consent' }, 'patient');
      return;
    }
    const matched = suggestConsentTemplate(service, consentTemplatesForPage);
    openConsentPreparation(patient.id, 'patient', matched?.id || matched?.title || '', service);
  };
  const openConsentPreparation = (patientId = '', returnTo = null, templateId = '', service = '') => {
    if (returnTo === 'patient') patientRecordReturnTab.current = patientRecordTab;
    setConsentDefaults({ patientId, templateId, service });
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

  const notify = (message,saveToFeed=true) => { if(saveToFeed) notificationFeed.add(message); setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const saveClinicName = (event) => {
    event.preventDefault();
    const nextName = String(new FormData(event.currentTarget).get('clinicName') || '').trim();
    if (!nextName) { notify('Escribe el nombre de la clínica.'); return; }
    setClinicProfileName(nextName.slice(0, 80));
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
        returnToPatientRecord();
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
    returnToPatientRecord();
    notify('Nota de seguimiento guardada');
  };
  const savePatientClinicalHistory = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patient = selectedPatient;
    if (!patient) return;
    const answers = Object.fromEntries(clinicalHistoryPrompts.map(([key]) => [key, {
      state: String(form.get(`state-${key}`) || 'not_asked'), detail: String(form.get(`detail-${key}`) || '').trim(),
    }]));
    try {
      let saved = { answers, updatedAt: new Date().toISOString() };
      if (sharedMode) {
        const result = await createPatientDirectoryStore().saveClinicalHistory(sharedDirectory.clinicId, patient, answers);
        saved = { ...saved, id: result.id, updatedAt: result.updated_at };
        sharedDirectory.refresh();
      } else {
        saved.id = `clinical-background-${Date.now()}`;
        setDemoClinicalBackgrounds(items => [{ patientId: patient.id, ...saved }, ...items.filter(item => item.patientId !== patient.id)]);
      }
      setSelectedPatient(current => current?.id === patient.id ? { ...current, clinicalBackground: saved } : current);
      returnToPatientRecord();
      notify('Antecedentes clínicos guardados');
    } catch (error) { notify(error?.message || 'No se pudieron guardar los antecedentes clínicos.'); }
  };
  const addClinicalEncounter = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patient = selectedPatient;
    if (!patient) return;
    const entry = {
      patientId: patient.id,
      appointmentId: String(form.get('appointmentId') || ''),
      occurredAt: new Date(`${String(form.get('occurredOn') || localISODate())}T${String(form.get('occurredTime') || '00:00')}`).toISOString(),
      chiefComplaint: String(form.get('chiefComplaint') || '').trim(),
      history: String(form.get('history') || '').trim(),
      examination: String(form.get('examination') || '').trim(),
      assessment: String(form.get('assessment') || '').trim(),
      plan: String(form.get('plan') || '').trim(),
      prognosis: String(form.get('prognosis') || '').trim(),
      evolution: String(form.get('evolution') || '').trim(),
      vitals: Object.fromEntries(['weight','height','temperature','pulse','bloodPressure','oxygen'].map(key => [key, String(form.get(key) || '').trim()]).filter(([,value]) => value)),
      physicalExam: Object.fromEntries(['skin','face','neck','cardiovascular','respiratory','neurological'].map(key => [key, String(form.get(`exam-${key}`) || 'not_recorded') ])),
    };
    try {
      if (sharedMode) {
        const result = await createPatientDirectoryStore().createEncounter(sharedDirectory.clinicId, patient, entry);
        setSelectedPatient(current => current?.id === patient.id ? { ...current, clinicalHistory: [{ ...entry, id: result.id }, ...(current.clinicalHistory || [])] } : current);
        sharedDirectory.refresh();
      } else {
        const record = { ...entry, id: `encounter-${Date.now()}` };
        setDemoClinicalHistory(items => [record, ...items]);
      }
      returnToPatientRecord();
      notify('Consulta agregada a la historia clínica');
    } catch (error) {
      notify(error?.message || 'No se pudo guardar la consulta.');
    }
  };
  const addBotoxTreatment = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patient = selectedPatient;
    if (!patient) return;
    const record = {
      patientId: patient.id,
      appointmentId: String(form.get('appointmentId') || ''),
      performedAt: new Date(`${String(form.get('performedOn') || localISODate())}T${String(form.get('performedTime') || '00:00')}`).toISOString(),
      product: String(form.get('product') || '').trim(),
      lotNumber: String(form.get('lotNumber') || '').trim(),
      expirationDate: String(form.get('expirationDate') || ''),
      treatmentAreas: String(form.get('treatmentAreas') || '').trim(),
      totalUnits: Number(form.get('totalUnits')),
      followUp: String(form.get('followUp') || '').trim(),
      consentDocumentId: String(form.get('consentReference') || '').startsWith('document:') ? String(form.get('consentReference')).slice(9) : '',
      consentFileId: String(form.get('consentReference') || '').startsWith('file:') ? String(form.get('consentReference')).slice(5) : '',
    };
    try {
      let savedRecord = { ...record, id: `botox-${Date.now()}` };
      if (sharedMode) {
        const result = await createPatientDirectoryStore().createBotoxTreatment(sharedDirectory.clinicId, patient, record);
        savedRecord = { ...savedRecord, id: result.id };
        sharedDirectory.refresh();
      } else {
        setDemoBotoxTreatments(items => [savedRecord, ...items]);
      }
      setSelectedPatient(current => current?.id === patient.id ? { ...current, botoxTreatments: [savedRecord, ...(current.botoxTreatments || [])] } : current);
      returnToPatientRecord();
      notify('Sesión de Botox agregada al expediente');
    } catch (error) {
      notify(error?.message || 'No se pudo guardar la sesión de Botox.');
    }
  };
  const [editingProcedure, setEditingProcedure] = useState(null);
  const [procedurePending, setProcedurePending] = useState(false);
  const openProcedure = record => {
    setEditingProcedure(record);
    openPatientRecordModal('new-patient-procedure');
  };
  const saveProcedure = async (event, zones, photos = []) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patient = selectedPatient;
    const existing = editingProcedure;
    if (!patient || procedurePending || !can(existing ? 'clinical.edit' : 'clinical.create')) return;
    const sessionDate = String(form.get('sessionDate') || localISODate());
    const sessionTime = String(form.get('sessionTime') || '00:00');
    const record = {
      patientId: patient.id, appointmentId: String(form.get('appointmentId') || ''),
      performedAt: new Date(`${sessionDate}T${sessionTime}`).toISOString(),
      procedureType: String(form.get('procedureType') || '').trim(), product: String(form.get('product') || '').trim(),
      lotNumber: String(form.get('lotNumber') || '').trim(), zones, followUp: String(form.get('followUp') || '').trim(),
      consentDocumentId: String(form.get('consentReference') || '').replace(/^document:/, ''),
    };
    setProcedurePending(true);
    try {
      let saved = { ...record, id: existing?.id ?? crypto.randomUUID() };
      if (sharedMode) {
        const store = createPatientDirectoryStore();
        const result = existing
          ? await store.updateProcedure(sharedDirectory.clinicId, patient, existing.id, record)
          : await store.createProcedure(sharedDirectory.clinicId, patient, record);
        saved = { ...saved, id: result.id };
      }
      const saveToList = items => [saved, ...items.filter(item => item.id !== saved.id)]
        .sort((a, b) => Date.parse(b.performedAt) - Date.parse(a.performedAt));
      if (sharedMode) {
        setSelectedPatient(current => current?.id === patient.id
          ? { ...current, procedures: saveToList(current.procedures || []) }
          : current);
        sharedDirectory.refresh();
      } else setDemoProcedures(saveToList);
      if (photos.length) await saveSessionMedia(saved.id, photos, 'photo', true);
      returnToPatientRecord();
      notify(existing ? 'Sesión actualizada' : 'Sesión guardada en el expediente');
    } catch (error) {
      notify(error?.message || 'No se pudo guardar el procedimiento.');
    } finally {
      setProcedurePending(false);
    }
  };
  const deleteProcedure = async record => {
    const patient = selectedPatient;
    if (!patient || procedurePending || !can('clinical.edit')) return;
    setPendingProcedureDeletion({patientId: patient.id, record});
  };
  const confirmProcedureDeletion = async () => {
    const request = pendingProcedureDeletion;
    const patient = selectedPatient;
    if (!request || !patient || request.patientId !== patient.id || procedurePending || !can('clinical.edit')) return;
    setPendingProcedureDeletion(null);
    setProcedurePending(true);
    try {
      const removeFromList = items => items.filter(item => item.id !== request.record.id);
      if (sharedMode) {
        await createPatientDirectoryStore().deleteProcedure(sharedDirectory.clinicId, patient, request.record.id);
        setSelectedPatient(current => current?.id === patient.id
          ? { ...current, procedures: removeFromList(current.procedures || []) }
          : current);
        sharedDirectory.refresh();
      } else setDemoProcedures(removeFromList);
      notify('Procedimiento eliminado del expediente');
    } catch (error) {
      notify(error?.message || 'No se pudo eliminar el procedimiento.');
    } finally {
      setProcedurePending(false);
    }
  };
  const attachPatientFile = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let file = form.get('file');
    if (file?.type?.startsWith('image/')) {
      try { file = await compressClinicalPhoto(file); } catch { notify('No se pudo comprimir la fotografía.'); return; }
    }
    const validationError = validatePatientRecordFile(file);
    if (validationError) { notify(validationError); return; }
    const contentError = await validatePatientRecordFileContent(file);
    if (contentError) { notify(contentError); return; }
    if (!selectedPatient) return;
    const input = { file, title: String(form.get('title') || '').trim(), kind: String(form.get('kind') || 'consent'), signedAt: String(form.get('signedAt') || '') };
    if (!input.title) { notify('Escribe el nombre del documento.'); return; }
    try {
      let id = `file-${Date.now()}`;
      if (sharedMode) {
        const uploaded = await createPatientDirectoryStore().uploadPatientFile(sharedDirectory.clinicId, selectedPatient, input);
        id = uploaded.id;
        const metadata = { id, title: input.title, kind: input.kind, signedAt: input.signedAt, mimeType: file.type, byteSize: file.size, createdAt: new Date().toISOString(), storagePath: uploaded.storagePath };
        setSelectedPatient(current => current?.id === selectedPatient.id ? { ...current, recordFiles: [metadata, ...(current.recordFiles || [])] } : current);
        sharedDirectory.refresh();
      } else {
        await saveDemoRecordFile(id, file);
        const metadata = { id, patientId: selectedPatient.id, title: input.title, kind: input.kind, signedAt: input.signedAt, mimeType: file.type, byteSize: file.size, createdAt: new Date().toISOString(), demoOnly: true };
        setDemoRecordFiles(items => [metadata, ...items]);
      }
      returnToPatientRecord();
      notify('Archivo agregado al expediente');
    } catch (error) {
      notify(error?.message || 'No se pudo guardar el archivo.');
    }
  };
  async function saveSessionMedia(sessionId, incoming, mode, quiet = false) {
    const patient = selectedPatient;
    if (!patient || !sessionId) return;
    const prefix = `[sesión:${sessionId}]`;
    const currentFiles = sharedMode ? (patient.recordFiles || []) : demoRecordFiles.filter(item => item.patientId === patient.id);
    const photoCount = currentFiles.filter(item => item.title?.startsWith(prefix) && item.kind === 'clinical_photo').length;
    const room = mode === 'photo' ? Math.max(0, 4 - photoCount) : incoming.length;
    const batch = [...incoming].slice(0, room);
    if (!batch.length) { notify(mode === 'photo' ? 'Esta sesión ya tiene 4 fotos.' : 'Selecciona un archivo.'); return; }
    const stored = [];
    try {
    for (let index = 0; index < batch.length; index += 1) {
      let file = batch[index];
      if (file.type?.startsWith('image/')) {
        try { file = await compressClinicalPhoto(file, 1024, 0.55); } catch { notify('No se pudo comprimir una fotografía.'); continue; }
      }
      const validationError = validatePatientRecordFile(file);
      if (validationError) { notify(validationError); continue; }
      const contentError = await validatePatientRecordFileContent(file);
      if (contentError) { notify(contentError); continue; }
      const label = mode === 'photo' ? `Foto ${photoCount + stored.length + 1}` : (file.name || 'Archivo').replace(/\.[^.]+$/, '');
      const title = `${prefix} ${label}`.slice(0, 200);
      const kind = mode === 'photo' ? 'clinical_photo' : 'other';
      let id = `file-${Date.now()}-${index}`;
      let metadata = { id, title, kind, signedAt: '', mimeType: file.type, byteSize: file.size, createdAt: new Date().toISOString(), patientId: patient.id };
      if (sharedMode) {
        const uploaded = await createPatientDirectoryStore().uploadPatientFile(sharedDirectory.clinicId, patient, { file, title, kind, signedAt: '' });
        metadata = { ...metadata, id: uploaded.id, storagePath: uploaded.storagePath };
      } else {
        await saveDemoRecordFile(id, file);
      }
      stored.push(metadata);
    }
    if (!stored.length) return;
    if (sharedMode) {
      setSelectedPatient(current => current?.id === patient.id ? { ...current, recordFiles: [...stored, ...(current.recordFiles || [])] } : current);
      sharedDirectory.refresh();
    } else setDemoRecordFiles(items => [...stored, ...items]);
    if (!quiet) notify(mode === 'photo' ? 'Fotos guardadas en la sesión.' : 'Archivos guardados en la sesión.');
    } catch (error) {
      notify(error?.message || 'No se pudo guardar en la sesión.');
    }
  }
  const resolvePatientFileUrl = async file => {
    if (sharedMode) return createPatientDirectoryStore().openPatientFile(file.storagePath);
    const blob = await openDemoRecordFile(file.id);
    return blob ? URL.createObjectURL(blob) : '';
  };
  const saveDocumentSignature = async (kind, file) => {
    const patient = selectedPatient;
    if (!patient || !file) return;
    const recordId = kind === 'contract' ? selectedContractRecordId : selectedConsentRecordId;
    const history = documentHistory(patient, kind);
    const record = history.find(item => item.id === recordId) || history.at(-1);
    const documentTitle = record?.title || (kind === 'contract' ? patient.contractTemplateTitle : selectedConsent) || (kind === 'contract' ? 'Contrato' : 'Consentimiento');
    const signedAt = new Date().toISOString();
    const input = { file, title: `Firma · ${documentTitle}`, kind, signedAt: signedAt.slice(0, 10) };
    const nextHistory = history.map(item => item.id === (record?.id || recordId) ? { ...item, status: 'Firmado', signedAt } : item);
    const signedUpdate = kind === 'contract'
      ? { contract: 'Firmado', contractSignedAt: signedAt, contractHistory: nextHistory }
      : { consent: 'Firmado', consentSignedAt: signedAt, consentHistory: nextHistory };
    try {
      let storedFile = { id: `file-${Date.now()}`, title: input.title, kind, signedAt: input.signedAt, mimeType: file.type, byteSize: file.size, createdAt: signedAt };
      if (sharedMode) {
        const uploaded = await createPatientDirectoryStore().uploadPatientFile(sharedDirectory.clinicId, patient, input);
        storedFile = { ...storedFile, ...uploaded };
        sharedDirectory.refresh();
      } else {
        await saveDemoRecordFile(storedFile.id, file);
        setDemoRecordFiles(items => [{ ...storedFile, patientId: patient.id, demoOnly: true }, ...items]);
        setPatients(current => current.map(item => item.id === patient.id ? { ...item, ...signedUpdate } : item));
      }
      setSelectedPatient(current => current?.id === patient.id ? { ...current, ...signedUpdate, recordFiles: [storedFile, ...(current.recordFiles || [])] } : current);
      notify('La firma quedó guardada en el expediente.');
    } catch (error) {
      notify(error?.message || 'No se pudo guardar la firma.');
      throw error;
    }
  };
  const saveAccountSignature = async file => {
    const dataUrl = await fileToDataUrl(file);
    if (!sharedMode) {
      const stored = JSON.parse(window.localStorage.getItem('crm-demo-user-profile-v1') || '{}');
      window.localStorage.setItem('crm-demo-user-profile-v1', JSON.stringify({ ...stored, signatureUrl: dataUrl }));
      setUserProfile(current => ({ ...current, signatureUrl: dataUrl }));
      return dataUrl;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) throw new Error('La sesión no está disponible.');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error('Inicia sesión de nuevo para guardar tu firma.');
    const user = userData.user;
    const path = `${user.id}/${crypto.randomUUID()}.png`;
    const bucket = supabase.storage.from('profile-signatures');
    const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type || 'image/png', cacheControl: '3600', upsert: false });
    if (uploadError) throw new Error('No se pudo guardar la firma en la cuenta.');
    const { data: signedData, error: signedError } = await bucket.createSignedUrl(path, 3600);
    if (signedError || !signedData?.signedUrl) throw new Error('La firma se subió, pero no se pudo mostrar.');
    const metadata = { ...userProfile.metadata, signature_path: path };
    const { error: metadataError } = await supabase.auth.updateUser({ data: metadata });
    if (metadataError) throw new Error('No se pudo guardar la firma en la cuenta.');
    const previousPath = typeof userProfile.metadata?.signature_path === 'string' ? userProfile.metadata.signature_path : '';
    if (previousPath.startsWith(`${user.id}/`) && previousPath !== path) await bucket.remove([previousPath]);
    setUserProfile(current => ({ ...current, metadata, signaturePath: path, signatureUrl: signedData.signedUrl }));
    return signedData.signedUrl;
  };
  const openPatientFile = async (file) => {
    try {
      const url = sharedMode
        ? await createPatientDirectoryStore().openPatientFile(file.storagePath)
        : URL.createObjectURL(await openDemoRecordFile(file.id));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      notify('No se pudo abrir el archivo. Comprueba que siga disponible.');
    }
  };
  const filteredPatients = useMemo(() => workspacePatients.filter(p => `${p.name} ${p.id} ${p.treatment} ${p.clinician} ${p.branch} ${p.email||''} ${p.phone||''}`.toLowerCase().includes(query.toLowerCase())), [workspacePatients, query]);
  const businessOptions = useMemo(() => [{ id: '', name: 'Todos los negocios' }, ...workspaceBusinesses.map(business => ({ id: business.id, name: business.name }))], [workspaceBusinesses]);
  const branchOptions = useMemo(() => {
    const activeBranches = workspaceBranches.filter(branch => branch.active);
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
  }, [workspaceBranches, businessFilter, businesses]);
  const providerOptions = useMemo(() => {
    const relevantBranchIds = new Set(workspaceBranches
      .filter(branch => branch.active && (branchFilter ? branch.id === branchFilter : !businessFilter || branch.businessId === businessFilter))
      .map(branch => branch.id));
    return [
      { id: '', name: 'Todas las personas', branchIds: [] },
      ...workspaceProviders
        .filter(provider => provider.active && (!provider.branchIds?.length || provider.branchIds.some(id => relevantBranchIds.has(id))))
        .map(provider => ({ id: provider.id, name: provider.name, branchIds: provider.branchIds || [], branchSettings: provider.branchSettings || {} })),
    ];
  }, [workspaceProviders, workspaceBranches, branchFilter, businessFilter]);
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
  const filteredAppointments = useMemo(() => workspaceAppointments.filter(appointment => {
    const branchId = appointment.branchId || branches.find(branch => branch.name === appointment.branch)?.id;
    const providerId = appointment.providerId || providers.find(provider => provider.name === appointment.clinician)?.id;
    const businessId = appointment.businessId || branches.find(branch => branch.id === branchId)?.businessId || businesses.find(business => business.name === appointment.business)?.id;
    return (!providerFilter || providerId === providerFilter)
      && (!branchFilter || branchId === branchFilter)
      && (!businessFilter || businessId === businessFilter);
  }), [workspaceAppointments, providerFilter, branchFilter, businessFilter, branches, providers, businesses]);
  const pendingDocs = workspacePatients.reduce((total, patient) => total + Number(patient.contract === 'Pendiente') + Number(patient.consent === 'Pendiente'), 0);

  const createAppointmentPatient = async ({ name, email = '', phone = '', treatment = '', branchId = '', firstVisit = false }) => {
    const cleanedName = String(name || '').trim();
    const cleanedEmail = String(email || '').trim();
    const cleanedPhone = String(phone || '').trim();
    const cleanedTreatment = String(treatment || '').trim() || 'Por definir';
    const assignedBranchId = branchId === undefined ? (activeWorkspaceSelection.branchId || branches[0]?.id || '') : branchId;
    const branch = branches.find(item => item.id === assignedBranchId);
    if (!cleanedName) return null;
    if (cleanedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      notify('Revisa el formato del correo electrónico.');
      return null;
    }
    const initials = cleanedName.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-MX');
    if (sharedMode) {
      if (sharedDirectory.status !== 'ready' || !sharedDirectory.clinicId || !can('patients.create')) {
        notify('No tienes permiso para crear pacientes o el directorio aún no está listo.');
        return null;
      }
      try {
        const saved = await createPatientDirectoryStore().create(sharedDirectory.clinicId, {
          name: cleanedName, email: cleanedEmail, phone: cleanedPhone, treatment: cleanedTreatment, branchId: assignedBranchId, firstVisit,
        });
        const patient = {
          id: saved.record_number, databaseId: saved.id, name: cleanedName, initials, treatment: cleanedTreatment, firstVisit,
          email: cleanedEmail, phone: cleanedPhone, whatsappOptIn: false, whatsappOptInAt: null,
          whatsappOptInSource: '', branch: branch?.name || 'Sin sucursal asignada', branchId: assignedBranchId,
          clinician: 'Sin profesional asignado', providerId: '', status: 'Nuevo', contract: 'Por preparar',
          contractType: '', contractTemplateTitle: '', contractContent: '', contractService: '', contractDiagnosisId: '',
          contractRequestedAt: null, contractSignedAt: null, contractHistory: [], consent: 'Por preparar',
          consentDocument: '', consentContentSnapshot: '', consentRequestedAt: null, consentSignedAt: null,
          consentHistory: [], diagnosisAccepted: false, diagnosisId: '', diagnosisSummary: '', diagnosisHistory: [],
          clinicalHistory: [], recordFiles: [], botoxTreatments: [], last: 'Recién agregado', tone: 'blue',
        };
        sharedDirectory.prependPatientOptimistically(patient);
        notify('Paciente creado y seleccionado para la cita');
        return patient;
      } catch {
        notify('No se pudo crear el paciente. Revisa los campos y tus permisos.');
        return null;
      }
    }
    const patient = {
      id: `CN-${2482 + patients.length - initialPatients.length}`, name: cleanedName, initials,
      email: cleanedEmail, phone: cleanedPhone, treatment: cleanedTreatment, firstVisit,
      branch: branch?.name || 'Sin sucursal asignada', branchId: assignedBranchId,
      clinician: 'Sin profesional asignado', providerId: '', last: 'Recién agregado', status: 'Nuevo',
      contract: 'Por preparar', consent: 'Por preparar', tone: 'blue',
    };
    setPatients(current => [patient, ...current]);
    notify('Paciente creado y seleccionado para la cita');
    return patient;
  };

  const addPatient = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const firstVisit = form.has('firstVisit');
    const name = String(form.get('name') || '').trim();
    const email = String(form.get('email') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const treatment = String(form.get('treatment') || 'Por definir').trim();
    const branchId = String(form.get('branchId') || '');
    const branch = branches.find(item => item.id === branchId);
    if (!name) return;
    if (sharedMode) {
      if (sharedDirectory.status !== 'ready' || !sharedDirectory.clinicId) { notify('El directorio compartido no está listo. Actualiza la página e inténtalo de nuevo.'); return; }
      try {
        await createPatientDirectoryStore().create(sharedDirectory.clinicId, { name, email, phone, treatment, branchId, firstVisit });
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
    const p = { id: `CN-${2482 + patients.length - initialPatients.length}`, name, initials, email, phone, treatment, firstVisit, branch: branch?.name || 'Sin sucursal asignada', branchId, clinician: 'Sin profesional asignado', providerId: '', last: 'Recién agregado', status: 'Nuevo', contract: 'Por preparar', consent: 'Por preparar', tone: 'blue' };
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
        returnToPatientRecord();
        notify('Expediente actualizado en la base compartida');
      } catch {
        notify('No se pudo actualizar el expediente. Revisa tus permisos e inténtalo de nuevo.');
      }
      return;
    }
    setPatients(current => current.map(patient => patient.id === id ? { ...patient, ...update } : patient));
    setAppointments(current => current.map(appointment => appointment.patientId === id || (!appointment.patientId && appointment.patient === previous.name) ? { ...appointment, patient: name, initials } : appointment));
    setSelectedPatient(current => current?.id === id ? { ...current, ...update } : current);
    returnToPatientRecord(); notify('Expediente actualizado');
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
    const note = String(form.get('note') || '').trim();
    const durationMinutes = Number(form.get('durationMinutes') || 45);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720 || durationMinutes % 15 !== 0) { notify('La duración debe ser de 15 minutos a 12 horas, en pasos de 15 minutos.'); return; }
    const packageId = String(form.get('packageId') || '');
    const depositRequired = !packageId;
    let depositAmount = 0;
    try { if (depositRequired) depositAmount = parseFixedDeposit(form.get('depositAmount')); }
    catch (error) { notify(error.message); return; }
    let sessionPrice;
    try {
      sessionPrice = parseSessionPrice(form.get('sessionPriceAmount'), form.get('sessionPriceCurrency'));
    } catch (error) {
      notify(error.message);
      return;
    }
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
    let serviceIds = [];
    try { serviceIds = JSON.parse(String(form.get('serviceIds') || '[]')); } catch { serviceIds = []; }
    if (!Array.isArray(serviceIds) || serviceIds.some(id => typeof id !== 'string')) { notify('Revisa los servicios seleccionados.'); return; }
    const service = serviceIds.length ? serviceIds.map(id => serviceCatalog.find(item => item.id === id)?.name).filter(Boolean).join(' + ') : String(form.get('service') || '').trim();
    if (!service) { notify('Agrega el nombre del servicio para la cita.'); return; }
    const serviceId = serviceIds[0] || String(form.get('serviceId') || '');
    const selectedCatalogService = serviceCatalog.find(item => item.id === serviceId);
    const selectedCatalogServices = serviceIds.map(id => serviceCatalog.find(item => item.id === id));
    if (packageId && serviceIds.length !== 1) { notify('Una cita de paquete debe incluir un solo servicio.'); return; }
    if (packageId && !sharedMode) {
      const purchase = demoPackageBalances(demoPackages, patientId, demoAppointments, demoPayments).find(item => item.id === packageId);
      if (!purchase || purchase.serviceId !== serviceIds[0] || !purchase.availableSessions) {
        notify('El paquete no tiene sesiones disponibles para este servicio.'); return;
      }
    }
    if (serviceIds.length > 12 || new Set(serviceIds).size !== serviceIds.length || selectedCatalogServices.some(item => !item || !item.active || (item.branchIds?.length && !item.branchIds.includes(branchId)) || (item.providerIds?.length && !item.providerIds.includes(providerId)))) { notify('Cada servicio debe estar disponible para la sucursal y profesional seleccionados.'); return; }
    const serviceSnapshot = selectedCatalogService ? { code:selectedCatalogService.code, name:selectedCatalogService.name, category:selectedCatalogService.category, durationMin:selectedCatalogService.durationMin, durationMax:selectedCatalogService.durationMax, offers:selectedCatalogService.offers, capturedAt:new Date().toISOString() } : {};
    if (sharedMode) {
      try {
        await createClinicAgendaStore().create(sharedDirectory.clinicId, { patient: patientRecord, businessId, branchId, providerId, date, time, modality, service, serviceId, serviceIds, serviceSnapshot, depositRequired, depositAmount, durationMinutes, note, sessionPrice, packageId }, sharedDirectory.timeZone);
        sharedAgenda.refresh();
        setAgendaDate(date); setPage('agenda'); setProviderFilter(''); setBranchFilter(''); setBusinessFilter(''); notify('Cita guardada en la agenda compartida',false);
        const matchedConsent = suggestConsentTemplate(service, consentTemplatesForPage);
        if (matchedConsent) openConsentPreparation(patientRecord.id, null, matchedConsent.id || matchedConsent.title);
        else setModal(null);
      } catch (error) {
        if (error?.code === 'APPOINTMENT_PRICE_SCHEMA') { notify(error.message); return; }
        if (packageId && error?.code === '23514' && /package/i.test(error.cause?.message || '')) { notify('El paquete no tiene sesiones disponibles para este servicio.'); return; }
        notify(error?.code === '23P01' ? 'El paciente o profesional ya tiene una cita en ese horario.' : isScheduleBoundsError(error) ? 'La cita debe iniciar a partir de las 06:00, en intervalos de 15 minutos, y terminar a más tardar a medianoche.' : 'No se pudo guardar la cita. Revisa la asignación de sucursal y tus permisos.');
      }
      return;
    }
    const appointmentId = `appointment-${crypto.randomUUID()}`;
    setAppointments(prev => [...prev, { id: appointmentId, date, time, patient, patientId, initials: patientRecord.initials, service, serviceId, serviceIds, serviceSnapshot, clinician, providerId, branch, branchId, business, businessId, modality, depositRequired, depositAmount, note, sessionPrice, packageId, duration: `${durationMinutes} min`, status: 'Por confirmar', tone: patientRecord.tone||'blue' }].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)));
    setAgendaDate(date); setPage('agenda'); setProviderFilter(''); setBranchFilter(''); setBusinessFilter(''); notify('Cita agregada a la agenda',false); addDemoAppointmentAlert('new_appointment','Nueva cita registrada',appointmentId);
    const matchedConsent = suggestConsentTemplate(service, consentTemplatesForPage);
    if (matchedConsent) openConsentPreparation(patientRecord.id, null, matchedConsent.id || matchedConsent.title);
    else setModal(null);
  };
  const updateAppointment = async (event) => {
    event.preventDefault();
    if (!can('agenda.edit')) { notify('No tienes permiso para editar citas.'); return; }
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
    let sessionPrice;
    try {
      sessionPrice = parseSessionPrice(form.get('sessionPriceAmount'), form.get('sessionPriceCurrency'));
    } catch (error) {
      notify(error.message);
      return;
    }
    const priceChanged = sessionPrice?.amount !== current.sessionPrice?.amount || sessionPrice?.currency !== current.sessionPrice?.currency;
    let serviceIds = [];
    try { serviceIds = JSON.parse(String(form.get('serviceIds') || '[]')); } catch { serviceIds = []; }
    if (!Array.isArray(serviceIds) || serviceIds.some(id => typeof id !== 'string')) { notify('Revisa los servicios seleccionados.'); return; }
    const service = serviceIds.length ? serviceIds.map(id => serviceCatalog.find(item => item.id === id)?.name).filter(Boolean).join(' + ') : String(form.get('service') || current.service || '').trim();
    if (!service) { notify('Agrega el nombre del servicio para la cita.'); return; }
    const serviceId = serviceIds[0] || String(form.get('serviceId') || '');
    const selectedCatalogService = serviceCatalog.find(item => item.id === serviceId);
    const selectedCatalogServices = serviceIds.map(id => serviceCatalog.find(item => item.id === id));
    const previousServiceIds = current.serviceIds || [current.serviceId].filter(Boolean);
    const keepHistoricalSelection = serviceIds.join('|') === previousServiceIds.join('|') && branchId === current.branchId && providerId === current.providerId;
    const unavailableService = selectedCatalogServices.some(item => !item || !item.active || (item.branchIds?.length && !item.branchIds.includes(branchId)) || (item.providerIds?.length && !item.providerIds.includes(providerId)));
    if (serviceIds.length > 12 || new Set(serviceIds).size !== serviceIds.length || (!keepHistoricalSelection && unavailableService)) { notify('Cada servicio debe estar disponible para la sucursal y profesional seleccionados.'); return; }
    const serviceSnapshot = serviceIds.join('|')===(current.serviceIds||[current.serviceId].filter(Boolean)).join('|') ? current.serviceSnapshot || {} : selectedCatalogService ? { code:selectedCatalogService.code, name:selectedCatalogService.name, category:selectedCatalogService.category, durationMin:selectedCatalogService.durationMin, durationMax:selectedCatalogService.durationMax, offers:selectedCatalogService.offers, capturedAt:new Date().toISOString() } : {};
    const selectedBusiness = businesses.find(item => item.id === businessId && item.active !== false);
    const selectedBranch = branches.find(item => item.id === branchId && item.active !== false);
    const selectedProvider = providers.find(item => item.id === providerId && item.active !== false);
    if (!selectedBusiness || !selectedBranch || selectedBranch.businessId !== businessId || !selectedProvider || (selectedProvider.branchIds?.length && !selectedProvider.branchIds.includes(branchId))) {
      notify('Selecciona un negocio, sucursal y profesional compatibles.');
      return;
    }
    const currentDuration = Number.parseInt(current.duration, 10) || 45;
    const durationMinutes = Number(form.get('durationMinutes') || currentDuration);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720 || durationMinutes % 15 !== 0) { notify('La duración debe ser de 15 minutos a 12 horas, en pasos de 15 minutos.'); return; }
    if (!sharedMode && current.depositRequired && ['Confirmada', 'Completada'].includes(status)) {
      const received = payments.filter(payment => payment.appointmentId === current.id).reduce((total, payment) => total + (payment.direction === 'Reembolso' ? -Number(payment.amount) : Number(payment.amount)), 0);
      if (received + 0.001 < Number(current.depositAmount || 0)) { notify(`Registra el anticipo de ${formatCurrencyMXN(current.depositAmount)} antes de confirmar esta cita.`); return; }
    }
    const modality = String(form.get('modality') || current.modality || 'Presencial');
    const note = String(form.get('note') || '').trim();
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
        await createClinicAgendaStore().update(sharedDirectory.clinicId, current, { date, time, status, modality, durationMinutes, businessId, branchId, providerId, service, serviceId, serviceIds, serviceSnapshot, note, sessionPrice: priceChanged ? sessionPrice : undefined }, sharedDirectory.timeZone);
        sharedAgenda.refresh();
      } catch (error) {
        if (error?.code === 'APPOINTMENT_PRICE_SCHEMA') { notify(error.message); return; }
        notify(error?.code === '23P01' ? 'El paciente o profesional ya tiene una cita en ese horario.' : isScheduleBoundsError(error) ? 'La cita debe iniciar a partir de las 06:00, en intervalos de 15 minutos, y terminar a más tardar a medianoche.' : error?.code === '23514' ? `Registra el anticipo de ${formatCurrencyMXN(current.depositAmount)} antes de confirmar esta cita.` : 'No se pudo actualizar la cita. Revisa el horario y tus permisos.');
        return;
      }
    } else {
      setAppointments(items => items.map(item => item.id === id ? { ...item, date, time, status, modality, service, serviceId, serviceIds, serviceSnapshot, note, sessionPrice, duration: `${durationMinutes} min`, businessId, business: selectedBusiness.name, branchId, branch: selectedBranch.name, providerId, clinician: selectedProvider.name } : item).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)));
    }
    if (!sharedMode && (status !== current.status && status === 'Cancelada' || date !== current.date || time !== current.time || durationMinutes !== Number.parseInt(current.duration,10) || providerId !== current.providerId || branchId !== current.branchId)) addDemoAppointmentAlert('agenda_change',status === 'Cancelada' ? 'Cita cancelada' : 'Horario o asignación de cita actualizado',id);
    setAgendaDate(date); setSelectedAppointment(null); setModal(null); notify('Cita actualizada',false);
  };
  const cancelAppointment = async appointment => {
    if (!can('agenda.cancel')) { notify('No tienes permiso para cancelar citas.'); return; }
    if (!window.confirm(`¿Cancelar la cita de ${appointment.patient || 'este paciente'}?`)) return;
    if (sharedMode) {
      try {
        await createClinicAgendaStore().update(sharedDirectory.clinicId, appointment, {
          date: appointment.date, time: appointment.time, status: 'Cancelada', modality: appointment.modality || 'Presencial',
          durationMinutes: Number.parseInt(appointment.duration, 10) || 45, businessId: appointment.businessId || '',
          branchId: appointment.branchId || '', providerId: appointment.providerId || '', service: appointment.service || '',
          serviceId: appointment.serviceId || '', serviceIds: appointment.serviceIds || [], serviceSnapshot: appointment.serviceSnapshot || {},
        }, sharedDirectory.timeZone);
        sharedAgenda.refresh();
      } catch {
        notify('No se pudo cancelar la cita. Revisa el estado y tus permisos.');
        return;
      }
    } else setAppointments(items => items.map(item => item.id === appointment.id ? { ...item, status: 'Cancelada' } : item));
    setSelectedAppointment(null); setModal(null); notify('Cita cancelada',false);
  };
  const recordAppointmentArrival = async appointment => {
    if (!can('agenda.edit') || appointment.arrivedAt || !['Por confirmar', 'Confirmada'].includes(appointment.status)) return;
    try {
      const arrivedAt = sharedMode
        ? await createClinicAgendaStore().recordArrival(sharedDirectory.clinicId, appointment.id)
        : new Date().toISOString();
      if (sharedMode) sharedAgenda.refresh();
      else {
        setAppointments(items => items.map(item => item.id === appointment.id && !item.arrivedAt ? { ...item, arrivedAt } : item));
        addDemoAppointmentAlert('patient_arrived', 'Paciente en recepción', appointment.id);
      }
      setSelectedAppointment(current => current?.id === appointment.id ? { ...current, arrivedAt } : current);
      notify('Llegada registrada', false);
    } catch (error) {
      notify(error.message);
    }
  };
  const createPayment = async (event, referenceQuote = null) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!can('payments.create')) { notify('No tienes permiso para registrar movimientos.'); return; }
    const appointmentId = String(form.get('appointmentId') || '');
    const appointment = paymentAppointments.find(item => item.id === appointmentId) || (selectedAppointment?.id === appointmentId ? selectedAppointment : null);
    let patientId = String(form.get('patientId') || '');
    if (appointment) patientId = appointment.patientId || paymentPatients.find(patient => patient.name === appointment.patient)?.id || patientId;
    const patient = paymentPatients.find(item => item.id === patientId);
    const packageId = appointment?.packageId || (!appointment ? String(form.get('packageId') || '') : '');
    const date = String(form.get('date') || '');
    let originalAmount;
    let amount;
    try {
      originalAmount = parseSessionPrice(form.get('amount'), referenceQuote ? 'USD' : 'MXN')?.amount;
      amount = referenceQuote ? convertCurrency(originalAmount,'USD',referenceQuote)?.amount : originalAmount;
    } catch (error) {
      notify(error.message);
      return;
    }
    const direction = String(form.get('direction') || 'Ingreso');
    if (direction === 'Reembolso' && !can('payments.refund')) { notify('No tienes permiso para registrar reembolsos.'); return; }
    if (!patient || !date || !Number.isFinite(amount) || amount <= 0) { notify('Selecciona un paciente, una fecha y un monto mayor a cero.'); return; }
    if (packageId && !sharedMode) {
      const purchase = demoPackageBalances(demoPackages, patientId, demoAppointments, demoPayments).find(item => item.id === packageId);
      const limit = direction === 'Reembolso' ? purchase?.paidAmount : purchase?.outstandingAmount;
      if (limit == null || amount > limit + 0.001) { notify('El movimiento supera el saldo disponible del paquete.'); return; }
    }
    if (direction === 'Reembolso' && (appointment || !packageId)) {
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
    let exchange = null;
    if (referenceQuote) {
      try {
        const confirmed = await confirmReferenceRate(date,referenceQuote);
        if (sharedMode && !confirmed.id) throw new Error('No se pudo conservar el tipo de cambio.');
        exchange = { ...confirmed,originalAmount };
      } catch (error) {
        notify(error.message || 'No se pudo confirmar el tipo de cambio.');
        return;
      }
    }
    if (sharedMode) {
      try {
        await createClinicPaymentsStore().create(sharedDirectory.clinicId, patient, appointment, { direction, amount, packageId, exchange, method: String(form.get('method') || 'Otro'), date, note: String(form.get('note') || '').trim() });
        sharedPaymentWorkspace.refresh();
        setModal(modalReturn === 'appointment' ? 'appointment' : null);
        setModalReturn(null);
        notify(direction === 'Reembolso' ? 'Reembolso guardado en el historial compartido' : 'Pago guardado en el historial compartido');
      } catch (error) {
        const databaseDetail = [error?.cause?.constraint, error?.cause?.message, error?.cause?.details].filter(Boolean).join(' ');
        if (/package balance|payments_package_balance/.test(databaseDetail)) { notify('El movimiento supera el saldo disponible del paquete.'); return; }
        notify(databaseDetail.includes('payments_refund_preserves_appointment_deposit')
          ? 'Ese reembolso dejaría una cita confirmada por debajo del anticipo requerido.'
          : databaseDetail.includes('payments_refund_preserves_patient_deposits')
            ? 'Ese reembolso usaría fondos reservados para anticipos de citas confirmadas. Vincula el reembolso a una cita o reduce el monto.'
          : error?.code === '23514' ? 'El reembolso supera el saldo disponible.' : error.message || 'No se pudo registrar el movimiento. Revisa tus permisos.');
      }
      return;
    }
    const payment = { id: `payment-${Date.now()}`, patientId: patient.id, patientNameSnapshot: patient.name, appointmentId: appointment?.id || '', packageId, date, direction, amount, exchange, method: String(form.get('method') || 'Otro'), note: String(form.get('note') || '').trim(), branchId, providerId, businessId, branchName: appointment?.branch || patient.branch || '', providerName: appointment?.clinician || patient.clinician || '', businessName: appointment?.business || businesses.find(item => item.id === businessId)?.name || '', createdAt: new Date().toISOString() };
    setPayments(previous => [...previous, payment].sort((a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||'').localeCompare(String(a.createdAt||''))));
    setModal(modalReturn === 'appointment' ? 'appointment' : null);
    setModalReturn(null);
    notify(direction === 'Reembolso' ? 'Reembolso registrado' : 'Pago registrado');
  };
  const openPatientFromAppointment = () => {
    const patient = patients.find(item => item.id === selectedAppointment?.patientId || item.name === selectedAppointment?.patient);
    if (!patient) { notify('No se encontró el expediente vinculado.'); return; }
    setSelectedAppointment(null); setSelectedPatient(patient); setPatientRecordTab('overview'); setModal('patient');
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
        await createPatientDirectoryStore().createBranch(sharedDirectory.clinicId, { name, businessId, address, phone, hours });
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
      if (!can('team.manage_branches')) { notify('No tienes permiso para editar sucursales.'); return; }
      try {
        await createPatientDirectoryStore().updateBranch(sharedDirectory.clinicId, selectedBranchRecord, { name, address, phone, hours });
        sharedDirectory.refresh(); setModal(null); setSelectedBranchRecord(null); notify('Sucursal actualizada');
      } catch (error) { notify(error.message || 'No se pudo actualizar la sucursal.'); }
      return;
    }
    setBranches(previous => previous.map(branch => branch.id === selectedBranchRecord.id ? { ...branch, name, address, phone, hours } : branch));
    setModal(null); setSelectedBranchRecord(null); notify('Sucursal actualizada en el catálogo de demostración');
  };
  const saveProfessional = async (input) => {
    if (sharedMode) {
      if (!can('team.manage_professionals')) throw new Error('No tienes permiso para guardar profesionales.');
      const store = createPatientDirectoryStore();
      if (selectedProvider) await store.updateProvider(sharedDirectory.clinicId, selectedProvider, input);
      else await store.createProvider(sharedDirectory.clinicId, input);
      sharedDirectory.refresh();
    } else {
      const initials = input.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
      if (selectedProvider) setProviders(previous => previous.map(provider => provider.id === selectedProvider.id ? { ...provider, ...input, initials } : provider));
      else setProviders(previous => [...previous, { id: `provider-${Date.now()}`, ...input, initials, tone: 'blue', active: true }]);
    }
    setModal(null); setSelectedProvider(null); notify(selectedProvider ? 'Profesional actualizado' : 'Profesional agregado al equipo');
  };
  const createConsentTemplate = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    const type = String(form.get('type') || 'Documento clínico');
    const content = String(form.get('content') || '').trim();
    if (!title || !content) return;
    if (sharedMode) {
      if (!can('documents.manage_templates')) { notify('No tienes permiso para guardar formatos.'); return; }
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
  const renameConsentTemplate = async (template, title) => {
    const nextTitle = String(title || '').trim();
    if (!template || !nextTitle) return;
    if (sharedMode) {
      if (!can('documents.manage_templates')) { notify('No tienes permiso para cambiar formatos.'); return; }
      try {
        await createPatientDirectoryStore().renameTemplate(sharedDirectory.clinicId, template.id, nextTitle);
        sharedDirectory.refresh();
        notify('Nombre del formato actualizado. Los documentos ya preparados conservan el nombre con el que se guardaron.');
      } catch (error) {
        notify(error.message || 'No se pudo cambiar el nombre.');
      }
      return;
    }
    setConsentTemplates(previous => previous.map(item => item.id === template.id ? { ...item, title: nextTitle } : item));
    notify('Nombre del formato actualizado en este navegador.');
  };
  const archiveConsentTemplate = async (template) => {
    if (!template) return;
    if (sharedMode) {
      if (!can('documents.manage_templates')) { notify('No tienes permiso para quitar formatos.'); return; }
      try {
        await createPatientDirectoryStore().archiveTemplate(sharedDirectory.clinicId, template.id);
        sharedDirectory.refresh();
        notify('Formato quitado de la biblioteca. Los expedientes que ya lo usaron conservan su copia.');
      } catch (error) {
        notify(error.message || 'No se pudo quitar el formato.');
      }
      return;
    }
    setConsentTemplates(previous => previous.map(item => item.id === template.id ? { ...item, active: false } : item));
    notify('Formato quitado de la biblioteca. Los expedientes que ya lo usaron conservan su copia.');
  };
  const linkConsentToRecord = async ({ patientId, template, service }) => {
    if (!patientId || !template) return;
    const patientRecord = patients.find(patient => patient.id === patientId);
    if (!patientRecord) return;
    if (!template.content?.trim()) { notify('Este formato no tiene texto para vincular.'); return; }
    const requestedAt = new Date().toISOString();
    if (sharedMode) {
      if (!can('documents.create')) { notify('No tienes permiso para preparar documentos clínicos.'); return; }
      try {
        const result = await createPatientDirectoryStore().createPatientDocument(sharedDirectory.clinicId, patientRecord, { kind: 'consent', template, service: service || null });
        sharedDirectory.refresh();
        notify(`Formato vinculado al expediente${service ? ` con ${service}` : ''}. La copia ya guardada no cambia si editas el formato.`);
        return result;
      } catch (error) {
        notify(error.message || 'No se pudo vincular el expediente.');
        return;
      }
    }
    const consentRecord = { id: `consent-${Date.now()}`, title: template.title, type: template.type || 'Consentimiento informado', templateVersion: String(template.version || '').match(/\d+(?:\.\d+)?/)?.[0] || '', createdByLabel: 'Equipo clínico · demostración', contentSnapshot: template.content, service: service || '', status: 'Pendiente', requestedAt, signedAt: null };
    const consentHistory = [...documentHistory(patientRecord, 'consent'), consentRecord];
    const update = { consent: 'Pendiente', consentDocument: template.title, consentRequestedAt: requestedAt, consentContentSnapshot: template.content, consentHistory };
    setPatients(previous => previous.map(patient => patient.id === patientId ? { ...patient, ...update } : patient));
    notify(`Formato vinculado al expediente${service ? ` con ${service}` : ''}.`);
  };
  const createContractTemplate = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    const type = String(form.get('type') || 'Prestación de servicios');
    const content = String(form.get('content') || '').trim();
    if (!title || !content) return;
    if (sharedMode) {
      if (!can('documents.manage_templates')) { notify('No tienes permiso para guardar formatos.'); return; }
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
    const imageUseRaw=String(form.get('imageUseAuthorized')||'');
    const imageUseAuthorized=imageUseRaw==='true'?true:imageUseRaw==='false'?false:null;
    if(/imagen/i.test(document)&&imageUseAuthorized===null){notify('Registra si la persona autoriza o no el uso de su imagen.');return;}
    if (!templateId) { notify('Elige un formato.'); return; }
    if (!template?.content?.trim()) {
      notify('Agrega el texto oficial aprobado por la clínica antes de preparar una solicitud.');
      return;
    }
    if (sharedMode) {
      if (!can('documents.create')) { notify('No tienes permiso para preparar documentos clínicos.'); return; }
      try {
        const service = String(form.get('service') || '').trim();
        const result = await createPatientDirectoryStore().createPatientDocument(sharedDirectory.clinicId, patientRecord, { kind: 'consent', template, imageUseAuthorized, service: service || null });
        const consentRecord = { id: result.id, title: result.title || document, type: template.type || 'Consentimiento informado', templateVersion: String(result.templateVersion || ''), createdByLabel: result.createdByLabel, contentSnapshot: result.contentSnapshot, service: service || '', imageUseAuthorized: result.imageUseAuthorized ?? imageUseAuthorized, status: 'Pendiente', requestedAt: result.requestedAt || requestedAt, signedAt: null };
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
    const consentRecord = { id: `consent-${Date.now()}`, title: document, type: template.type || 'Consentimiento informado', templateVersion: String(template.version || '').match(/\d+(?:\.\d+)?/)?.[0] || '', createdByLabel: 'Equipo clínico · demostración', contentSnapshot: template.content, service: String(form.get('service') || ''), imageUseAuthorized, status: 'Pendiente', requestedAt, signedAt: null };
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
      if (!can('documents.create')) { notify('No tienes permiso para preparar contratos.'); return; }
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
      returnToPatientRecord();
      notify('El diagnóstico no tuvo cambios; no se creó una versión duplicada.');
      return;
    }
    if (sharedMode) {
      if (!can('clinical.edit')) { notify('No tienes permiso para aceptar diagnósticos.'); return; }
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
    if (returnTo === 'patient') patientRecordReturnTab.current = patientRecordTab;
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
    if (returnTo === 'patient') patientRecordReturnTab.current = patientRecordTab;
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
    { section: 'PRINCIPAL', links: [{ id: 'overview', label: 'Resumen', icon: LayoutDashboard }, { id: 'agenda', label: 'Agenda', icon: CalendarDays, count: String(workspaceAppointments.filter(a => !a.date || a.date === agendaDate).length) }, { id: 'patients', label: 'Pacientes', icon: UsersRound }] },
    { section: 'OPERACIÓN', links: [{ id: 'payments', label: 'Pagos', icon: DollarSign }, { id: 'recall', label: 'Seguimiento', icon: Activity, count: String(buildPatientRecallQueue(workspacePatients, workspaceAppointments, recallPackages, clinicTimeZone).length) }, { id: 'reminders', label: 'Recordatorios', icon: Bell }, ...(can('whatsapp.view') ? [{ id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }, { id: 'messages', label: 'Instagram y Messenger', icon: AtSign }] : [])] },
    { section: 'GESTIÓN CLÍNICA', links: [{ id: 'consents', label: 'Consentimientos', icon: FileCheck2, count: String(workspacePatients.filter(p => p.consent === 'Pendiente').length) }, { id: 'contracts', label: 'Contratos', icon: FileText }, { id: 'team', label: 'Equipo y sucursales', icon: UserRound }] },
  ];

  if (isStandaloneRoute) return <>{children}</>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen?'mobile-open':''}`}>
      <span className="zone-corner zone-corner-tl" aria-hidden="true"/>
      <span className="zone-corner zone-corner-tr" aria-hidden="true"/>
      <BrandSwitch theme={theme}/>
      <div className="workspace-switcher" ref={workspaceSwitcherRef}>
        {canSwitchWorkspace
          ? <button type="button" className="workspace-chip workspace-chip-button" title="Cambiar clínica y área" aria-label={`Selección actual: ${workspaceLabel}. Cambiar clínica y área`} aria-haspopup="menu" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen(open => !open)}><span className="online-dot"/><span>{workspaceLabel}</span><ChevronDown size={14}/></button>
          : <div className="workspace-chip" title={activeClinicName}><span className="online-dot"/><span>{activeClinicName}</span></div>}
        {canSwitchWorkspace && workspaceMenuOpen && <div className="workspace-menu" role="menu" aria-label="Cambiar clínica y área">
          <button type="button" role="menuitemradio" aria-checked={!activeWorkspaceSelection.businessId} className={!activeWorkspaceSelection.businessId ? 'is-active' : ''} onClick={() => chooseWorkspace()}><span>Todas las clínicas</span>{!activeWorkspaceSelection.businessId && <Check size={15}/>}</button>
          {workspaceGroups.map(business => <div className="workspace-menu-group" role="group" aria-label={business.name} key={business.id}>
            <button type="button" role="menuitemradio" aria-checked={activeWorkspaceSelection.businessId === business.id && !activeWorkspaceSelection.branchId} className={activeWorkspaceSelection.businessId === business.id && !activeWorkspaceSelection.branchId ? 'is-active' : ''} onClick={() => chooseWorkspace(business.id)}><span>{business.name}</span>{activeWorkspaceSelection.businessId === business.id && !activeWorkspaceSelection.branchId && <Check size={15}/>}</button>
            {business.branches.map(branch => <button type="button" role="menuitemradio" aria-checked={activeWorkspaceSelection.branchId === branch.id} className={`workspace-menu-area ${activeWorkspaceSelection.branchId === branch.id ? 'is-active' : ''}`} key={branch.id} onClick={() => chooseWorkspace(business.id, branch.id)}><span>{branch.name.split(/\s*[-–]\s*/)[0]}</span>{activeWorkspaceSelection.branchId === branch.id && <Check size={15}/>}</button>)}
          </div>)}
        </div>}
      </div>
      <nav className="side-nav">{nav.map(group=><div className="nav-group" key={group.section}><div className="nav-caption">{group.section}</div>{group.links.map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}><item.icon size={17}/><span>{item.label}</span>{item.count&&<span className="nav-count">{item.count}</span>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><span className="sidebar-above-flora sidebar-above-flora-left" aria-hidden="true"/><span className="sidebar-above-flora sidebar-above-flora-right" aria-hidden="true"/><div className="profile-row"><span className="profile-mini profile-mini-tl" aria-hidden="true"/><span className="profile-mini profile-mini-br" aria-hidden="true"/><button type="button" className="profile-identity" onClick={()=>setPage('profile')} aria-label="Abrir mi perfil"><Avatar initials={profileInitials(displayUserName)} tone="navy" imageUrl={userProfile.avatarUrl}/></button><span className="profile-copy"><button type="button" className="profile-name" onClick={()=>setPage('profile')}><strong>{profileLoaded?displayUserName:'Cargando perfil…'}</strong></button><button type="button" className="profile-logout" onClick={()=>setModal('confirm-logout')}>Cerrar sesión</button></span><button type="button" className={`profile-settings ${page==='settings'?'active':''}`} onClick={()=>setPage('settings')} aria-label="Configuración"><Settings size={20} strokeWidth={2.25}/></button></div></div>
    </aside>
    {mobileNavOpen&&<button className="mobile-nav-backdrop" aria-label="Cerrar navegación" onClick={()=>setMobileNavOpen(false)}/>}
    <main className="main-shell">
      <span className="canvas-corner canvas-corner-tl" aria-hidden="true"/>
      <span className="canvas-corner canvas-corner-tr" aria-hidden="true"/>
      <span className="canvas-corner canvas-corner-bl" aria-hidden="true"/>
      <span className="canvas-corner canvas-corner-br" aria-hidden="true"/>
      <header className="topbar"><span className="bar-corner bar-corner-left" aria-hidden="true"/><span className="bar-field" aria-hidden="true"/><span className="bar-corner bar-corner-right" aria-hidden="true"/><button className="mobile-menu-button" aria-label="Abrir navegación" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(open=>!open)}><Menu size={18}/></button><div className="breadcrumbs"><span>{activeClinicName}</span><ChevronRight size={14}/><strong>{({overview:'Resumen',agenda:'Agenda',payments:'Pagos',recall:'Seguimiento',reminders:'Recordatorios',whatsapp:'WhatsApp',messages:'Instagram y Messenger',patients:'Pacientes',consents:'Consentimientos',contracts:'Contratos',team:'Equipo y sucursales',settings:'Configuración',profile:'Mi perfil'})[page]}</strong></div><div className="topbar-actions"><button className="search-shortcut" onClick={openPatientSearch}><Search size={15}/><span>Buscar</span></button><span className="topbar-divider"/><IconButton className="theme-toggle-button" aria-label={theme==='dark'?'Activar modo claro':'Activar modo oscuro'} aria-pressed={theme==='dark'} title={theme==='dark'?'Cambiar a modo claro':'Cambiar a modo oscuro'} onClick={()=>setTheme(current=>current==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</IconButton><IconButton className="mobile-install-button" type="button" aria-label="Instalar app para Android" title="Instalar app para Android" onClick={()=>setModal('install-app')}><Smartphone size={18}/></IconButton><NotificationCenter key={notificationScope} {...notificationFeed}/><button type="button" className="topbar-profile-button" aria-label="Abrir mi perfil" onClick={()=>setPage('profile')}><Avatar initials={profileInitials(displayUserName)} tone="navy" imageUrl={userProfile.avatarUrl}/></button></div>{sharedPageStatus === 'loading' && <div className="clinic-loading-track" role="progressbar" aria-label="Cargando datos de la clínica" />}</header>
    <div className="content-area">
        {!sharedMode && <div className="demo-storage-banner" role="status"><ShieldCheck size={15}/> Modo de demostración: usa solo datos ficticios. Los cambios se guardan en este navegador; no es un sistema seguro para información real de pacientes. Conecta el proyecto Supabase de la clínica antes de usarlo en operación.</div>}
        {sharedMode && <SharedDataStatus status={sharedPageStatus} memberships={sharedDirectory.memberships} chooseClinic={sharedDirectory.chooseClinic} retry={sharedPageRetry}/>}
        <div className="shared-page-content" aria-busy={sharedMode && page !== 'profile' && sharedPageStatus === 'loading'} inert={sharedMode && page !== 'profile' && sharedPageStatus !== 'ready'}>
        {page==='overview' && <Overview userName={displayUserName} canCreateAppointment={can('agenda.create')} timeZone={clinicTimeZone} patients={workspacePatients} appointments={workspaceAppointments} payments={workspacePayments} setPage={setPage} notify={notify} onNewAppointment={openNewAppointment} onOpenPatient={patient=>{setSelectedPatient(patient);setPatientRecordTab('overview');setModalReturn(null);setModal('patient')}}/>}
        {page==='patients' && <PatientsPage key={`${activeWorkspaceSelection.businessId}:${activeWorkspaceSelection.branchId}`} patients={filteredPatients} allPatients={workspacePatients} query={query} setQuery={setQuery} searchRef={patientSearchRef} setModal={setModal} canCreatePatient={can('patients.create')} sharedMode={sharedMode} onOpen={p=>{setSelectedPatient(p);setPatientRecordTab('overview');setModalReturn(null);setModal('patient')}}/>}
        {!sharedMode&&page==='agenda' && <AgendaPage allProviders={providers.filter(provider=>provider.active)} allAppointments={appointments} clinicId={sharedDirectory.clinicId} currentAccountProviderId={providers.find(provider=>provider.userId&&provider.userId===userProfile.userId)?.id||''} accountReady={profileLoaded&&sharedDirectory.status==='ready'} listEnd={agendaListEnd} setListEnd={setAgendaListEnd} timeZone={clinicTimeZone} appointments={filteredAppointments} payments={workspacePayments} providerFilter={providerFilter} setProviderFilter={setProviderFilter} providerOptions={providerOptions} branchFilter={branchFilter} setBranchFilter={updateAgendaBranchFilter} branchOptions={branchOptions} businessFilter={businessFilter} setBusinessFilter={updateAgendaBusinessFilter} businessOptions={businessOptions} period={period} setPeriod={setPeriod} onNewAppointment={openNewAppointment} canCreateAppointment onEditAppointment onCancelAppointment notify={notify} agendaDate={agendaDate} setAgendaDate={setAgendaDate} onOpenAppointment={appointment=>{setSelectedAppointment(appointment);setModal('appointment')}}/>}
        {sharedMode&&page==='agenda'&&<AgendaPage allProviders={providers.filter(provider=>provider.active)} allAppointments={appointments} clinicId={sharedDirectory.clinicId} currentAccountProviderId={providers.find(provider=>provider.userId&&provider.userId===userProfile.userId)?.id||''} accountReady={profileLoaded&&sharedDirectory.status==='ready'} listEnd={agendaListEnd} setListEnd={setAgendaListEnd} timeZone={clinicTimeZone} appointments={filteredAppointments} payments={[]} sharedMode providerFilter={providerFilter} setProviderFilter={setProviderFilter} providerOptions={providerOptions} branchFilter={branchFilter} setBranchFilter={updateAgendaBranchFilter} branchOptions={branchOptions} businessFilter={businessFilter} setBusinessFilter={updateAgendaBusinessFilter} businessOptions={businessOptions} period={period} setPeriod={setPeriod} onNewAppointment={openNewAppointment} canCreateAppointment={can('agenda.create')} canEditAppointment={can('agenda.edit')} canCancelAppointment={can('agenda.cancel')} notify={notify} agendaDate={agendaDate} setAgendaDate={setAgendaDate} onOpenAppointment={appointment=>{setSelectedAppointment(appointment);setModal('appointment')}}/>}
        {page==='payments' && <FinanceWorkspace expenses={<ClinicExpenseLedger clinicId={sharedDirectory.clinicId} sharedMode={sharedMode}
          timeZone={clinicTimeZone} canWrite={can('payments.create')} payments={payments} paymentsReady={!sharedMode || sharedPaymentWorkspace.status==='ready'}
          demoBills={demoBills} demoExpenses={demoExpenses}
          onDemoBill={saved=>setDemoBills(rows=>[saved,...rows.filter(item=>item.id!==saved.id)])}
          onDemoExpense={saved=>setDemoExpenses(rows=>[saved,...rows.filter(item=>item.id!==saved.id)])}/>}>
          <PaymentsPage sharedMode={sharedMode} payments={workspacePayments} appointments={sharedMode ? workspacePaymentAppointments : workspaceAppointments}
            patients={sharedMode ? workspacePaymentPatients : workspacePatients} onNewPayment={()=>openPaymentModal()} canCreatePayment={can('payments.create')}/>
        </FinanceWorkspace>}
        {!sharedMode&&page==='reminders'&&<RemindersPage reminders={workspaceReminders}/>}
        {sharedMode&&page==='reminders'&&<RemindersPage sharedMode reminders={workspaceReminders}/>}
        {page==='recall'&&<PatientRecallPage patients={workspacePatients} appointments={workspaceAppointments} packages={recallPackages} packageStatus={sharedMode ? sharedRecallPackageState.status : 'ready'} timeZone={clinicTimeZone} onRetryPackages={()=>setSharedRecallReload(value=>value+1)} onOpenPatient={patient=>{setSelectedPatient(patient);setPatientRecordTab('overview');setModalReturn(null);setModal('patient')}} onNewAppointment={(patient,purchase)=>openNewAppointment(agendaDate,'17:00',patient.id,'',purchase?.id||'',purchase?.serviceId||'',purchase?.serviceName||'')}/>}
      {page==='consents'&&<ConsentsPage patients={workspacePatients} services={serviceCatalog} templates={consentTemplatesForPage} notify={notify} onPrepareConsent={template=>openConsentPreparation('',null,template?.id||template?.title||'')} onNewTemplate={()=>openConsentTemplateCreation()} onEditTemplate={template=>openConsentTemplateCreation(null, template)} onRenameTemplate={renameConsentTemplate} onArchiveTemplate={archiveConsentTemplate} onLinkTemplate={linkConsentToRecord} sharedMode={sharedMode} canPrepare={can('documents.create')} canManageTemplates={can('documents.manage_templates')}/>}
        {page==='contracts'&&<ContractsPage patients={workspacePatients} templates={contractTemplatesForPage} setModal={setModal} notify={notify} onOpenDocument={openPatientDocument} onNewContract={()=>openContractPreparation()} onNewTemplate={()=>openContractTemplateCreation()} sharedMode={sharedMode} canPrepare={can('documents.create')} canManageTemplates={can('documents.manage_templates')}/>}
        {!sharedMode&&page==='team' && <TeamPage businesses={businesses} branches={branches} providers={providers} setModal={setModal} notify={notify} onEditBranch={branch=>{setSelectedBranchRecord(branch);setModal('edit-branch')}} onEditProvider={provider=>{setSelectedProvider(provider);setModal('edit-provider')}}/>}
        {sharedMode&&page==='team'&&<><TeamPage sharedMode clinicId={sharedDirectory.clinicId} businesses={businesses} branches={branches} providers={providers} setModal={setModal} notify={notify} onEditBranch={branch=>{setSelectedBranchRecord(branch);setModal('edit-branch')}} onEditProvider={provider=>{setSelectedProvider(provider);setModal('edit-provider')}} canManageBusinesses={can('team.manage_branches')} canManageProviders={can('team.manage_professionals')}/>{sharedDirectory.role==='admin'&&<ClinicAccessManager clinicId={sharedDirectory.clinicId}/>}</>}
        {page==='whatsapp'&&<WhatsAppInbox sharedMode={sharedMode} clinicId={sharedDirectory.clinicId} role={sharedDirectory.role} permissions={sharedDirectory.permissions}/>}
        {page==='messages'&&<SocialInbox/>}
        {page==='settings'&&<SettingsPage currentUserId={userProfile.userId} publicBranches={branches} publicProviders={providers} services={serviceCatalog} promotionData={promotionData} onSavePromotion={saveClinicPromotion} patients={patients} onRequestApproved={sharedDirectory.refresh} clinicName={activeClinicName} sharedMode={sharedMode} clinicId={sharedDirectory.clinicId} role={sharedDirectory.role} permissions={sharedDirectory.permissions} branches={workspaceBranches} providers={workspaceProviders} timeZone={sharedDirectory.timeZone} onCatalogChange={setServiceCatalog} onSaveClinicName={saveClinicName}/>}
        {page==='profile'&&<ProfilePage profile={{...userProfile,name:displayUserName}} clinicName={activeClinicName} memberships={sharedDirectory.memberships} clinicId={sharedDirectory.clinicId} onSelectClinic={sharedDirectory.chooseClinic} sharedMode={sharedMode} onProfileChange={setUserProfile} notify={notify}/>}
        </div>
        <footer className="clinic-footer"><span>Elixir Clinic ©</span> · Solución digital by <a href="https://mkzsolutions.com.mx" target="_blank" rel="noreferrer">MKZ Solutions</a></footer>
      </div>
    </main>
    {modal==='install-app' && <Modal className="mobile-install-modal" title="Instalar Elixir Clinic para Android" subtitle="Escanea el código con tu teléfono o copia el enlace." close={()=>setModal(null)}><MobileInstallLink /></Modal>}
    {modal==='confirm-logout'&&<Modal title="Cerrar sesión" subtitle="¿Quieres salir de tu cuenta en este dispositivo?" close={()=>setModal(null)}><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><form action={async formData=>{await unlinkPushOnSignOut(formData);await signOut(formData)}}><button type="submit" className="button primary">Cerrar sesión</button></form></div></Modal>}
    {modal==='patient' && selectedPatient && <PatientModal patient={selectedPatient} activeRecordTab={patientRecordTab} setActiveRecordTab={setPatientRecordTab} clinicalBackground={sharedMode?selectedPatient.clinicalBackground:demoClinicalBackgrounds.find(item=>item.patientId===selectedPatient.id)||selectedPatient.clinicalBackground} packagePanel={<PatientPackagePanel key={selectedPatient.id} patient={selectedPatient} clinicId={sharedDirectory.clinicId} sharedMode={sharedMode} timeZone={clinicTimeZone} canCreate={can('payments.create')} services={serviceCatalog} promotions={promotionData.rows} demoPurchases={demoPackages} appointments={demoAppointments} payments={demoPayments} onDemoPurchase={purchase=>setDemoPackages(items=>[purchase,...items.filter(item=>item.id!==purchase.id)])}/>} appointments={workspaceAppointments} activities={workspacePatientActivities.filter(activity=>activity.patientId===selectedPatient.id)} clinicalHistory={sharedMode?(selectedPatient.clinicalHistory||[]):demoClinicalHistory.filter(item=>item.patientId===selectedPatient.id)} botoxTreatments={sharedMode?(selectedPatient.botoxTreatments||[]):demoBotoxTreatments.filter(item=>item.patientId===selectedPatient.id)} procedures={sharedMode?(selectedPatient.procedures||[]):demoProcedures.filter(item=>item.patientId===selectedPatient.id)} recordFiles={sharedMode?(selectedPatient.recordFiles||[]):demoRecordFiles.filter(item=>item.patientId===selectedPatient.id)} onSaveSessionMedia={saveSessionMedia} resolvePatientFileUrl={resolvePatientFileUrl} sharedMode={sharedMode} canEditPatient={can('patients.edit')} canDiagnose={can('clinical.edit')} canWriteClinical={can('clinical.create')} canPrepareContract={can('documents.create')} canPrepareConsent={can('documents.create')} canCreateAppointment={can('agenda.create')} close={()=>setModal(null)} notify={notify} onAddActivity={()=>openPatientRecordModal('new-patient-activity')} onClinicalBackground={()=>openPatientRecordModal('patient-clinical-background')} onNewEncounter={()=>openPatientRecordModal('new-clinical-encounter')} onNewBotoxTreatment={()=>openPatientRecordModal('new-botox-treatment')} onNewProcedure={()=>openProcedure(null)} onEditProcedure={openProcedure} onDeleteProcedure={deleteProcedure} procedurePending={procedurePending} onAddRecordFile={()=>openPatientRecordModal('new-patient-file')} onOpenRecordFile={openPatientFile} onEdit={()=>openPatientRecordModal('edit-patient')} onDiagnosis={()=>openPatientRecordModal('diagnosis')} onNewAppointment={()=>openNewAppointment(agendaDate,'17:00',selectedPatient.id)} onPrepareContract={()=>openContractPreparation(selectedPatient.id,'patient')} onPrepareConsent={()=>openConsentPreparation(selectedPatient.id,'patient','',[...(selectedPatient.consentHistory||[])].reverse().find(record=>record.status!=='Reemplazado'&&record.service)?.service||'')} onOpenContract={()=>openPatientDocument(selectedPatient,'contract','patient')} onOpenConsent={()=>openPatientDocument(selectedPatient,'consent','patient')} onOpenDocumentRecord={record=>openPatientDocumentRecord(selectedPatient,record,'patient')}/>}
    <dialog ref={procedureDeletionDialog} className="point-removal-dialog" aria-labelledby="procedure-delete-title"
      aria-describedby="procedure-delete-description" onClose={() => setPendingProcedureDeletion(null)}>
      <div className="point-removal-heading">
        <span aria-hidden="true"><Trash2 size={17}/></span>
        <h3 id="procedure-delete-title">¿Eliminar procedimiento?</h3>
      </div>
      <p id="procedure-delete-description">Se eliminará {pendingProcedureDeletion?.record.procedureType || 'este procedimiento'} y su nota del expediente. Esta acción no se puede deshacer.</p>
      <div className="point-removal-actions">
        <button ref={cancelProcedureDeletion} type="button" className="button outline" onClick={() => procedureDeletionDialog.current?.close()}>Cancelar</button>
        <button type="button" className="button point-removal-confirm" onClick={() => {
          procedureDeletionDialog.current?.close();
          void confirmProcedureDeletion();
        }}>Eliminar procedimiento</button>
      </div>
    </dialog>
    {modal==='appointment' && selectedAppointment && <AppointmentModal serviceCatalog={serviceCatalog} timeZone={clinicTimeZone} onRecordArrival={recordAppointmentArrival} sharedMode={sharedMode} canEditAppointment={can('agenda.edit')} canCancelAppointment={can('agenda.cancel')} canCreatePayment={can('payments.create')} canManagePayments={!sharedMode||can('payments.create')} paymentDataReady={!sharedMode||sharedPaymentWorkspace.status==='ready'} appointment={selectedAppointment} businesses={workspaceBusinesses} branches={workspaceBranches} providers={workspaceProviders} payments={workspacePayments.filter(payment=>payment.appointmentId===selectedAppointment.id)} close={()=>{setModal(null);setSelectedAppointment(null)}} onSubmit={updateAppointment} onCancelAppointment={()=>cancelAppointment(selectedAppointment)} onOpenPatient={openPatientFromAppointment} onAddPayment={()=>openPaymentModal(selectedAppointment.id)}/>}
    {modal==='new-payment' && <PaymentModal sharedMode={sharedMode} clinicId={sharedDirectory.clinicId} demoPurchases={demoPackages} demoAppointments={demoAppointments} demoPayments={demoPayments} close={()=>{setModal(modalReturn==='appointment'?'appointment':null);setModalReturn(null)}} onSubmit={createPayment} canRefund={can('payments.refund')} defaultDate={paymentDefaults.date} defaultAppointmentId={paymentDefaults.appointmentId} patients={workspacePaymentPatients} appointments={selectedAppointment?[...workspacePaymentAppointments.filter(item=>item.id!==selectedAppointment.id),selectedAppointment]:workspacePaymentAppointments} payments={workspacePayments}/>}
    {modal==='new-patient-activity' && selectedPatient && <Modal title="Registrar seguimiento" subtitle={`${selectedPatient.name} · Expediente ${selectedPatient.id}`} close={returnToPatientRecord}><form onSubmit={addPatientActivity} className="form-stack"><input type="hidden" name="patientId" value={selectedPatient.id}/><label>Tipo de actividad<select name="type" defaultValue="Seguimiento"><option>Seguimiento</option><option>Llamada</option><option>Mensaje</option><option>Administrativa</option><option>Otro</option></select></label><label>Nota<textarea name="note" rows="4" maxLength="1000" placeholder="Resumen de llamada, acuerdo o pendiente. No agregues datos clínicos sensibles." required autoFocus/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Nota guardada en la base compartida del consultorio.':'Nota interna de demostración, guardada solo en este navegador.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={returnToPatientRecord}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar nota</button></div></form></Modal>}
    {modal==='patient-clinical-background' && selectedPatient && <ClinicalBackgroundModal patient={selectedPatient} clinicalBackground={sharedMode?selectedPatient.clinicalBackground:demoClinicalBackgrounds.find(item=>item.patientId===selectedPatient.id)||selectedPatient.clinicalBackground} sharedMode={sharedMode} close={returnToPatientRecord} onSubmit={savePatientClinicalHistory}/>}
    {modal==='new-clinical-encounter' && selectedPatient && <ClinicalEncounterModal patient={selectedPatient} appointments={workspaceAppointments.filter(item=>item.patientId===selectedPatient.id||item.patient===selectedPatient.name)} sharedMode={sharedMode} close={returnToPatientRecord} onSubmit={addClinicalEncounter}/>}
    {modal==='new-botox-treatment' && selectedPatient && <BotoxTreatmentModal patient={selectedPatient} appointments={workspaceAppointments.filter(item=>item.patientId===selectedPatient.id||item.patient===selectedPatient.name)} sharedMode={sharedMode} close={returnToPatientRecord} onSubmit={addBotoxTreatment}/>}
    {modal==='new-patient-procedure' && selectedPatient && <ProcedureModal patient={selectedPatient} services={serviceCatalog} templates={consentTemplatesForPage} record={editingProcedure} recordFiles={sharedMode?(selectedPatient.recordFiles||[]):demoRecordFiles.filter(item=>item.patientId===selectedPatient.id)} pending={procedurePending} sharedMode={sharedMode} close={returnToPatientRecord} onSubmit={saveProcedure} onSignConsent={signConsentForService}/>}
    {modal==='new-patient-file' && selectedPatient && <PatientFileModal patient={selectedPatient} sharedMode={sharedMode} close={returnToPatientRecord} onSubmit={attachPatientFile}/>}
    {modal==='diagnosis' && selectedPatient && <DiagnosisModal patient={selectedPatient} sharedMode={sharedMode} close={returnToPatientRecord} onAccept={acceptDiagnosis}/>}
    {modal==='contract-prompt' && selectedPatient && <ContractPromptModal patient={selectedPatient} close={returnToPatientRecord} onViewContract={()=>{setSelectedContractRecordId(latestDocumentRecord(selectedPatient,'contract')?.id || '');setModal('contract-view')}} onPrepareContract={()=>openContractPreparation(selectedPatient.id, 'patient')}/>}
    {modal==='contract-view' && selectedPatient && <ContractViewerModal sharedMode={sharedMode} patient={viewedContractPatient || selectedPatient} staffName={displayUserName} staffSignatureUrl={userProfile.signatureUrl} close={()=>modalReturn==='patient'?returnToPatientRecord():setModal(modalReturn || null)} onPrint={()=>{const previous=document.title;document.title=clinicFileStamp(selectedPatient.name);window.print();window.setTimeout(()=>{document.title=previous;},400);}} onDownload={signatures=>downloadClinicDocument({title:selectedContractRecord?.title||selectedPatient.contractTemplateTitle||'Contrato',patientName:selectedPatient.name,fileName:clinicFileStamp(selectedPatient.name),body:fillDocumentPlaceholders(selectedContractRecord?.contentSnapshot||selectedPatient.contractContent||'',selectedPatient),signatures})} onDiagnosis={()=>openPatientRecordModal('diagnosis')} onSign={()=>simulateSignature('contract')} onSaveSignature={file=>saveDocumentSignature('contract',file)} onSaveStaffSignature={saveAccountSignature} onPrepare={()=>openContractPreparation(selectedPatient.id, modalReturn)}/>}
    {modal==='consent-view' && selectedPatient && <ConsentViewerModal sharedMode={sharedMode} patient={selectedPatient} staffName={displayUserName} staffSignatureUrl={userProfile.signatureUrl} document={selectedConsent} content={withPatientWord(fillDocumentPlaceholders(selectedConsentRecord?.contentSnapshot ?? '', {...selectedPatient, treatment: selectedConsentRecord?.service || selectedPatient.treatment}))} status={selectedConsentRecord?.status || selectedPatient.consent} signedAt={selectedConsentRecord?.signedAt || null} close={()=>modalReturn==='patient'?returnToPatientRecord():setModal(modalReturn || null)} onPrint={()=>window.print()} onDownload={()=>downloadClinicDocument({title:selectedConsent||'Consentimiento',patientName:selectedPatient.name,body:withPatientWord(fillDocumentPlaceholders(selectedConsentRecord?.contentSnapshot ?? '', selectedPatient))})} onChangeService={()=>openConsentPreparation(selectedPatient.id,'consent-view','',selectedConsentRecord?.service||'')} onSign={()=>simulateSignature('consent')} onSaveSignature={file=>saveDocumentSignature('consent',file)}/>}
    {modal==='new-patient' && <Modal title="Agregar paciente" subtitle="Crea el expediente; el profesional se elige en cada cita." close={()=>setModal(null)}><form onSubmit={addPatient} className="form-stack"><label className="whatsapp-opt-in"><input type="checkbox" name="firstVisit"/> Primera vez</label><label>Nombre completo<input name="name" autoFocus placeholder="Ej. Andrea García" required/></label><div className="form-grid"><label>Correo electrónico<input name="email" type="email" placeholder="correo@ejemplo.com"/></label><label>Teléfono<input name="phone" placeholder="Teléfono de contacto"/></label></div><label>Tratamiento o servicio<input name="treatment" placeholder="Por definir"/></label><label>Sucursal<select name="branchId" defaultValue={activeWorkspaceSelection.branchId || workspaceBranches.find(item=>item.active)?.id || ''}><option value="">Sin asignar</option>{workspaceBranches.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?"Se guardará en el directorio compartido del consultorio.":"Prototipo de demostración: no ingreses datos reales de pacientes."}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary" type="submit"><Plus size={16}/> Crear expediente</button></div></form></Modal>}
    {modal==='edit-patient' && selectedPatient && <Modal title="Editar expediente" subtitle={`${selectedPatient.id} · Actualiza sus datos de contacto y atención.`} close={returnToPatientRecord}><form onSubmit={updatePatient} className="form-stack"><input type="hidden" name="id" value={selectedPatient.id}/><label>Nombre completo<input name="name" defaultValue={selectedPatient.name} autoFocus required/></label><div className="form-grid"><label>Correo electrónico<input name="email" type="email" defaultValue={selectedPatient.email||''} placeholder="correo@ejemplo.com"/></label><label>Teléfono<input name="phone" defaultValue={selectedPatient.phone||''} placeholder="Teléfono de contacto"/></label></div><label>Tratamiento o servicio<input name="treatment" defaultValue={selectedPatient.treatment||''} placeholder="Por definir"/></label><div className="form-grid"><label>Sucursal<select name="branchId" defaultValue={workspaceBranches.find(item=>item.name===selectedPatient.branch)?.id||selectedPatient.branchId||''}><option value="">Sin asignar</option>{workspaceBranches.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Profesional de referencia<select name="providerId" defaultValue={workspaceProviders.find(item=>item.name===selectedPatient.clinician)?.id||selectedPatient.providerId||''}><option value="">Sin asignar</option>{workspaceProviders.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="form-note"><ShieldCheck size={15}/> Este profesional solo se sugiere al agendar; cada cita puede tener otro.</div><label>Estado<select name="status" defaultValue={selectedPatient.status}><option>Activo</option><option>Seguimiento</option><option>Nuevo</option><option>Inactivo</option></select></label><label className="whatsapp-opt-in"><input type="checkbox" name="whatsappOptIn" defaultChecked={Boolean(selectedPatient.whatsappOptIn)}/> Autoriza avisos de citas por WhatsApp</label><label>Origen de la autorización<select name="whatsappOptInSource" defaultValue={selectedPatient.whatsappOptInSource||''}><option value="">Seleccionar si autoriza…</option><option value="written">Consentimiento escrito</option><option value="verbal">Autorización verbal</option><option value="electronic">Consentimiento electrónico</option></select></label><div className="form-note"><ShieldCheck size={15}/> Registra solo una autorización ya otorgada por el paciente. Esto no envía mensajes.</div><div className="form-note"><ShieldCheck size={15}/> {sharedMode?"Cambios guardados en el directorio compartido.":"Datos guardados solo en este navegador de demostración."}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={returnToPatientRecord}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar cambios</button></div></form></Modal>}    {modal==='new-appointment' && <NewAppointmentModal serviceCatalog={serviceCatalog} promotions={promotionData.rows} sharedMode={sharedMode} clinicId={sharedDirectory.clinicId} timeZone={clinicTimeZone} historyAppointments={demoAppointments} demoPurchases={demoPackages} demoPayments={demoPayments} canCreatePatient={can('patients.create')} onCreatePatient={createAppointmentPatient} close={()=>setModal(null)} onSubmit={createAppointment} defaultDate={appointmentDefaults.date} defaultTime={appointmentDefaults.time} defaultPatientId={appointmentDefaults.patientId} defaultProviderId={appointmentDefaults.providerId} defaultPackageId={appointmentDefaults.packageId} defaultServiceId={appointmentDefaults.serviceId} defaultServiceName={appointmentDefaults.serviceName} defaultDuration={appointmentDefaults.availability?.duration} defaultBusinessId={activeWorkspaceSelection.businessId} defaultBranchId={appointmentDefaults.availability?.branchId || activeWorkspaceSelection.branchId} patients={workspacePatients} businesses={workspaceBusinesses} branches={workspaceBranches} providers={workspaceProviders} appointments={workspaceAppointments}/>}
    {modal==='new-business' && <Modal title="Agregar negocio" subtitle="Crea un negocio para organizar sus sucursales y agenda." close={()=>setModal(null)}><form className="form-stack" onSubmit={createBusiness}><label>Nombre del negocio<input name="name" placeholder={sharedMode?'Nombre del negocio':'Nombre de demostración'} required autoFocus/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Se guardará en el catálogo compartido.':'Solo se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary"><Plus size={15}/> Agregar negocio</button></div></form></Modal>}
    {modal==='new-branch' && <Modal title="Agregar sucursal" subtitle="Asigna la nueva ubicación a uno de tus negocios." close={()=>setModal(null)}><form className="form-stack" onSubmit={createBranch}><label>Negocio<select name="businessId" required defaultValue=""><option value="" disabled>Seleccionar negocio…</option>{businesses.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nombre de sucursal<input name="name" placeholder={sharedMode?'Nombre de sucursal':'Nombre de demostración'} required/></label><label>Dirección<input name="address" placeholder={sharedMode?'Dirección de la sucursal':'Dirección de demostración'}/></label><label>Teléfono<input name="phone" placeholder="686 308 6854"/></label><label>Horario de atención<input name="hours" placeholder="Lunes a sábados, 9:00 a.m. a 7:00 p.m."/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Se guardará en el catálogo compartido.':'Solo se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="button primary" type="submit" disabled={!businesses.some(item=>item.active)}><Plus size={15}/> Agregar sucursal</button></div></form></Modal>}
    {modal==='edit-branch' && selectedBranchRecord && <Modal title="Editar sucursal" subtitle={`${businesses.find(item=>item.id===selectedBranchRecord.businessId)?.name||'Negocio'} · La sucursal seguirá asociada a este negocio.`} close={()=>{setModal(null);setSelectedBranchRecord(null)}}><form className="form-stack" onSubmit={updateBranch}><label>Nombre de sucursal<input name="name" defaultValue={selectedBranchRecord.name} required autoFocus/></label><label>Dirección<input name="address" defaultValue={selectedBranchRecord.address||''} placeholder="Dirección de la sucursal"/></label><label>Teléfono<input name="phone" defaultValue={selectedBranchRecord.phone||''} placeholder="686 308 6854"/></label><label>Horario de atención<input name="hours" defaultValue={selectedBranchRecord.hours||''} placeholder="Lunes a sábados, 9:00 a.m. a 7:00 p.m."/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'El cambio se guarda en el catálogo compartido.':'El cambio se guarda en este navegador de demostración.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>{setModal(null);setSelectedBranchRecord(null)}}>Cancelar</button><button className="button primary"><Check size={15}/> Guardar cambios</button></div></form></Modal>}
    {(modal==='new-provider'||modal==='edit-provider') && <ProfessionalEditor key={`${sharedDirectory.clinicId || 'demo'}:${modal}:${selectedProvider?.id || 'new'}`} Modal={Modal} provider={modal==='edit-provider'?selectedProvider:null} providers={providers} branches={branches} sharedMode={sharedMode} clinicId={sharedDirectory.clinicId} onSave={saveProfessional} onSelectExisting={provider=>{setSelectedProvider(provider);setModal('edit-provider')}} close={()=>{setModal(null);setSelectedProvider(null)}}/>}
    {modal==='new-consent-template' && <Modal className="consent-editor-modal" title={consentTemplateDraft?'Editar formato':'Crear formato de consentimiento'} subtitle={consentTemplateDraft?'Los documentos ya preparados conservan su copia. Lo que ves aquí es el texto guardado del formato.':'Agrega el texto oficial que proporcione y valide la clínica.'} close={closeConsentTemplateCreation}><form className="form-stack" onSubmit={createConsentTemplate}><label>Nombre del formato<input name="title" defaultValue={consentTemplateDraft?.title||''} placeholder="Ej. Consentimiento para tratamiento" required autoFocus/></label><label>Tipo<select name="type" defaultValue={consentTemplateDraft?.type||'Documento clínico'}><option>Documento clínico</option><option>Protección de datos</option><option>Autorización</option></select></label><label>Contenido del documento<textarea className="consent-editor-paper" name="content" defaultValue={consentTemplateDraft?.content||''} rows="14" placeholder="Pega aquí el texto revisado por la clínica. Usa {{paciente}}, {{fecha}} y {{tratamiento}} donde deba completarse después." required/></label>{consentTemplateDraft&&<div className="form-note"><ShieldCheck size={15}/> Si aparece un nombre como “Ian Ramirez Tamayo”, está escrito dentro del formato. No se eligió un expediente. Cámbialo por {'{{paciente}}'} si debe llenarse al preparar el documento.</div>}<div className="form-note"><ShieldCheck size={15}/> {sharedMode?'El formato se comparte con el equipo clínico y queda versionado.':'El formato queda guardado solo en este navegador.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={closeConsentTemplateCreation}>Cancelar</button><button className="button primary" disabled={!can('documents.manage_templates')}><Plus size={15}/> {consentTemplateDraft?'Guardar cambios':'Guardar formato'}</button></div></form></Modal>}
    {modal==='send-consent' && <Modal title="Servicio" subtitle="Elige el servicio. Si tiene un consentimiento vinculado, se marca solo y puedes cambiarlo." close={closeConsentPreparation}><form className="form-stack" onSubmit={prepareConsent}><label>Paciente<SearchablePatientSelect patients={patients} defaultValue={consentDefaults.patientId}/></label><ConsentServiceAndFormat services={serviceCatalog} templates={consentTemplatesForPage} defaultTemplateId={consentDefaults.templateId} defaultService={consentDefaults.service}/><label>Si es un consentimiento de uso de imagen, registra la decisión<select name="imageUseAuthorized" defaultValue=""><option value="">Sin decisión / no aplica</option><option value="true">Sí autoriza el uso de imagen</option><option value="false">No autoriza el uso de imagen</option></select></label>{!consentTemplatesForPage.some(template=>template.content?.trim())&&<div className="form-note"><FileText size={15}/> No hay formatos con texto oficial. Agrega el documento validado por la clínica antes de solicitar una firma. <button type="button" className="text-link" onClick={()=>openConsentTemplateCreation('send-consent')}>Crear formato</button></div>}<div className="form-note"><ShieldCheck size={15}/> El contenido se guarda como copia inmutable en el expediente; no se envía para firma.</div><div className="modal-actions"><button type="button" className="button secondary" onClick={closeConsentPreparation}>Cancelar</button><button className="button primary" disabled={!consentTemplatesForPage.some(template=>template.content?.trim())||!can('documents.create')}><FileCheck2 size={16}/> Preparar documento</button></div></form></Modal>}
    {modal==='new-contract-template' && <Modal title="Crear formato de contrato" subtitle="Agrega el texto oficial que proporcione y valide la clínica." close={closeContractTemplateCreation}><form className="form-stack" onSubmit={createContractTemplate}><label>Nombre del formato<input name="title" placeholder="Ej. Prestación de servicios" required autoFocus/></label><label>Tipo<select name="type"><option>Prestación de servicios</option><option>Plan de tratamiento</option><option>Otro</option></select></label><label>Contenido del contrato<textarea name="content" rows="10" placeholder="Pega el texto oficial revisado por la clínica." required/></label><div className="form-note"><ShieldCheck size={15}/> {sharedMode?'El formato se comparte con el equipo clínico y queda versionado.':'Se guarda localmente. La plantilla no añade ni valida cláusulas legales.'}</div><div className="modal-actions"><button type="button" className="button secondary" onClick={closeContractTemplateCreation}>Cancelar</button><button className="button primary" disabled={!can('documents.manage_templates')}><FilePlus2 size={15}/> Guardar formato</button></div></form></Modal>}
    {modal==='new-contract' && <NewContractModal sharedMode={sharedMode} canPrepare={can('documents.create')} close={closeContractPreparation} onSubmit={prepareContract} onReviewDiagnosis={patientId=>{const patient=patients.find(item=>item.id===patientId);if(patient){setSelectedPatient(patient);setModalReturn('new-contract');setModal('diagnosis')}}} onAddTemplate={()=>openContractTemplateCreation('new-contract')} patients={patients} services={serviceCatalog} templates={contractTemplatesForPage} defaultPatientId={contractDefaults.patientId} canManageTemplates={can('documents.manage_templates')}/>}
    {toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')} aria-label="Cerrar"><X size={15}/></button></div>}
    {children}
  </div>;
}

const settingsSections = [
  {id:'google-calendar',label:'Google Calendar',icon:CalendarDays,title:'Google Calendar',description:'Conecta tu cuenta de Google para sincronizar tus citas.',status:'Disponible'},
  {id:'whatsapp',label:'Notificaciones WhatsApp',icon:Bell,title:'Notificaciones WhatsApp',description:'Asigna números a sucursales y configura avisos internos del CRM.',status:'Configurable'},
  {id:'availability',label:'Disponibilidad',icon:Clock3,title:'Gestión de disponibilidad',description:'Define horarios bloqueados y reglas para citas simultáneas.',status:'Disponible',items:[]},
  {id:'push',label:'Notificaciones Push',icon:Bell,title:'Notificaciones Push',description:'Administra los avisos que recibe el equipo en sus dispositivos.',status:'Disponible',items:[['Nuevas citas','Avisos al equipo cuando se registra una cita.'],['Cambios en la agenda','Notificaciones sobre cancelaciones y cambios de horario.'],['Preferencias por usuario','Cada integrante podrá elegir qué avisos recibe.']]},
  {id:'services',label:'Servicios',icon:Settings2,title:'Catálogo de servicios',description:'Administra tratamientos, duraciones, precios y paquetes de la clínica.',status:'Disponible'},
  {id:'promotions',label:'Promociones',icon:DollarSign,title:'Promociones del mes',description:'Define precios promocionales para sesiones y paquetes con fechas de vigencia.',status:'Disponible'},
  {id:'public-agenda',label:'Agenda Pública',icon:UsersRound,title:'Agenda pública',description:'Configura la página de solicitudes y revisa las citas que piden tus pacientes.',status:'Disponible',items:[['Página de reservas','Configura el enlace público de la clínica.'],['Disponibilidad para pacientes','Elige horarios, profesionales y sucursales visibles.'],['Reglas de reservación','Define anticipación, confirmaciones y datos requeridos.']]},
  {id:'clinic',label:'Clínica',icon:Building2,title:'Perfil de la clínica',description:'Revisa el nombre y la identidad de este espacio.',status:'Disponible'},
];

function profileInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => Array.from(part)[0]?.toLocaleUpperCase('es-MX') || '').join('') || 'U';
}

function SignaturePad({ onSave, onCancel, saving, confirmLabel = 'Firmar', tall = false }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const position = event => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const start = event => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const point = position(event);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#17141a';
    setHasInk(true);
  };
  const draw = event => {
    if (!drawingRef.current) return;
    const point = position(event);
    const context = canvasRef.current.getContext('2d');
    context.lineTo(point.x, point.y);
    context.stroke();
  };
  const stop = () => { drawingRef.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };
  const save = () => {
    if (!hasInk || saving) return;
    canvasRef.current.toBlob(blob => {
      if (blob) onSave(new File([blob], 'firma.png', { type: 'image/png' }));
    }, 'image/png');
  };
  return <div className="signature-pad-wrap">
    <p>Dibuja tu firma en el recuadro. Puedes usar el mouse, el dedo o un lápiz táctil.</p>
    <canvas ref={canvasRef} className="signature-pad" width={tall ? 1400 : 1200} height={tall ? 680 : 360} aria-label="Área para dibujar la firma" onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerCancel={stop}/>
    <div className="signature-pad-actions"><button type="button" className="button secondary" onClick={clear} disabled={!hasInk || saving}>Limpiar</button><span/>{onCancel&&<button type="button" className="button secondary" onClick={onCancel} disabled={saving}>Cancelar</button>}<button type="button" className="button primary" onClick={save} disabled={!hasInk || saving}>{saving?'Guardando…':confirmLabel}</button></div>
  </div>;
}

function ProfilePage({ profile, clinicName, memberships, clinicId, onSelectClinic, sharedMode, onProfileChange, notify }) {
  const signatureInputRef = useRef(null);
  const [form, setForm] = useState(() => ({
    names: profile.metadata?.names || '', firstLastName: profile.metadata?.firstLastName || '',
    secondLastName: profile.metadata?.secondLastName || '', rfc: profile.metadata?.rfc || '',
    phone: profile.metadata?.phone || '', specialty: profile.metadata?.specialty || '',
    university: profile.metadata?.university || '', certificationNumber: profile.metadata?.certificationNumber || '',
    tipoPersonal: profile.metadata?.tipoPersonal || '', specialtyCertificationNumber: profile.metadata?.specialtyCertificationNumber || '',
    curp: profile.metadata?.curp || '', paisNacimiento: profile.metadata?.paisNacimiento || '',
    timezone: profile.metadata?.timezone || 'America/Tijuana', email: profile.email || '', newPassword: '',
  }));
  const [saving, setSaving] = useState(false);
  const [noChangesMessageVisible, setNoChangesMessageVisible] = useState(false);
  const noChangesTimerRef = useRef(null);
  const [error, setError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState('');
  const [signatureModal, setSignatureModal] = useState('');
  const [signaturePreviewError, setSignaturePreviewError] = useState(false);
  const [signatureLoading, setSignatureLoading] = useState(Boolean(sharedMode && profile.signaturePath && !profile.signatureUrl));
  const [additionalOpen, setAdditionalOpen] = useState(true);
  const curpValidationMessage = 'El CURP debe tener exactamente 18 caracteres.';
  const dismissNoChangesMessage = () => {
    window.clearTimeout(noChangesTimerRef.current);
    setNoChangesMessageVisible(false);
  };
  const showNoChangesMessage = () => {
    window.clearTimeout(noChangesTimerRef.current);
    setNoChangesMessageVisible(true);
    noChangesTimerRef.current = window.setTimeout(() => setNoChangesMessageVisible(false), 3200);
  };
  useEffect(() => () => window.clearTimeout(noChangesTimerRef.current), []);
  useEffect(() => {
    if (!sharedMode || !profile.signaturePath) { setSignatureLoading(false); return undefined; }
    let active = true;
    const supabase = createSupabaseBrowserClient();
    setSignatureLoading(true);
    supabase?.storage.from('profile-signatures').createSignedUrl(profile.signaturePath, 3600).then(({ data, error: signedUrlError }) => {
      if (!active) return;
      setSignatureLoading(false);
      if (signedUrlError || !data?.signedUrl) {
        setSignatureError('No se pudo cargar la firma guardada. Recarga el perfil para intentarlo de nuevo.');
      } else if (data.signedUrl !== profile.signatureUrl) {
        onProfileChange({ ...profile, signatureUrl: data.signedUrl });
      }
    }).catch(() => {
      if (active) { setSignatureLoading(false); setSignatureError('No se pudo cargar la firma guardada. Recarga el perfil para intentarlo de nuevo.'); }
    });
    return () => { active = false; };
  }, [sharedMode, profile.signaturePath]);
  useEffect(() => {
    setForm(current => ({ ...current, ...Object.fromEntries(['names','firstLastName','secondLastName','rfc','phone','specialty','university','certificationNumber','timezone','tipoPersonal','specialtyCertificationNumber','curp','paisNacimiento'].map(key => [key, profile.metadata?.[key] || current[key] || ''])), email: profile.email || current.email }));
  }, [profile]);
  const update = event => {
    dismissNoChangesMessage();
    setForm(current => ({ ...current, [event.target.name]: event.target.name === 'curp' ? event.target.value.toLocaleUpperCase('es-MX') : event.target.value }));
  };
  const updateCurp = event => {
    const value = event.currentTarget.value.toLocaleUpperCase('es-MX');
    event.currentTarget.setCustomValidity(!value || value.length === 18 ? '' : curpValidationMessage);
    dismissNoChangesMessage();
    setForm(current => ({ ...current, curp: value }));
  };
  const updateProfilePhoto = async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setPhotoError('');
    const extensionByType = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const extensionByName = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp' };
    const namedExtension = file.name.split('.').pop()?.toLowerCase();
    const extension = extensionByType[file.type.toLowerCase()] || (
      (!file.type || file.type === 'application/octet-stream') ? extensionByName[namedExtension] : ''
    );
    const contentType = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension];
    const maxBytes = (sharedMode ? 5 : 1) * 1024 * 1024;
    if (!extension || !contentType) { setPhotoError('Elige una imagen JPG, PNG o WebP.'); return; }
    if (file.size > maxBytes) { setPhotoError(`La imagen debe pesar menos de ${sharedMode ? '5' : '1'} MB.`); return; }
    setPhotoBusy(true);
    try {
      if (sharedMode) {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) throw new Error('La sesión no está disponible.');
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error('Inicia sesión de nuevo para cambiar la foto de perfil.');
        const user = userData.user;
        if (profile.userId && profile.userId !== user.id) throw new Error('La sesión cambió. Recarga la página e inténtalo de nuevo.');
        const previousPath = typeof profile.metadata?.avatar_path === 'string' ? profile.metadata.avatar_path : '';
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, {
          cacheControl: '31536000',
          contentType,
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message || 'No se pudo subir la foto. Verifica tu conexión e inténtalo otra vez.');
        const metadata = { ...profile.metadata, avatar_path: path };
        const { data: updatedUser, error: metadataError } = await supabase.auth.updateUser({ data: metadata });
        if (metadataError) {
          await supabase.storage.from('profile-avatars').remove([path]);
          throw new Error('La foto se subió, pero no se pudo guardar en tu perfil. Inténtalo de nuevo.');
        }
        const avatarUrl = supabase.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
        onProfileChange({ ...profile, metadata: updatedUser.user?.user_metadata || metadata, avatarPath: path, avatarUrl, userId: user.id });
        if (previousPath.startsWith(`${user.id}/`) && previousPath !== path) {
          await supabase.storage.from('profile-avatars').remove([previousPath]);
        }
      } else {
        const avatarUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la imagen.'));
          reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
          reader.readAsDataURL(file);
        });
        const stored = JSON.parse(window.localStorage.getItem('crm-demo-user-profile-v1') || '{}');
        window.localStorage.setItem('crm-demo-user-profile-v1', JSON.stringify({ ...stored, avatarUrl }));
        onProfileChange({ ...profile, avatarUrl });
      }
      notify('Foto de perfil actualizada.');
    } catch (photoSaveError) {
      setPhotoError(photoSaveError.message || 'No se pudo guardar la foto de perfil.');
    } finally { setPhotoBusy(false); }
  };
  const removeProfilePhoto = async () => {
    if (!profile.avatarUrl) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      if (sharedMode) {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) throw new Error('La sesión no está disponible.');
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error('Inicia sesión de nuevo para cambiar la foto de perfil.');
        const user = userData.user;
        const previousPath = typeof profile.metadata?.avatar_path === 'string' ? profile.metadata.avatar_path : '';
        if (profile.userId && profile.userId !== user.id) throw new Error('La sesión cambió. Recarga la página e inténtalo de nuevo.');
        const metadata = { ...profile.metadata, avatar_path: null };
        const { data: updatedUser, error: metadataError } = await supabase.auth.updateUser({ data: metadata });
        if (metadataError) throw new Error('No se pudo quitar la foto del perfil. Inténtalo de nuevo.');
        onProfileChange({ ...profile, metadata: updatedUser.user?.user_metadata || metadata, avatarPath: '', avatarUrl: '', userId: user.id });
        if (previousPath.startsWith(`${user.id}/`)) {
          await supabase.storage.from('profile-avatars').remove([previousPath]);
        }
      } else {
        const stored = JSON.parse(window.localStorage.getItem('crm-demo-user-profile-v1') || '{}');
        delete stored.avatarUrl;
        window.localStorage.setItem('crm-demo-user-profile-v1', JSON.stringify(stored));
        onProfileChange({ ...profile, avatarUrl: '' });
      }
      notify('Foto de perfil quitada.');
    } catch (photoRemoveError) {
      setPhotoError(photoRemoveError.message || 'No se pudo quitar la foto de perfil.');
    } finally { setPhotoBusy(false); }
  };
  const saveSignatureFile = async file => {
    setSignatureError('');
    const extensionFromName = file.name.split('.').pop()?.toLowerCase();
    const extensionByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
    const extension = extensionByType[file.type] || (['jpg','jpeg','png','gif','webp','heic','heif'].includes(extensionFromName) ? extensionFromName : '');
    const mimeType = file.type || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }[extension]);
    const maxBytes = (sharedMode ? 10 : 1) * 1024 * 1024;
    if (!extension || !mimeType?.startsWith('image/')) throw new Error('Elige una imagen JPG, PNG, GIF, WebP o HEIC.');
    if (file.size > maxBytes) throw new Error(`La firma debe pesar menos de ${sharedMode ? '10' : '1'} MB.`);
    setSignatureBusy(true);
    try {
      if (sharedMode) {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) throw new Error('La sesión no está disponible.');
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error('Inicia sesión de nuevo para guardar tu firma.');
        const user = userData.user;
        if (profile.userId && profile.userId !== user.id) throw new Error('La sesión cambió. Recarga la página e inténtalo de nuevo.');
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const bucket = supabase.storage.from('profile-signatures');
        const { error: uploadError } = await bucket.upload(path, file, { contentType: mimeType, cacheControl: '3600', upsert: false });
        if (uploadError) throw new Error('No se pudo subir la firma. Verifica tu conexión e inténtalo otra vez.');
        const { data: signedData, error: signedError } = await bucket.createSignedUrl(path, 3600);
        if (signedError || !signedData?.signedUrl) {
          await bucket.remove([path]);
          throw new Error('La firma se subió, pero no se pudo preparar su vista previa. Inténtalo otra vez.');
        }
        const metadata = { ...profile.metadata, signature_path: path };
        const { data: updatedUser, error: metadataError } = await supabase.auth.updateUser({ data: metadata });
        if (metadataError) {
          await bucket.remove([path]);
          throw new Error('La firma se subió, pero no se pudo guardar en tu perfil. Inténtalo de nuevo.');
        }
        const previousPath = typeof profile.metadata?.signature_path === 'string' ? profile.metadata.signature_path : '';
        onProfileChange({ ...profile, metadata: updatedUser.user?.user_metadata || metadata, signaturePath: path, signatureUrl: signedData.signedUrl, userId: user.id });
        if (previousPath.startsWith(`${user.id}/`) && previousPath !== path) await bucket.remove([previousPath]);
      } else {
        const signatureUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la firma.'));
          reader.onerror = () => reject(new Error('No se pudo leer la firma.'));
          reader.readAsDataURL(file);
        });
        const stored = JSON.parse(window.localStorage.getItem('crm-demo-user-profile-v1') || '{}');
        window.localStorage.setItem('crm-demo-user-profile-v1', JSON.stringify({ ...stored, signatureUrl }));
        onProfileChange({ ...profile, signatureUrl });
      }
      setSignaturePreviewError(false);
      setSignatureModal('');
      notify('Firma de perfil actualizada.');
    } catch (signatureSaveError) {
      throw signatureSaveError;
    } finally { setSignatureBusy(false); }
  };
  const selectSignatureFile = async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try { await saveSignatureFile(file); }
    catch (signatureSaveError) { setSignatureError(signatureSaveError.message || 'No se pudo guardar la firma.'); }
  };
  const removeSignature = async () => {
    if (!profile.signatureUrl) return;
    setSignatureBusy(true);
    setSignatureError('');
    try {
      if (sharedMode) {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) throw new Error('La sesión no está disponible.');
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error('Inicia sesión de nuevo para quitar tu firma.');
        const user = userData.user;
        const previousPath = typeof profile.metadata?.signature_path === 'string' ? profile.metadata.signature_path : '';
        if (profile.userId && profile.userId !== user.id) throw new Error('La sesión cambió. Recarga la página e inténtalo de nuevo.');
        const metadata = { ...profile.metadata, signature_path: null };
        const { data: updatedUser, error: metadataError } = await supabase.auth.updateUser({ data: metadata });
        if (metadataError) throw new Error('No se pudo quitar la firma del perfil. Inténtalo de nuevo.');
        onProfileChange({ ...profile, metadata: updatedUser.user?.user_metadata || metadata, signaturePath: '', signatureUrl: '', userId: user.id });
        if (previousPath.startsWith(`${user.id}/`)) await supabase.storage.from('profile-signatures').remove([previousPath]);
      } else {
        const stored = JSON.parse(window.localStorage.getItem('crm-demo-user-profile-v1') || '{}');
        delete stored.signatureUrl;
        window.localStorage.setItem('crm-demo-user-profile-v1', JSON.stringify(stored));
        onProfileChange({ ...profile, signatureUrl: '' });
      }
      setSignaturePreviewError(false);
      notify('Firma de perfil quitada.');
    } catch (signatureRemoveError) {
      setSignatureError(signatureRemoveError.message || 'No se pudo quitar la firma.');
    } finally { setSignatureBusy(false); }
  };
  const downloadSignature = async () => {
    try {
      let blob;
      if (sharedMode) {
        const supabase = createSupabaseBrowserClient();
        const { data, error: downloadError } = await supabase.storage.from('profile-signatures').download(profile.signaturePath);
        if (downloadError || !data) throw new Error('No se pudo descargar la firma.');
        blob = data;
      } else {
        const response = await fetch(profile.signatureUrl);
        if (!response.ok) throw new Error('No se pudo descargar la firma.');
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `firma.${profile.signaturePath?.split('.').pop() || blob.type.split('/').pop() || 'png'}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) { setSignatureError(downloadError.message || 'No se pudo descargar la firma.'); }
  };
  const savedFormValues = {
    names: profile.metadata?.names || '',
    firstLastName: profile.metadata?.firstLastName || '',
    secondLastName: profile.metadata?.secondLastName || '',
    rfc: profile.metadata?.rfc || '',
    phone: profile.metadata?.phone || '',
    specialty: profile.metadata?.specialty || '',
    university: profile.metadata?.university || '',
    certificationNumber: profile.metadata?.certificationNumber || '',
    tipoPersonal: profile.metadata?.tipoPersonal || '',
    specialtyCertificationNumber: profile.metadata?.specialtyCertificationNumber || '',
    curp: profile.metadata?.curp || '',
    paisNacimiento: profile.metadata?.paisNacimiento || '',
    timezone: profile.metadata?.timezone || 'America/Tijuana',
    email: profile.email || '',
    newPassword: '',
  };
  const hasUnsavedChanges = Object.entries(savedFormValues).some(([key, value]) => form[key] !== value);
  const save = async event => {
    event.preventDefault();
    if (!hasUnsavedChanges) { showNoChangesMessage(); return; }
    if (saving) return;
    dismissNoChangesMessage();
    setSaving(true); setError('');
    const { newPassword, email, ...metadata } = form;
    const savedMetadata = { ...profile.metadata, ...metadata };
    try {
      if (sharedMode) {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) throw new Error('La sesión no está disponible.');
        const { error: profileError } = await supabase.auth.updateUser({ data: savedMetadata });
        if (profileError) throw profileError;
        if (email.trim() && email.trim() !== profile.email) {
          const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() });
          if (emailError) throw emailError;
        }
        if (newPassword) {
          const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
          if (passwordError) throw passwordError;
        }
      } else {
        window.localStorage.setItem('crm-demo-user-profile-v1', JSON.stringify({ ...savedMetadata, email, avatarUrl: profile.avatarUrl || '', signatureUrl: profile.signatureUrl || '' }));
      }
      const name = [savedMetadata.names, savedMetadata.firstLastName, savedMetadata.secondLastName].filter(Boolean).join(' ') || email || 'Equipo clínico';
      onProfileChange({ ...profile, name, email: email || profile.email, metadata: savedMetadata });
      setForm(current => ({ ...current, newPassword: '' }));
      notify(email && email !== profile.email ? 'Cambios guardados. Confirma el correo desde tu bandeja de entrada.' : 'Perfil guardado.');
    } catch (saveError) { setError(saveError.message || 'No se pudieron guardar los cambios.'); }
    finally { setSaving(false); }
  };
  return <div className="profile-page">
    <PageTitle title="Mi perfil" description="Administra la información personal y profesional de tu cuenta."/>
    <form className="profile-form" onSubmit={save}>
      <section className="panel profile-section"><div className="panel-heading padded"><div><div className="panel-title">Cuenta</div><p className="panel-subtitle">Correo y acceso a tu cuenta.</p></div></div><div className="profile-section-content"><div className="profile-avatar-setting"><Avatar initials={profileInitials(profile.name)} tone="navy" size="large" imageUrl={profile.avatarUrl}/><div className="profile-avatar-copy"><strong>Foto de perfil</strong><small>JPG, PNG o WebP · Hasta {sharedMode?'5':'1'} MB.</small>{photoError&&<small className="profile-error" role="alert">{photoError}</small>}</div><div className="profile-avatar-actions"><label className={`button outline compact profile-photo-trigger${photoBusy?' is-disabled':''}`}><input className="profile-photo-input" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp" aria-label="Seleccionar foto de perfil" onChange={updateProfilePhoto} disabled={photoBusy}/><span>{photoBusy?'Subiendo…':profile.avatarUrl?'Cambiar foto':'Agregar foto'}</span></label>{profile.avatarUrl&&<button className="profile-photo-remove" type="button" onClick={removeProfilePhoto} disabled={photoBusy}>Quitar</button>}</div></div><div className="form-grid"><label>Correo electrónico<input name="email" type="email" value={form.email} onChange={update} autoComplete="email"/></label><label>Contraseña nueva<input name="newPassword" type="password" value={form.newPassword} onChange={update} autoComplete="new-password" placeholder="Deja en blanco para conservarla" minLength="8"/></label><label>Clínica actual{memberships.length?<select aria-label="Clínica actual" value={clinicId} onChange={event=>onSelectClinic(event.target.value)}>{memberships.map(membership=><option key={membership.clinicId} value={membership.clinicId}>{membership.name}</option>)}</select>:<input value={clinicName} readOnly/>}</label><label>Zona horaria<select name="timezone" value={form.timezone} onChange={update}><option value="America/Tijuana">Tijuana (UTC−8/UTC−7)</option><option value="America/Mexico_City">Ciudad de México</option><option value="America/Hermosillo">Hermosillo</option></select></label></div></div></section>
      <section className="panel profile-section"><div className="panel-heading padded"><div><div className="panel-title">Datos personales</div><p className="panel-subtitle">Tu información básica de contacto.</p></div></div><div className="profile-section-content"><div className="form-grid"><label>Nombre(s)<input name="names" value={form.names} onChange={update} autoComplete="given-name" required/></label><label>Primer apellido<input name="firstLastName" value={form.firstLastName} onChange={update} autoComplete="family-name" required/></label><label>Segundo apellido<input name="secondLastName" value={form.secondLastName} onChange={update}/></label><label>RFC<input name="rfc" value={form.rfc} onChange={update} autoCapitalize="characters"/></label><label>Teléfono<input name="phone" type="tel" value={form.phone} onChange={update} autoComplete="tel"/></label></div></div></section>
      <section className="panel profile-section"><div className="panel-heading padded"><div><div className="panel-title">Datos profesionales</div><p className="panel-subtitle">Credenciales que aparecen en el perfil clínico.</p></div></div><div className="profile-section-content"><div className="form-grid"><label>Especialidad<input name="specialty" value={form.specialty} onChange={update} placeholder="Ej. Medicina estética"/></label><label>Universidad<input name="university" value={form.university} onChange={update}/></label><label>Cédula profesional<input name="certificationNumber" value={form.certificationNumber} onChange={update}/></label></div><div className="profile-signature-setting">
        <div className="profile-signature-heading"><strong>Firma (como aparece en la INE)</strong>{profile.signatureUrl&&<button type="button" className="profile-signature-expand" onClick={()=>setSignatureModal('preview')}>Clic para ampliar</button>}</div>
        <input ref={signatureInputRef} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif" aria-label="Seleccionar imagen de firma" onChange={selectSignatureFile}/>
        {profile.signatureUrl?<div className="profile-signature-preview">{signaturePreviewError?<div className="profile-signature-unavailable">La vista previa no está disponible en este navegador. Puedes descargar la firma o reemplazarla.</div>:<img src={profile.signatureUrl} alt="Firma guardada en el perfil" onError={()=>setSignaturePreviewError(true)}/>}<div className="profile-signature-quick-actions"><IconButton type="button" aria-label="Ampliar firma" title="Ampliar firma" onClick={()=>setSignatureModal('preview')}><Maximize2 size={16}/></IconButton><IconButton type="button" aria-label="Descargar firma" title="Descargar firma" onClick={downloadSignature}><Download size={16}/></IconButton></div><button type="button" className="profile-signature-replace" onClick={()=>signatureInputRef.current?.click()} disabled={signatureBusy}><Upload size={13}/>{signatureBusy?'Subiendo…':'Reemplazar'}</button></div>:signatureLoading?<div className="profile-signature-empty">Cargando firma…</div>:<div className="profile-signature-empty"><PenLine size={19}/><span>Aún no has agregado tu firma</span></div>}
        <small className="profile-signature-help">JPG, PNG, GIF, WebP o HEIC · Hasta {sharedMode?'10':'1'} MB</small>
        {signatureError&&<p className="profile-error" role="alert">{signatureError}</p>}
        <div className="profile-signature-actions"><button className="button outline compact" type="button" onClick={()=>signatureInputRef.current?.click()} disabled={signatureBusy}><Upload size={15}/>{signatureBusy?'Subiendo…':profile.signatureUrl?'Subir otra imagen':'Subir firma'}</button><button className="button outline compact" type="button" onClick={()=>{setSignatureError('');setSignatureModal('draw')}} disabled={signatureBusy}><PenLine size={15}/>Firmar a mano</button>{profile.signatureUrl&&<button className="profile-photo-remove" type="button" onClick={removeSignature} disabled={signatureBusy}><Trash2 size={14}/>Quitar firma</button>}</div>
      </div><details className="profile-extra profile-additional-details" open={additionalOpen} onToggle={event=>setAdditionalOpen(event.currentTarget.open)}><summary><ChevronRight size={16}/> Datos adicionales</summary><div className="form-grid profile-additional-grid"><label>Tipo de personal<select name="tipoPersonal" value={form.tipoPersonal} onChange={update}><option value="">Sin especificar</option>{profileStaffTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label><label>Cédula de especialidad<input name="specialtyCertificationNumber" value={form.specialtyCertificationNumber} onChange={update} placeholder="Número de cédula de especialidad"/></label><label>CURP<input name="curp" value={form.curp} onChange={updateCurp} onInvalid={event=>event.currentTarget.setCustomValidity(event.currentTarget.value ? curpValidationMessage : '')} placeholder="CURP de 18 caracteres" minLength="18" maxLength="18" autoCapitalize="characters"/></label><label>País de nacimiento<select name="paisNacimiento" value={form.paisNacimiento} onChange={update}><option value="">Sin especificar</option>{profileBirthCountries.map(country=><option key={country} value={country}>{country}</option>)}</select></label></div></details>{error&&<p className="profile-error" role="alert">{error}</p>}<div className="profile-save-row"><span className={`profile-save-feedback${noChangesMessageVisible?' is-visible':''}`} aria-live="polite" aria-hidden={!noChangesMessageVisible}>Sin cambios que guardar.</span><button className="button primary" data-no-changes={!hasUnsavedChanges} disabled={saving} onClick={event=>{if(!hasUnsavedChanges){event.preventDefault();showNoChangesMessage();}}}>{saving?'Guardando…':'Guardar cambios'}</button></div></div></section>
      </form>
    {signatureModal==='draw'&&<Modal title="Firmar a mano" subtitle="Dibuja tu firma para guardarla en tu perfil." close={()=>!signatureBusy&&setSignatureModal('')} className="signature-draw-modal"><SignaturePad confirmLabel="Guardar en mi perfil" saving={signatureBusy} onCancel={()=>setSignatureModal('')} onSave={async file=>{try{await saveSignatureFile(file)}catch(signatureSaveError){setSignatureError(signatureSaveError.message||'No se pudo guardar la firma.')}}}/></Modal>}
    {signatureModal==='preview'&&profile.signatureUrl&&<Modal title="Firma del perfil" subtitle="Firma guardada para tu perfil profesional." close={()=>setSignatureModal('')} className="signature-viewer-modal"><img className="profile-signature-viewer" src={profile.signatureUrl} alt="Firma guardada en el perfil"/><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setSignatureModal('')}>Cerrar</button><button type="button" className="button outline" onClick={downloadSignature}><Download size={15}/> Descargar firma</button></div></Modal>}
  </div>;
}

function SettingsPage({currentUserId,clinicName,sharedMode,onSaveClinicName,clinicId,role,permissions={},branches,providers,timeZone,onCatalogChange,publicBranches,publicProviders,services,promotionData,onSavePromotion,patients,onRequestApproved}) {
  const [activeSectionId,setActiveSectionId]=useState('google-calendar');
  useEffect(()=>{const tab=new URL(window.location.href).searchParams.get('tab');if(settingsSections.some(section=>section.id===tab))setActiveSectionId(tab);},[]);
  const visibleSettingsSections=settingsSections.filter(section=>{
    if(!sharedMode)return true;
    if(section.id==='whatsapp')return hasClinicPermission(role,permissions,'whatsapp.view');
    if(section.id==='public-agenda')return hasClinicPermission(role,permissions,'public_agenda.view');
    return true;
  });
  const activeSection=visibleSettingsSections.find(section=>section.id===activeSectionId)||visibleSettingsSections[0];
  const SectionIcon=activeSection.icon;
  return <div className="settings-page">
    <PageTitle eyebrow="PREFERENCIAS DEL SISTEMA" title="Configuración" description="Administra las integraciones y preferencias de la clínica."/>
    <div className="settings-tabs-viewport"><nav className="settings-tabs" aria-label="Secciones de configuración">{visibleSettingsSections.map(section=>{const Icon=section.icon;const active=section.id===activeSection.id;return <button key={section.id} type="button" className={`settings-tab${active?' is-active':''}`} aria-pressed={active} onClick={()=>setActiveSectionId(section.id)}><Icon size={15}/>{section.label}</button>})}</nav></div>
    <section className="panel settings-panel" aria-labelledby="settings-section-title">
      <header className="settings-panel-heading"><span className="settings-section-icon"><SectionIcon size={19}/></span><div className="settings-section-copy"><span className="settings-section-kicker">{activeSection.id==='clinic'?'CLÍNICA':'CONFIGURACIÓN'}</span><h2 id="settings-section-title">{activeSection.title}</h2><p>{activeSection.description}</p></div></header>
      {activeSection.id==='clinic'?<div className="settings-clinic-content">{sharedMode?<><div className="settings-clinic-row"><div><strong>Nombre de la clínica</strong><span>Identidad del espacio compartido</span></div><div className="settings-readonly-value">{clinicName}</div></div><div className="settings-preview-note"><ShieldCheck size={17}/><p>El nombre del consultorio compartido se administra desde la configuración de la clínica.</p></div></>:<form className="settings-clinic-form" onSubmit={onSaveClinicName}><label htmlFor="settings-clinic-name">Nombre de la clínica</label><div className="settings-clinic-input-row"><input id="settings-clinic-name" name="clinicName" defaultValue={clinicName} maxLength={80} placeholder="Ej. Clínica del Valle" required/><button className="button primary" type="submit"><Check size={15}/> Guardar cambios</button></div><p>Este nombre se guarda en este navegador de demostración y aparece en la navegación del CRM.</p></form>}</div>:activeSection.id==='public-agenda'?<PublicAgendaSettings key={clinicId || 'demo'} clinicId={clinicId} clinicName={clinicName} role={role} permissions={permissions} sharedMode={sharedMode} branches={publicBranches} providers={publicProviders} services={services} patients={patients} timeZone={timeZone} onApproved={onRequestApproved}/>:activeSection.id==='push'?<PushSettings key={clinicId || 'demo'} clinicId={clinicId} sharedMode={sharedMode} role={role}/>:activeSection.id==='availability'?<ClinicAvailabilitySettings clinicId={clinicId} currentUserId={currentUserId} role={role} permissions={permissions} branches={branches} providers={providers} timeZone={timeZone} sharedMode={sharedMode}/>:activeSection.id==='google-calendar'?<GoogleCalendarSettings clinicId={clinicId} role={role} permissions={permissions} sharedMode={sharedMode}/>:activeSection.id==='whatsapp'?<WhatsAppSettings clinicId={clinicId} role={role} permissions={permissions} branches={branches} sharedMode={sharedMode}/>:activeSection.id==='promotions'?<ClinicPromotionsSettings promotions={promotionData.rows} services={services} status={promotionData.status} today={dateKeyInTimeZone(new Date(),timeZone)} canManage={!sharedMode||hasClinicPermission(role,permissions,'services.manage')} onSave={onSavePromotion}/>:activeSection.id==='services'?<ClinicServicesSettings clinicId={clinicId} role={role} permissions={permissions} branches={branches} providers={providers} sharedMode={sharedMode} demoServices={sharedMode?undefined:services} onCatalogChange={onCatalogChange}/>:<div className="settings-preview-content"><div className="settings-preview-banner"><ShieldCheck size={17}/><div><strong>Vista previa de esta sección</strong><span>La navegación ya está preparada; las funciones aún no se conectan a este CRM.</span></div></div><div className="settings-option-list">{activeSection.items.map(([title,description])=><div className="settings-option-row" key={title}><div><strong>{title}</strong><span>{description}</span></div><span className="settings-option-status">Próximamente</span></div>)}</div><p className="settings-preview-footnote">Estas opciones son placeholders: todavía no guardan cambios ni se conectan a servicios externos.</p></div>}
    </section>
  </div>;
}

function Overview({patients,appointments,payments=[],setPage,onNewAppointment,onOpenPatient,canCreateAppointment=true,timeZone='America/Tijuana',userName=''}) {
  const dateParts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const todayKey=`${dateParts.find(part=>part.type==='year')?.value}-${dateParts.find(part=>part.type==='month')?.value}-${dateParts.find(part=>part.type==='day')?.value}`;
  const todayLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date()).toUpperCase();
  const todayAppointments=appointments.filter(appointment=>appointment.date===todayKey&&appointment.status!=='Cancelada').sort((a,b)=>a.time.localeCompare(b.time));
  const activePatients=patients.filter(patient=>patient.status==='Activo').length;
  const monthAppointments=appointments.filter(appointment=>appointment.date?.startsWith(todayKey.slice(0,7))&&appointment.status!=='Cancelada').length;
  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const todayPayments = payments.filter(payment => payment.date === todayKey);
  const collected = todayPayments.reduce((sum, payment) => sum + (payment.direction === 'Reembolso' ? -Number(payment.amount || 0) : Number(payment.amount || 0)), 0);
  return <div className="overview-dashboard"><div className="welcome-line"><div className="date-pill">{todayLabel}</div></div><PageTitle title="Buenos días" description={<>Bienvenido{userName ? <>, <span className="welcome-name">{userName}</span></> : null}</>} action={canCreateAppointment&&<button className="button primary" onClick={()=>onNewAppointment?.()}><Plus size={16}/> Nueva cita</button>}/>
    <div className="metric-grid" role="list" aria-label="Resumen de actividad de la clínica"><MetricCard label="Citas de hoy" value={String(todayAppointments.length).padStart(2,'0')} change={`${todayAppointments.filter(item=>item.status==='Por confirmar').length} por confirmar`}/><MetricCard label="Pacientes activos" value={String(activePatients)} change={`${patients.length} expedientes`}/><MetricCard label="Recaudado hoy" value={money.format(collected)} change={`${todayPayments.length} movimientos`}/><MetricCard label="Citas este mes" value={String(monthAppointments)} change="Registradas en la agenda"/></div>
    <div className="dashboard-grid"><section className="panel agenda-panel"><div className="panel-heading"><div><div className="panel-title">Agenda de hoy</div><p className="panel-subtitle">Citas de la clínica para esta fecha</p></div><button className="text-link" onClick={()=>setPage('agenda')}>Ver agenda <ArrowRight size={14}/></button></div><div className="appointment-list">{todayAppointments.slice(0,6).map(a=><div className="appointment-row" key={`${a.patient}-${a.time}-${a.id||''}`}><div className="time-col"><strong>{a.time}</strong><span>{a.duration}</span></div><div className="timeline-mark"><i/></div><Avatar initials={a.initials} tone={a.tone}/><div className="appointment-info"><strong>{a.patient}</strong><span>{a.service} <i>·</i> {a.clinician}</span></div><Badge variant={a.status==='Confirmada'?'confirmed':'pending'}>{a.status}</Badge></div>)}{todayAppointments.length===0&&<div className="empty-inline">No hay citas registradas para hoy.</div>}</div><button className="panel-footer-link" onClick={()=>setPage('agenda')}>Ver las {todayAppointments.length} citas de hoy <ArrowRight size={14}/></button></section>
      <section className="panel activity-panel"><div className="panel-heading"><div><div className="panel-title">Ventas del día</div><p className="panel-subtitle">Ingresos y reembolsos con fecha de hoy</p></div><button className="text-link" onClick={()=>setPage('payments')}>Ver pagos <ArrowRight size={14}/></button></div><div className="day-sales"><strong>{money.format(collected)}</strong><span>Aproximado en pesos, según lo capturado en Pagos. No es un corte contable.</span></div><div className="task-list">{todayPayments.slice(0,5).map(payment=><div className="task-item" key={payment.id}><div className="task-copy"><strong>{payment.patientNameSnapshot || 'Paciente'}</strong><span>{payment.direction} · {payment.method}</span></div><b>{money.format(payment.direction==='Reembolso'?-payment.amount:payment.amount)}</b></div>)}{todayPayments.length===0&&<div className="empty-inline">Hoy no hay movimientos registrados.</div>}</div></section>
    </div><div className="bottom-grid overview-patients-only"><section className="panel patient-panel"><div className="panel-heading"><div><div className="panel-title">Últimos pacientes</div><p className="panel-subtitle">Expedientes abiertos recientemente</p></div><button className="text-link" onClick={()=>setPage('patients')}>Ver pacientes <ArrowRight size={14}/></button></div><div className="mini-patients">{patients.slice(0,6).map(p=><button className="mini-patient" key={p.id} onClick={()=>onOpenPatient(p)}><Avatar initials={p.initials} tone={p.tone}/><div><strong>{p.name}</strong><span>{p.treatment}</span></div><span className="mini-date">{String(p.last||'').split(',')[0]}</span><ChevronRight size={15} className="muted-icon"/></button>)}</div></section></div>
  </div>;
}
function MetricCard({label,value,change,attention=false}) { return <article className={`metric-card${attention?' attention':''}`} role="listitem"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className={`metric-change${attention?' attention':''}`}>{attention&&<span className="attention-dot" aria-hidden="true"/>}{change}</span></article>; }
function TaskItem({icon:Icon,tint,title,subtitle,time,action,onClick}) { return <div className="task-item"><div className={`task-icon ${tint}`}><Icon size={16}/></div><div className="task-copy"><strong>{title}</strong><span>{subtitle}</span><small><Clock3 size={11}/>{time}</small></div><button onClick={onClick}>{action}<ChevronRight size={14}/></button></div>; }

function PatientsPage({patients,allPatients,query,setQuery,searchRef,setModal,onOpen,canCreatePatient=true,sharedMode=false}) {
 const [filter,setFilter]=useState('Todos');
 const [documentFilter,setDocumentFilter]=useState('Todos');
 const [branchFilter,setBranchFilter]=useState('Todas las sucursales');
 const [providerFilter,setProviderFilter]=useState('Todas las personas');
 const [filtersOpen,setFiltersOpen]=useState(false);
 const [page,setPage]=useState(1);
 const pageSize=10;
 useEffect(()=>setPage(1),[filter,documentFilter,branchFilter,providerFilter,query]);
 const branches=[...new Set(allPatients.map(patient=>patient.branch).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
 const providers=[...new Set(allPatients.map(patient=>patient.clinician).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
 const matchesFilter=patient=>filter==='Todos'||(filter==='Activos'?patient.status==='Activo':filter==='Nuevos'?patient.status==='Nuevo':patient.contract==='Pendiente'||patient.consent==='Pendiente');
 const matchesDocumentFilter=patient=>documentFilter==='Todos'||(documentFilter==='Contrato pendiente'?patient.contract==='Pendiente':documentFilter==='Consentimiento pendiente'?patient.consent==='Pendiente':patient.contract==='Pendiente'&&patient.consent==='Pendiente');
 const matchesBranch=patient=>branchFilter==='Todas las sucursales'||patient.branch===branchFilter;
 const matchesProvider=patient=>providerFilter==='Todas las personas'||patient.clinician===providerFilter;
 const filtered=patients.filter(patient=>matchesFilter(patient)&&matchesDocumentFilter(patient)&&matchesBranch(patient)&&matchesProvider(patient));
 const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
 const currentPage=Math.min(page,pageCount);
 const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const pageSlots=5;
 const pageWindowLength=Math.min(pageSlots,pageCount);
 let pageWindowStart=Math.max(1,currentPage-Math.floor(pageWindowLength/2));
 pageWindowStart=Math.min(pageWindowStart,Math.max(1,pageCount-pageWindowLength+1));
 const pageMarks=Array.from({length:pageSlots},(_,index)=>index<pageWindowLength?pageWindowStart+index:null);
 const pendingPatients=allPatients.filter(patient=>patient.contract==='Pendiente'||patient.consent==='Pendiente').length;
 const clearFilters=()=>{setQuery('');setFilter('Todos');setDocumentFilter('Todos');setBranchFilter('Todas las sucursales');setProviderFilter('Todas las personas');};
 return <><PageTitle eyebrow="DIRECTORIO CLÍNICO" title="Pacientes" description="Expedientes, documentos y seguimiento en un solo lugar." action={canCreatePatient&&<button className="button primary" onClick={()=>setModal('new-patient')}><Plus size={16}/> Agregar paciente</button>}/><div className="summary-strip patient-directory-summary"><div><UsersRound size={16}/><strong>{allPatients.length}</strong><span>pacientes en el directorio</span></div><i/><div><span className="summary-dot green"/><strong>{allPatients.filter(patient=>patient.status==='Activo').length}</strong><span>activos</span></div><i/><div><span className="summary-dot orange"/><strong>{pendingPatients}</strong><span>expedientes con documentos pendientes</span></div><div className="summary-side-note"><ShieldCheck size={14}/> {sharedMode?'Datos compartidos':'Datos de demostración'}</div></div><section className="panel data-panel patients-directory-table"><div className="table-toolbar"><div className="filter-tabs">{['Todos','Activos','Nuevos','Docs pendientes'].map(label=><button className={filter===label?'selected':''} onClick={()=>setFilter(label)} key={label}>{label}{label==='Todos'?<span>{allPatients.length}</span>:label==='Docs pendientes'?<span>{pendingPatients}</span>:null}</button>)}</div><div className="table-actions"><label className="input-search"><Search size={15}/><input ref={searchRef} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar nombre, expediente, correo…"/></label><button className="button outline compact" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(open=>!open)}><SlidersHorizontal size={15}/> Filtros</button><button className="icon-button outline" onClick={clearFilters} aria-label="Limpiar búsqueda y filtros"><ListFilter size={16}/></button></div></div>{filtersOpen&&<div className="agenda-filter-panel patient-filter-panel"><label className="select-filter"><Activity size={15}/><select aria-label="Filtrar pacientes por sucursal" value={branchFilter} onChange={event=>setBranchFilter(event.target.value)}><option>Todas las sucursales</option>{branches.map(branch=><option key={branch}>{branch}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><UserRound size={15}/><select aria-label="Filtrar pacientes por profesional" value={providerFilter} onChange={event=>setProviderFilter(event.target.value)}><option>Todas las personas</option>{providers.map(provider=><option key={provider}>{provider}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><FileCheck2 size={15}/><select aria-label="Filtrar pacientes por documento" value={documentFilter} onChange={event=>setDocumentFilter(event.target.value)}><option>Todos</option><option>Contrato pendiente</option><option>Consentimiento pendiente</option><option>Ambos pendientes</option></select><ChevronDown size={14}/></label><span className="panel-subtitle">Los filtros se combinan con la búsqueda, el estado y los documentos.</span></div>}<div className="table-wrap"><table><thead><tr><th>PACIENTE</th><th>ÚLTIMA ACTIVIDAD</th><th>TRATAMIENTO</th><th>CONTRATO</th><th>CONSENTIMIENTO</th><th>ESTADO</th><th></th></tr></thead><tbody>{shown.map(patient=><tr key={patient.id} onClick={()=>onOpen(patient)} className="clickable-row"><td><div className="patient-cell"><Avatar initials={patient.initials} tone={patient.tone}/><div><strong>{patient.name}</strong><span>{patient.id}</span></div></div></td><td className="last-cell">{patient.last}</td><td><span className="treatment-cell">{patient.treatment}</span></td><td><DocStatus status={patient.contract}/></td><td><DocStatus status={patient.consent}/></td><td><Badge variant={patient.status==='Activo'?'active':patient.status==='Nuevo'?'new':'followup'}><span className="badge-dot"/>{patient.status}</Badge></td><td><button className="row-more" aria-label={`Abrir expediente de ${patient.name}`} onClick={event=>{event.stopPropagation();onOpen(patient)}}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{shown.length===0&&<div className="empty-state"><Search size={20}/><strong>No encontramos pacientes</strong><span>Prueba con otros filtros o limpia la búsqueda.</span></div>}</div>{filtered.length>0&&<div className="table-bottom"><nav className="consent-pager" aria-label="Páginas de pacientes"><button type="button" className="consent-pager-step" aria-label="Página anterior" disabled={currentPage<=1} onClick={()=>setPage(current=>Math.max(1,current-1))}><ChevronLeft size={16}/></button><span className="consent-pager-pages">{pageMarks.map((mark,index)=>mark?<button type="button" key={mark} className={mark===currentPage?'is-current':''} aria-current={mark===currentPage?'page':undefined} onClick={()=>setPage(mark)}>{mark}</button>:<span key={`slot-${index}`} className="consent-pager-slot" aria-hidden="true"/>)}</span><button type="button" className="consent-pager-step" aria-label="Página siguiente" disabled={currentPage>=pageCount} onClick={()=>setPage(current=>Math.min(pageCount,current+1))}><ChevronRight size={16}/></button><span className="consent-pager-count">{((currentPage-1)*pageSize)+1}–{Math.min(currentPage*pageSize,filtered.length)} de {filtered.length}</span></nav></div>}</section></>;
}
function agendaSlotTime(index) {
  const totalMinutes = 6 * 60 + index * 15;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}
function DocStatus({status}){return <span className={`doc-status ${status==='Firmado'?'signed':status==='Reemplazado'?'replaced':'waiting'}`}><span className="status-icon">{status==='Firmado'?<Check size={11}/>:status==='Reemplazado'?<X size={11}/>:<Clock3 size={11}/>}</span>{status}</span>;}

function AppointmentColorPreview({ providerId, branchId, service, providers }) {
  const color = appointmentAgendaColor({ providerId, branchId, service }, providers);
  return <div className="appointment-color-preview" role="status"><i className="agenda-color-dot" style={colorStyle(color)}/><span>Color de agenda: <strong>{agendaPalette.find(item=>item.id===color)?.label}</strong> · según profesional, sucursal y servicio</span></div>;
}

function serviceOfferSummary(service) {
  if (!service.offers?.length) return 'Precio por definir';
  return service.offers.map(offer => {
    const amount = offer.amount == null ? 'Por cotizar' : `${offer.currency === 'UNRESOLVED' ? 'Moneda por confirmar' : offer.currency} ${Number(offer.amount).toLocaleString('es-MX')}`;
    return `${offer.kind === 'package' ? 'Paquete' : 'Sesión'} ${amount}${offer.sessions ? ` / ${offer.sessions} sesiones` : offer.kind === 'package' ? ' / sesiones por definir' : ''}`;
  }).join(' · ');
}

function AppointmentServicePicker({ services, selectedIds, providers, branchId, providerId, onChange, manualField, manualInitiallyOpen = false, onCloseManual }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [open, setOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(manualInitiallyOpen);
  const selected = selectedIds.map(id => services.find(service => service.id === id)).filter(Boolean);
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
  const matches = services.filter(service => !selectedIds.includes(service.id)
    && (category === 'Todas' || service.category === category)
    && (!query || normalize(`${service.name} ${service.category} ${service.code}`).includes(normalize(query))))
    .map(service => {
      const eligible = eligibleServiceProviders([...selected, service], providers, branchId);
      const assigned = eligible.find(provider => provider.id === providerId) || (eligible.length === 1 ? eligible[0] : null);
      return { service, assigned };
    }).filter(match => match.assigned);
  const remove = id => onChange(selectedIds.filter(current => current !== id));

  return <section className="appointment-service-picker" aria-label="Servicios de la cita" onBlur={event=>{
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="appointment-service-picker-heading">
      <strong>Servicios</strong>
      {selected.length>0&&<span>{selected.length} seleccionados</span>}
      {selectedIds.length===0&&<button type="button" className="text-link" aria-expanded={manualOpen} onClick={()=>{
        if (manualOpen) onCloseManual();
        setManualOpen(!manualOpen);
        setOpen(false);
      }}>{manualOpen?'Volver al catálogo':'Servicio manual'}</button>}
    </div>
    {manualOpen ? manualField : <>
    {selected.length>0&&<div className="appointment-service-chips" aria-label="Servicios seleccionados">{selected.map(service=><span className="appointment-service-chip" key={service.id}><span>{service.name}</span><button type="button" aria-label={`Quitar ${service.name}`} onClick={()=>remove(service.id)}><X size={13}/></button></span>)}</div>}
    <label className="appointment-service-search"><Search size={15}/><input aria-label="Buscar servicios" value={query} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setOpen(true)}} placeholder="Buscar servicio por nombre…" autoComplete="off"/></label>
    {open&&<div className="appointment-service-dropdown">
      <label className="appointment-service-category">Categoría<select aria-label="Categoría del servicio" value={category} onChange={event=>setCategory(event.target.value)}><option>Todas</option>{serviceCategories.map(item=><option key={item}>{item}</option>)}</select></label>
      <div className="appointment-service-results">{matches.slice(0,12).map(({service, assigned})=><button className="appointment-service-result" key={service.id} type="button" onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange([...selectedIds,service.id],assigned.id);setQuery('')}}><span className="appointment-service-result-main"><strong>{service.name}</strong><small>{serviceOfferSummary(service)}</small>{assigned.id!==providerId&&<small>Asignar a {assigned.name}</small>}</span><span className="appointment-service-result-meta"><span>{service.durationMin?`${service.durationMin}${service.durationMax&&service.durationMax!==service.durationMin?`–${service.durationMax}`:''} min`:'Duración pendiente'}</span><Plus size={15}/></span></button>)}{matches.length===0&&<p className="appointment-service-no-results">No hay servicios que coincidan. Puedes capturarlo como servicio manual.</p>}{matches.length>12&&<p className="appointment-service-more">Escribe para acotar los resultados ({matches.length} disponibles).</p>}</div>
    </div>}
    {!open&&selected.length===0&&<p className="appointment-service-picker-hint">Los servicios activos del catálogo están disponibles. Si la duración está pendiente, ingrésala abajo.</p>}
    </>}
  </section>;
}

function AppointmentModal({appointment,payments,businesses,branches,providers,serviceCatalog=[],sharedMode=false,canEditAppointment=true,canCancelAppointment=true,canManagePayments=!sharedMode,paymentDataReady=true,timeZone,close,onSubmit,onCancelAppointment,onOpenPatient,onAddPayment,onRecordArrival}) {
  const [recordingArrival, setRecordingArrival] = useState(false);
  const canRecordArrival = canEditAppointment && !appointment.arrivedAt && ['Por confirmar', 'Confirmada'].includes(appointment.status);
  const recordArrival = async () => {
    if (recordingArrival) return;
    setRecordingArrival(true);
    try { await onRecordArrival(appointment); }
    finally { setRecordingArrival(false); }
  };
  const netReceived=payments.reduce((total,payment)=>total+(payment.direction==='Reembolso'?-Number(payment.amount):Number(payment.amount)),0);
  const currentDuration=Number.parseInt(appointment.duration,10)||45;
  const [time,setTime]=useState(appointment.time);
  const [service,setService]=useState(appointment.service||'');
  const [serviceId,setServiceId]=useState(appointment.serviceId||'');
  const [serviceIds,setServiceIds]=useState(appointment.serviceIds||[appointment.serviceId].filter(Boolean));
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
  const updateDuration=next=>{setDurationMinutes(next);if(Number(next)>0&&timeToMinutes(time)>timeToMinutes(latestAppointmentStart(next)))setTime(latestAppointmentStart(next))};
  return <Modal title="Detalle de la cita" subtitle={`${appointment.patient} · ${appointment.service}`} close={close}>
    <form onSubmit={onSubmit} className="form-stack">
      <input type="hidden" name="id" value={appointment.id}/>
      <input type="hidden" name="serviceId" value={serviceId}/>
      <input type="hidden" name="serviceIds" value={JSON.stringify(serviceIds)}/>
      {appointment.arrivedAt && <div className="form-note" role="status"><Check size={15}/> Llegada registrada · {new Intl.DateTimeFormat('es-MX', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(appointment.arrivedAt))}</div>}
      {canRecordArrival && <div><button type="button" className="button outline compact" onClick={recordArrival} disabled={recordingArrival}><Check size={15}/>{recordingArrival ? 'Registrando…' : 'Ya llegó'}</button></div>}
      <fieldset disabled={!canEditAppointment} className="appointment-edit-fields"><div className="form-note"><CalendarDays size={15}/>{appointment.clinician} · {appointment.branch} · {appointment.duration||'45 min'} · {appointment.modality||'Presencial'}</div>
      {appointment.depositRequired&&<div className="form-note"><DollarSign size={15}/>{sharedMode&&!canManagePayments?`Anticipo requerido: ${formatCurrencyMXN(appointment.depositAmount)}. El sistema validará el pago antes de confirmar.`:sharedMode&&!paymentDataReady?`Anticipo requerido: ${formatCurrencyMXN(appointment.depositAmount)} · Actualizando pagos registrados…`:`Anticipo requerido: ${formatCurrencyMXN(appointment.depositAmount)} · Registrado: ${formatCurrencyMXN(netReceived)}.`}</div>}
      <AppointmentSessionPrice price={appointment.sessionPrice}/>
      <label>Negocio<select name="businessId" value={businessId} onChange={event=>{const nextBusinessId=event.target.value;setBusinessId(nextBusinessId);const nextBranch=activeBranches.find(item=>item.businessId===nextBusinessId);setBranchId(nextBranch?.id||'');const nextProvider=activeProviders.find(item=>!item.branchIds?.length||item.branchIds.includes(nextBranch?.id));setProviderId(nextProvider?.id||'')}} required>{activeBusinesses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="form-grid"><label>Profesional<select name="providerId" value={providerId} onChange={event=>setProviderId(event.target.value)} required>{providersForBranch.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sucursal<select name="branchId" value={branchId} onChange={event=>{const nextBranchId=event.target.value;setBranchId(nextBranchId);const nextProvider=activeProviders.find(item=>!item.branchIds?.length||item.branchIds.includes(nextBranchId));setProviderId(nextProvider?.id||'')}} required>{branchesForBusiness.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <section className="appointment-reminder-card"><div className="appointment-reminder-heading"><strong>Avisos de la cita</strong><span>{appointment.status==='Confirmada'?'Programados':appointment.status==='Cancelada'?'Cancelados':appointment.status==='Completada'?'Cita completada':'Al confirmar'}</span></div><div className="appointment-reminder-row"><span>Confirmación</span><strong>2 días antes</strong></div><div className="appointment-reminder-row"><span>Recordatorio</span><strong>1 día antes</strong></div><div className="appointment-reminder-row"><span>Recordatorio del día</span><strong>5 horas antes</strong></div><p>La agenda de avisos se actualiza al confirmar, reprogramar o cancelar. El envío automático requiere conectar un proveedor.</p></section>
      <div className="form-grid"><label>Fecha<ClinicDateField name="date" defaultValue={appointment.date} required/></label><label>Hora<ClinicTimeField name="time" value={time} onChange={event=>setTime(event.target.value)} min="06:00" max={latestAppointmentStart(durationMinutes)} step={900} required/></label></div>
      <div className="form-grid"><label>Duración (minutos)<input name="durationMinutes" type="number" min="15" max="720" step="15" value={durationMinutes} onChange={event=>updateDuration(event.target.value)}/></label><label>Modalidad<select name="modality" defaultValue={appointment.modality||'Presencial'}><option>Presencial</option><option>Virtual</option></select></label></div>
      <AppointmentColorPreview providerId={providerId} branchId={branchId} service={service} providers={providers}/>
      {appointment.packageId ? <div className="form-note">Sesión de paquete · {appointment.service}</div> : <AppointmentServicePicker manualInitiallyOpen={!serviceIds.length && Boolean(appointment.service)} onCloseManual={()=>{setService(appointment.service||'');setServiceId(appointment.serviceId||'')}} manualField={<label>Servicio manual<input name="service" value={service} onChange={event=>{setService(event.target.value);setServiceId('')}} maxLength="120" required/></label>} services={serviceCatalog} selectedIds={serviceIds} providers={providersForBranch} branchId={branchId} providerId={providerId} onChange={(next, nextProviderId)=>{if(nextProviderId)setProviderId(nextProviderId);setServiceIds(next);setServiceId(next[0]||'');setService(next.map(id=>serviceCatalog.find(option=>option.id===id)?.name).filter(Boolean).join(' + '));const selected=next.map(id=>serviceCatalog.find(option=>option.id===id));if(selected.length&&selected.every(option=>option?.durationMin))updateDuration(String(selected.reduce((total,option)=>total+Number(option.durationMax||option.durationMin),0)));}}/>}
      <label>Notas de la cita (opcional)<textarea name="note" rows={3} defaultValue={appointment.note || ''}/></label>
      <label>Estado<select name="status" defaultValue={appointment.status||'Por confirmar'}><option>Por confirmar</option><option>Confirmada</option><option>Completada</option>{canCancelAppointment&&<option>Cancelada</option>}</select></label></fieldset>
      <section className="appointment-payment-card"><div className="appointment-payment-heading"><div><strong>Pagos de esta cita</strong><span>{paymentDataReady?`Saldo neto registrado: ${formatCurrencyMXN(netReceived)}`:'Cargando el historial de pagos…'}</span></div>{canManagePayments&&<button type="button" className="button outline compact" disabled={!paymentDataReady} onClick={onAddPayment}><Plus size={14}/> Registrar pago</button>}</div>{paymentDataReady&&payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(payment=><div className="appointment-payment-row" key={payment.id}><span>{formatRecordDate(payment.date)} · {payment.method}</span><strong className={payment.direction==='Reembolso'?'refund-text':''}>{payment.direction==='Reembolso'?'−':'+'}{formatCurrencyMXN(payment.amount)}</strong></div>)}{paymentDataReady&&payments.length===0&&<p className="appointment-payment-empty">Todavía no hay movimientos para esta cita.</p>}</section>
      <div className="modal-actions appointment-modal-actions"><button type="button" className="button outline compact" onClick={onOpenPatient}><UsersRound size={15}/> Ver expediente</button>{canCancelAppointment&&appointment.status!=='Cancelada'&&<button type="button" className="button outline compact" onClick={onCancelAppointment}>Cancelar cita</button>}<span/><button type="button" className="button secondary" onClick={close}>Cerrar</button>{canEditAppointment&&<button className="button primary" type="submit"><Check size={15}/> Guardar cita</button>}</div>
    </form>
  </Modal>;
}
function NewAppointmentModal({serviceCatalog=[],promotions=[],close,onSubmit,onCreatePatient,canCreatePatient=true,defaultDate,defaultTime,defaultDuration=45,defaultPatientId='',defaultProviderId='',defaultPackageId='',defaultServiceId='',defaultServiceName='',defaultBusinessId='',defaultBranchId='',patients,businesses,branches,providers,appointments=[],sharedMode=false,clinicId,timeZone,historyAppointments=[],demoPurchases=[],demoPayments=[]}) {
  const [date,setDate]=useState(defaultDate);
  const [time,setTime]=useState(defaultTime);
  const [durationMinutes,setDurationMinutes]=useState(String(defaultDuration));
  const [service,setService]=useState(defaultServiceName);
  const [serviceId,setServiceId]=useState(defaultServiceId);
  const [serviceIds,setServiceIds]=useState(defaultServiceId?[defaultServiceId]:[]);
  const [depositOverride,setDepositOverride]=useState(null);
  const updateDuration=next=>{setDurationMinutes(next);if(Number(next)>0&&timeToMinutes(time)>timeToMinutes(latestAppointmentStart(next)))setTime(latestAppointmentStart(next))};
  const [patientId,setPatientId]=useState(defaultPatientId);
  const preferredPatient=patients.find(patient=>patient.id===defaultPatientId);
  const activeBusinesses=businesses.filter(item=>item.active);
  const activeBranches=branches.filter(item=>item.active);
  const activeProviders=providers.filter(item=>item.active);
  const preferredProvider=activeProviders.find(item=>item.id===defaultProviderId)||activeProviders.find(item=>item.id===preferredPatient?.providerId||item.name===preferredPatient?.clinician);
  const patientBranch=activeBranches.find(item=>item.id===preferredPatient?.branchId||item.name===preferredPatient?.branch);
  const providerBranch=activeBranches.find(item=>preferredProvider?.branchIds?.includes(item.id));
  const preferredBranch=patientBranch||providerBranch;
  const defaultBranch=activeBranches.find(item=>item.id===defaultBranchId);
  const initialBusinessId=defaultBranch?.businessId||patientBranch?.businessId||(defaultProviderId&&providerBranch?.businessId)||activeBusinesses.find(item=>item.id===defaultBusinessId)?.id||activeBusinesses.find(item=>item.id===preferredBranch?.businessId)?.id||activeBusinesses[0]?.id||'';
  const [businessId,setBusinessId]=useState(initialBusinessId);
  const branchesForBusiness=activeBranches.filter(item=>item.businessId===businessId);
  const initialBranchId=branchesForBusiness.some(item=>item.id===defaultBranchId)?defaultBranchId:branchesForBusiness.some(item=>item.id===preferredBranch?.id)?preferredBranch.id:branchesForBusiness[0]?.id||'';
  const [branchId,setBranchId]=useState(initialBranchId);
  const [quickPatientOpen,setQuickPatientOpen]=useState(false);
  const [quickPatientName,setQuickPatientName]=useState('');
  const [quickPatientEmail,setQuickPatientEmail]=useState('');
  const [quickPatientPhone,setQuickPatientPhone]=useState('');
  const [quickPatientSaving,setQuickPatientSaving]=useState(false);
  const [quickFirstVisit,setQuickFirstVisit]=useState(false);
  const [quickCreatedPatients,setQuickCreatedPatients]=useState([]);
  const patientsForAppointment=useMemo(()=>[
    ...quickCreatedPatients,
    ...patients.filter(patient=>!quickCreatedPatients.some(created=>created.id===patient.id)),
  ],[patients,quickCreatedPatients]);
  const selectedPatient = patientsForAppointment.find(patient => patient.id === patientId);
  const selectedServices = serviceIds.map(id => serviceCatalog.find(item => item.id === id)).filter(Boolean);
  const quotedServices = selectedServices.length ? selectedServices : serviceCatalog.filter(item => item.id === serviceId);
  const quote = quoteSessionPrice(quotedServices, promotions, date);
  const { amount: suggestedDeposit, subtotal: depositSubtotal, pending: pendingDeposits } = calculateServiceDeposit(quotedServices, promotions, date);
  const historyTreatments = selectedServices.length ? selectedServices : service.trim() ? [{ name: service.trim() }] : [];
  const [packageId,setPackageId] = useState(defaultPackageId);
  const packageRows = usePatientPackages({ patient:selectedPatient, clinicId, sharedMode, demoPurchases, appointments:historyAppointments, payments:demoPayments });
  const packageOptions = serviceIds.length === 1 ? (packageRows?.rows || []).filter(item => item.serviceId === serviceIds[0] && item.availableSessions > 0) : [];
  const selectedPackage = packageOptions.find(item => item.id === packageId);
  const createAndSelectPatient=async()=>{
    if(quickPatientSaving||!quickPatientName.trim()) return;
    setQuickPatientSaving(true);
    try {
      const patient=await onCreatePatient({name:quickPatientName,email:quickPatientEmail,phone:quickPatientPhone,firstVisit:quickFirstVisit});
      if(!patient) return;
      setQuickCreatedPatients(current=>[patient,...current.filter(item=>item.id!==patient.id)]);
      setPatientId(patient.id);
      setQuickPatientOpen(false);
      setQuickPatientName('');setQuickPatientEmail('');setQuickPatientPhone('');setQuickFirstVisit(false);
    } finally { setQuickPatientSaving(false); }
  };
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
    setPackageId('');
    const catalogService=branchServices.find(item=>item.name.toLocaleLowerCase('es-MX')===String(value||'').trim().toLocaleLowerCase('es-MX'));
    if(catalogService){setServiceId(catalogService.id);updateDuration(String(catalogService.durationMax||catalogService.durationMin));return;}
    setServiceId('');
    const preset=servicePresetsByName.get(String(value||'').trim().toLocaleLowerCase('es-MX'));
    if(!preset) { updateDuration(String(defaultDuration)); return; }
    const presetDuration=Number.parseInt(preset.duration,10);
    if([15,30,45,60,75,90,120].includes(presetDuration)) updateDuration(String(presetDuration));
  };
  const providersForBranch=activeProviders.filter(item=>!item.branchIds?.length||item.branchIds.includes(branchId));
  const providersForBusiness=activeProviders.filter(item=>!item.branchIds?.length||item.branchIds.some(id=>branchesForBusiness.some(branch=>branch.id===id)));
  const initialProviderId=providersForBranch.some(item=>item.id===preferredProvider?.id)?preferredProvider.id:providersForBranch[0]?.id||'';
  const [providerId,setProviderId]=useState(initialProviderId);
  const selectedProvider=activeProviders.find(item=>item.id===providerId);
  const branchOptions=selectedProvider?.branchIds?.length?activeBranches.filter(item=>selectedProvider.branchIds.includes(item.id)&&activeBusinesses.some(business=>business.id===item.businessId)):branchesForBusiness;
  const branchOptionLabel=branch=>{
    const businessName=activeBusinesses.find(business=>business.id===branch.businessId)?.name||'';
    const duplicateName=activeBranches.some(other=>other.id!==branch.id&&other.name===branch.name);
    const branchIncludesBusiness=branch.name.toLocaleLowerCase('es-MX').includes(businessName.toLocaleLowerCase('es-MX'));
    return businessName&&(duplicateName||!branchIncludesBusiness)?`${branch.name} · ${businessName}`:branch.name;
  };
  const branchServices=serviceCatalog.filter(item=>item.active!==false&&(!item.branchIds?.length||item.branchIds.includes(branchId))&&(!item.providerIds?.length||item.providerIds.includes(providerId)));
  return <Modal title="Nueva cita" subtitle="Vincula el expediente y elige un profesional y una sucursal donde atiende." close={close}>
    <form onSubmit={onSubmit} className="form-stack">
      <input type="hidden" name="serviceId" value={serviceId}/>
      <input type="hidden" name="serviceIds" value={JSON.stringify(serviceIds)}/>
      <div className="appointment-patient-field"><label>Paciente<SearchablePatientSelect patients={patientsForAppointment} name="patientId" value={patientId} onChange={id=>{setPatientId(id);setPackageId('')}}/></label>{canCreatePatient&&<button type="button" className="button outline compact appointment-add-patient" onClick={()=>setQuickPatientOpen(open=>!open)} aria-expanded={quickPatientOpen}><Plus size={14}/>{quickPatientOpen?'Cerrar':'Nuevo paciente'}</button>}</div>
      {quickPatientOpen&&<section className="appointment-quick-patient" aria-label="Crear paciente para esta cita"><div className="appointment-quick-patient-heading"><strong>Nuevo expediente</strong><span>Se agregará a esta cita al guardarlo.</span></div><label>Nombre completo<input autoFocus value={quickPatientName} onChange={event=>setQuickPatientName(event.target.value)} placeholder="Ej. Andrea García" maxLength="160"/></label><div className="form-grid"><label>Correo electrónico<input type="text" inputMode="email" value={quickPatientEmail} onChange={event=>setQuickPatientEmail(event.target.value)} placeholder="correo@ejemplo.com" maxLength="254"/></label><label>Teléfono<input type="tel" value={quickPatientPhone} onChange={event=>setQuickPatientPhone(event.target.value)} placeholder="Teléfono de contacto" maxLength="40"/></label></div><label className="whatsapp-opt-in"><input type="checkbox" checked={quickFirstVisit} onChange={event=>setQuickFirstVisit(event.target.checked)}/> Primera vez</label><div className="appointment-quick-patient-actions"><button type="button" className="button secondary compact" onClick={()=>setQuickPatientOpen(false)}>Cancelar</button><button type="button" className="button primary compact" onClick={createAndSelectPatient} disabled={!quickPatientName.trim()||quickPatientSaving}><Plus size={14}/>{quickPatientSaving?'Guardando…':'Crear y seleccionar'}</button></div></section>}
      <div className="form-grid"><label>Fecha<ClinicDateField name="date" value={date} onChange={event=>setDate(event.target.value)} required/></label><label>Hora<ClinicTimeField name="time" value={time} onChange={event=>setTime(event.target.value)} min="06:00" max={latestAppointmentStart(durationMinutes)} step={900} required/></label></div>
      <AppointmentServicePicker onCloseManual={()=>{setService('');setServiceId('');setPackageId('')}} manualField={<><label>Servicio manual<input autoFocus name="service" value={service} onChange={event=>setService(event.target.value)} onBlur={event=>applyServicePreset(event.target.value)} list="clinic-service-new-suggestions" placeholder="Captura un servicio manual" maxLength="120" required/></label><datalist id="clinic-service-new-suggestions">{[...new Set(['Consulta de valoración','Limpieza facial','Tratamiento facial','Seguimiento',...servicePresets.map(appointment=>appointment.service),...branchServices.map(item=>item.name)].filter(Boolean))].map(name=><option key={name} value={name}/>)}</datalist></>} services={serviceCatalog} selectedIds={serviceIds} providers={providersForBranch} branchId={branchId} providerId={providerId} onChange={(next, nextProviderId)=>{if(nextProviderId)setProviderId(nextProviderId);setServiceIds(next);setServiceId(next[0]||'');setService(next.map(id=>serviceCatalog.find(option=>option.id===id)?.name).filter(Boolean).join(' + '));setPackageId('');const selected=next.map(id=>serviceCatalog.find(option=>option.id===id));if(selected.length&&selected.every(option=>option?.durationMin))updateDuration(String(selected.reduce((total,option)=>total+Number(option.durationMax||option.durationMin),0)));}}/>
      {selectedPatient && <AppointmentHistory key={`${clinicId || 'demo'}:${patientId}`} patient={selectedPatient} sharedMode={sharedMode}
        clinicId={clinicId} appointments={historyAppointments} treatments={historyTreatments} date={date} time={time} timeZone={timeZone}/>}
      <label>Duración (minutos)<input name="durationMinutes" type="number" min="15" max="720" step="15" value={durationMinutes} onChange={event=>updateDuration(event.target.value)}/></label>
      <label>Modalidad<select name="modality" defaultValue="Presencial"><option>Presencial</option><option>Virtual</option></select></label>
      <label>Negocio<select name="businessId" required value={businessId} onChange={event=>{const nextBusinessId=event.target.value;const nextBranches=activeBranches.filter(item=>item.businessId===nextBusinessId);const currentProvider=activeProviders.find(item=>item.id===providerId);const nextBranch=nextBranches.find(item=>!currentProvider?.branchIds?.length||currentProvider.branchIds.includes(item.id))||nextBranches[0];const nextProvider=activeProviders.find(item=>!item.branchIds?.length||item.branchIds.includes(nextBranch?.id));setBusinessId(nextBusinessId);setBranchId(nextBranch?.id||'');setProviderId(currentProvider&&(!currentProvider.branchIds?.length||currentProvider.branchIds.includes(nextBranch?.id))?currentProvider.id:nextProvider?.id||'')}}>{activeBusinesses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="form-grid appointment-assignment-grid"><label>Profesional<select name="providerId" required value={providerId} onChange={event=>{const nextProviderId=event.target.value;const nextProvider=activeProviders.find(item=>item.id===nextProviderId);const nextBranch=branchesForBusiness.find(item=>item.id===branchId&&(!nextProvider?.branchIds?.length||nextProvider.branchIds.includes(item.id)))||branchesForBusiness.find(item=>!nextProvider?.branchIds?.length||nextProvider.branchIds.includes(item.id));setProviderId(nextProviderId);setBranchId(nextBranch?.id||'')}}>{providersForBusiness.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Sucursal<select name="branchId" required value={branchId} onChange={event=>{const nextBranch=activeBranches.find(item=>item.id===event.target.value);setBranchId(nextBranch?.id||'');if(nextBranch?.businessId)setBusinessId(nextBranch.businessId)}}>{branchOptions.map(item=><option key={item.id} value={item.id}>{branchOptionLabel(item)}</option>)}</select></label></div>
      {branchOptions.some(item=>item.businessId!==businessId)&&<div className="form-note"><Building2 size={15}/> Al elegir una sucursal de otro negocio, este campo se actualizará automáticamente.</div>}
      <AppointmentColorPreview providerId={providerId} branchId={branchId} service={service} providers={providers}/>
      {packageOptions.length > 0 && <label>Paquete del paciente<select name="packageId" value={selectedPackage?.id || ''} onChange={event=>setPackageId(event.target.value)}>
        <option value="">Cita individual</option>
        {packageOptions.map(item=><option key={item.id} value={item.id}>{item.serviceName} · {item.availableSessions} disponibles · {item.outstandingAmount ? formatCurrencyMXN(item.outstandingAmount) + ' pendientes' : 'Liquidado'} · {item.id.slice(-6)}</option>)}
      </select></label>}
      {selectedPackage ? <div className="form-note">La cita reserva una sesión. Los cobros se registran en el saldo del paquete.</div> : <>
      <label>Monto del anticipo requerido (MXN)<input name="depositAmount" type="number" min="0.01" max="9999999999.99" step="0.01" value={depositOverride ?? suggestedDeposit ?? ''} onChange={event=>setDepositOverride(event.target.value)} placeholder="Captura el anticipo" required/></label>
      {suggestedDeposit != null && <div className="form-note">
        <span>Anticipo sugerido según los servicios: {formatCurrencyMXN(suggestedDeposit)}. Puedes editarlo.</span>
        {depositOverride !== null && <button type="button" className="text-link" onClick={()=>setDepositOverride(null)}>Usar anticipo sugerido</button>}
      </div>}
      {pendingDeposits.length > 0 && <div className="form-note" role="status">
        <span>Falta definir el anticipo para {pendingDeposits.join(', ')}.
          {depositSubtotal > 0 && <> Subtotal calculado: {formatCurrencyMXN(depositSubtotal)}.</>}
          {' '}Captura el total de la cita o configura el precio por sesión o un anticipo fijo en Servicios.
        </span>
      </div>}
      <AppointmentSessionPrice key={serviceIds.join('|') || serviceId} {...quote}/>
      <div className="form-note"><Bell size={15}/> {sharedMode?"La base compartida verificará el anticipo registrado antes de permitir confirmar.":"La cita no podrá marcarse como confirmada hasta que el anticipo esté registrado en Pagos."}</div>
      </>}
      <label>Notas de la cita (opcional)<textarea name="note" rows={3}/></label>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit" disabled={!patients.length||!activeBusinesses.length||!branchOptions.length||!providersForBranch.length}><CalendarDays size={16}/> Agendar cita</button></div>
    </form>
  </Modal>;
}

function NewContractModal({close,onSubmit,onReviewDiagnosis,onAddTemplate,patients,templates,services=[],defaultPatientId,sharedMode=false,canPrepare=true}) {
  const [patientId,setPatientId]=useState(defaultPatientId||'');
  const readyTemplates = templates.filter(template => template.content?.trim());
  const selectedPatient = patients.find(patient => patient.id === patientId);
  const diagnosisAccepted = Boolean(selectedPatient?.diagnosisAccepted && selectedPatient?.diagnosisId);
  return <Modal title="Nuevo contrato de servicios" subtitle="Prepara un contrato para revisar con el paciente." close={close}>
    <form className="form-stack" onSubmit={onSubmit}>
      <label>Paciente<SearchablePatientSelect patients={patients} value={patientId} onChange={setPatientId}/></label>
      <label>Formato oficial<select name="contractTemplate" defaultValue="" required><option value="" disabled>Seleccionar formato…</option>{readyTemplates.map(template=><option key={template.id} value={template.id}>{template.title}{template.version?` · ${template.version}`:''} · {template.type}</option>)}</select></label>
      <label>Servicio<select name="service" required defaultValue=""><option value="" disabled>Elige el servicio de esta visita…</option>{services.filter(service=>service.active!==false&&service.name).map(service=><option key={service.id} value={service.name}>{service.name}</option>)}</select></label>
      {readyTemplates.length===0&&<div className="form-note"><FileText size={14}/> Agrega un formato oficial con contenido antes de preparar el documento. <button type="button" className="text-link" onClick={onAddTemplate}>Crear formato oficial</button></div>}
      {patients.length===0&&<div className="form-note"><ClipboardCheck size={14}/> No hay pacientes disponibles. Registra un paciente desde Pacientes para comenzar.</div>}
      {selectedPatient&&!diagnosisAccepted&&<div className="form-note"><ClipboardCheck size={14}/> Acepta el diagnóstico de {selectedPatient.name} antes de preparar el contrato. <button type="button" className="text-link" onClick={()=>onReviewDiagnosis?.(selectedPatient.id)}>Revisar diagnóstico</button></div>}
      <div className="form-note"><ShieldCheck size={15}/> {sharedMode?'Se guarda una copia inmutable para revisión; la firma electrónica aún no está conectada.':'La vista y firma son de demostración; no se envían ni tienen validez legal.'}</div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" disabled={!canPrepare||!readyTemplates.length||!patients.length||!diagnosisAccepted}><FilePlus2 size={16}/> Preparar contrato</button></div>
    </form>
  </Modal>;
}

function PaymentModal({close,onSubmit,defaultDate,defaultAppointmentId,patients,appointments,payments,canRefund=true,sharedMode=false,clinicId,demoPurchases=[],demoAppointments=[],demoPayments=[]}) {
  const initialAppointment=appointments.find(item=>item.id===defaultAppointmentId);
  const initialPatientId=initialAppointment?.patientId||patients.find(patient=>patient.name===initialAppointment?.patient)?.id||patients[0]?.id||'';
  const [patientId,setPatientId]=useState(initialPatientId);
  const [appointmentId,setAppointmentId]=useState(defaultAppointmentId||'');
  const [direction,setDirection]=useState('Ingreso');
  const patient=patients.find(item=>item.id===patientId);
  const appointmentOptions=appointments.filter(item=>item.patientId===patientId||item.patient===patient?.name);
  const linkedAppointment=appointments.find(item=>item.id===appointmentId);
  const [packageId,setPackageId]=useState('');
  const packageRows=usePatientPackages({patient,clinicId,sharedMode,demoPurchases,appointments:demoAppointments,payments:demoPayments});
  const packageOptions=packageRows?.rows||[];
  const purchase=!appointmentId&&packageOptions.find(item=>item.id===packageId);
  const refundAvailability=purchase ? {balance:purchase.paidAmount,protectedDeposits:0,available:purchase.paidAmount}
    : patient?summarizeRefundAvailability(patient.id,patient.name,linkedAppointment,appointments,payments):{balance:0,protectedDeposits:0,available:0};
  const [currency,setCurrency]=useState('MXN');
  const [amount,setAmount]=useState('');
  const [transactionDate,setTransactionDate]=useState(defaultDate);
  const [saving,setSaving]=useState(false);
  const submitting=useRef(false);
  const rate=useReferenceRate(transactionDate);
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || (currency === 'USD' && !rate.quote)) return;
    submitting.current=true;
    setSaving(true);
    try { await onSubmit(event,currency === 'USD' ? rate.quote : null); }
    finally { submitting.current=false; setSaving(false); }
  }
  return <Modal title="Registrar movimiento" subtitle="Guarda un ingreso o reembolso como un registro independiente." close={close}><form onSubmit={submit} className="form-stack"><label>Paciente<SearchablePatientSelect patients={patients} name="patientId" value={patientId} onChange={id=>{setPatientId(id);setAppointmentId('');setPackageId('')}}/></label><label>Cita vinculada<select name="appointmentId" value={appointmentId} onChange={event=>{setAppointmentId(event.target.value);setPackageId('')}}><option value="">Sin cita vinculada</option>{appointmentOptions.map(item=><option key={item.id} value={item.id}>{item.date} · {item.time} · {item.service}</option>)}</select></label>{!appointmentId&&packageOptions.length>0&&<label>Paquete vinculado<select name="packageId" value={purchase?.id||''} onChange={event=>setPackageId(event.target.value)}><option value="">Sin paquete</option>{packageOptions.map(item=><option key={item.id} value={item.id}>{item.serviceName} · {item.outstandingAmount?formatCurrencyMXN(item.outstandingAmount)+' pendientes':'Liquidado'} · {item.id.slice(-6)}</option>)}</select></label>}<div className="form-grid"><label>Tipo<select name="direction" value={direction} onChange={event=>setDirection(event.target.value)}><option>Ingreso</option>{canRefund&&<option>Reembolso</option>}</select></label><label>Moneda del movimiento<select value={currency} onChange={event=>{setCurrency(event.target.value);setAmount('')}}><option>MXN</option><option>USD</option></select></label><label>{`Monto (${currency})`}<input name="amount" type="number" min="0.01" max={currency==='USD'?9999999999.99:direction==='Reembolso'?refundAvailability.available:purchase?.outstandingAmount} step="0.01" placeholder="0.00" required value={amount} onChange={event=>setAmount(event.target.value)}/></label></div><div className="form-grid"><label>Fecha<ClinicDateField name="date" value={transactionDate} onChange={event=>setTransactionDate(event.target.value)} required/></label><label>Método<select name="method" defaultValue="Transferencia"><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Otro</option></select></label></div>{currency==='USD'&&<ExchangeRatePreview rate={rate} amount={amount} currency={currency} disabled={!transactionDate || saving}/>}<label>Nota opcional<input name="note" maxLength="240" placeholder="Referencia, concepto o motivo"/></label>{direction==='Reembolso'&&patient&&<div className="form-note"><CalendarDays size={15}/>{purchase?`Saldo del paquete ${purchase.serviceName}`:linkedAppointment?`${linkedAppointment.service} · ${linkedAppointment.date}`:`Saldo del expediente de ${patient.name}`} · Saldo: {formatCurrencyMXN(refundAvailability.balance)} · Anticipos reservados: {formatCurrencyMXN(refundAvailability.protectedDeposits)} · Disponible para reembolso: {formatCurrencyMXN(refundAvailability.available)}</div>}<div className="form-note"><ShieldCheck size={15}/> Los movimientos se conservan en el historial. Para corregir un ingreso registra un reembolso, no edites el movimiento.</div><div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit" disabled={saving || (currency==='USD' && !rate.quote)}><DollarSign size={15}/>{saving?'Guardando…':'Guardar movimiento'}</button></div></form></Modal>;
}

function PatientRecallPage({patients,appointments,packages=[],packageStatus='ready',timeZone,onRetryPackages,onOpenPatient,onNewAppointment}) {
  const queue = useMemo(() => buildPatientRecallQueue(patients, appointments, packages, timeZone), [patients, appointments, packages, timeZone]);
  const patientCount = new Set(queue.map(item => item.patient.id)).size;
  const packageCount = queue.filter(item => item.kind === 'package').length;
  return <div className="patient-recall-page">
    <PageTitle eyebrow="CONTINUIDAD DE ATENCIÓN" title="Seguimiento de pacientes" description="Retoma tratamientos faciales y ayuda a cada paciente a completar las sesiones disponibles de sus paquetes."/>
    <div className="reminder-summary-grid">
      <div className="reminder-summary-card"><span>Personas por contactar</span><strong>{patientCount}</strong></div>
      <div className="reminder-summary-card"><span>Sesiones de paquete por agendar</span><strong>{packageCount}</strong></div>
      <div className="reminder-summary-card"><span>Seguimientos</span><strong>Retorno · facial · paquetes</strong></div>
    </div>
    <section className="panel reminder-ledger">
      <div className="panel-heading"><div><div className="panel-title">Lista de regreso</div><p className="panel-subtitle">Incluye pacientes marcados para seguimiento, visitas estéticas completadas hace 30 días o más y paquetes con sesiones sin cita reservada.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>PACIENTE</th><th>MOTIVO</th><th>ÚLTIMA VISITA</th><th>ESTADO</th><th></th></tr></thead><tbody>
        {queue.map(({kind,patient,purchase,lastVisit,daysSince,reason}) => <tr key={patient.id + ':' + kind + ':' + (purchase?.id || 'return')}>
          <td><div className="patient-cell"><Avatar initials={patient.initials} tone={patient.tone}/><div><strong>{patient.name}</strong><span>{patient.id} · {patient.treatment}</span></div></div></td>
          <td>{reason}</td>
          <td>{lastVisit ? formatRecordDate(lastVisit.date) + (daysSince !== null ? ' · hace ' + daysSince + ' días' : '') : purchase?.createdAt ? 'Paquete del ' + formatRecordDate(purchase.createdAt) : 'Sin visita completada registrada'}</td>
          <td><span className="reminder-status pending"><i/>{kind === 'package' ? 'Sesión disponible' : 'Sin cita futura'}</span></td>
          <td><div className="recall-actions"><button className="button outline compact" onClick={() => onOpenPatient(patient)}>Ver expediente</button><button className="button primary compact" onClick={() => onNewAppointment(patient,purchase)}><CalendarPlus size={14}/> Agendar</button></div></td>
        </tr>)}
      </tbody></table>
        {queue.length === 0 && packageStatus === 'loading' && <div className="empty-state"><Activity size={20}/><strong>Cargando paquetes y seguimientos…</strong><span>Estamos revisando las sesiones disponibles y las citas futuras.</span></div>}
        {queue.length === 0 && packageStatus === 'error' && <div className="empty-state" role="alert"><Activity size={20}/><strong>No se pudieron cargar los paquetes</strong><span>Revisa la conexión e inténtalo de nuevo.</span><button className="button outline compact" onClick={onRetryPackages}>Reintentar</button></div>}
        {queue.length === 0 && packageStatus === 'ready' && <div className="empty-state"><Activity size={20}/><strong>No hay pacientes pendientes de regreso</strong><span>Aquí aparecerán seguimientos, retornos faciales y paquetes con sesiones disponibles.</span></div>}
      </div>
    </section>
  </div>;
}
function RemindersPage({ reminders, sharedMode = false }) {
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [kindFilter, setKindFilter] = useState('Todos');
  const pending = reminders.filter(item => (item.status === 'pending' || item.status === 'sending') && item.deliveryEligible).length;
  const blocked = reminders.filter(item => item.status === 'blocked' || (['pending', 'failed'].includes(item.status) && !item.deliveryEligible)).length;
  const sent = reminders.filter(item => item.status === 'sent' && !item.simulated).length;
  const hasRealAttempts = reminders.some(item => !item.simulated && ['sent', 'failed', 'unknown'].includes(item.status));
  const attention = reminders.filter(item => !item.simulated && (item.status === 'failed' || item.status === 'unknown')).length;
  const statusLabels = { pending: 'Pendiente', sending: 'En preparación', sent: 'Enviado', failed: 'Error', unknown: 'Entrega incierta · revisar', blocked: 'Bloqueado', skipped: 'Omitido', cancelled: 'Cancelado' };
  const sorted = reminders.filter(item => {
    const statusMatches = statusFilter === 'Todos'
      || (statusFilter === 'Pendientes' && (['pending', 'sending'].includes(item.status) || item.simulated) && item.deliveryEligible)
      || (statusFilter === 'Bloqueados' && (item.status === 'blocked' || (['pending', 'failed'].includes(item.status) && !item.deliveryEligible)))
      || (statusFilter === 'Enviados' && item.status === 'sent' && !item.simulated)
      || (statusFilter === 'Requieren atención' && ['failed', 'unknown'].includes(item.status) && !item.simulated)
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
      <div className="reminder-delivery-note"><Bell size={15}/><span>{sharedMode ? hasRealAttempts ? 'La programación se guarda en la clínica. Los avisos requieren autorización explícita, teléfono válido y una plantilla aprobada.' : 'La programación se guarda en la clínica. Solo pacientes con autorización y teléfono válido son elegibles; los avisos también requieren números y plantillas configurados.' : 'Vista de demostración: muestra cuándo tocaría cada aviso; no se envían mensajes.'}</span></div>
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
          <td><span className={`reminder-status ${item.simulated ? 'pending' : item.status || 'pending'}`}><i/>{item.simulated && item.deliveryEligible ? 'Pendiente de configuración' : statusLabels[item.status] || 'Pendiente'}</span>{!item.deliveryEligible&&item.deliveryBlockReason&&<small className="reminder-block-reason">{item.deliveryBlockReason}</small>}</td>
        </tr>)}
      </tbody></table>
        {sorted.length === 0 && <div className="empty-state"><Bell size={20}/><strong>No hay avisos programados</strong><span>Las citas aparecerán aquí cuando estén confirmadas.</span></div>}
      </div>
    </section>
  </>;
}

function FinanceWorkspace({children,expenses}) {
  const [tab,setTab] = useState('payments');
  useEffect(() => {
    const requested = new URL(window.location.href).searchParams.get('tab');
    if (requested === 'expenses' || requested === 'exchange') setTab(requested);
  }, []);
  function select(next) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'payments') url.searchParams.delete('tab');
    else url.searchParams.set('tab',next);
    window.history.replaceState(null,'',url);
  }
  return <>
    <nav className="expense-tabs" aria-label="Finanzas">
      <button className={`button ${tab==='payments'?'primary':'outline'} compact`} type="button" aria-pressed={tab==='payments'} onClick={()=>select('payments')}>Pagos de pacientes</button>
      <button className={`button ${tab==='expenses'?'primary':'outline'} compact`} type="button" aria-pressed={tab==='expenses'} onClick={()=>select('expenses')}>Gastos y corte</button>
      <button className={`button ${tab==='exchange'?'primary':'outline'} compact`} type="button" aria-pressed={tab==='exchange'} onClick={()=>select('exchange')}>Convertir moneda</button>
    </nav>
    {tab==='expenses' ? expenses : tab==='exchange' ? <CurrencyConverter/> : children}
  </>;
}

function PaymentsPage({payments,appointments,patients,onNewPayment,sharedMode=false,canCreatePayment=true}) {
  const sortedPayments=payments.slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||''));
  const income=payments.filter(payment=>payment.direction==='Ingreso').reduce((total,payment)=>total+Number(payment.amount||0),0);
  const refunds=payments.filter(payment=>payment.direction==='Reembolso').reduce((total,payment)=>total+Number(payment.amount||0),0);
  const net=income-refunds;
  return <><PageTitle eyebrow="ADMINISTRACIÓN" title="Pagos" description="Registra ingresos y reembolsos vinculados a pacientes y citas." action={canCreatePayment&&<button className="button primary" onClick={onNewPayment}><Plus size={16}/> Registrar movimiento</button>}/><div className="payment-summary-grid"><div className="payment-summary-card"><span>Ingresos registrados</span><strong>{formatCurrencyMXN(income)}</strong></div><div className="payment-summary-card refund"><span>Reembolsos</span><strong>{formatCurrencyMXN(refunds)}</strong></div><div className="payment-summary-card net"><span>Neto registrado</span><strong>{formatCurrencyMXN(net)}</strong></div></div><section className="panel payment-ledger"><div className="panel-heading"><div><div className="panel-title">Historial de movimientos</div><p className="panel-subtitle">{payments.length} movimientos · cada ingreso y reembolso conserva su propio registro</p></div></div><div className="table-wrap"><table><thead><tr><th>FECHA</th><th>PACIENTE</th><th>CITA</th><th>TIPO</th><th>MÉTODO</th><th>NOTA</th><th>MONTO</th></tr></thead><tbody>{sortedPayments.map(payment=>{const patient=patients.find(item=>item.id===payment.patientId);const appointment=appointments.find(item=>item.id===payment.appointmentId);return <tr key={payment.id}><td>{formatRecordDate(payment.date)}</td><td><div className="patient-cell"><Avatar initials={patient?.initials||payment.patientNameSnapshot?.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'PA'} tone={patient?.tone||'blue'}/><div><strong>{patient?.name||payment.patientNameSnapshot||'Paciente'}</strong><span>{patient?.id||'Expediente'}</span></div></div></td><td>{appointment?`${appointment.date} · ${appointment.time} · ${appointment.service}`:'Sin cita vinculada'}</td><td><span className={`payment-type ${payment.direction==='Reembolso'?'refund':''}`}>{payment.direction}</span></td><td>{payment.method}</td><td>{payment.note||'—'}</td><td className={`payment-amount ${payment.direction==='Reembolso'?'refund-text':''}`}>{payment.direction==='Reembolso'?'−':'+'}{formatCurrencyMXN(payment.amount)}{payment.exchange&&<small>{paymentExchangeLabel(payment.exchange)}</small>}</td></tr>})}</tbody></table>{sortedPayments.length===0&&<div className="empty-state"><DollarSign size={20}/><strong>Aún no hay movimientos</strong><span>Registra un ingreso o un reembolso para empezar el historial.</span><button className="button primary compact" onClick={onNewPayment}><Plus size={14}/> Registrar movimiento</button></div>}</div></section><p className="payment-demo-note"><ShieldCheck size={14}/>{sharedMode?'Movimientos compartidos y de solo alta; confirma la conciliación bancaria por separado.':'Movimientos guardados localmente para demostración; no sustituyen una conciliación contable.'}</p></>;
}

function AgendaEventCard({ appointment, variant = 'calendar-event', compact = false, style, onOpen }) {
  const duration = appointment.duration || '45 min';
  const isShortDayEvent = variant === 'calendar-event' && Number.parseInt(duration, 10) < 20;
  const status = appointment.status || 'Por confirmar';
  const modality = appointment.modality || 'Presencial';
  const details = [
    appointment.date,
    appointment.time,
    duration,
    appointment.patient,
    appointment.service,
    status,
    appointment.arrivedAt ? 'Llegó a recepción' : '',
    modality,
    appointment.clinician,
    appointment.branch,
  ].filter(Boolean).join(' · ');
  const isPending = status === 'Por confirmar';
  const isCancelled = status === 'Cancelada';

  return <button
    type="button"
    className={`agenda-event-card agenda-colored-event ${variant} ${isPending ? 'is-pending' : ''} ${isCancelled ? 'is-cancelled' : ''} ${compact ? 'is-compact' : ''} ${isShortDayEvent ? 'is-short' : ''}`}
    style={{...style,...colorStyle(appointment.agendaColor)}}
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
      <span className="event-status">{appointment.arrivedAt && ['Por confirmar', 'Confirmada'].includes(status) ? 'Llegó' : status}</span>
    </span>
    {!compact && <small className="event-meta">{[appointment.clinician, appointment.branch, modality].filter(Boolean).join(' · ')}</small>}
  </button>;
}

function AgendaPage({canCreateAppointment=true,canEditAppointment=true,canCancelAppointment=true,currentAccountProviderId='',accountReady=false,listEnd,setListEnd,appointments,allAppointments,allProviders,clinicId,payments,sharedMode=false,timeZone='America/Tijuana',providerFilter,setProviderFilter,providerOptions,branchFilter,setBranchFilter,branchOptions,businessFilter,setBusinessFilter,businessOptions,period,setPeriod,onNewAppointment,notify,agendaDate,setAgendaDate,onOpenAppointment}) {
  const [showAvailability, setShowAvailability] = useState(false);
  const [availableDuration, setAvailableDuration] = useState(30);
  const availabilityActive = period === 'Día' && showAvailability;
  const availability = useAgendaAvailability(availabilityActive, sharedMode, clinicId, agendaDate, timeZone);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState([]);
  const [onlyMine,setOnlyMine] = useState(false);
  const [selectedColors, setSelectedColors] = useState([]);
  const [compactColorIds, setCompactColorIds] = useState([]);
  const compactView = period === 'Compacta';
  const dailyView = period === 'Día' || compactView;
  const compactColors = useMemo(() => compactAgendaColors(allProviders), [allProviders]);
  const [appointmentQuery, setAppointmentQuery] = useState('');
  const [listSort, setListSort] = useState('date');
  useEffect(() => { setSelectedProviderIds(previous => previous.filter(id => providerOptions.some(provider => provider.id === id))); }, [providerOptions]);
  const coloredAppointments = appointments.map(item => ({ ...item, agendaColor: compactView ? (item.providerId || 'unassigned') : appointmentAgendaColor(item, providerOptions) }));
  const colorOptions = agendaPalette.map(color => {
    const meanings = [];
    for (const provider of providerOptions.filter(item => item.id && (!onlyMine || item.id===currentAccountProviderId) && (!selectedProviderIds.length || selectedProviderIds.includes(item.id)))) {
      for (const [branchId, settings] of Object.entries(provider.branchSettings || {})) {
        if (branchFilter && branchId !== branchFilter || !branchOptions.some(branch => branch.id === branchId)) continue;
        const branchName = branchOptions.find(branch => branch.id === branchId)?.name;
        const services = Object.entries(settings.serviceColors || {}).filter(([, value]) => value === color.id).map(([service]) => service);
        if (settings.color === color.id || services.length) meanings.push(`${provider.name} · ${branchName}${services.length ? ` (${services.join(', ')})` : ''}`);
      }
    }
    return { ...color, meaning: [...new Set(meanings)].join(' / ') };
  }).filter(color => color.meaning || color.id === 'unassigned');
  useEffect(() => { setSelectedColors(previous => previous.filter(id => colorOptions.some(color => color.id === id))); }, [branchFilter,businessFilter,providerOptions,selectedProviderIds,onlyMine,currentAccountProviderId]);

  const [statusFilter,setStatusFilter]=useState('Todos los estados');
  const [currentTime,setCurrentTime]=useState(null);
  useEffect(()=>{const updateTime=()=>setCurrentTime(new Date());updateTime();const timer=window.setInterval(updateTime,60000);return()=>window.clearInterval(timer)},[]);
  const providers=providerOptions;
  const branches=branchOptions;
  const visibleProviders=providers.filter(provider=>provider.id&&(!onlyMine||provider.id===currentAccountProviderId)&&(!selectedProviderIds.length||selectedProviderIds.includes(provider.id))&&(availabilityActive||!selectedColors.length||Object.entries(provider.branchSettings||{}).some(([branchId,settings])=>(!branchFilter||branchId===branchFilter)&&branchOptions.some(branch=>branch.id===branchId)&&(selectedColors.includes(settings.color||'unassigned')||Object.values(settings.serviceColors||{}).some(color=>selectedColors.includes(color))))));
  const dayProviders=visibleProviders.length?visibleProviders:onlyMine?[]:[{id:'unassigned',name:'Sin profesional asignado',initials:'—'}];
  const availableLanes = new Map();
  if (availabilityActive && availability.status === 'ready') {
    for (const provider of visibleProviders) {
      const branchChoices = branches.filter(branch => branch.id && (!branchFilter || branch.id === branchFilter)
        && (!provider.branchIds.length || provider.branchIds.includes(branch.id)));
      if (!branchChoices.length) continue;
      const branch = branchChoices.find(item => availability.hours.some(row => row.provider_id === provider.id && row.branch_id === item.id)) ?? branchChoices[0];
      const hours = agendaWorkingHours(availability.hours, agendaDate, provider.id, branch.id);
      const free = agendaFreeBlocks({ date: agendaDate, timeZone, provider, branchId: branch.id,
        windows: hours.windows, appointments: allAppointments, blocks: availability.blocks, duration: availableDuration });
      availableLanes.set(provider.id, { branch, ...hours, free });
    }
  }
  const availabilityNeedsHours = [...availableLanes.values()].some(lane => lane.assumed);
  const hasFreeBlocks = [...availableLanes.values()].some(lane => lane.free.length);
  const availableWindows = [...availableLanes.values()].flatMap(lane => lane.windows);
  const dayStartHour = availabilityActive ? Math.floor(Math.min(...[defaultAgendaHours, ...availableWindows].map(window => window.start)) / 60) : 6;
  const dayEndHour = availabilityActive ? Math.ceil(Math.max(...[defaultAgendaHours, ...availableWindows].map(window => window.end)) / 60) : 24;
  const daySlotCount=((dayEndHour-dayStartHour)*60-45)/15+1;
  const activeFilterCount=[onlyMine,Boolean(providerFilter)||selectedProviderIds.length>0,(compactView?compactColorIds:selectedColors).length>0,Boolean(appointmentQuery),Boolean(branchFilter),Boolean(businessFilter),statusFilter!=='Todos los estados'].filter(Boolean).length;
  const selectedDate=new Date(`${agendaDate}T12:00:00Z`);
  const weekStart=new Date(selectedDate);
  weekStart.setUTCDate(weekStart.getUTCDate()-((weekStart.getUTCDay()+6)%7));
  const monthStart=new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth(),1,12));
  const yearStart=new Date(Date.UTC(selectedDate.getUTCFullYear(),0,1,12));
  const rangeStart=period==='Semana'?weekStart:period==='Mes'?monthStart:period==='Año'?yearStart:selectedDate;
  const rangeEnd=period==='Lista'&&listEnd>=agendaDate?new Date(`${listEnd}T12:00:00Z`):period==='Semana'?new Date(Date.UTC(weekStart.getUTCFullYear(),weekStart.getUTCMonth(),weekStart.getUTCDate()+7,12)):period==='Mes'?new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth()+1,1,12)):period==='Año'?new Date(Date.UTC(selectedDate.getUTCFullYear()+1,0,1,12)):new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth(),selectedDate.getUTCDate()+1,12));
  if(period==='Lista'&&listEnd>=agendaDate) rangeEnd.setUTCDate(rangeEnd.getUTCDate()+1);
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
  const appointmentsInRange=filterAgendaAppointments(coloredAppointments,{providerIds:selectedProviderIds,colors:compactView?compactColorIds:selectedColors,query:appointmentQuery,onlyMine,currentProviderId:currentAccountProviderId}).filter(item=>{const date=new Date(`${item.date||agendaDate}T12:00:00Z`);return date>=rangeStart&&date<rangeEnd&&(statusFilter==='Todos los estados'||item.status===statusFilter);});
  const showCurrentTimeLine=agendaDate===todayKey&&currentMinutes>=dayStartHour*60&&currentMinutes<dayEndHour*60;
  const appointmentsFor=(key)=>appointmentsInRange.filter(item=>(item.date||agendaDate)===key).sort((a,b)=>a.time.localeCompare(b.time));
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
  const clearFilters=()=>{setProviderFilter('');setBranchFilter('');setBusinessFilter('');setStatusFilter('Todos los estados');setSelectedProviderIds([]);setSelectedColors([]);setCompactColorIds([]);setAppointmentQuery('');setOnlyMine(false);};
  const weekDays=Array.from({length:7},(_,index)=>{const date=new Date(weekStart);date.setUTCDate(date.getUTCDate()+index);return date;});
  const monthOffset=(monthStart.getUTCDay()+6)%7;
  const monthLength=new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth()+1,0,12)).getUTCDate();
  const monthCells=Array.from({length:Math.ceil((monthOffset+monthLength)/7)*7},(_,index)=>index-monthOffset+1);
  const yearMonths=Array.from({length:12},(_,month)=>new Date(Date.UTC(selectedDate.getUTCFullYear(),month,1,12)));
  return <><PageTitle title="Agenda" description="Coordina las citas de cada profesional, sucursal y negocio." action={<div className="agenda-title-actions">{sharedMode&&<div className="agenda-account-scope" role="group" aria-label="Citas por cuenta"><button type="button" aria-pressed={!onlyMine} onClick={()=>setOnlyMine(false)}>Todas las citas</button><button type="button" aria-pressed={onlyMine} disabled={!accountReady} onClick={()=>{setOnlyMine(true);setSelectedProviderIds([]);setProviderFilter('')}}><UserRound size={14}/> Mis citas</button></div>}{canCreateAppointment&&<button className="button primary" onClick={()=>onNewAppointment()}><Plus size={16}/> Nueva cita</button>}</div>}/><section className={`panel calendar-panel ${filtersOpen?'mobile-filters-open':''} ${availabilityActive?'availability-active':''} ${compactView?'compact-view-active':''}`}><div className="calendar-toolbar"><div className="calendar-left"><div className="date-navigator"><button aria-label="Periodo anterior" onClick={()=>changeDate(-1)}><ChevronLeft size={17}/></button><label className="agenda-date-picker"><ClinicDateField aria-label="Elegir fecha de agenda" value={agendaDate} onChange={event=>setAgendaDate(event.target.value)}/></label><button aria-label="Periodo siguiente" onClick={()=>changeDate(1)}><ChevronRight size={17}/></button></div><button className="button outline compact" onClick={goToToday}>Hoy</button></div><div className="calendar-right"><button className="button outline compact agenda-print-button" onClick={()=>window.print()}><Printer size={14}/> Imprimir</button><button className="button outline compact agenda-filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(open=>!open)}><Filter size={14}/> Filtrar{activeFilterCount>0&&<span className="filter-count">{activeFilterCount}</span>}</button><label className="agenda-mobile-period"><select aria-label="Vista de agenda" value={period} onChange={event=>setPeriod(event.target.value)}>{['Día','Compacta','Semana','Mes','Año','Lista'].map(view=><option key={view}>{view}</option>)}</select><ChevronDown size={14}/></label><div className="period-toggle">{['Día','Compacta','Semana','Mes','Año','Lista'].map(x=><button onClick={()=>setPeriod(x)} className={period===x?'active':''} key={x}>{x}</button>)}</div><div className="agenda-options"><button type="button" className="icon-button outline" aria-label="Opciones de agenda" aria-expanded={optionsOpen} onClick={()=>setOptionsOpen(open=>!open)}><MoreHorizontal size={18}/></button>{optionsOpen&&<div className="agenda-options-menu"><button type="button" className="agenda-mobile-print" onClick={()=>{setOptionsOpen(false);window.print()}}><Printer size={14}/> Imprimir</button><button type="button" onClick={()=>{goToToday();setPeriod('Día');clearFilters();setOptionsOpen(false)}}><CalendarDays size={14}/> Restablecer vista</button></div>}</div></div></div><AgendaIdentityFilters providers={providers} providerIds={selectedProviderIds} setProviderIds={ids=>{setOnlyMine(false);setSelectedProviderIds(ids)}} colorOptions={compactView?compactColors.filter(color=>providers.some(provider=>provider.id===color.id)||compactColorIds.includes(color.id)):colorOptions} colors={compactView?compactColorIds:selectedColors} setColors={compactView?setCompactColorIds:setSelectedColors} query={appointmentQuery} setQuery={setAppointmentQuery} availabilityControls={period==='Día'&&<AgendaAvailabilityControls active={availabilityActive} onToggle={()=>setShowAvailability(value=>!value)} duration={availableDuration} onDurationChange={setAvailableDuration}/>}/>{filtersOpen&&<div className="agenda-filter-panel"><label className="select-filter"><Activity size={15}/><select aria-label="Filtrar por sucursal" value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}>{branches.map(b=><option key={b.id || b.name} value={b.id}>{b.name}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><Building2 size={15}/><select aria-label="Filtrar por negocio" value={businessFilter} onChange={e=>{setBusinessFilter(e.target.value);setBranchFilter("")}}>{businessOptions.map(b=><option key={b.id || b.name} value={b.id}>{b.name}</option>)}</select><ChevronDown size={14}/></label><label className="select-filter"><ListFilter size={15}/><select aria-label="Filtrar citas por estado" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option>Todos los estados</option><option>Por confirmar</option><option>Confirmada</option><option>Completada</option><option>Cancelada</option></select><ChevronDown size={14}/></label><button className="text-link" onClick={clearFilters}>Limpiar filtros <X size={13}/></button></div>}{onlyMine&&accountReady&&!currentAccountProviderId&&<div className="agenda-account-note" role="status"><UserRound size={18}/><div><strong>Tu cuenta aún no está vinculada a un profesional</strong><p>Vincula tu cuenta desde Equipo y sucursales para ver tus citas. Puedes volver a «Todas las citas» para consultar la agenda.</p></div></div>}<div className="agenda-summary"><div className="day-summary"><div className="day-number">{dailyView||period==='Lista'?new Intl.DateTimeFormat('es-MX',{day:'2-digit',timeZone:'UTC'}).format(selectedDate):period==='Semana'?`${weekStart.getUTCDate()}–${new Date(Date.UTC(weekStart.getUTCFullYear(),weekStart.getUTCMonth(),weekStart.getUTCDate()+6,12)).getUTCDate()}`:period==='Mes'?new Intl.DateTimeFormat('es-MX',{month:'short',timeZone:'UTC'}).format(selectedDate):selectedDate.getUTCFullYear()}</div><div>{(dailyView||period==='Lista')&&<strong>{new Intl.DateTimeFormat('es-MX',{weekday:'long',timeZone:'UTC'}).format(selectedDate)}</strong>}<span>{period==='Semana'?dateLabel:dailyView||period==='Lista'?new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(selectedDate):''}</span></div><Badge variant="active"><span className="badge-dot"/>{appointmentsInRange.length} {appointmentsInRange.length===1?'cita':'citas'}</Badge></div><p className="agenda-color-explanation">{availabilityActive ? 'En verde, horarios que admiten la duración elegida.' : compactView ? 'Color por profesional.' : 'Color por profesional, sucursal y procedimiento. El estado aparece en cada cita.'}</p></div>
  {period==='Día'&&dayProviders.length>1&&<p className="agenda-mobile-hint">Desliza la agenda para ver más profesionales.</p>}
  {availabilityActive && (availability.status !== 'ready' || availabilityNeedsHours || !hasFreeBlocks) && <div className="agenda-availability-status" role="status">
    {availability.status === 'loading' && 'Cargando disponibilidad…'}
    {availability.status === 'error' && <>No se pudo cargar la disponibilidad. <button type="button" className="text-link" onClick={availability.retry}>Reintentar</button></>}
    {availability.status === 'ready' && <>
      {!hasFreeBlocks && <span>Sin horarios libres para la duración elegida</span>}
      {availabilityNeedsHours && <small>Sin horario configurado: se muestra de 09:00 a 18:00.</small>}
    </>}
  </div>}
  {period==='Día'&&(!onlyMine||currentAccountProviderId)&&<div className={`calendar-grid resource-calendar-grid ${availabilityActive ? 'show-availability' : ''}`} style={{'--provider-lane-count':dayProviders.length}}>
    <div className="time-gutter resource-time-gutter">
      <div className="provider-lane-spacer" aria-hidden="true"/>
      {Array.from({length:dayEndHour-dayStartHour},(_,index)=>`${String(index+dayStartHour).padStart(2,'0')}:00`).map(time=><div key={time}>{time}</div>)}
    </div>
    <div className="provider-day-lanes">
      {dayProviders.map(provider => {
        const lane = availableLanes.get(provider.id);
        const laneAppointments = appointmentsInRange.filter(item => (item.date||agendaDate)===agendaDate
          && item.providerId===provider.id && timeToMinutes(item.time) >= dayStartHour * 60
          && timeToMinutes(item.time) < dayEndHour * 60);
        return <section className="provider-day-lane" key={provider.id} aria-label={`Agenda de ${provider.name}`}>
          <div className="provider-lane-heading">
            <span className="provider-lane-avatar">{provider.initials||provider.name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase('es-MX')}</span>
            <div>
              <strong title={provider.name}>{provider.name}</strong>
              {availabilityActive
                ? <small title={lane?.branch.name}>{lane?.branch.name || 'Disponibilidad sin confirmar'}</small>
                : <small>{laneAppointments.length} {laneAppointments.length===1?'cita':'citas'}</small>}
            </div>
          </div>
          <div className="day-column" style={{height:`calc(var(--hour) * ${dayEndHour-dayStartHour})`}}>
            {!availabilityActive && Array.from({length:daySlotCount},(_,index)=>{
              const time=agendaSlotTime(index);
              return <button type="button" className="calendar-slot" key={time} aria-label={`Agendar cita para ${provider.name} el ${dateLabel} a las ${time}`} onClick={()=>onNewAppointment(agendaDate,time,'',provider.id)} style={{top:`calc(${index} * var(--hour) / 4)`,height:'calc(var(--hour) / 4)'}}>+ Agendar cita</button>;
            })}
            {Array.from({length:dayEndHour-dayStartHour},(_,index)=><div className="hour-line" key={index}/>)}
            {lane?.free.map(block => <AgendaFreeBlock key={block.start} block={block} dayStartHour={dayStartHour}
              provider={provider} branch={lane.branch} onBook={canCreateAppointment ? time => onNewAppointment(
                agendaDate,time,'',provider.id,'','','',{ branchId:lane.branch.id, duration:availableDuration }
              ) : undefined}/>)}
            {laneAppointments.map(appointment=>{
              const offset=timeToMinutes(appointment.time)/60-dayStartHour;
              const durationMinutes=Number.parseInt(appointment.duration,10)||45;
              return <AgendaEventCard appointment={appointment} variant="calendar-event" compact={durationMinutes<=30} onOpen={onOpenAppointment} key={appointment.id||`${appointment.date}-${appointment.patient}-${appointment.time}`} style={{top:`calc(${offset} * var(--hour) + 2px)`,height:`max(14px, calc(${durationMinutes/60} * var(--hour) - 4px))`}}/>;
            })}
          </div>
        </section>;
      })}
      {showCurrentTimeLine&&<div className="now-line provider-now-line" style={{top:`calc(48px + ${currentTimeOffset} * var(--hour))`}}><span>{currentTimeLabel}</span></div>}
    </div>
  </div>}
  {compactView && (!onlyMine || currentAccountProviderId) && <AgendaCompact appointments={appointmentsInRange} colors={compactColors}
    currentTime={agendaDate===todayKey?currentMinutes:null} canCreate={canCreateAppointment}
    onCreate={time=>onNewAppointment(agendaDate,time,'',selectedProviderIds.length===1?selectedProviderIds[0]:'')} onOpen={onOpenAppointment}/>}
  {period==='Semana'&&<div className="agenda-week">{weekDays.map(date=>{const dayAppointments=appointmentsFor(dateKey(date));return <section className={`week-day ${dateKey(date)===agendaDate?'selected':''}`} key={dateKey(date)}><button className="week-day-heading" onClick={()=>{setAgendaDate(dateKey(date));setPeriod('Día')}}><span>{weekdayFormatter.format(date)}</span><strong>{date.getUTCDate()}</strong></button><div className="week-day-events">{dayAppointments.map(item=><AgendaEventCard appointment={item} variant="week-event" compact onOpen={onOpenAppointment} key={item.id||`${item.date}-${item.time}-${item.patient}`}/>)}{!dayAppointments.length&&<span className="week-empty">Sin citas</span>}</div></section>})}</div>}
  {period==='Mes'&&<div className="agenda-month"><div className="month-weekdays">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><span key={day}>{day}</span>)}</div><div className="month-grid">{monthCells.map((day,index)=>{const valid=day>0&&day<=monthLength;const date=valid?new Date(Date.UTC(selectedDate.getUTCFullYear(),selectedDate.getUTCMonth(),day,12)):null;const dayAppointments=date?appointmentsFor(dateKey(date)):[];return <button key={index} disabled={!valid} className={`month-cell ${valid?'':'outside'} ${valid&&dateKey(date)===agendaDate?'selected':''} ${valid&&dayAppointments.length?'has-events':''}`} onClick={()=>{if(date){setAgendaDate(dateKey(date));setPeriod('Día')}}}>{valid&&<><strong>{day}</strong>{dayAppointments.slice(0,3).map(item=><span className="month-event agenda-colored-event" style={colorStyle(item.agendaColor)} title={`${item.clinician} · ${item.service} · ${item.status}`} key={`${item.time}-${item.patient}`}>{item.time} {item.patient}</span>)}{dayAppointments.length>3&&<small>+{dayAppointments.length-3} más</small>}</>}</button>})}</div></div>}
  {period==='Año'&&<div className="agenda-year">{yearMonths.map(date=>{const monthAppointments=appointmentsInRange.filter(item=>{const itemDate=new Date(`${item.date||agendaDate}T12:00:00Z`);return itemDate.getUTCMonth()===date.getUTCMonth()});return <button className="year-month" key={date.getUTCMonth()} onClick={()=>{setAgendaDate(dateKey(date));setPeriod('Mes')}}><strong>{new Intl.DateTimeFormat('es-MX',{month:'long',timeZone:'UTC'}).format(date)}</strong><span>{monthAppointments.length} {monthAppointments.length===1?'cita':'citas'}</span><i>{monthAppointments.length?`${new Set(monthAppointments.map(item=>item.date)).size} días con actividad`:'Sin actividad registrada'}</i></button>})}</div>}
  {period==='Lista'&&<div className="agenda-list-wrap"><div className="agenda-list-controls"><label>Desde<ClinicDateField aria-label="Lista desde" value={agendaDate} onChange={event=>setAgendaDate(event.target.value)}/></label><label>Hasta<ClinicDateField aria-label="Lista hasta" min={agendaDate} value={listEnd>=agendaDate?listEnd:agendaDate} onChange={event=>setListEnd(event.target.value)}/></label><label>Ordenar<select aria-label="Ordenar citas" value={listSort} onChange={event=>setListSort(event.target.value)}><option value="date">Fecha y hora · ascendente</option><option value="date-desc">Fecha y hora · descendente</option><option value="patient">Paciente</option><option value="provider">Profesional</option></select></label></div><table className="agenda-list-table"><thead><tr><th>HORA</th><th>PACIENTE</th><th>SERVICIO</th><th>PROFESIONAL</th><th>SUCURSAL</th><th>ESTADO</th><th></th></tr></thead><tbody>{sortAgendaAppointments(appointmentsInRange,listSort).map(appointment=><tr key={appointment.id||`${appointment.date}-${appointment.time}-${appointment.patient}`} onClick={()=>onOpenAppointment(appointment)} className="clickable-row"><td><strong>{appointment.time}</strong><span>{appointment.duration||'45 min'}</span></td><td><div className="patient-cell"><Avatar initials={appointment.initials} tone={appointment.tone}/><div><strong>{appointment.patient}</strong><span>{appointment.date}</span></div></div></td><td>{appointment.service}</td><td><span className="agenda-list-professional"><i className="agenda-color-dot" style={colorStyle(appointment.agendaColor)}/>{appointment.clinician}</span><small className="agenda-list-color">{agendaPalette.find(color=>color.id===appointment.agendaColor)?.label}</small></td><td>{appointment.branch}</td><td><Badge variant={appointment.status==='Confirmada'?'confirmed':appointment.status==='Completada'?'active':appointment.status==='Cancelada'?'':'pending'}><span className="badge-dot"/>{appointment.status||'Por confirmar'}</Badge>{appointment.arrivedAt&&<small>Llegó a recepción</small>}</td><td><button className="row-action" aria-label={`Abrir cita de ${appointment.patient}`} onClick={event=>{event.stopPropagation();onOpenAppointment(appointment)}}>Abrir <ArrowRight size={13}/></button></td></tr>)}</tbody></table>{appointmentsInRange.length===0&&<div className="empty-state"><CalendarDays size={20}/><strong>Sin citas para estos filtros</strong><span>Prueba otro estado o fecha, o agrega una cita.</span>{canCreateAppointment&&<button className="button primary compact" onClick={()=>onNewAppointment()}><Plus size={14}/> Nueva cita</button>}</div>}</div>}
  <section className="agenda-print-sheet" aria-label="Agenda imprimible"><header className="agenda-print-heading"><div><span>Agenda clínica</span><h1>Agenda de citas</h1><p>{dateLabel}</p></div><strong>{appointmentsInRange.length} {appointmentsInRange.length===1?'cita':'citas'}</strong></header>{appointmentsInRange.length>0?<table className="agenda-print-table"><thead><tr><th>Fecha y hora</th><th>Paciente</th><th>Servicio</th><th>Profesional</th><th>Sucursal</th><th>Modalidad</th><th>Color</th><th>Estado</th></tr></thead><tbody>{sortAgendaAppointments(appointmentsInRange,period==='Lista'?listSort:'date').map(appointment=><tr key={`print-${appointment.id||`${appointment.date}-${appointment.time}-${appointment.patient}`}`}><td>{appointment.date||agendaDate} · {appointment.time} · {appointment.duration||'45 min'}</td><td>{appointment.patient}</td><td>{appointment.service||'—'}</td><td>{appointment.clinician||'Sin profesional'}</td><td>{appointment.branch||'—'}</td><td>{appointment.modality||'Presencial'}</td><td><span className="agenda-print-color" style={colorStyle(appointment.agendaColor)}/>{agendaPalette.find(color=>color.id===appointment.agendaColor)?.label||'Sin color asignado'}</td><td>{appointment.status||'Por confirmar'}</td></tr>)}</tbody></table>:<p className="agenda-print-empty">No hay citas para imprimir con el periodo y los filtros actuales.</p>}</section>
<div className="calendar-bottom"><span>Mostrando <strong>{appointmentsInRange.length}</strong> {appointmentsInRange.length===1?'cita':'citas'} en este periodo según tus filtros</span><button className="text-link" onClick={clearFilters}>Limpiar filtros <X size={13}/></button></div></section></>;
}
function SearchablePatientSelect({patients,defaultValue='',name='patient',value,onChange}) {
  const optionsId=useId();
  const initialPatient=patients.find(patient=>String(patient.id)===String(value??defaultValue));
  const [localSelectedId,setLocalSelectedId]=useState(initialPatient?.id||'');
  const selectedId=value??localSelectedId;
  const setSelectedId=id=>{setLocalSelectedId(id);onChange?.(id)};
  const [query,setQuery]=useState(initialPatient?.name||'');
  useEffect(()=>{
    const selected=patients.find(patient=>String(patient.id)===String(selectedId));
    if(selected) setQuery(selected.name);
  },[selectedId,patients]);
  const [open,setOpen]=useState(false);
  const [activeIndex,setActiveIndex]=useState(0);
  const inputRef=useRef(null);
  const normalizedQuery=query.trim().toLocaleLowerCase();
  const matches=patients.filter(patient=>!normalizedQuery||String(patient.name||'').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(normalizedQuery.normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  const visibleMatches=matches.slice(0,8);
  const choosePatient=patient=>{inputRef.current?.setCustomValidity('');setSelectedId(patient.id);setQuery(patient.name);setOpen(false)};
  const handleKeyDown=event=>{
    if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActiveIndex(index=>Math.min(index+1,visibleMatches.length-1))}
    else if(event.key==='ArrowUp'){event.preventDefault();setActiveIndex(index=>Math.max(index-1,0))}
    else if(event.key==='Enter'&&open&&visibleMatches[activeIndex]){event.preventDefault();choosePatient(visibleMatches[activeIndex])}
    else if(event.key==='Escape'){setOpen(false)}
  };
  return <div className="patient-search-select">
    <input type="hidden" name={name} value={selectedId}/>
    <input ref={inputRef} type="text" role="combobox" aria-label="Buscar paciente" aria-autocomplete="list" aria-expanded={open} aria-controls={optionsId} autoComplete="off" placeholder="Buscar por nombre o apellido…" value={query} required={!selectedId} onInvalid={event=>{if(!selectedId)event.currentTarget.setCustomValidity('Selecciona un paciente de la lista.')}} onFocus={()=>setOpen(true)} onChange={event=>{event.currentTarget.setCustomValidity(event.target.value?'Selecciona un paciente de la lista.':'');setQuery(event.target.value);setSelectedId('');setActiveIndex(0);setOpen(true)}} onBlur={()=>setTimeout(()=>setOpen(false),100)} onKeyDown={handleKeyDown}/>
    {open&&<div className="patient-search-options" id={optionsId} role="listbox" aria-label="Pacientes">
      {visibleMatches.map((patient,index)=><button key={patient.id} type="button" role="option" aria-selected={patient.id===selectedId} className={index===activeIndex?'active':''} onMouseDown={event=>event.preventDefault()} onClick={()=>choosePatient(patient)}><span>{patient.name}</span>{patient.phone&&<small>{patient.phone}</small>}</button>)}
      {matches.length===0&&<div className="patient-search-empty">No hay pacientes que coincidan.</div>}
      {matches.length>8&&<div className="patient-search-count">Mostrando 8 de {matches.length}. Escribe para afinar la búsqueda.</div>}
    </div>}
  </div>;
}

function foldConsentSearch(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}
function NamePickerModal({title, subtitle, items, selectedId, placeholder, emptyLabel, onSelect, onClose}) {
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const pageSize=5;
  const needle=foldConsentSearch(query.trim());
  const filtered=items.filter(item=>!needle||foldConsentSearch(item.label).includes(needle));
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,pageCount);
  useEffect(()=>{setPage(1)},[query]);
  const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const pageSlots=5;
  const pageWindowLength=Math.min(pageSlots,pageCount);
  let pageWindowStart=Math.max(1,currentPage-Math.floor(pageWindowLength/2));
  pageWindowStart=Math.min(pageWindowStart,Math.max(1,pageCount-pageWindowLength+1));
  const pageMarks=Array.from({length:pageSlots},(_,index)=>index<pageWindowLength?pageWindowStart+index:null);
  const modal=<Modal className="name-picker-modal" title={title} subtitle={subtitle} close={onClose}>
    <div className="consent-library-search consent-format-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={placeholder} aria-label={placeholder}/></div>
    <div className="consent-format-list">{shown.map(item=><button type="button" key={item.id} className={item.id===selectedId?'is-selected':''} aria-pressed={item.id===selectedId} onClick={()=>onSelect(item)}>{item.icon||<img className="picker-mark" src="/elixirclinic-logo.png" alt=""/>}<span>{item.label}</span></button>)}{items.length===0&&<div className="empty-inline">{emptyLabel}</div>}{items.length>0&&filtered.length===0&&<div className="empty-inline">Nada coincide con ese nombre.</div>}</div>
    {filtered.length>0&&<nav className="consent-pager" aria-label={title}><button type="button" className="consent-pager-step" aria-label="Página anterior" disabled={currentPage<=1} onClick={()=>setPage(current=>Math.max(1,current-1))}><ChevronLeft size={16}/></button><span className="consent-pager-pages">{pageMarks.map((mark,index)=>mark?<button type="button" key={mark} className={mark===currentPage?'is-current':''} aria-current={mark===currentPage?'page':undefined} onClick={()=>setPage(mark)}>{mark}</button>:<span key={`slot-${index}`} className="consent-pager-slot" aria-hidden="true"/>)}</span><button type="button" className="consent-pager-step" aria-label="Página siguiente" disabled={currentPage>=pageCount} onClick={()=>setPage(current=>Math.min(pageCount,current+1))}><ChevronRight size={16}/></button></nav>}
  </Modal>;
  return createPortal(modal, document.body);
}
function ConsentServiceAndFormat({services, templates, defaultTemplateId='', defaultService=''}) {
  const ready=templates.filter(template=>String(template.content||'').trim());
  const templateKey=template=>String(template.id||template.title);
  const catalog=services.filter(service=>service.active!==false&&service.name);
  const [serviceName,setServiceName]=useState(defaultService||'');
  const [pickedByHand,setPickedByHand]=useState(false);
  const [selectedId,setSelectedId]=useState(()=>ready.some(template=>templateKey(template)===String(defaultTemplateId))?String(defaultTemplateId):'');
  const [open,setOpen]=useState('');
  const suggested=suggestConsentTemplate(serviceName, templates);
  useEffect(()=>{
    if(pickedByHand) return;
    const next=suggested?String(suggested.id||suggested.title):'';
    if(next && ready.some(template=>templateKey(template)===next)) setSelectedId(next);
    else if(!serviceName && defaultTemplateId && ready.some(template=>templateKey(template)===String(defaultTemplateId))) setSelectedId(String(defaultTemplateId));
    else if(serviceName) setSelectedId('');
  },[serviceName,defaultTemplateId,pickedByHand,templates]);
  const selectedFormat=ready.find(template=>templateKey(template)===selectedId);
  return <div className="choice-pair">
    <input type="hidden" name="service" value={serviceName}/>
    <input type="hidden" name="templateId" value={selectedId}/>
    <button type="button" className="choice-card" onClick={()=>setOpen('service')}><span><small>Servicio</small><strong>{serviceName||'Elegir servicio'}</strong></span><em>{serviceName?'Cambiar':'Buscar'}</em></button>
    <button type="button" className="choice-card" onClick={()=>setOpen('format')}><span><small>Formato{suggested&&!pickedByHand?' · ligado al servicio':''}</small><strong>{selectedFormat?.title||'Elegir formato'}</strong></span><em>{selectedFormat?'Cambiar':'Buscar'}</em></button>
    {open==='service'&&<NamePickerModal title="Elegir servicio" subtitle="Busca por nombre y elige el de esta visita." placeholder="Buscar servicio por nombre" emptyLabel="No hay servicios activos en el catálogo." items={catalog.map(service=>({id:service.name,label:service.name}))} selectedId={serviceName} onClose={()=>setOpen('')} onSelect={item=>{setServiceName(item.label);setPickedByHand(false);setOpen('');}}/>}
    {open==='format'&&<NamePickerModal title="Elegir formato" subtitle="Si el servicio tiene uno vinculado, ya queda marcado. Puedes elegir otro." placeholder="Buscar formato por nombre" emptyLabel="No hay formatos con texto para preparar." items={ready.map(template=>({id:templateKey(template),label:template.title,icon:<span className={`consent-file-icon ${template.color||'blue'}`}><FileText size={18}/></span>}))} selectedId={selectedId} onClose={()=>setOpen('')} onSelect={item=>{setPickedByHand(true);setSelectedId(item.id);setOpen('');}}/>}
  </div>;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la firma.'));
    reader.onerror = () => reject(new Error('No se pudo leer la firma.'));
    reader.readAsDataURL(file);
  });
}
function dataUrlToFile(dataUrl, name) {
  const [header, payload] = String(dataUrl || '').split(',');
  const mime = header?.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(payload || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime });
}
function withPatientWord(text) {
  return String(text || '').replace(/usuario/gi, match => match === match.toUpperCase() ? 'PACIENTE' : match[0] === match[0].toUpperCase() ? 'Paciente' : 'paciente');
}
function clinicFileStamp(patientName) {
  const date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const name = String(patientName || 'paciente').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim() || 'paciente';
  return `${name}-${date}`;
}
function downloadClinicDocument({title, patientName, body, signatures = [], fileName = ''}) {
  const figures = signatures.filter(item => item?.src).map(item => `<figure><figcaption>${item.label}</figcaption><img alt="${item.label}" src="${item.src}" style="max-height:96px"></figure>`).join('');
  const downloadName = fileName || clinicFileStamp(patientName);
  const html=`<!doctype html><html lang="es"><meta charset="utf-8"><title>${downloadName}</title><body style="font-family:sans-serif;padding:32px;line-height:1.5"><h1>${title}</h1><p>${patientName}</p><pre style="white-space:pre-wrap">${body}</pre>${figures}</body></html>`;
  const link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  link.download=`${downloadName}.html`;
  link.click();
  URL.revokeObjectURL(link.href);
}
function consentInline(text, keyPrefix) {
  const labels = { paciente: 'Nombre del paciente', domicilio: 'Domicilio', telefono: 'Teléfono', correo: 'Correo', fecha: 'Fecha', tratamiento: 'Servicio' };
  return withPatientWord(text).split(/(\{\{\s*(?:paciente|domicilio|telefono|correo|fecha|tratamiento)\s*\}\})/gi).filter(part => part !== '').map((part, index) => {
    const token = part.match(/^\{\{\s*(paciente|domicilio|telefono|correo|fecha|tratamiento)\s*\}\}$/i);
    if (!token) return <span key={`${keyPrefix}-${index}`}>{part}</span>;
    return <span className="consent-token" key={`${keyPrefix}-${index}`}>{labels[token[1].toLowerCase()]}</span>;
  });
}
function isConsentHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (/^[-–—].+[-–—]$/.test(trimmed)) return true;
  const letters = trimmed.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z]/g, '');
  return letters.length >= 6 && letters === letters.toUpperCase();
}
function ConsentFormattedCopy({ content }) {
  const lines = String(content || '').split('\n');
  return <div className="consent-formatted">{lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div className="consent-gap" key={index}/>;
    if (isConsentHeading(trimmed)) return <h3 className="consent-preview-title" key={index}>{trimmed.replace(/^[-–—\s]+|[-–—\s]+$/g, '')}</h3>;
    const numbered = trimmed.match(/^(\d+\s*[\.\)\-–]+)\s*(.*)$/);
    if (numbered) return <p key={index}><strong>{numbered[1]}</strong> {consentInline(numbered[2], index)}</p>;
    const labeled = trimmed.match(/^([^:]{2,48}):\s*(.+)$/);
    if (labeled && !labeled[1].includes('{{')) return <p key={index}><strong>{labeled[1]}:</strong> {consentInline(labeled[2], index)}</p>;
    return <p key={index}>{consentInline(trimmed, index)}</p>;
  })}</div>;
}
function ConsentsPage({patients,services=[],templates,notify,onPrepareConsent,onNewTemplate,onEditTemplate,onRenameTemplate,onArchiveTemplate,onLinkTemplate,sharedMode=false,canPrepare=true,canManageTemplates=true}) {
  const [nameQuery,setNameQuery]=useState('');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(6);
  const gridRef=useRef(null);
  const [menuTemplate,setMenuTemplate]=useState(null);
  const [previewTemplate,setPreviewTemplate]=useState(null);
  const [renameTemplate,setRenameTemplate]=useState(null);
  const [linkTemplate,setLinkTemplate]=useState(null);
  const [deleteTemplate,setDeleteTemplate]=useState(null);
  const nameNeedle=foldConsentSearch(nameQuery.trim());
  const filtered=templates.filter(template=>!nameNeedle||foldConsentSearch(template.title).includes(nameNeedle));
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,pageCount);
  useEffect(()=>{
    const grid=gridRef.current;
    if(!grid) return;
    let frame=0;
    const measure=()=>{
      const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length||1;
      const gap=Number.parseFloat(getComputedStyle(grid).rowGap)||10;
      const sample=[...grid.querySelectorAll('.consent-card')].reduce((tallest,card)=>Math.max(tallest,card.getBoundingClientRect().height),0);
      const rowHeight=sample||110;
      const top=grid.getBoundingClientRect().top;
      const available=Math.max(rowHeight,window.innerHeight-Math.max(top,0)-84);
      const rows=Math.max(1,Math.floor((available+gap)/(rowHeight+gap)));
      const fitted=columns*rows;
      const next=columns===1?Math.max(5,fitted):fitted;
      setPageSize(current=>current===next?current:next);
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};
    schedule();
    const observer=new ResizeObserver(schedule);
    observer.observe(grid);
    window.addEventListener('resize',schedule);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule)};
  },[templates.length,nameQuery]);
  useEffect(()=>{setPage(1)},[nameQuery,pageSize]);
  const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const pageSlots=5;
  const pageWindowLength=Math.min(pageSlots,pageCount);
  let pageWindowStart=Math.max(1,currentPage-Math.floor(pageWindowLength/2));
  pageWindowStart=Math.min(pageWindowStart,Math.max(1,pageCount-pageWindowLength+1));
  const pageMarks=Array.from({length:pageSlots},(_,index)=>index<pageWindowLength?pageWindowStart+index:null);
  return <div className="consents-page">
    <PageTitle eyebrow="DOCUMENTACIÓN DIGITAL" title="Consentimientos" description="Gestiona formatos, solicitudes de firma y documentos informados." action={canPrepare&&<button className="button primary" onClick={()=>onPrepareConsent()}>Preparar documento</button>}/>
    <div className="section-heading"><span className="consent-format-badge">{templates.length} formatos</span></div>
    <div className="consent-library-bar">
      <label className="consent-library-search"><Search size={16}/><input value={nameQuery} onChange={event=>setNameQuery(event.target.value)} placeholder="Buscar formato por nombre" aria-label="Buscar formato por nombre"/></label>
      {canManageTemplates&&<button type="button" className="consent-create" aria-label="Crear formato" onClick={onNewTemplate}><Plus size={20}/></button>}
    </div>
    <div className="consent-grid" ref={gridRef}>{shown.map(template=><article className="consent-card" key={template.id||template.title} role="button" tabIndex={0} aria-label={`Vista previa de ${template.title}`} onClick={()=>setPreviewTemplate(template)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setPreviewTemplate(template)}}}><div className="consent-card-main"><span className={`consent-file-icon ${template.color||'blue'}`}><FileText size={18}/></span><h3>{template.title}</h3></div><div className="consent-card-tools">{(canManageTemplates||canPrepare)&&<button type="button" className="consent-gear" aria-label={`Opciones de ${template.title}`} onClick={event=>{event.stopPropagation();setMenuTemplate(template)}}><Settings size={18} strokeWidth={2.25}/></button>}{canManageTemplates&&<button type="button" className="consent-delete" aria-label={`Eliminar ${template.title}`} onClick={event=>{event.stopPropagation();setDeleteTemplate(template)}}><Trash2 size={16}/></button>}</div></article>)}{templates.length===0&&<div className="empty-inline">Aún no hay formatos. Agrega el documento validado por la clínica.</div>}{templates.length>0&&filtered.length===0&&<div className="empty-inline"><Search size={17}/> Ningún formato coincide con ese nombre.</div>}</div>
    {filtered.length>0&&<nav className="consent-pager" aria-label="Páginas de formatos"><button type="button" className="consent-pager-step" aria-label="Página anterior" disabled={currentPage<=1} onClick={()=>setPage(current=>Math.max(1,current-1))}><ChevronLeft size={16}/></button><span className="consent-pager-pages">{pageMarks.map((mark,index)=>mark?<button type="button" key={mark} className={mark===currentPage?'is-current':''} aria-current={mark===currentPage?'page':undefined} onClick={()=>setPage(mark)}>{mark}</button>:<span key={`slot-${index}`} className="consent-pager-slot" aria-hidden="true"/>)}</span><button type="button" className="consent-pager-step" aria-label="Página siguiente" disabled={currentPage>=pageCount} onClick={()=>setPage(current=>Math.min(pageCount,current+1))}><ChevronRight size={16}/></button><span className="consent-pager-count">{filtered.length?((currentPage-1)*pageSize)+1:0}–{Math.min(currentPage*pageSize,filtered.length)} de {filtered.length}</span></nav>}
    {menuTemplate&&<Modal className="consent-menu-modal" title={menuTemplate.title} subtitle="Acciones del formato" close={()=>setMenuTemplate(null)}><div className="consent-action-list">{canManageTemplates&&<button type="button" onClick={()=>{const template=menuTemplate;setMenuTemplate(null);onEditTemplate(template)}}><Settings size={16}/> Editar</button>}{canManageTemplates&&<button type="button" onClick={()=>{setRenameTemplate(menuTemplate);setMenuTemplate(null)}}><PenLine size={16}/> Cambiar nombre</button>}{canPrepare&&<button type="button" onClick={()=>{const template=menuTemplate;setMenuTemplate(null);onPrepareConsent(template)}}><FileCheck2 size={16}/> Solicitar firma</button>}{canPrepare&&<button type="button" onClick={()=>{setLinkTemplate(menuTemplate);setMenuTemplate(null)}}><UsersRound size={16}/> Vincular expediente</button>}</div></Modal>}
    {previewTemplate&&<Modal className="consent-preview-modal" title={previewTemplate.title} subtitle="Los recuadros se completan al preparar un expediente. Un nombre escrito en el texto forma parte del formato, no de un paciente elegido." close={()=>setPreviewTemplate(null)}><article className="consent-preview-sheet"><ConsentFormattedCopy content={previewTemplate.content}/></article></Modal>}
    {renameTemplate&&<Modal title="Cambiar nombre" subtitle="Los expedientes que ya usaron este formato conservan el nombre con el que se guardaron." close={()=>setRenameTemplate(null)}><form className="form-stack" onSubmit={event=>{event.preventDefault();const title=String(new FormData(event.currentTarget).get('title')||'').trim();if(!title)return;onRenameTemplate(renameTemplate,title);setRenameTemplate(null)}}><label>Nombre del formato<input name="title" defaultValue={renameTemplate.title} required autoFocus/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setRenameTemplate(null)}>Cancelar</button><button className="button primary">Guardar nombre</button></div></form></Modal>}
    {linkTemplate&&<Modal title="Vincular expediente" subtitle={`${linkTemplate.title}. Se guarda una copia en el expediente junto con el servicio.`} close={()=>setLinkTemplate(null)}><form className="form-stack" onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);const patientId=String(form.get('patient')||'');const service=String(form.get('service')||'').trim();if(!patientId||!service){notify('Elige un paciente y un servicio.');return}await onLinkTemplate({patientId,template:linkTemplate,service});setLinkTemplate(null)}}><label>Paciente<SearchablePatientSelect patients={patients}/></label><label>Servicio<select name="service" required defaultValue=""><option value="" disabled>Seleccionar servicio…</option>{services.filter(service=>service.active!==false&&service.name).map(service=><option key={service.id} value={service.name}>{service.name}</option>)}</select></label><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setLinkTemplate(null)}>Cancelar</button><button className="button primary">Vincular</button></div></form></Modal>}
    {deleteTemplate&&<Modal title="Quitar formato" subtitle="Se elimina de la biblioteca. Los expedientes que ya lo usaron conservan su copia." close={()=>setDeleteTemplate(null)}><p className="consent-delete-copy">{deleteTemplate.title}</p><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setDeleteTemplate(null)}>Cancelar</button><button type="button" className="button primary consent-delete-confirm" onClick={async()=>{const template=deleteTemplate;setDeleteTemplate(null);await onArchiveTemplate(template)}}><Trash2 size={15}/> Eliminar de la biblioteca</button></div></Modal>}
  </div>;
}

function ContractsPage({patients,templates,setModal,notify,onOpenDocument,onNewContract,onNewTemplate,sharedMode=false,canPrepare=true,canManageTemplates=true}) {
  const [filterOpen,setFilterOpen]=useState(false);
  const [statusFilter,setStatusFilter]=useState('Todos');
  const waiting=patients.filter(patient=>patient.contract==='Pendiente');
  const signed=patients.filter(patient=>patient.contract==='Firmado');
  const shown=patients.filter(patient=>statusFilter==='Todos'||patient.contract===statusFilter);
  return <div className="consents-page contracts-page"><PageTitle eyebrow="ACUERDOS DE SERVICIO" title="Contratos" description="Prepara y da seguimiento a los contratos de prestación de servicios." action={canPrepare&&<button className="button primary" onClick={onNewContract}><Plus size={16}/> Nuevo contrato</button>}/><div className="contract-intro"><div className="contract-intro-icon"><FileText size={21}/></div><div><h3>Contratos claros, atención confiable.</h3><p>Usa el formato aprobado por la clínica al preparar el documento de cada expediente.</p></div><span className="demo-pill"><ShieldCheck size={14}/>{sharedMode?'Firma electrónica por conectar':'Firma de demostración'}</span></div><div className="document-stats"><div className="doc-stat"><div className="metric-icon peach"><Clock3 size={18}/></div><div><span>Pendientes de firma</span><strong>{String(waiting.length).padStart(2,'0')}</strong></div><small>Expedientes que necesitan seguimiento</small></div><div className="doc-stat"><div className="metric-icon mint"><CheckCircle2 size={18}/></div><div><span>Firmados</span><strong>{String(signed.length).padStart(2,'0')}</strong></div><small>Según los expedientes guardados aquí</small></div><div className="doc-stat"><div className="metric-icon lavender"><FileText size={18}/></div><div><span>{sharedMode?'Formatos activos':'Formatos guardados'}</span><strong>{String(templates.length).padStart(2,'0')}</strong></div><small>{sharedMode?'Versiones activas en la clínica':'Texto guardado en este navegador'}</small></div></div><section className="panel contract-template-library"><div className="panel-heading padded"><div><div className="panel-title">Biblioteca de contratos</div><p className="panel-subtitle">Guarda el texto oficial validado para usarlo en nuevos contratos.</p></div>{canManageTemplates&&<button className="button outline compact" onClick={onNewTemplate}><Plus size={15}/> Agregar formato</button>}</div><div className="contract-template-list">{templates.map(template=><article className="contract-template-row" key={template.id}><div className="contract-template-icon"><FileText size={17}/></div><div className="contract-template-copy"><strong>{template.title}</strong><span>{template.isDemoPlaceholder?'Muestra de flujo · texto no legal':`${template.type} · ${template.content.length.toLocaleString('es-MX')} caracteres`}</span></div><span className={template.isDemoPlaceholder ? "demo-pill" : "template-ready"}>{template.isDemoPlaceholder ? <><ShieldCheck size={14}/> Muestra de flujo</> : <><CheckCircle2 size={14}/> Disponible</>}</span></article>)}{templates.length===0&&<div className="empty-inline"><FileText size={17}/> Aún no hay formatos. Agrega el documento proporcionado y revisado por la clínica antes de preparar contratos.</div>}</div></section><section className="panel data-panel contract-table-panel"><div className="panel-heading padded"><div><div className="panel-title">Contratos por expediente</div><p className="panel-subtitle">{shown.length} registros según el filtro seleccionado</p></div><button className="button outline compact" aria-expanded={filterOpen} onClick={()=>setFilterOpen(value=>!value)}><Filter size={15}/> Filtrar</button></div>{filterOpen&&<div className="agenda-filter-panel"><label className="select-filter"><FileCheck2 size={15}/><select aria-label="Filtrar contratos por estado" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option>Todos</option><option>Pendiente</option><option>Firmado</option></select><ChevronDown size={14}/></label><button className="text-link" onClick={()=>setStatusFilter('Todos')}>Limpiar filtros <X size={13}/></button></div>}<div className="table-wrap"><table><thead><tr><th>PACIENTE</th><th>DOCUMENTO</th><th>FECHA DE ESTADO</th><th>ESTADO</th><th>RESPONSABLE</th><th></th></tr></thead><tbody>{shown.map(patient=><tr key={patient.id}><td><div className="patient-cell"><Avatar initials={patient.initials} tone={patient.tone}/><div><strong>{patient.name}</strong><span>{patient.id}</span></div></div></td><td data-label="Documento"><span className="contract-doc"><FileText size={15}/>{patient.contractTemplateTitle||patient.contractType||'Prestación de servicios'}</span></td><td data-label="Fecha de estado" className="last-cell">{formatRecordDate(patient.contractSignedAt||patient.contractRequestedAt)}</td><td data-label="Estado"><DocStatus status={patient.contract}/></td><td data-label="Responsable" className="responsible-cell"><Avatar initials={(patient.clinician||'').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'—'} tone="lavender" size="xs"/> {patient.clinician||'Sin asignar'}</td><td><button className="row-more" aria-label={`Ver contrato de ${patient.name}`} onClick={()=>onOpenDocument(patient,'contract')}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{shown.length===0&&<div className="empty-state"><FileText size={20}/><strong>No hay contratos para este filtro</strong><span>Elige otro estado para ver registros.</span></div>}</div><div className="table-bottom"><span>Mostrando <strong>{shown.length}</strong> de <strong>{patients.length}</strong> expedientes</span><span className="per-page">{sharedMode?'Documentos compartidos del consultorio':'Los cambios se guardan en este navegador'}</span></div></section></div>;
}
function TeamPage({businesses,branches,providers,setModal,notify,onEditBranch,onEditProvider,sharedMode=false,clinicId,canManageBusinesses=true,canManageProviders=true}) {
  const accountDirectory = useProfessionalAccounts(clinicId, sharedMode && canManageProviders, providers);
  const accountFor = provider => accountDirectory.accounts.find(account => account.userId === provider.userId);
  const professionalName = provider => accountFor(provider)?.name || provider.name;
  const branchNamesForProvider=(provider)=>provider.branchIds?.map(id=>branches.find(branch=>branch.id===id)?.name).filter(Boolean).join(', ')||'Sin sucursal asignada';
  return <><PageTitle title="Equipo y sucursales" description="Administra los negocios, ubicaciones y profesionales que aparecen en la agenda."/><div className="team-layout"><section className="panel team-panel"><div className="panel-heading padded"><div><div className="panel-title">Equipo clínico</div><p className="panel-subtitle">{providers.filter(item=>item.active).length} profesionales activos</p></div>{canManageProviders&&<button className="more-button" onClick={()=>setModal('new-provider')} aria-label="Agregar profesional"><Plus size={18}/></button>}</div><div className="team-list">{accountDirectory.error&&<p className="professional-error" role="alert">{accountDirectory.error} <button className="button outline compact" onClick={accountDirectory.reload}>Reintentar</button></p>}{providers.filter(item=>item.active).map(provider=><div className="team-member" key={provider.id}><Avatar initials={provider.initials||provider.name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()} tone={provider.tone||'blue'} imageUrl={accountFor(provider)?.avatarUrl} size="large"/><div className="team-person"><div className="professional-name-line"><strong>{professionalName(provider)}</strong>{provider.userId&&<span className="professional-link-icon" role="img" aria-label="Cuenta vinculada" title={accountFor(provider)?.email?`Cuenta vinculada: ${accountFor(provider).email}`:'Cuenta vinculada'}><Link2 size={14}/></span>}</div><span>{provider.role}</span><small><Activity size={12}/>{branchNamesForProvider(provider)}</small></div><span className="team-presence"><i/> Activo</span>{canManageProviders&&<button className="row-more" onClick={()=>onEditProvider(provider)} aria-label={`Editar profesional ${professionalName(provider)}`}><MoreHorizontal size={17}/></button>}</div>)}</div></section><section className="panel team-panel branch-panel"><div className="panel-heading padded"><div><div className="panel-title">Sucursales</div><p className="panel-subtitle">{branches.filter(item=>item.active).length} ubicaciones habilitadas</p></div>{canManageBusinesses&&<button className="icon-button outline" onClick={()=>setModal('new-branch')} aria-label="Agregar sucursal"><Plus size={16}/></button>}</div>{branches.filter(item=>item.active).map((branch,index)=><div className="branch-row" key={branch.id}><div className={`branch-icon branch-${index%3}`}><Activity size={16}/></div><div><strong>{branch.name}</strong><span>{branch.address||'Dirección pendiente'}</span>{branch.phone&&<small>{branch.phone}</small>}{branch.hours&&<small>{branch.hours}</small>}</div><span className="branch-active"><i/>Activa</span>{canManageBusinesses&&<button className="row-more" onClick={()=>onEditBranch(branch)} aria-label={`Editar sucursal ${branch.name}`}><Settings2 size={15}/></button>}</div>)}</section><section className="panel team-panel business-panel"><div className="panel-heading padded"><div><div className="panel-title">Negocios</div><p className="panel-subtitle">Agendas y sucursales agrupadas por negocio</p></div>{canManageBusinesses&&<button className="button outline compact" onClick={()=>setModal('new-business')}><Plus size={15}/> Agregar negocio</button>}</div><div className="business-list">{businesses.filter(item=>item.active).map(business=>{const count=branches.filter(branch=>branch.active&&branch.businessId===business.id).length;return <div className="business-row" key={business.id}><div className="branch-icon"><Building2 size={16}/></div><div><strong>{business.name}</strong><span>{count} {count===1?'sucursal activa':'sucursales activas'}</span></div><Badge variant="active"><span className="badge-dot"/>Activo</Badge></div>})}{businesses.filter(item=>item.active).length===0&&<div className="empty-inline">Aún no hay negocios. Agrega uno para empezar.</div>}</div></section></div></>;
}

function sessionMediaPrefix(sessionId) { return `[sesión:${sessionId}]`; }
function SessionPhotoStrip({ files, resolveUrl }) {
  const [urls,setUrls]=useState({});
  useEffect(()=>{
    let active=true;
    files.forEach(file=>{
      resolveUrl(file).then(url=>{ if(active && url) setUrls(current=>current[file.id]===url?current:({...current,[file.id]:url})); }).catch(()=>{});
    });
    return ()=>{ active=false; };
  },[files.map(file=>file.id).join('|')]);
  if(!files.length) return null;
  return <div className="session-photo-strip">{files.map(file=><button type="button" key={file.id} onClick={()=>urls[file.id]&&window.open(urls[file.id],'_blank','noopener,noreferrer')}><img src={urls[file.id]||''} alt={file.title.replace(sessionMediaPrefix(''),'').trim()||'Foto de la sesión'}/></button>)}</div>;
}
function SessionMediaBar({ sessionId, files, onOpen, resolveUrl }) {
  const prefix=sessionMediaPrefix(sessionId);
  const mine=files.filter(file=>String(file.title||'').startsWith(prefix));
  const photos=mine.filter(file=>file.kind==='clinical_photo');
  const docs=mine.filter(file=>file.kind!=='clinical_photo');
  return <div className="session-media">
    <div className="session-media-actions">
      <button type="button" className="session-media-button" disabled={photos.length>=4} onClick={()=>onOpen(sessionId,'photo')}><Camera size={16}/><span><strong>Fotos</strong><small>{photos.length}/4</small></span></button>
      <button type="button" className="session-media-button" onClick={()=>onOpen(sessionId,'file')}><FilePlus2 size={16}/><span><strong>Archivos</strong><small>{docs.length?`${docs.length} adjuntos`:'PDF o imagen'}</small></span></button>
    </div>
    <SessionPhotoStrip files={photos} resolveUrl={resolveUrl}/>
    {docs.length>0&&<div className="session-file-list">{docs.map(file=><span key={file.id}>{file.title.replace(prefix,'').trim()}</span>)}</div>}
  </div>;
}
function SessionPhotoSlots({ shots, onRemove, reserved = 0, total = 4 }) {
  const slots = Array.from({ length: total }, (_, index) => {
    if (index < reserved) return { kind: 'saved', key: `saved-${index}` };
    const shot = shots[index - reserved];
    return shot ? { kind: 'shot', key: shot.url, shot, number: index + 1 } : { kind: 'empty', key: `empty-${index}` };
  });
  return <div className="session-photo-slots">{slots.map(slot => slot.kind === 'shot'
    ? <button type="button" key={slot.key} onClick={() => onRemove(slot.shot)}><img src={slot.shot.url} alt={`Foto ${slot.number}`}/></button>
    : <span key={slot.key} className={`session-photo-slot ${slot.kind === 'saved' ? 'is-saved' : ''}`}>{slot.kind === 'saved' ? 'Guardada' : ''}</span>)}</div>;
}
function SessionCameraStage({ open, onClose, onCapture, disabled }) {
  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const [facing,setFacing]=useState('environment');
  useEffect(()=>{ if(!open) setFacing('environment'); },[open]);
  useEffect(()=>{
    if(!open) return undefined;
    let cancelled=false;
    let localStream=null;
    navigator.mediaDevices.getUserMedia({ video:{ facingMode: { ideal: facing } }, audio:false }).then(stream=>{
      if(cancelled){ stream.getTracks().forEach(track=>track.stop()); return; }
      localStream=stream;
      streamRef.current=stream;
      if(videoRef.current){ videoRef.current.srcObject=stream; videoRef.current.play(); }
    }).catch(()=>{ if(cancelled) return; if(facing==='environment') onClose(); else setFacing('environment'); });
    return ()=>{ cancelled=true; localStream?.getTracks().forEach(track=>track.stop()); if(streamRef.current===localStream) streamRef.current=null; };
  },[open,facing]);
  if(!open) return null;
  const capture=()=>{
    const video=videoRef.current; if(!video?.videoWidth||disabled) return;
    const scale=Math.min(1,1024/Math.max(video.videoWidth,video.videoHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
    canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{
      if(!blob) return;
      onCapture(new File([blob],`foto-${Date.now()}.jpg`,{type:'image/jpeg'}));
      onClose();
    },'image/jpeg',0.55);
  };
  return createPortal(<div className="session-camera-stage" role="dialog" aria-label="Tomar foto">
    <video ref={videoRef} className={facing==='user'?'is-front':''} playsInline autoPlay muted/>
    <button type="button" className="session-camera-back" onClick={onClose}><ArrowLeft size={18}/> Volver</button>
    <button type="button" className="session-camera-flip" onClick={()=>setFacing(current=>current==='environment'?'user':'environment')}><SwitchCamera size={18}/> {facing==='environment'?'Frontal':'Trasera'}</button>
    <button type="button" className="button session-camera session-camera-shutter" onClick={capture} disabled={disabled}><Camera size={18}/> Capturar</button>
  </div>, document.body);
}
function SessionCaptureModal({ mode, sessionId, existingPhotos, saving, onClose, onSave }) {
  const remaining=Math.max(0,4-existingPhotos);
  const [shots,setShots]=useState([]);
  const [documents,setDocuments]=useState([]);
  const [cameraOn,setCameraOn]=useState(false);
  const addGallery=list=>{
    const room=remaining-shots.length;
    const next=[...list].filter(file=>file.type?.startsWith('image/')).slice(0,room).map(file=>({file,url:URL.createObjectURL(file)}));
    setShots(current=>[...current,...next].slice(0,remaining));
  };
  const close=()=>{ shots.forEach(shot=>URL.revokeObjectURL(shot.url)); setCameraOn(false); onClose(); };
  const photoMode=mode==='photo';
  const modal=<Modal className="name-picker-modal session-capture-modal" title={photoMode?'Fotos de la sesión':'Archivos de la sesión'} subtitle={photoMode?`Puedes tomar o elegir hasta ${remaining} ${remaining===1?'foto':'fotos'}. Se guardan comprimidas.`:'PDF, JPG o PNG. Las imágenes se comprimen antes de guardarse.'} close={close}>
    {photoMode&&remaining===0&&<p className="form-note">Esta sesión ya tiene las 4 fotos.</p>}
    {photoMode&&remaining>0&&<>
      <div className="session-photo-actions"><button type="button" className="button session-camera" onClick={()=>setCameraOn(true)} disabled={shots.length>=remaining}><Camera size={16}/> Tomar foto</button><label className={`button session-photo-pick ${shots.length>=remaining?'is-disabled':''}`}><Upload size={16}/> Elegir fotos<input className="profile-photo-input" type="file" accept="image/*" multiple disabled={shots.length>=remaining} onChange={event=>{ addGallery(event.target.files||[]); event.target.value=''; }}/></label></div>
      <SessionCameraStage open={cameraOn} disabled={shots.length>=remaining} onClose={()=>setCameraOn(false)} onCapture={file=>setShots(current=>current.length>=remaining?current:[...current,{file,url:URL.createObjectURL(file)}])}/>
      <SessionPhotoSlots shots={shots} reserved={existingPhotos} onRemove={shot=>setShots(current=>current.filter(item=>item.url!==shot.url))}/>
    </>}
    {!photoMode&&<label className="session-file-picker">Selecciona uno o varios archivos<input type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={event=>setDocuments([...(event.target.files||[])])}/></label>}
    {!photoMode&&documents.length>0&&<ul className="session-file-list">{documents.map(file=><li key={file.name}>{file.name}</li>)}</ul>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={close} disabled={saving}>Cancelar</button><button type="button" className="button primary" disabled={saving||(photoMode?shots.length===0:documents.length===0)} onClick={async()=>{ await onSave(sessionId, photoMode?shots.map(shot=>shot.file):documents, photoMode?'photo':'file'); close(); }}>{saving?'Guardando…':'Guardar en la sesión'}</button></div>
  </Modal>;
  return createPortal(modal, document.body);
}
function PatientModal({patient,activeRecordTab,setActiveRecordTab,clinicalBackground=null,packagePanel,appointments,activities,clinicalHistory=[],botoxTreatments=[],procedures=[],recordFiles=[],sharedMode=false,canEditPatient=true,canCreateAppointment=true,canDiagnose=true,canWriteClinical=true,canPrepareContract=true,canPrepareConsent=true,close,notify,onAddActivity,onClinicalBackground,onNewEncounter,onNewBotoxTreatment,onNewProcedure,onEditProcedure,onDeleteProcedure,procedurePending,onAddRecordFile,onOpenRecordFile,onEdit,onDiagnosis,onNewAppointment,onPrepareContract,onPrepareConsent,onOpenContract,onOpenConsent,onOpenDocumentRecord,onSaveSessionMedia,resolvePatientFileUrl}) {
  const [sessionMedia,setSessionMedia]=useState(null);
  const selectRecordTab=(event,tab)=>{setActiveRecordTab(tab);event.currentTarget.closest('.modal')?.scrollTo({top:0,behavior:'instant'});};
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
  const serviceLabel=[...(patient.consentHistory||[])].reverse().find(record=>record.status!=='Reemplazado'&&record.service)?.service||'';
  const backgroundAnswers=clinicalBackground?.answers||{};
  const imageConsent=(patient.consentHistory||[]).find(record=>/imagen/i.test(record.title||''));
  const imageDecision=typeof imageConsent?.imageUseAuthorized==='boolean'?(imageConsent.imageUseAuthorized?'Sí autoriza':'No autoriza'):'decisión no estructurada';
  const imageConsentLabel=!imageConsent?'Sin registro · decisión no documentada':imageConsent.status==='Firmado'?`Firmado · ${imageDecision}`:imageConsent.status==='Pendiente'?`Pendiente de firma · ${imageDecision}`:`${imageConsent.status} · ${imageDecision}`;
  return <Modal title={patient.name} subtitle={`Expediente ${patient.id} · ${patient.status} · ${patient.firstVisit ? "Primera vez" : "Paciente recurrente"}`} close={close} className="patient-record-modal patient-record-overview-modal"><div className="patient-modal-profile"><Avatar initials={patient.initials} tone={patient.tone} size="large"/><div><strong>{patient.treatment}</strong><span>Última actividad: {patient.last}</span><small>{patient.clinician} · {patient.branch}</small><small>{patient.phone||'Sin teléfono'}{patient.email?` · ${patient.email}`:''}</small><small>Avisos por WhatsApp: {patient.whatsappOptIn?'Autorizados':'No autorizados'}{patient.whatsappOptInAt?' · '+formatRecordDate(patient.whatsappOptInAt):''}</small><small>Uso de imagen: {imageConsentLabel}{imageConsent?.signedAt?` · ${formatRecordDate(imageConsent.signedAt)}`:''}{imageConsent?.signedByLabel?` · ${imageConsent.signedByLabel}`:''}</small></div>{(canCreateAppointment||canEditPatient||canDiagnose)&&<span className="patient-profile-actions">{canCreateAppointment&&<button className="button outline compact" onClick={onNewAppointment}><CalendarPlus size={14}/> Agendar cita</button>}{canEditPatient&&<button className="button outline compact" onClick={onEdit}><Settings2 size={14}/> Editar</button>}{canDiagnose&&<button className="button outline compact" onClick={onDiagnosis}><ClipboardCheck size={14}/> Diagnóstico</button>}</span>}</div>
  <section className="patient-workflow-progress" aria-label="Progreso de diagnóstico y documentos">
    <article className={diagnosisAccepted?'complete':''}><div><span className="patient-workflow-number">1</span><strong>Diagnóstico</strong><Badge variant={diagnosisAccepted?'confirmed':'pending'}><span className="badge-dot"/>{diagnosisAccepted?'Aceptado':'Pendiente'}</Badge></div><p>{diagnosisAccepted?'El expediente tiene un diagnóstico vigente.':'Registra y acepta el diagnóstico para habilitar el contrato.'}{canDiagnose&&<button type="button" className="text-link" onClick={onDiagnosis}>{diagnosisAccepted?'Revisar':'Registrar diagnóstico'}</button>}</p></article>
    <article className={contractReady||contractSignedCurrent?'complete':''}><div><span className="patient-workflow-number">2</span><strong>Contrato</strong><Badge variant={contractReady?'pending':contractSignedCurrent?'confirmed':patient.contract==='Firmado'?'new':'pending'}><span className="badge-dot"/>{contractStatus}</Badge></div><p>{contractDescription}{canPrepareContract&&diagnosisAccepted&&<button type="button" className="text-link" onClick={contractReady?onOpenContract:onPrepareContract}>{contractReady?'Revisar contrato':'Preparar contrato'}</button>}</p></article>
    <article className={consentReady?'complete':''}><div><span className="patient-workflow-number">3</span><strong>Servicio</strong><Badge variant={patient.consent==='Firmado'?'confirmed':consentReady?'pending':'pending'}><span className="badge-dot"/>{patient.consent==='Firmado'?'Firmado':consentReady?'Pendiente de firma':'Por elegir'}</Badge></div><p>{serviceLabel?`Servicio: ${serviceLabel}. Puedes cambiarlo o revisar el consentimiento.`:'Elige el servicio de esta visita. Si tiene consentimiento, se selecciona solo.'}{canPrepareConsent&&<button type="button" className="text-link" onClick={onPrepareConsent}>{consentReady||serviceLabel?'Cambiar servicio':'Elegir servicio'}</button>}{canPrepareConsent&&(consentReady||patient.consent==='Firmado')&&<button type="button" className="text-link" onClick={onOpenConsent}>Ver consentimiento</button>}</p></article>
  </section>

  <div className="patient-record-tabs" role="tablist" aria-label="Secciones del expediente" onKeyDown={event=>{const tabs=[...event.currentTarget.querySelectorAll('[role="tab"]')];const index=tabs.indexOf(event.target);const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:index;if(next!==index){event.preventDefault();tabs[next].focus();tabs[next].click();}}}>
   <button type="button" role="tab" id="patient-record-tab-overview" aria-controls="patient-record-panel-overview" aria-selected={activeRecordTab==='overview'} tabIndex={activeRecordTab==='overview'?0:-1} className={activeRecordTab==='overview'?'is-active':''} onClick={event=>selectRecordTab(event,'overview')}>Resumen</button>
   <button type="button" role="tab" id="patient-record-tab-clinical" aria-controls="patient-record-panel-clinical" aria-selected={activeRecordTab==='clinical'} tabIndex={activeRecordTab==='clinical'?0:-1} className={activeRecordTab==='clinical'?'is-active':''} onClick={event=>selectRecordTab(event,'clinical')}>Historia clínica <span>{clinicalHistory.length+diagnosisRecords.length}</span></button>
   <button type="button" role="tab" id="patient-record-tab-procedures" aria-controls="patient-record-panel-procedures" aria-selected={activeRecordTab==='procedures'} tabIndex={activeRecordTab==='procedures'?0:-1} className={activeRecordTab==='procedures'?'is-active':''} onClick={event=>selectRecordTab(event,'procedures')}>Procedimientos <span>{botoxTreatments.length+procedures.length}</span></button>
   <button type="button" role="tab" id="patient-record-tab-documents" aria-controls="patient-record-panel-documents" aria-selected={activeRecordTab==='documents'} tabIndex={activeRecordTab==='documents'?0:-1} className={activeRecordTab==='documents'?'is-active':''} onClick={event=>selectRecordTab(event,'documents')}>Documentos <span>{recordFiles.length+documentRecords.length}</span></button>
   <button type="button" role="tab" id="patient-record-tab-follow-up" aria-controls="patient-record-panel-follow-up" aria-selected={activeRecordTab==='follow-up'} tabIndex={activeRecordTab==='follow-up'?0:-1} className={activeRecordTab==='follow-up'?'is-active':''} onClick={event=>selectRecordTab(event,'follow-up')}>Seguimiento <span>{sortedActivities.length}</span></button>
  </div>
  <div className="patient-record-panel" role="tabpanel" id="patient-record-panel-overview" aria-labelledby="patient-record-tab-overview" tabIndex={0} hidden={activeRecordTab!=='overview'}>
   <section className="patient-activity-box medical-background-box"><div className="panel-title"><span>Antecedentes clínicos</span><div className="record-actions"><span>{clinicalBackground?.updatedAt?`Actualizado ${formatRecordDate(clinicalBackground.updatedAt)}`:'Sin completar'}</span>{canWriteClinical&&<button className="button outline compact" onClick={onClinicalBackground}><Plus size={13}/> Completar antecedentes</button>}</div></div><div className="medical-history-summary">{clinicalHistoryPrompts.slice(0,6).map(([key,label])=>{const answer=backgroundAnswers[key]||{state:'not_asked',detail:''};return <div key={key}><span>{label}</span><strong>{clinicalHistoryStateLabels[answer.state]||'Sin preguntar'}</strong>{answer.detail&&<small>{answer.detail}</small>}</div>})}</div></section>
   {packagePanel}
   <section className="patient-appointments"><div className="panel-title">Citas del expediente <span>{patientAppointments.length}</span></div>{patientAppointments.map(appointment=><div className="patient-appointment-row" key={`${appointment.date}-${appointment.time}-${appointment.patient}`}><div><strong>{appointment.time}</strong><span>{appointment.date?new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${appointment.date}T12:00:00`)):'Fecha pendiente'}</span></div><div><strong>{appointment.service}</strong><span>{appointment.clinician} · {appointment.branch}</span></div><Badge variant={appointment.status==='Confirmada'?'confirmed':'pending'}><span className="badge-dot"/>{appointment.status}</Badge></div>)}{patientAppointments.length===0&&<div className="empty-inline">Este expediente aún no tiene citas.</div>}</section>
  </div>
  <div className="patient-record-panel" role="tabpanel" id="patient-record-panel-clinical" aria-labelledby="patient-record-tab-clinical" tabIndex={0} hidden={activeRecordTab!=='clinical'}>
   <section className="patient-activity-box clinical-history-box"><div className="panel-title"><span>Consultas y notas de evolución</span><div className="record-actions"><span>{clinicalHistory.length} consultas</span>{canWriteClinical&&<button className="button outline compact" onClick={onNewEncounter}><Plus size={13}/> Nueva consulta</button>}</div></div>{clinicalHistory.map(record=><article className="patient-activity-row clinical-encounter" key={record.id}><div className="patient-activity-meta"><strong>Consulta clínica</strong><time dateTime={record.occurredAt}>{record.occurredAt?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(record.occurredAt)):'Fecha no registrada'}</time></div><p><b>Motivo:</b> {record.chiefComplaint}</p>{record.history&&<p><b>Antecedentes:</b> {record.history}</p>}{record.vitals&&Object.keys(record.vitals).length>0&&<p><b>Signos vitales:</b> {Object.entries(record.vitals).map(([key,value])=>`${({weight:'Peso',height:'Estatura',temperature:'Temperatura',pulse:'Pulso',bloodPressure:'Presión',oxygen:'SpO₂'})[key]||key}: ${value}`).join(' · ')}</p>}{record.physicalExam&&Object.keys(record.physicalExam).filter(key=>record.physicalExam[key]!=='not_recorded').length>0&&<p><b>Exploración:</b> {Object.entries(record.physicalExam).filter(([,value])=>value!=='not_recorded').map(([key,value])=>`${({skin:'Piel',face:'Cara',neck:'Cuello',cardiovascular:'Cardiovascular',respiratory:'Respiratorio',neurological:'Neurológico'})[key]}: ${{normal:'Sin hallazgos relevantes',finding:'Hallazgo documentado',not_applicable:'No aplica'}[value]||value}`).join(' · ')}</p>}{record.examination&&<p><b>Hallazgos:</b> {record.examination}</p>}{record.assessment&&<p><b>Valoración:</b> {record.assessment}</p>}{record.prognosis&&<p><b>Pronóstico:</b> {record.prognosis}</p>}{record.plan&&<p><b>Plan:</b> {record.plan}</p>}{record.evolution&&<p><b>Evolución / comentarios:</b> {record.evolution}</p>}</article>)}{clinicalHistory.length===0&&<div className="empty-inline">Aún no hay consultas clínicas registradas.</div>}</section>
  {canDiagnose&&<section className="patient-activity-box"><div className="panel-title"><span>Historial de diagnósticos</span><span>{diagnosisRecords.length}</span></div>{diagnosisRecords.map(record=><article className="patient-activity-row" key={record.id}><div className="patient-activity-meta"><strong>{record.status==='accepted'?'Vigente':record.status==='superseded'?'Sustituido':'Borrador'}</strong><time dateTime={record.acceptedAt||record.createdAt}>{(record.acceptedAt||record.createdAt)?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(record.acceptedAt||record.createdAt)):'Fecha no registrada'}</time></div><p>{record.summary}</p><small>Aceptado por: {record.acceptedByLabel||'Usuario no identificado'}</small></article>)}{diagnosisRecords.length===0&&<div className="empty-inline">Aún no hay diagnósticos en el historial.</div>}</section>}
  </div>
  <div className="patient-record-panel" role="tabpanel" id="patient-record-panel-procedures" aria-labelledby="patient-record-tab-procedures" tabIndex={0} hidden={activeRecordTab!=='procedures'}>
   <section className="procedure-record-box" aria-labelledby="procedure-notes-title">
    <header className="procedure-record-header">
     <div>
      <h3 id="procedure-notes-title">Sesiones</h3>
      <span>{procedures.length + botoxTreatments.length} {procedures.length + botoxTreatments.length === 1 ? 'sesión' : 'sesiones'}</span>
     </div>
     {canWriteClinical && <button type="button" className="button primary" onClick={onNewProcedure}><Plus size={16} aria-hidden="true"/> Registrar sesión</button>}
    </header>
    {procedures.map(record => (
     <article className="procedure-record-row" key={record.id}>
      <div className="procedure-record-details">
       <h4>{record.procedureType}{record.product ? ` · ${record.product}` : ''}</h4>
       <div className="procedure-record-meta">
        <time dateTime={record.performedAt}><CalendarDays size={14} aria-hidden="true"/>{record.performedAt ? new Intl.DateTimeFormat('es-MX', {dateStyle:'medium', timeStyle:'short'}).format(new Date(record.performedAt)) : 'Fecha no registrada'}</time>
        {record.lotNumber && <span><b>Lote:</b> {record.lotNumber}</span>}
       </div>
       <ProcedureRecordCounts zones={record.zones || []}/>
       {record.followUp && <p className="procedure-record-followup"><b>Indicaciones y seguimiento</b>{record.followUp}</p>}
       <SessionMediaBar sessionId={record.id} files={recordFiles} onOpen={(id,mode)=>setSessionMedia({id,mode})} resolveUrl={resolvePatientFileUrl}/>
      </div>
      {activeRecordTab === 'procedures' && <ProcedureThumbnails zones={record.zones || []}/>}
      {canDiagnose && <div className="procedure-record-actions">
       <button type="button" aria-label="Editar sesión" disabled={procedurePending} onClick={()=>onEditProcedure(record)}><PenLine size={15} aria-hidden="true"/> Editar</button>
       <button type="button" aria-label="Eliminar sesión" disabled={procedurePending} onClick={()=>onDeleteProcedure(record)}><Trash2 size={15} aria-hidden="true"/> Eliminar</button>
      </div>}
     </article>
    ))}
    {botoxTreatments.map(record => (
     <article className="procedure-record-row" key={record.id}>
      <div className="procedure-record-details">
       <h4>{record.product || 'Sesión'}</h4>
       <div className="procedure-record-meta">
        <time dateTime={record.performedAt}><CalendarDays size={14} aria-hidden="true"/>{record.performedAt ? new Intl.DateTimeFormat('es-MX', {dateStyle:'medium', timeStyle:'short'}).format(new Date(record.performedAt)) : 'Fecha no registrada'}</time>
        {record.lotNumber && <span><b>Lote:</b> {record.lotNumber}</span>}
        {record.totalUnits && <span><b>Unidades:</b> {record.totalUnits}</span>}
       </div>
       {record.treatmentAreas && <p className="procedure-record-followup"><b>Áreas</b>{record.treatmentAreas}</p>}
       {record.followUp && <p className="procedure-record-followup"><b>Indicaciones y seguimiento</b>{record.followUp}</p>}
       <SessionMediaBar sessionId={record.id} files={recordFiles} onOpen={(id,mode)=>setSessionMedia({id,mode})} resolveUrl={resolvePatientFileUrl}/>
      </div>
     </article>
    ))}
    {procedures.length + botoxTreatments.length === 0 && <p className="procedure-record-empty">Registra la sesión, marca las zonas en el mapa y deja las indicaciones.</p>}
   </section>
  </div>
  <div className="patient-record-panel" role="tabpanel" id="patient-record-panel-documents" aria-labelledby="patient-record-tab-documents" tabIndex={0} hidden={activeRecordTab!=='documents'}>
   <section className="patient-activity-box patient-files-box"><div className="panel-title"><span>Documentos y estudios</span><div className="record-actions"><span>{recordFiles.filter(file=>!String(file.title||'').startsWith('[sesión:')).length} archivos</span>{canWriteClinical&&<button className="button outline compact" onClick={onAddRecordFile}><Plus size={13}/> Adjuntar archivo</button>}</div></div>{recordFiles.filter(file=>!String(file.title||'').startsWith('[sesión:')).map(file=><article className="patient-record-file" key={file.id}><div><strong>{file.title}</strong><span>{file.kind==='consent'?'Consentimiento':file.kind==='contract'?'Contrato':file.kind==='study'?'Estudio':file.kind==='clinical_photo'?'Foto clínica':'Otro documento'}{file.signedAt?` · Firmado ${formatRecordDate(file.signedAt)}`:''} · {(file.byteSize/1024).toFixed(0)} KB</span></div><button type="button" className="button outline compact" onClick={()=>onOpenRecordFile(file)}><ArrowUpRight size={14}/> Abrir</button></article>)}{recordFiles.length===0&&<div className="empty-inline">Aquí aparecen consentimientos firmados, estudios y fotos clínicas privadas.</div>}</section>


  <section className="patient-document-history"><div className="panel-title"><span>Historial de documentos</span><span>{documentRecords.length}</span></div>{documentRecords.map(record=><details className="patient-document-record" key={record.id}><summary><span><strong>{record.kind==='contract'?'Contrato':'Consentimiento'} · {record.title}</strong><small>{record.templateVersion?`Formato v${record.templateVersion} · `:''}{record.requestedAt?formatRecordDate(record.requestedAt):'Fecha anterior no registrada'}{record.legacy?' · Registro anterior':''}</small></span><DocStatus status={record.status}/></summary><div className="patient-document-record-content">{record.service&&<p><strong>Servicio:</strong> {record.service}</p>}{record.createdByLabel&&<p><strong>Preparado por:</strong> {record.createdByLabel}</p>}{record.signedByLabel&&<p><strong>Firmado por:</strong> {record.signedByLabel}</p>}{record.contentSnapshot?<div className="template-content">{fillDocumentPlaceholders(record.kind==='contract'?record.contentSnapshot:withPatientWord(record.contentSnapshot), patient)}</div>:<p>Este documento anterior no tenía texto de plantilla guardado.</p>}{record.signedAt&&<small>{sharedMode?"Firma registrada":"Firma simulada registrada"} · {new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(record.signedAt))}</small>}<button type="button" className="button outline compact" onClick={()=>onOpenDocumentRecord?.(record)}><ArrowUpRight size={14}/> Abrir esta versión</button></div></details>)}{documentRecords.length===0&&<div className="empty-inline">Aún no hay documentos preparados.</div>}</section><div className={sharedMode?"patient-doc-box shared-readonly-docs":"patient-doc-box"}><div className="panel-title">Documentación del expediente</div><div><FileText size={16}/><span><strong>{patient.contractTemplateTitle||patient.contractType||'Contrato de prestación de servicios'}</strong><small>Contrato de servicios</small></span><DocStatus status={patient.contract}/><button className="icon-button" aria-label={documentHistory(patient,'contract').length?'Ver contrato':'Contrato aún no preparado'} disabled={!documentHistory(patient,'contract').length} onClick={onOpenContract}><ArrowUpRight size={15}/></button></div><div><FileCheck2 size={16}/><span><strong>{patient.consentDocument||'Consentimiento informado'}</strong><small>Documento clínico</small></span><DocStatus status={patient.consent}/><button className="icon-button" aria-label={documentHistory(patient,'consent').length?'Ver consentimiento':'Consentimiento aún no preparado'} disabled={!documentHistory(patient,'consent').length} onClick={onOpenConsent}><ArrowUpRight size={15}/></button></div></div>
  </div>
  <div className="patient-record-panel" role="tabpanel" id="patient-record-panel-follow-up" aria-labelledby="patient-record-tab-follow-up" tabIndex={0} hidden={activeRecordTab!=='follow-up'}>
     <section className="patient-activity-box"><div className="panel-title"><span>Seguimiento</span><button className="button outline compact" onClick={onAddActivity}><Plus size={13}/> Agregar nota</button></div>{sortedActivities.slice(0,8).map(activity=><article className="patient-activity-row" key={activity.id}><div className="patient-activity-meta"><strong>{activity.type}</strong><time dateTime={activity.createdAt}>{new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(activity.createdAt))}</time></div><p>{activity.note}</p><small>{activity.author}</small></article>)}{sortedActivities.length===0&&<div className="empty-inline">Aún no hay seguimientos registrados.</div>}</section>
  </div>
  <div className="modal-actions"><button className="button secondary" onClick={close}>Cerrar</button></div>
  {sessionMedia&&<SessionCaptureModal mode={sessionMedia.mode} sessionId={sessionMedia.id} existingPhotos={recordFiles.filter(file=>String(file.title||'').startsWith(sessionMediaPrefix(sessionMedia.id))&&file.kind==='clinical_photo').length} saving={false} onClose={()=>setSessionMedia(null)} onSave={onSaveSessionMedia}/>}
  </Modal>;
}

function ClinicalBackgroundModal({patient,clinicalBackground,sharedMode,close,onSubmit}) {
  const answers=clinicalBackground?.answers||{};
  return <Modal title="Antecedentes clínicos" subtitle={`${patient.name} · Expediente ${patient.id}`} close={close} className="patient-record-modal"><form className="form-stack clinical-background-form" onSubmit={onSubmit}>
    <div className="form-note"><ShieldCheck size={15}/> Registra lo preguntado: distingue entre lo que la persona niega, desconoce o aún no ha respondido. No se completa “no tiene” por omisión.</div>
    {clinicalHistoryPrompts.map(([key,label])=>{const answer=answers[key]||{};return <fieldset className="clinical-history-field" key={key}><legend>{label}</legend><div className="form-grid"><label>Respuesta<select name={`state-${key}`} defaultValue={answer.state||'not_asked'}>{Object.entries(clinicalHistoryStateLabels).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label><label>Detalle / observaciones<input name={`detail-${key}`} defaultValue={answer.detail||''} maxLength="1000" placeholder="Opcional; registra el dato referido"/></label></div></fieldset>})}
    <div className="form-note">{sharedMode?'Visible al equipo clínico autorizado.':'Demostración local: se guarda solo en este navegador.'}</div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar antecedentes</button></div>
  </form></Modal>;
}

function ClinicalEncounterModal({patient,appointments,sharedMode,close,onSubmit}) {
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16);
  return <Modal title="Nueva consulta clínica" subtitle={`${patient.name} · Historia clínica`} close={close} className="patient-record-modal"><form className="form-stack" onSubmit={onSubmit}>
    <div className="form-grid"><label>Fecha<ClinicDateField name="occurredOn" defaultValue={localNow.slice(0,10)} required/></label><label>Hora<ClinicTimeField name="occurredTime" defaultValue={localNow.slice(11,16)} step={300} required/></label></div>
    {appointments.length>0&&<label>Cita relacionada<select name="appointmentId" defaultValue=""><option value="">Sin vincular</option>{appointments.map(item=><option key={item.id} value={item.databaseId||item.id}>{item.date} · {item.time} · {item.service}</option>)}</select></label>}
    <label>Motivo de consulta<textarea name="chiefComplaint" rows="2" maxLength="2000" required autoFocus/></label>
    <label>Antecedentes / historia<textarea name="history" rows="3" maxLength="5000"/></label>
    <fieldset className="clinical-vitals"><legend>Signos vitales <small>Deja en blanco si no se midió; no se interpreta como normal</small></legend><div className="form-grid clinical-vitals-grid"><label>Peso (kg)<input name="weight" type="number" min="0" step="0.1"/></label><label>Estatura (cm)<input name="height" type="number" min="0" step="0.1"/></label><label>Temperatura (°C)<input name="temperature" type="number" min="0" step="0.1"/></label><label>Pulso (lpm)<input name="pulse" type="number" min="0" step="1"/></label><label>Presión arterial<input name="bloodPressure" placeholder="No registrada" maxLength="30"/></label><label>SpO₂ (%)<input name="oxygen" type="number" min="0" max="100" step="1"/></label></div></fieldset>
    <fieldset className="clinical-vitals"><legend>Exploración física <small>Estado explícito por sistema</small></legend><div className="form-grid clinical-exam-grid">{[['skin','Piel'],['face','Cara'],['neck','Cuello'],['cardiovascular','Cardiovascular'],['respiratory','Respiratorio'],['neurological','Neurológico']].map(([key,label])=><label key={key}>{label}<select name={`exam-${key}`} defaultValue="not_recorded"><option value="not_recorded">Sin registrar</option><option value="normal">Sin hallazgos relevantes</option><option value="finding">Hallazgo documentado</option><option value="not_applicable">No aplica</option></select></label>)}</div></fieldset>
    <label>Exploración y hallazgos<textarea name="examination" rows="3" maxLength="5000"/></label>
    <label>Valoración / diagnóstico<textarea name="assessment" rows="3" maxLength="5000"/></label>
    <div className="form-grid"><label>Pronóstico<textarea name="prognosis" rows="2" maxLength="2000"/></label><label>Plan<textarea name="plan" rows="2" maxLength="5000"/></label></div>
    <label>Nota de evolución y comentarios<textarea name="evolution" rows="3" maxLength="5000" placeholder="Evolución, respuesta, observaciones o indicaciones relevantes."/></label>
    <div className="form-note"><ShieldCheck size={15}/>{sharedMode?'Visible para el personal autorizado de esta clínica.':'Demostración local: se guarda solo en este navegador.'}</div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar consulta</button></div>
  </form></Modal>;
}

function BotoxTreatmentModal({patient,appointments,sharedMode,close,onSubmit}) {
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16);
  const consentChoices = [
    ...(patient.consentHistory || []).filter(record => record.status === 'Firmado').map(record => ({ value: `document:${record.id}`, label: record.title })),
    ...(patient.recordFiles || []).filter(file => file.kind === 'consent' && file.signedAt).map(file => ({ value: `file:${file.id}`, label: file.title })),
  ];
  return <Modal title="Registrar sesión" subtitle={`${patient.name} · Expediente clínico`} close={close} className="patient-record-modal"><form className="form-stack" onSubmit={onSubmit}>
    <div className="form-grid"><label>Fecha<ClinicDateField name="performedOn" defaultValue={localNow.slice(0,10)} required/></label><label>Hora<ClinicTimeField name="performedTime" defaultValue={localNow.slice(11,16)} step={300} required/></label></div>
    {appointments.length>0&&<label>Cita relacionada<select name="appointmentId" defaultValue=""><option value="">Sin vincular</option>{appointments.map(item=><option key={item.id} value={item.databaseId||item.id}>{item.date} · {item.time} · {item.service}</option>)}</select></label>}
    <div className="form-grid"><label>Producto / marca<input name="product" required maxLength="160" placeholder="Nombre del producto"/></label><label>Lote<input name="lotNumber" required maxLength="100" placeholder="Número de lote"/></label></div>
    <div className="form-grid"><label>Fecha de caducidad<ClinicDateField name="expirationDate"/></label><label>Unidades totales<input type="number" name="totalUnits" min="0.01" max="10000" step="0.01" required/></label></div>
    <label>Consentimiento informado firmado<select name="consentReference" defaultValue=""><option value="">Sin vincular</option>{consentChoices.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label>Áreas tratadas y unidades por área<textarea name="treatmentAreas" rows="3" maxLength="4000" placeholder="Registra las áreas y cantidades indicadas por la profesional." required/></label>
    <label>Seguimiento / respuesta<textarea name="followUp" rows="3" maxLength="4000" placeholder="Indicaciones de seguimiento, respuesta o revisión posterior."/></label>
    <div className="form-note"><ShieldCheck size={15}/>{consentChoices.length?'Puedes asociar el documento firmado a esta sesión.':'No hay consentimientos firmados disponibles para asociar.'} {sharedMode?'Solo personal clínico autorizado puede consultar este registro.':'Demostración local: se guarda solo en este navegador.'}</div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit"><Check size={15}/> Guardar sesión</button></div>
  </form></Modal>;
}

const procedureMapViews = [
  ['face','Rostro'],['profile-right','Perfil derecho'],['profile-left','Perfil izquierdo'],
  ['neck-chest','Cuello y tórax'],['axillae','Axilas'],['hands','Manos'],['front','Cuerpo de frente'],['back','Cuerpo de espaldas'],
];

const [faceLeft, , faceWidth] = procedureAnatomy.face.viewBox.split(' ').map(Number);
const faceCenterX = faceLeft + faceWidth / 2;
const procedurePointRecordType = 'face-points-v1';
const isProcedurePointRecord = zone => zone.kind === procedurePointRecordType;
const facePointLabel = point => [point.amount, point.unit].filter(Boolean).join(' ');

const facePointDetail = point => [facePointLabel(point), point.note].filter(Boolean).join(' · ');

function groupFacePointsByZone(points) {
  const grouped = new Map();
  for (const point of points) {
    if (!point.zone) continue;
    if (!grouped.has(point.zone)) grouped.set(point.zone, []);
    grouped.get(point.zone).push(point);
  }
  return grouped;
}

function ProcedureZoneGlyph({name, view}) {
  const includesZone = anatomy => anatomy.visible.some(index => anatomy.paths[index][4] === name);
  const current = procedureAnatomy[view];
  const anatomy = includesZone(current) ? current : Object.values(procedureAnatomy).find(includesZone);
  if (!anatomy) return <PenLine size={19} className="procedure-zone-custom-glyph" aria-hidden="true"/>;
  const {paths, visible, viewBox} = anatomy;
  return <svg className="face-zone-glyph" viewBox={viewBox} aria-hidden="true" focusable="false">
    {paths.map(([d, , stroke, , zone], index) => {
      const highlighted = visible.includes(index) && zone === name;
      return stroke === '#6b7280' || highlighted
        ? <path key={index} d={d} data-highlight={highlighted || undefined}/>
        : null;
    })}
  </svg>;
}

function ProcedureRecordCounts({zones}) {
  const points = zones.filter(isProcedurePointRecord).flatMap(zone => zone.points || []);
  const names = new Set([
    ...zones.filter(zone => !isProcedurePointRecord(zone)).map(zone => zone.name),
    ...points.map(point => point.zone),
  ].filter(Boolean));
  return <div className="procedure-record-counts">
    {names.size} {names.size === 1 ? 'zona' : 'zonas'} · {points.length} {points.length === 1 ? 'punto' : 'puntos'}
  </div>;
}

function ProcedureThumbnails({zones}) {
  const groups = new Map();
  const points = zones.filter(isProcedurePointRecord).flatMap(zone => zone.points || []);
  const includesZone = (view, name) => name && procedureAnatomy[view].visible.some(index => procedureAnatomy[view].paths[index][4] === name);
  function groupFor(view) {
    if (!groups.has(view)) groups.set(view, {names: new Set(), points: []});
    return groups.get(view);
  }
  for (const point of points) {
    const view = Object.hasOwn(procedureAnatomy, point.view) ? point.view : 'face';
    const group = groupFor(view);
    group.points.push(point);
    if (point.zone) group.names.add(point.zone);
  }
  for (const {name} of zones.filter(zone => !isProcedurePointRecord(zone))) {
    if ([...groups.values()].some(group => group.names.has(name))) continue;
    const match = procedureMapViews.find(([view]) => includesZone(view, name));
    if (match) groupFor(match[0]).names.add(name);
  }
  if (!groups.size) groupFor('face');
  const views = procedureMapViews.filter(([view]) => groups.has(view));
  const overflow = Math.max(0, views.length - 4);
  return <div className="procedure-thumbnail-strip">
    {views.slice(0, 4).map(([view, label]) => <ProcedureThumbnail key={view} view={view} label={label}
      group={groups.get(view)} isolated={groups.get(view).names.size === 1}/>)}
    {overflow > 0 && <span className="procedure-thumbnail-overflow" aria-label={`${overflow} vistas adicionales`}>+{overflow}</span>}
  </div>;
}

function ProcedureThumbnail({view, label, group: {names, points}, isolated}) {
  const {viewBox, paths, visible} = procedureAnatomy[view];
  const svgRef = useRef(null);
  const [crop, setCrop] = useState(null);
  const zone = isolated ? [...names][0] : null;
  useEffect(() => {
    const path = zone && svgRef.current?.querySelector('[data-zone-selected]');
    if (!path) { setCrop(null); return; }
    const bounds = path.getBBox();
    const [, , width, height] = viewBox.split(' ').map(Number);
    const cropWidth = Math.max(bounds.width * 1.5, bounds.height * 1.15, width * .42);
    const cropHeight = Math.max(bounds.height * 1.5, cropWidth * 1.16, height * .23);
    setCrop([bounds.x + (bounds.width - cropWidth) / 2, bounds.y + (bounds.height - cropHeight) / 2, cropWidth, cropHeight].join(' '));
  }, [zone, viewBox]);
  const description = points.map(point => [facePointLabel(point), point.zone, point.note].filter(Boolean).join(' · ') || 'Punto sin detalle').join('; ');

  const thumbnailViewBox = (zone && crop) || viewBox;
  const [, , thumbnailWidth, thumbnailHeight] = thumbnailViewBox.split(' ').map(Number);
  const pointRadius = 3.25 * Math.max(thumbnailWidth / 54, thumbnailHeight / 72);
  return <svg ref={svgRef} className="procedure-map-drawing procedure-face-thumbnail" viewBox={thumbnailViewBox} role="img"
    aria-label={[label, ...names].join(' · ')}>
    <title>{[label, ...names, description].filter(Boolean).join(' · ')}</title>
    {paths.map(([d, fill, stroke, strokeWidth, name], index) => <path key={index} {...{d, fill, stroke, strokeWidth}}
      data-zone-selected={visible.includes(index) && names.has(name) || undefined}/>)}
    {points.map(point => <FacePointMarker key={point.id} point={point} radius={pointRadius}/>)}
  </svg>;
}

function FacePointMarker({point, radius: baseRadius, compact, active, dragHandlers, onSelect}) {
  const radius = baseRadius * (compact ? 0.7225 : 0.85);
  const quantity = point.amount.trim();
  const label = [facePointLabel(point), point.zone, point.note].filter(Boolean).join(' · ') || 'sin detalle';
  const labelWidth = Math.max(radius, radius * (.55 + quantity.length * .34));
  return <g transform={`translate(${point.x} ${point.y})`} className="face-point-marker" data-active={active || undefined} data-hovered={point.hovered || undefined} data-draggable={!!dragHandlers || undefined}
    {...dragHandlers}
    role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined}
    aria-label={onSelect ? `Seleccionar punto: ${label}` : undefined}
    onClick={onSelect ? event => { event.stopPropagation(); onSelect(); } : undefined}
    onKeyDown={onSelect ? event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(); }
    } : undefined}>
    <ellipse rx={labelWidth} ry={radius}/>
    {quantity
      ? <text textAnchor="middle" dominantBaseline="central" fontSize={radius * 1.18}>{quantity}</text>
      : <circle className="face-point-dot" r={radius * .24}/>}
  </g>;
}

function ProcedureAnatomyMap({ zones, toggleZone, setZoneDose, points, setPoints, zoneOrder }) {
  const [view, setView] = useState('face');
  const [zoom, setZoom] = useState(null);
  const [drawingViewBox, setDrawingViewBox] = useState(procedureAnatomy.face.viewBox);
  const drawingViewBoxRef = useRef(drawingViewBox);
  const previousViewRef = useRef(view);
  const [listOpen, setListOpen] = useState(false);
  const clipId = useId();
  const [mode, setMode] = useState(null);
  const placement = mode === 'add';
  const [inspectedZone, setInspectedZone] = useState(null);
  const [activePointId, setActivePointId] = useState(null);
  const [hoveredPointId, setHoveredPointId] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [pendingMapRemoval, setPendingMapRemoval] = useState(null);
  const baseViewBox = procedureAnatomy[view].viewBox;
  const targetViewBox = zoom?.viewBox || baseViewBox;
  useEffect(() => {
    if (previousViewRef.current !== view) {
      previousViewRef.current = view;
      drawingViewBoxRef.current = baseViewBox;
      setDrawingViewBox(baseViewBox);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawingViewBoxRef.current = targetViewBox;
      setDrawingViewBox(targetViewBox);
      return;
    }

    const from = drawingViewBoxRef.current.split(' ').map(Number);
    const to = targetViewBox.split(' ').map(Number);
    if (from.every((value, index) => value === to[index])) return;

    const startedAt = performance.now();
    const duration = zoom ? 620 : 420;
    let frame;
    const animate = now => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 5);
      const next = from.map((value, index) => value + (to[index] - value) * eased)
        .map(value => Number(value.toFixed(3))).join(' ');
      drawingViewBoxRef.current = next;
      setDrawingViewBox(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [baseViewBox, targetViewBox, view, zoom]);
  const pointRemovalDialog = useRef(null);
  const cancelPointRemoval = useRef(null);
  useEffect(() => {
    if (pendingMapRemoval && !pointRemovalDialog.current.open) {
      pointRemovalDialog.current.showModal();
      cancelPointRemoval.current?.focus();
    }
  }, [pendingMapRemoval]);
  const drawingRef = useRef(null);
  const drawingContentRef = useRef(null);
  const dragRef = useRef(null);
  const [draggedPoint, setDraggedPoint] = useState(null);
  useEffect(() => { if (placement) drawingRef.current?.focus({preventScroll: true}); }, [placement]);
  const activePoint = points.find(point => point.id === activePointId);
  const canMirrorPoint = view === 'face' && placement && activePoint && Math.abs(activePoint.x - faceCenterX) > 0.01;
  const showPoints = !listOpen;
  const currentView = procedureMapViews.find(([key]) => key === view)[1];
  const { paths, visible } = procedureAnatomy[view];
  const faceOverview = view === 'face' && !zoom;
  const faceBleed = faceOverview ? 16 : 0;
  const [x, y, width, height] = drawingViewBox.split(' ').map(Number);
  const visiblePaths = new Set(visible);
  const pointsByZone = groupFacePointsByZone(points);
  const manualZones = new Map(zones.map(zone => [zone.name, zone]));
  const selectedNames = new Set([...manualZones.keys(), ...pointsByZone.keys()]);
  const orderedNames = [...new Set([...zoneOrder.filter(name => selectedNames.has(name)), ...selectedNames])];
  const availableNames = [...new Set(visible.map(index => paths[index][4]))];
  const orientation = view === 'back' ? ['I', 'D'] : ['D', 'I'];
  const isProfile = view.startsWith('profile');
  const side = view === 'profile-right' ? 'D' : 'I';

  const zoneInDetail = selectedNames.has(inspectedZone) ? inspectedZone : null;
  const detailPoints = zoneInDetail ? pointsByZone.get(zoneInDetail) || [] : [];
  const focusedPoint = showPoints && mode === 'add' && Boolean(activePoint);
  const activePointIndex = activePoint ? points.findIndex(point => point.id === activePoint.id) : -1;
  const pointPlacementActive = placement && Boolean(zoom);
  const pointPlacementAction = zoneInDetail && <button type="button" className={`face-zone-add-application${pointPlacementActive ? ' is-active' : ''}`}
    aria-label={pointPlacementActive ? `Cancelar agregar puntos en ${zoneInDetail}` : `Agregar puntos en ${zoneInDetail}`}
    aria-pressed={pointPlacementActive}
    onClick={() => toggleZonePointPlacement(zoneInDetail)}>
    {pointPlacementActive ? <X size={15} aria-hidden="true"/> : <Plus size={15} aria-hidden="true"/>}
    <span>{pointPlacementActive ? 'Cancelar' : 'Agregar puntos'}</span>
  </button>;

  function beginZoneSelection() {
    setZoom(null);
    setCursor(null);
    setActivePointId(null);
    setInspectedZone(null);
    setListOpen(false);
    setMode('choose-zone');
  }

  function finishZoneEntry() {
    setMode(null);
    setZoom(null);
    setCursor(null);
    setInspectedZone(null);
    setActivePointId(null);
    setHoveredPointId(null);
  }

  function backToZoneSummary() {
    setActivePointId(null);
    setCursor(null);
    setMode(zoneInDetail ? 'zone-ready' : null);
    if (!zoneInDetail) setZoom(null);
  }

  function zoomIntoZone(name, path) {
    if (view === 'face') {
      const presets = Object.values(procedureFaceZoom);
      const bounds = path?.getBBox();
      const zoneY = bounds ? bounds.y + bounds.height / 2 : y + height / 2;
      const distanceToPreset = preset => {
        const [, top, , presetHeight] = preset.viewBox.split(' ').map(Number);
        return Math.abs(zoneY - (top + presetHeight / 2));
      };
      const namedPresets = presets.filter(preset => preset.names.includes(name));
      const candidates = namedPresets.length ? namedPresets : presets;
      const preset = candidates.reduce((closest, option) => distanceToPreset(option) < distanceToPreset(closest) ? option : closest);
      setZoom({viewBox: preset.viewBox});
    } else if (path) {
      const bounds = path.getBBox();
      const stage = drawingRef.current?.getBoundingClientRect();
      const aspect = stage?.width && stage?.height ? stage.width / stage.height : width / height;
      const horizontalPadding = Math.max(bounds.width * 0.24, bounds.height * aspect * 0.18, width * 0.025);
      const verticalPadding = Math.max(bounds.height * 0.24, bounds.width / aspect * 0.18, height * 0.025);
      const viewWidth = Math.max(bounds.width + horizontalPadding * 2, (bounds.height + verticalPadding * 2) * aspect);
      const viewHeight = viewWidth / aspect;
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      setZoom({viewBox: [centerX - viewWidth / 2, centerY - viewHeight / 2, viewWidth, viewHeight]
        .map(value => Number(value.toFixed(2))).join(' ')});
    }
    setCursor(null);
    setMode('add');
  }

  function toggleZonePointPlacement(name) {
    if (placement && zoom) {
      setZoom(null);
      setCursor(null);
      setMode('zone-ready');
      return;
    }
    const path = Array.from(drawingContentRef.current?.querySelectorAll('[data-anatomical-zone]') || [])
      .find(candidate => candidate.dataset.anatomicalZone === name);
    if (path) zoomIntoZone(name, path);
  }

  function chooseAnatomicalZone(name, path) {
    const targetPath = path || Array.from(drawingContentRef.current?.querySelectorAll('[data-anatomical-zone]') || [])
      .find(candidate => candidate.dataset.anatomicalZone === name);
    if (showPoints && targetPath) {
      if (mode === 'zone-ready' && inspectedZone === name) {
        zoomIntoZone(name, targetPath);
        return;
      }
      if (!selectedNames.has(name)) toggleZone(name);
      openZone(name);
      return;
    }
    if (selectedNames.has(name)) openZone(name);
    else toggleZone(name);
  }

  function openZone(name) {
    setInspectedZone(name);
    setActivePointId(null);
    setHoveredPointId(null);
    if (showPoints) {
      setZoom(null);
      setCursor(null);
      setMode('zone-ready');
    }
  }

  function editZonePoint(point) {
    setHoveredPointId(null);
    if (!showPoints) { setView('face'); setListOpen(false); setZoom(null); }
    setMode('add');
    selectPoint(point.id);
  }

  function selectPoint(id) {
    setActivePointId(id);
    const point = points.find(item => item.id === id);
    setInspectedZone(point?.zone || null);
    if (zoom && point && (point.x < x || point.x > x + width || point.y < y || point.y > y + height)) setZoom(null);
  }

  function withAnatomicalZone(position) {
    const target = new DOMPoint(position.x, position.y);
    const candidates = Array.from(drawingContentRef.current?.querySelectorAll('[data-anatomical-zone]') || []);
    const zone = candidates.reverse().find(path => path.isPointInFill(target))?.dataset.anatomicalZone || '';
    return {...position, zone, view, zoneFromPosition: true};
  }

  function mirrorActivePoint() {
    if (!canMirrorPoint) return;
    const position = withAnatomicalZone({x: 2 * faceCenterX - activePoint.x, y: activePoint.y});
    const copy = {...activePoint, ...position, id: crypto.randomUUID()};
    setPoints(current => [...current, copy]);
    setActivePointId(copy.id);
    if (zoom && (copy.x < x || copy.x > x + width || copy.y < y || copy.y > y + height)) setZoom(null);
  }

  function savePosition(position) {
    if (!placement || position.x < x || position.x > x + width || position.y < y || position.y > y + height) return;
    const location = withAnatomicalZone(position);
    if (!location.zone) return;
    if (!selectedNames.has(location.zone)) {
      toggleZone(location.zone);
      openZone(location.zone);
      return;
    }
    const id = crypto.randomUUID();
    setPoints(current => [...current, {id, ...location, amount: '', unit: '', note: ''}]);
    setActivePointId(id);
    setInspectedZone(location.zone);

  }

  function dragHandlersFor(point) {
    return {
      onPointerDown(event) {
        if (!event.isPrimary || event.button !== 0 || dragRef.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId, id: point.id, point,
          clientX: event.clientX, clientY: event.clientY,
          position: null,
        };
      },
      onPointerMove(event) {
        const drag = dragRef.current;
        if (drag?.pointerId !== event.pointerId || drag.id !== point.id) return;
        if (!drag.position && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
        const matrix = drawingContentRef.current?.getScreenCTM();
        if (!matrix) return;
        const inverse = matrix.inverse();
        const start = new DOMPoint(drag.clientX, drag.clientY).matrixTransform(inverse);
        const current = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
        if (!drag.position) selectPoint(point.id);
        drag.position = {
          x: Math.min(x + width, Math.max(x, drag.point.x + current.x - start.x)),
          y: Math.min(y + height, Math.max(y, drag.point.y + current.y - start.y)),
        };
        setDraggedPoint({...drag.point, ...drag.position});
      },
      onPointerUp(event) {
        const drag = dragRef.current;
        if (drag?.pointerId !== event.pointerId || drag.id !== point.id) return;
        if (drag.position) {
          const location = withAnatomicalZone(drag.position);
          setPoints(current => current.map(item => item.id === point.id ? {...item, ...location} : item));
        }
        dragRef.current = null;
        setDraggedPoint(null);
      },
      onLostPointerCapture(event) {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        setDraggedPoint(null);
      },
    };
  }

  function placeFromClick(event) {
    if (!placement) return;
    const matrix = drawingContentRef.current?.getScreenCTM();
    if (!matrix) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    savePosition({x: position.x, y: position.y});
  }

  function placeFromKeyboard(event) {
    if (event.target !== event.currentTarget) return;
    const position = cursor ?? {x: x + width / 2, y: y + height / 2};
    if (event.key === 'Escape') { finishZoneEntry(); return; }
    if (!placement) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      savePosition(position);
      return;
    }
    const direction = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 8 : 2;
    setCursor({
      x: Math.min(x + width, Math.max(x, position.x + direction[0] * step)),
      y: Math.min(y + height, Math.max(y, position.y + direction[1] * step)),
    });
  }

  function editPoint(field, value) {
    setPoints(current => current.map(point => point.id === activePointId ? {...point, [field]: value} : point));
  }

  function removePoint(point) {
    const hasDetails = [point.amount, point.unit, point.note, point.zoneFromPosition ? '' : point.zone].some(value => value.trim());
    if (hasDetails) {
      setPendingMapRemoval({point});
      return;
    }
    deletePoint(point);
  }

  function deleteZone(name) {
    if (manualZones.has(name)) toggleZone(name);
    setPoints(current => current.filter(point => point.zone !== name));
    finishZoneEntry();
  }

  function removeZone(name) {
    if (pointsByZone.has(name) || manualZones.get(name)?.dose?.trim()) {
      setPendingMapRemoval({zone: name});
      return;
    }
    deleteZone(name);
  }

  function deletePoint(point) {
    setPoints(current => current.filter(item => item.id !== point.id));
    if (activePointId === point.id) setActivePointId(null);
  }

  function renderPath([d, fill, stroke, strokeWidth, name], index) {
    const available = visiblePaths.has(index);
    const selected = available && selectedNames.has(name);
    const attributes = { d, fill, stroke, strokeWidth, 'data-anatomical-zone': visiblePaths.has(index) ? name : undefined, 'data-zone-selected': selected || undefined };
    if (!available || placement) return <path key={index} {...attributes} aria-hidden="true" style={{pointerEvents: 'none'}} />;

    return <path key={index} {...attributes}
      className="procedure-map-zone" role="button" tabIndex={0}
      aria-label={name} aria-pressed={selected}
      onClick={event => chooseAnatomicalZone(name, event.currentTarget)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          chooseAnatomicalZone(name, event.currentTarget);
        }
      }}>
      <title>{name}</title>
    </path>;
  }

  return <section className="body-map-workspace" aria-label="Mapa anatómico interactivo">
    <header className="clinical-map-header"><div><strong>Mapa de aplicación</strong><small>Selecciona las áreas tratadas; agrega dosis o detalle en cada una.</small></div><button type="button" className="button outline compact" aria-expanded={listOpen} onClick={()=>{setMode(null);setListOpen(value=>!value);}}>{listOpen?'Ver mapa':'Lista de zonas'}</button></header>
    <nav className="clinical-map-nav" aria-label="Vistas anatómicas">{procedureMapViews.map(([key,label])=><button type="button" key={key} className={view===key?'active':''} aria-pressed={view===key} onClick={()=>{setView(key);setZoom(null);setMode(null);setInspectedZone(null);setActivePointId(null);setHoveredPointId(null);setCursor(null);}}>{label}</button>)}</nav>
    {placement && <p className="face-point-mode-status" id={`${clipId}-placement`} role="status">
      Haz clic para agregar puntos. Selecciona o arrastra un punto existente. Con el teclado, usa las flechas y pulsa Intro.
    </p>}
    <div className={`body-map-layout${listOpen ? ' list-mode' : ''}`}>
      {!listOpen && <div className="clinical-map-illustration procedure-map-stage" data-face-overview={faceOverview || undefined}>
        <div className="procedure-map-orientation" aria-hidden="true">
          {isProfile ? <span>{currentView} · {side}</span> : orientation.map(label => <span key={label}>{label}</span>)}
        </div>
        <svg ref={drawingRef} className="procedure-map-drawing" viewBox={drawingViewBox}
          data-placement={placement ? 'add' : undefined}
          data-point-zoom={showPoints && placement && zoom ? 'detail' : undefined} onClick={placeFromClick} onKeyDown={placeFromKeyboard}
          tabIndex={placement ? 0 : undefined} aria-describedby={placement ? `${clipId}-placement` : undefined}
          role="group" aria-label={`${currentView}: zonas anatómicas seleccionables`}>
          <defs><clipPath id={clipId}><rect x={x - faceBleed} y={y - faceBleed} width={width + faceBleed * 2} height={height + faceBleed} /></clipPath></defs>
          <g clipPath={`url(#${clipId})`}><g ref={drawingContentRef} className="procedure-map-content" style={{transformOrigin: `${x + width / 2}px ${y + height / 2}px`}}>
            {paths.map(renderPath)}
            {showPoints && points.filter(point => point.view ? point.view === view : view === 'face').map(point =>
              point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height
                ? <FacePointMarker key={point.id} point={{...(draggedPoint?.id === point.id ? draggedPoint : point), hovered: point.id === hoveredPointId}} radius={zoom ? 4.5 : 8} compact={!!zoom}
                    dragHandlers={placement ? dragHandlersFor(point) : undefined}
                    active={point.id === activePointId}
                    onSelect={() => mode === 'choose-zone' ? undefined : editZonePoint(point)}/>
                : null)}
            {placement && cursor && <path className="face-point-cursor"
              d="M-4 0H4M0-4V4" transform={`translate(${cursor.x} ${cursor.y})`} aria-hidden="true"/>}
          </g></g>
        </svg>
        {showPoints && placement && <span className="face-map-mode-icon" aria-hidden="true">
          <PenLine size={13}/>
        </span>}
      </div>}
      {listOpen&&<div className="clinical-zone-picker" role="region" aria-label={`Zonas disponibles: ${currentView}`}>
        <div className="clinical-zone-picker-heading"><strong>Zonas de {currentView.toLocaleLowerCase('es-MX')}</strong><span>{availableNames.length} disponibles</span></div>
        <div className="clinical-zone-picker-list">{availableNames.map(name => <button type="button" key={name}
          className={selectedNames.has(name) ? 'selected' : ''} aria-pressed={selectedNames.has(name)} onClick={() => chooseAnatomicalZone(name)}>
          <span>{name}</span><i aria-hidden="true">{selectedNames.has(name) ? '✓' : '+'}</i>
        </button>)}</div>
      </div>}
      <aside className="body-map-details" data-zone-details data-map-columns={!listOpen || undefined}
        data-application-summary={showPoints && zoneInDetail && !focusedPoint ? '' : undefined}>
      {(zoneInDetail || focusedPoint) && <div className="face-zone-detail-header">
        <button type="button" className="face-zone-back" onClick={focusedPoint ? backToZoneSummary : finishZoneEntry}>
          <ArrowLeft size={15} aria-hidden="true"/> {focusedPoint ? zoneInDetail || 'Zonas' : 'Zonas'}
        </button>
        <h3>{focusedPoint ? `Punto ${activePointIndex + 1}` : zoneInDetail}</h3>
        {!focusedPoint && zoneInDetail && <button type="button" className="face-zone-remove" aria-label="Quitar zona" title="Quitar zona" onClick={() => removeZone(zoneInDetail)}>
          <Trash2 size={16} aria-hidden="true"/>
        </button>}
      </div>}
      {zoneInDetail && !focusedPoint && <section className="face-zone-summary" aria-label={`Resumen de ${zoneInDetail}`}>
        <div className="face-zone-summary-heading"><strong>Aplicaciones</strong><span>{detailPoints.length}</span></div>
        {detailPoints.length > 0
          ? <div className="face-zone-summary-list" aria-label="Aplicaciones de la zona">{detailPoints.map((point, index) => <div className="face-zone-summary-row" key={point.id}>
            <button type="button" className="face-zone-summary-inspect"
              aria-label={`Inspeccionar aplicación ${index + 1}: ${facePointDetail(point) || 'Sin detalles'}`}
              title={`Inspeccionar aplicación ${index + 1}`} onMouseEnter={() => setHoveredPointId(point.id)}
              onMouseLeave={() => setHoveredPointId(null)} onFocus={() => setHoveredPointId(point.id)}
              onBlur={() => setHoveredPointId(null)} onClick={() => editZonePoint(point)}>
              <span className="face-zone-summary-index">{index + 1}</span>
              <span className="face-zone-summary-copy"><strong>{facePointLabel(point) || 'Sin cantidad'}</strong>{point.note && <span>{point.note}</span>}</span>
            </button>
            <button type="button" className="face-zone-summary-delete" aria-label={`Eliminar aplicación ${index + 1}`}
              title={`Eliminar aplicación ${index + 1}`} onClick={event => { event.stopPropagation(); removePoint(point); }}>
              <Trash2 size={15} aria-hidden="true"/>
            </button>
          </div>)}</div>
          : <p className="face-zone-summary-empty">Aún no hay puntos en esta zona.</p>}
        {pointPlacementAction}
      </section>}
      {focusedPoint && <section className="face-point-editor" aria-label="Editar punto">
        <h3>Editar punto</h3>
        <div className="face-point-fields">
          <label>Cantidad<input inputMode="decimal" maxLength={24} value={activePoint.amount} onChange={event => editPoint('amount', event.target.value)}/></label>
          <label>Unidad<input maxLength={24} value={activePoint.unit} onChange={event => editPoint('unit', event.target.value)}/></label>
          <p className="face-point-zone"><strong>Zona</strong> {activePoint.zone || 'Fuera de las zonas marcadas'}</p>
          <label>Nota del punto<input maxLength={200} value={activePoint.note} onChange={event => editPoint('note', event.target.value)}/></label>
          <div className="face-point-actions">
            <button type="button" className="button outline compact" onClick={() => removePoint(activePoint)}>Quitar punto</button>
            <button type="button" className="button outline compact" disabled={!canMirrorPoint} onClick={mirrorActivePoint}>Copiar</button>
          </div>
        </div>
        {pointPlacementAction}
      </section>}
      {showPoints && activePoint && !mode && !activePoint.zone && <p className="face-zone-details">{facePointDetail(activePoint) || 'Punto sin detalle'}</p>}
      {!zoneInDetail && <div className="clinical-zone-summary"><strong>Zonas seleccionadas</strong><span aria-live="polite">{selectedNames.size}</span></div>}
      {mode === 'choose-zone' && <div className="face-zone-entry-prompt">
        <p role="status">Selecciona una zona en el diagrama.</p>
        <button type="button" className="button outline compact" onClick={finishZoneEntry}>Cancelar selección</button>
      </div>}
      {!zoneInDetail && (selectedNames.size > 0 || showPoints) && <div className="face-zone-grid">
        {orderedNames.map(name => {
          const zonePoints = pointsByZone.get(name) || [];
          const count = zonePoints.length;
          const pointSummary = zonePoints.map(facePointLabel).filter(Boolean).join(' · ');
          return <button type="button" className="face-zone-tile" key={name}
            title={pointSummary ? `${name} · Cantidades: ${pointSummary}` : name}
            aria-label={pointSummary ? `${name} · Cantidades: ${pointSummary}` : name}
            onClick={() => openZone(name)}>
            <span className="face-zone-tile-visual">
              <ProcedureZoneGlyph name={name} view={view}/>
              {count > 0 && <span className="face-zone-tile-count" aria-label={`${count} ${count === 1 ? 'punto' : 'puntos'}`}>{count}</span>}
            </span>
            <strong>{name}</strong>
          </button>;
        })}
        {showPoints && mode !== 'choose-zone' && <button type="button" className="face-zone-tile face-zone-add-tile" onClick={placement ? finishZoneEntry : beginZoneSelection}>
          {placement ? <Check size={26} aria-hidden="true"/> : <Plus size={26} aria-hidden="true"/>}
          <strong>{placement ? "Finalizar" : "Agregar zona"}</strong>
        </button>}
      </div>}
      {selectedNames.size ? (zoneInDetail && !focusedPoint ? [zoneInDetail] : []).map(name => {
        const zone = manualZones.get(name);
        const zonePoints = pointsByZone.get(name);
        return <div className="face-zone-detail-content" key={name}>
          <label className="procedure-zone-detail-field">
            {zonePoints ? 'Notas adicionales' : 'Dosis / detalle'}
            {zonePoints
              ? <textarea aria-label={`Notas adicionales para ${name}`} value={zone?.dose || ''}
                  onChange={event => setZoneDose(name, event.target.value)} placeholder="Escribe una nota para esta zona…" rows={3} maxLength={80}/>
              : <input aria-label={`Dosis o detalle para ${name}`} value={zone?.dose || ''}
                  onChange={event => setZoneDose(name, event.target.value)} maxLength={80}/>}
          </label>
        </div>;
      }) : <p className="clinical-map-empty">Aún no hay zonas. Selecciona una región del mapa o usa la lista.</p>}
      </aside>
    </div>
    <dialog ref={pointRemovalDialog} className="point-removal-dialog" aria-labelledby={`${clipId}-remove-title`}
      aria-describedby={`${clipId}-remove-description`} onClose={() => setPendingMapRemoval(null)}>
      <div className="point-removal-heading">
        <span aria-hidden="true"><Trash2 size={17}/></span>
        <h3 id={`${clipId}-remove-title`}>{pendingMapRemoval?.zone ? "¿Quitar esta zona?" : "¿Quitar este punto?"}</h3>
      </div>
      <p id={`${clipId}-remove-description`}>{pendingMapRemoval?.zone ? "Se quitarán la zona, sus puntos y sus notas." : "Se quitará del mapa junto con los datos que ingresaste."}</p>
      <div className="point-removal-actions">
        <button ref={cancelPointRemoval} type="button" className="button outline" onClick={() => pointRemovalDialog.current.close()}>Cancelar</button>
        <button type="button" className="button point-removal-confirm" onClick={() => {
          if (!pendingMapRemoval) return;
          pointRemovalDialog.current.close();
          if (pendingMapRemoval.zone) deleteZone(pendingMapRemoval.zone);
          else deletePoint(pendingMapRemoval.point);
        }}>{pendingMapRemoval?.zone ? "Quitar zona" : "Quitar punto"}</button>
      </div>
    </dialog>
  </section>;
}

function ProcedureModal({patient,services=[],templates=[],record,recordFiles=[],pending,sharedMode,close,onSubmit,onSignConsent}) {
  const performedAt = record?.performedAt ? new Date(record.performedAt) : new Date();
  const localStamp = new Date(performedAt.getTime() - performedAt.getTimezoneOffset() * 60000).toISOString();
  const activeService = record?.procedureType || [...(patient.consentHistory||[])].reverse().find(item => item.status !== 'Reemplazado' && item.service)?.service || (patient.treatment && patient.treatment !== 'Por definir' ? patient.treatment : '');
  const [service,setService]=useState(activeService);
  const [pickingService,setPickingService]=useState(false);
  const [mapOpen,setMapOpen]=useState(false);
  const savedZones = record?.zones || [];
  const [zones,setZones]=useState(() => savedZones.filter(zone => !isProcedurePointRecord(zone)));
  const [points,setPoints]=useState(() => savedZones.find(isProcedurePointRecord)?.points || []);
  const [zoneOrder, setZoneOrder] = useState(() => savedZones.find(isProcedurePointRecord)?.zoneOrder || []);
  const existingPhotos = recordFiles.filter(file => String(file.title||'').startsWith(sessionMediaPrefix(record?.id||'')) && file.kind === 'clinical_photo').length;
  const room = Math.max(0, 4 - (record ? existingPhotos : 0));
  const [shots,setShots]=useState([]);
  const [cameraOn,setCameraOn]=useState(false);
  useEffect(() => {
    const selected = new Set([...zones.map(zone => zone.name), ...groupFacePointsByZone(points).keys()]);
    setZoneOrder(current => {
      const next = [...new Set([...current.filter(name => selected.has(name)), ...selected])];
      return next.length === current.length && next.every((name, index) => name === current[index]) ? current : next;
    });
  }, [zones, points]);
  const matchedConsent = suggestConsentTemplate(service, templates);
  const consentSigned = (patient.consentHistory||[]).some(item => item.status === 'Firmado' && item.service === service);
  const serviceItems = [...new Map([...(service ? [{id: service, label: service}] : []), ...services.map(item => ({id: item.name, label: item.name}))].map(item => [item.label, item])).values()];
  const zoneCount = zones.length + groupFacePointsByZone(points).size;
  const toggleZone=name=>setZones(current=>current.some(item=>item.name===name)?current.filter(item=>item.name!==name):[...current,{name,dose:''}]);
  const setZoneDose = (name, value) => setZones(current => {
    const zone = current.find(item => item.name === name);
    if (!zone) return value ? [...current, {name, dose: value, fromPointNotes: true}] : current;
    if (zone.fromPointNotes && !value) return current.filter(item => item.name !== name);
    return current.map(item => item.name === name ? {...item, dose: value} : item);
  });
  const addShots=files=>setShots(current=>{
    const next=[...files].filter(file=>file.type?.startsWith('image/')).slice(0, room-current.length).map(file=>({file,url:URL.createObjectURL(file)}));
    return [...current,...next].slice(0, room);
  });
  const zonesPayload = points.length ? [...zones, {kind: procedurePointRecordType, name: 'Puntos anatómicos', dose: String(points.length), points, zoneOrder}] : zones;
  return <Modal title={record ? "Editar sesión" : "Registrar sesión"} subtitle={`${patient.name} · Servicio, nota y fotos de esta visita`} close={()=>{ if (!pending) { setCameraOn(false); close(); } }} className="patient-record-modal procedure-modal"><form className="form-stack" onSubmit={event=>onSubmit(event, zonesPayload, shots.map(shot=>shot.file))}>
    <input type="hidden" name="procedureType" value={service}/>
    <button type="button" className="choice-card session-service-card" onClick={()=>setPickingService(true)}><span><strong>{service || 'Elige el servicio'}</strong><small>{service ? 'Servicio de esta sesión. Toca para cambiarlo.' : 'Por defecto es el servicio activo de la visita.'}</small></span><em>Cambiar</em></button>
    {matchedConsent && !consentSigned && <div className="form-note session-consent-note"><FileText size={15}/> Este servicio usa el consentimiento «{matchedConsent.title}» y todavía no está firmado. <button type="button" className="text-link" onClick={()=>onSignConsent?.(service)}>Firmar consentimiento</button></div>}
    {matchedConsent && consentSigned && <div className="form-note"><Check size={15}/> El consentimiento de este servicio ya está firmado.</div>}
    <div className="form-grid">
      <label>Fecha<ClinicDateField name="sessionDate" defaultValue={localStamp.slice(0,10)} required/></label>
      <label>Hora<ClinicTimeField name="sessionTime" defaultValue={localStamp.slice(11,16)} step={300} required/></label>
    </div>
    <div className="form-grid">
      <label>Producto / marca<input name="product" defaultValue={record?.product||''} maxLength="160" placeholder="Opcional"/></label>
      <label>Lote<input name="lotNumber" defaultValue={record?.lotNumber||''} maxLength="100" placeholder="Opcional"/></label>
    </div>
    <button type="button" className="choice-card session-service-card" onClick={()=>setMapOpen(true)}><span><strong>Mapa de aplicación</strong><small>{zoneCount ? `${zoneCount} ${zoneCount===1?'zona marcada':'zonas marcadas'}` : 'Opcional. Ábrelo solo si vas a marcar zonas.'}</small></span><em>{zoneCount?'Editar':'Abrir'}</em></button>
    <div className="session-photo-block">
      <div className="session-photo-heading"><strong>Fotos de la sesión</strong><span>{(record?existingPhotos:0)+shots.length}/4</span></div>
      <div className="session-photo-actions">
        <button type="button" className="button session-camera" onClick={()=>setCameraOn(true)} disabled={shots.length>=room}><Camera size={16}/> Tomar foto</button>
        <label className={`button session-photo-pick ${shots.length>=room?'is-disabled':''}`}><Upload size={16}/> Elegir fotos<input className="profile-photo-input" type="file" accept="image/*" multiple disabled={shots.length>=room} onChange={event=>{ addShots(event.target.files||[]); event.target.value=''; }}/></label>
      </div>
      <SessionCameraStage open={cameraOn} disabled={shots.length>=room} onClose={()=>setCameraOn(false)} onCapture={file=>addShots([file])}/>
      <SessionPhotoSlots shots={shots} reserved={record?existingPhotos:0} onRemove={shot=>setShots(current=>current.filter(item=>item.url!==shot.url))}/>
    </div>
    <label>Indicaciones<textarea name="followUp" defaultValue={record?.followUp||''} rows="3" maxLength="4000" placeholder="Cuidados, evolución esperada y seguimiento. Opcional."/></label>
    <div className="form-note"><ShieldCheck size={15}/>{sharedMode?'Registro clínico visible al equipo autorizado.':'Demostración local: se guarda en este navegador.'} Las fotos se comprimen y quedan en esta sesión, no en documentos.</div>
    <div className="modal-actions"><button type="button" className="button secondary" disabled={pending} onClick={()=>{setCameraOn(false); close();}}>Cancelar</button><button className="button primary" type="submit" disabled={pending || !service}><Check size={15}/> Guardar sesión</button></div>
  </form>
  {pickingService&&<NamePickerModal title="Servicio de la sesión" subtitle="Sale el servicio activo. Cámbialo solo si hoy vino por otra cosa." items={serviceItems} selectedId={service} placeholder="Buscar servicio" emptyLabel="No hay servicios con ese nombre." onClose={()=>setPickingService(false)} onSelect={item=>{setService(item.label);setPickingService(false);}}/>}
  {mapOpen&&createPortal(<Modal className="name-picker-modal procedure-map-modal" title="Mapa de aplicación" subtitle="Marca las zonas y la dosis. Se guarda con la sesión." close={()=>setMapOpen(false)}><ProcedureAnatomyMap zones={zones} toggleZone={toggleZone} setZoneDose={setZoneDose} points={points} setPoints={setPoints} zoneOrder={zoneOrder}/><div className="modal-actions"><button type="button" className="button primary" onClick={()=>setMapOpen(false)}>Listo</button></div></Modal>, document.body)}
  </Modal>;
}

function PatientFileModal({patient,close,onSubmit}) {
  const [kind,setKind]=useState('study');
  const [file,setFile]=useState(null);
  const today=localISODate();
  return <Modal title="Adjuntar archivo" subtitle={`${patient.name} · Estudios y documentos. Las fotos van en la sesión.`} close={close}><form className="form-stack" onSubmit={event=>{
    if(!file){ event.preventDefault(); return; }
    const input=event.currentTarget.querySelector('input[name="file"]');
    if(input){ const transfer=new DataTransfer(); transfer.items.add(file); input.files=transfer.files; }
    onSubmit(event);
  }}>
    <div className="form-grid"><label>Tipo<select name="kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="study">Estudio</option><option value="consent">Consentimiento firmado</option><option value="contract">Contrato firmado</option><option value="other">Otro documento</option></select></label><label>{kind==='consent'||kind==='contract'?'Fecha de firma':'Fecha del archivo'}<ClinicDateField name="signedAt" defaultValue={today} required/></label></div>
    <label>Nombre / descripción<input name="title" required maxLength="200" placeholder="Ej. Laboratorio, ultrasonido o radiografía" autoFocus/></label>
    <input name="file" type="file" className="profile-photo-input" accept="application/pdf,image/jpeg,image/png"/>
    <label className="session-media-button"><FilePlus2 size={16}/><span><strong>{file?file.name:'Elegir archivo'}</strong><small>PDF, JPG o PNG</small></span><input className="profile-photo-input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={event=>setFile(event.target.files?.[0]||null)}/></label>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Cancelar</button><button className="button primary" type="submit" disabled={!file}><FilePlus2 size={15}/> Adjuntar al expediente</button></div>
  </form></Modal>;
}

function DiagnosisModal({patient,sharedMode=false,close,onAccept}){
  const initialSummary=patient.diagnosisSummary||(patient.diagnosisAccepted&&!sharedMode?'Diagnóstico de demostración aceptado':'');
  const [summary,setSummary]=useState(initialSummary);
  const unchanged=Boolean(patient.diagnosisAccepted)&&summary.trim()===initialSummary.trim();
  return <Modal title={patient.diagnosisAccepted?'Revisar diagnóstico aceptado':'Diagnóstico'} subtitle={`${patient.name} · ${patient.treatment}`} close={close}>
    <form className="form-stack" onSubmit={onAccept}>
      <div className="workflow-stepper"><span className="step done">1 <small>Diagnóstico</small></span><i/><span className="step">2 <small>Contrato</small></span><i/><span className="step">3 <small>Firma</small></span></div>
      <div className="document-preview"><span className="eyebrow">{sharedMode?'REGISTRO CLÍNICO':'RESUMEN CLÍNICO DE DEMOSTRACIÓN'}</span><h3>{patient.treatment==='Por definir'?'Consulta de hoy':patient.treatment}</h3><label>Qué encontraste en la consulta<textarea name="summary" rows="5" maxLength="4000" value={summary} onChange={event=>setSummary(event.target.value)} placeholder="Motivo de la visita, lo que observaste y el plan. Ejemplo: valoración para bótox en frente." required/></label></div>
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

function DocumentSignatureBlock({signed, signedAt, drawing, setDrawing, saving, onSaveSignature, staffName, staffSignatureUrl, who='la paciente'}) {
  const padRef=useRef(null);
  useEffect(()=>{ if(drawing) padRef.current?.scrollIntoView({block:'nearest'}) },[drawing]);
  return <>
    <div className="document-sign-row">
      <figure><figcaption>Firma de {who}</figcaption>{signed?<span>Registrada{signedAt?` · ${new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(signedAt))}`:''}</span>:<span>Pendiente en este dispositivo</span>}</figure>
      <figure><figcaption>Firma de {staffName||'la cuenta clínica'}</figcaption>{staffSignatureUrl?<img src={staffSignatureUrl} alt={`Firma de ${staffName||'la profesional'}`}/>:<span>Todavía no hay firma en Mi perfil.</span>}</figure>
    </div>
    {drawing&&<div ref={padRef}><SignaturePad confirmLabel="Firmar" saving={saving} onCancel={()=>setDrawing(false)} onSave={onSaveSignature}/></div>}
  </>;
}
function SignatureCaptureModal({ title, subtitle, confirmLabel, saving, existingUrl, onUseExisting, onSave, onClose }) {
  const [redraw,setRedraw]=useState(!existingUrl);
  return <Modal className="signature-capture-modal" title={title} subtitle={subtitle} close={onClose}>
    {existingUrl&&!redraw?<div className="signature-existing"><img src={existingUrl} alt={title}/><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setRedraw(true)}>Firmar de nuevo</button><button type="button" className="button primary" onClick={onUseExisting}>Usar esta firma</button></div></div>:<SignaturePad tall confirmLabel={confirmLabel} saving={saving} onCancel={onClose} onSave={onSave}/>}
  </Modal>;
}
function ContractViewerModal({patient,close,onPrint,onDownload,onDiagnosis,onSaveSignature,onSaveStaffSignature,onPrepare,staffName,staffSignatureUrl}) {
  const [signRole,setSignRole]=useState('');
  const [patientSignature,setPatientSignature]=useState('');
  const [staffDrawn,setStaffDrawn]=useState('');
  const [staffAccepted,setStaffAccepted]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [saving,setSaving]=useState(false);
  const [signError,setSignError]=useState('');
  const signed=patient.contract==='Firmado';
  const hasOfficialText=Boolean(patient.contractContent?.trim());
  const diagnosisMismatch=Boolean(patient.diagnosisId&&patient.contractDiagnosisId!==patient.diagnosisId);
  const needsDiagnosis=!signed&&!patient.diagnosisAccepted;
  const canSign=!signed&&!confirmed&&patient.contract==='Pendiente'&&patient.diagnosisAccepted&&hasOfficialText&&!diagnosisMismatch;
  const staffImage=staffDrawn||staffSignatureUrl||'';
  const bothReady=Boolean(patientSignature)&&staffAccepted&&Boolean(staffImage);
  const sealed=confirmed||signed;
  const signatures=[{label:'Firma de la paciente',src:patientSignature},{label:`Firma de ${staffName||'el usuario'}`,src:staffImage}];
  const confirmContract=async()=>{
    if(!bothReady||saving) return;
    setSaving(true);
    try {
      await onSaveSignature?.(dataUrlToFile(patientSignature,'firma-paciente.png'));
      setConfirmed(true);
    } catch {
      setConfirmed(false);
    } finally { setSaving(false); }
  };
  const acceptStaffSignature=async()=>{
    setStaffAccepted(true);
    setSignRole('');
    if (!staffSignatureUrl) return;
    try {
      const response=await fetch(staffSignatureUrl);
      const blob=await response.blob();
      setStaffDrawn(await fileToDataUrl(new File([blob],'firma-medico.png',{type:blob.type||'image/png'})));
    } catch { setStaffDrawn(staffSignatureUrl); }
  };
  return <><Modal title="Contrato de servicios" subtitle={`${patient.name} · Expediente ${patient.id}`} close={close} printable>
    <div className="document-preview"><span className="eyebrow">VISTA PREVIA · {patient.contractType || 'PRESTACIÓN DE SERVICIOS'}</span><h3>{patient.contractTemplateTitle || 'Acuerdo de prestación de servicios'}</h3><div className="preview-section"><strong>Paciente</strong><span>{patient.name}</span></div><div className="preview-section"><strong>Servicio</strong><span>{patient.contractService || 'Elige el servicio al preparar el contrato'}</span></div><div className="preview-section"><strong>Estado del diagnóstico</strong><span>{patient.diagnosisAccepted ? 'Aceptado' : 'Pendiente de revisión'}</span></div>{hasOfficialText?<div className="template-content">{fillDocumentPlaceholders(patient.contractContent, {...patient, treatment: patient.contractService || patient.treatment})}</div>:<p>Este expediente no tiene un contrato preparado con texto oficial. Prepara uno desde un formato revisado por la clínica antes de firmar.</p>}
      {canSign&&<div className="sign-launch"><button type="button" className={patientSignature?'is-done':''} onClick={()=>setSignRole('patient')}><strong>Firma de la paciente</strong><span>{patientSignature?'Lista. Toca para repetirla.':'Primero firma la paciente.'}</span>{patientSignature&&<img src={patientSignature} alt="Firma de la paciente"/>}</button><button type="button" className={staffAccepted?'is-done':''} disabled={!patientSignature} onClick={()=>setSignRole('staff')}><strong>Firma del médico</strong><span>{staffAccepted?'Lista. Toca para cambiarla.':patientSignature?'Ahora firma el médico.':'Disponible después de la paciente.'}</span>{staffAccepted&&staffImage&&<img src={staffImage} alt="Firma del médico"/>}</button></div>}
      {signError&&<p>{signError}</p>}
      {bothReady&&!sealed&&<div className="form-note"><CheckCircle2 size={15}/> Las dos firmas ya están. Confirma para generar el contrato con ellas.</div>}
      {sealed&&<div className="contract-generated"><strong>Contrato generado con las firmas.</strong><span>Ya puedes descargarlo o imprimirlo.</span>{signatures.filter(item=>item.src).map(item=><figure key={item.label}><figcaption>{item.label}</figcaption><img src={item.src} alt={item.label}/></figure>)}</div>}
    </div>
    {needsDiagnosis&&<div className="form-note"><ClipboardCheck size={15}/> Primero escribe y acepta lo que encontraste en la consulta.</div>}
    {diagnosisMismatch&&<div className="form-note"><ClipboardCheck size={15}/> Este contrato corresponde a una valoración anterior. Prepara uno nuevo antes de continuar con el diagnóstico actual.</div>}
    <div className="modal-actions"><button className="button secondary" onClick={close}>Cerrar</button>{needsDiagnosis&&<button className="button primary" onClick={onDiagnosis}><ClipboardCheck size={15}/> Ir a diagnóstico</button>}{(diagnosisMismatch||(!signed&&!hasOfficialText))&&<button className="button primary" onClick={onPrepare}><FilePlus2 size={15}/> Preparar contrato</button>}{canSign&&bothReady&&<button className="button primary" onClick={confirmContract} disabled={saving}><CheckCircle2 size={15}/>{saving?'Generando…':'Confirmar contrato'}</button>}{sealed&&<><button className="button outline" onClick={()=>onDownload?.(signatures)}><FileText size={15}/> Descargar</button><button className="button outline" onClick={onPrint}><Printer size={15}/> Imprimir contrato</button><button className="button primary" onClick={close}><CheckCircle2 size={15}/> Listo</button></>}</div>
  </Modal>
  {signRole==='patient'&&<SignatureCaptureModal title="Firma de la paciente" subtitle={`${patient.name} firma primero`} confirmLabel="Firmar como paciente" saving={saving} existingUrl={patientSignature} onClose={()=>setSignRole('')} onUseExisting={()=>setSignRole('')} onSave={async file=>{ const url=await fileToDataUrl(file); setPatientSignature(url); setSignRole(''); }}/>}
  {signRole==='staff'&&<SignatureCaptureModal title="Firma del médico" subtitle={staffName||'Usuario de la cuenta'} confirmLabel="Firmar como médico" saving={saving} existingUrl={staffImage} onClose={()=>setSignRole('')} onUseExisting={acceptStaffSignature} onSave={async file=>{ setSignError(''); setSaving(true); try { const url=await onSaveStaffSignature?.(file); setStaffDrawn(url||await fileToDataUrl(file)); setStaffAccepted(true); setSignRole(''); } catch (error) { setSignError(error?.message || 'No se pudo guardar la firma del médico.'); } finally { setSaving(false); } }}/>}
  </>;
}

function ConsentViewerModal({patient,document,content,status,signedAt,close,onPrint,onDownload,onChangeService,onSign,onSaveSignature,staffName,staffSignatureUrl}) {
  const consentText=withPatientWord(content);
  const [signing,setSigning]=useState(false);
  const [saving,setSaving]=useState(false);
  const [justSigned,setJustSigned]=useState(false);
  const signed=status==='Firmado'||justSigned;
  const canSign=!signed&&status==='Pendiente'&&Boolean(content?.trim());
  return <><Modal title={document} subtitle={`${patient.name} · Expediente ${patient.id}`} close={close} printable>
    <div className="document-preview"><span className="eyebrow">{justSigned?'VISTA PREVIA · FIRMADO':'COPIA DEL DOCUMENTO'}</span><h3>{document}</h3><div className="preview-section"><strong>Paciente</strong><span>{patient.name}</span></div>{consentText.trim()?<div className="template-content consent-formatted-wrap"><ConsentFormattedCopy content={consentText}/></div>:<p>Esta solicitud no conserva texto oficial. Agrega y valida el formato en la biblioteca antes de solicitar una firma.</p>}<DocumentSignatureBlock signed={signed} signedAt={signedAt||(justSigned?new Date().toISOString():null)} drawing={false} setDrawing={()=>{}} saving={saving} staffName={staffName} staffSignatureUrl={staffSignatureUrl} who="la paciente" onSaveSignature={()=>{}}/>{justSigned&&<div className="contract-generated"><strong>Consentimiento firmado y guardado en el expediente.</strong><span>Puedes descargarlo o imprimirlo, y luego dar Listo.</span></div>}</div>
    <div className="modal-actions">{justSigned?<><button className="button outline" onClick={onDownload}><FileText size={15}/> Descargar</button><button className="button outline" onClick={onPrint}><Printer size={15}/> Imprimir consentimiento</button><button className="button primary" onClick={close}><CheckCircle2 size={15}/> Listo</button></>:<><button className="button secondary" onClick={close}>Cerrar</button>{onChangeService&&<button className="button outline" onClick={onChangeService}>Cambiar servicio</button>}{signed&&<button className="button primary" onClick={close}><CheckCircle2 size={15}/> Listo</button>}{canSign&&<button className="button primary" onClick={()=>{ if(onSaveSignature) setSigning(true); else onSign?.(); }}><FileCheck2 size={15}/> Firmar</button>}</>}</div>
  </Modal>
  {signing&&<SignatureCaptureModal title="Firma de la paciente" subtitle={patient.name} confirmLabel="Firmar consentimiento" saving={saving} onClose={()=>setSigning(false)} onSave={async file=>{ setSaving(true); try { await onSaveSignature?.(file); setSigning(false); setJustSigned(true); } finally { setSaving(false); } }}/>}
  </>;
}function Modal({title,subtitle,close,children,printable=false,className=''}){
  useEffect(()=>{
    if(!printable)return undefined;
    document.body.classList.add('print-document-mode');
    return()=>document.body.classList.remove('print-document-mode');
  },[printable]);
  return <div className={`modal-backdrop ${printable?'printable-document-modal':''}`} onMouseDown={e=>e.target===e.currentTarget&&close()}><div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" className="icon-button" onClick={close} aria-label="Cerrar diálogo"><X size={19}/></button></div>{children}</div></div>;
}

export default App;

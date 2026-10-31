export const CLINIC_ROLES = [
  ['admin', 'Administrador'],
  ['clinician', 'Profesional clínico'],
  ['receptionist', 'Recepción'],
  ['billing', 'Pagos'],
];

export const CLINIC_PERMISSION_GROUPS = [
  { id: 'patients', title: 'Pacientes', permissions: [['patients.create', 'Crear pacientes'], ['patients.edit', 'Editar pacientes']] },
  { id: 'agenda', title: 'Agenda', permissions: [['agenda.create', 'Crear citas'], ['agenda.edit', 'Editar citas'], ['agenda.cancel', 'Cancelar citas']] },
  { id: 'payments', title: 'Pagos', permissions: [['payments.create', 'Registrar pagos'], ['payments.refund', 'Registrar reembolsos']] },
  { id: 'documents', title: 'Consentimientos y contratos', permissions: [['documents.create', 'Preparar documentos'], ['documents.manage_templates', 'Administrar formatos']] },
  { id: 'clinical', title: 'Expediente clínico', permissions: [['clinical.create', 'Agregar información clínica'], ['clinical.edit', 'Editar información clínica']] },
  { id: 'team', title: 'Equipo', permissions: [['team.manage_professionals', 'Administrar profesionales']] },
  { id: 'settings', title: 'Configuración', permissions: [['team.manage_branches', 'Administrar sucursales'], ['services.manage', 'Editar servicios'], ['availability.scope', 'Administrar disponibilidad'], ['public_agenda.manage', 'Editar Agenda Pública']] },
  { id: 'whatsapp', title: 'WhatsApp', permissions: [['whatsapp.view', 'Mostrar WhatsApp'], ['whatsapp.reply', 'Responder y enviar archivos'], ['whatsapp.manage', 'Administrar remitentes y ajustes']] },
];

const universalReadPermissions = [
  'patients.view', 'agenda.view', 'payments.view', 'documents.view', 'clinical.view',
  'team.view', 'settings.view', 'reminders.view',
];

export const CLINIC_PERMISSION_KEYS = [
  ...universalReadPermissions,
  'patients.create', 'patients.edit', 'agenda.create', 'agenda.edit', 'agenda.cancel',
  'payments.create', 'payments.refund', 'documents.create', 'documents.manage_templates',
  'clinical.create', 'clinical.edit', 'team.manage_branches', 'team.manage_professionals',
  'team.manage_access', 'services.manage', 'availability.scope', 'public_agenda.manage', 'reminders.manage', 'whatsapp.view',
  'whatsapp.reply', 'whatsapp.manage',
];

const presetActions = {
  admin: [
    'patients.create', 'patients.edit', 'agenda.create', 'agenda.edit', 'agenda.cancel',
    'payments.create', 'payments.refund', 'documents.create', 'documents.manage_templates',
    'clinical.create', 'clinical.edit', 'team.manage_branches', 'team.manage_professionals',
    'team.manage_access', 'services.manage', 'public_agenda.manage', 'reminders.manage', 'whatsapp.view',
    'whatsapp.reply', 'whatsapp.manage',
  ],
  receptionist: [
    'patients.create', 'patients.edit', 'agenda.create', 'agenda.edit', 'agenda.cancel',
    'payments.create', 'documents.create', 'team.manage_branches', 'whatsapp.view', 'whatsapp.reply',
  ],
  clinician: [
    'patients.create', 'patients.edit', 'agenda.create', 'agenda.edit', 'agenda.cancel',
    'documents.create', 'clinical.create', 'clinical.edit',
  ],
  billing: ['payments.create'],
};

export function permissionsForPreset(role) {
  const permissions = Object.fromEntries(universalReadPermissions.map(permission => [permission, true]));
  for (const permission of presetActions[role] || []) permissions[permission] = true;
  permissions['availability.scope'] = ({ admin: 'clinic', receptionist: 'branch', clinician: 'self', billing: 'self' })[role] || 'self';
  if (role === 'admin') {
    permissions['services.manage'] = true;
    permissions['public_agenda.manage'] = true;
  }
  return permissions;
}

export function normalizeClinicPermissions(value, role = '') {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const permissions = { ...permissionsForPreset(role), ...source };
  const scope = permissions['availability.scope'];
  permissions['availability.scope'] = role === 'admin'
    ? 'clinic'
    : ['self', 'branch', 'clinic'].includes(scope) ? scope : 'self';
  return permissions;
}

export function hasClinicPermission(role, permissions, permission) {
  if (role === 'admin') return true;
  const normalized = normalizeClinicPermissions(permissions, role);
  if (permission.endsWith('.view') && permission !== 'whatsapp.view') return true;
  if (permission === 'availability.manage_clinic') return normalized['availability.scope'] === 'clinic';
  if (permission === 'availability.manage_branch') return ['clinic', 'branch'].includes(normalized['availability.scope']);
  if (permission === 'availability.manage_self') return ['clinic', 'self'].includes(normalized['availability.scope']);
  if (permission === 'whatsapp.reply' && normalized['whatsapp.reply']) return Boolean(normalized['whatsapp.view']);
  if (permission === 'whatsapp.manage' && normalized['whatsapp.manage']) return Boolean(normalized['whatsapp.view']);
  if (permission === 'team.manage_access') return false;
  return normalized[permission] === true;
}

export function isClinicPermissionObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function sanitizeClinicPermissions(value, role) {
  const normalized = normalizeClinicPermissions(value, role);
  return Object.fromEntries(CLINIC_PERMISSION_KEYS.map(permission => {
    if (permission === 'availability.scope') {
      return [permission, normalized[permission]];
    }
    return [permission, role === 'admin' ? true : normalized[permission] === true];
  }));
}

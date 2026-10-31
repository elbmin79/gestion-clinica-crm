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
  { id: 'team', title: 'Equipo y sucursales', permissions: [['team.manage_branches', 'Administrar sucursales'], ['team.manage_professionals', 'Administrar profesionales']] },
  { id: 'settings', title: 'Configuración', permissions: [['settings.manage', 'Administrar configuración']] },
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
  'team.manage_access', 'settings.manage', 'reminders.manage', 'whatsapp.view',
  'whatsapp.reply', 'whatsapp.manage',
];

const presetActions = {
  admin: [
    'patients.create', 'patients.edit', 'agenda.create', 'agenda.edit', 'agenda.cancel',
    'payments.create', 'payments.refund', 'documents.create', 'documents.manage_templates',
    'clinical.create', 'clinical.edit', 'team.manage_branches', 'team.manage_professionals',
    'team.manage_access', 'settings.manage', 'reminders.manage', 'whatsapp.view',
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
  return permissions;
}

export function normalizeClinicPermissions(value, role = '') {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { ...permissionsForPreset(role), ...source };
}

export function hasClinicPermission(role, permissions, permission) {
  if (role === 'admin') return true;
  if (permission.endsWith('.view') && permission !== 'whatsapp.view') return true;
  const normalized = normalizeClinicPermissions(permissions, role);
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
  return Object.fromEntries(CLINIC_PERMISSION_KEYS.map(permission => [
    permission,
    role === 'admin' ? true : normalized[permission] === true,
  ]));
}

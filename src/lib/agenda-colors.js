export const agendaPalette = [
  { id: 'green', label: 'Verde', hex: '#288151' },
  { id: 'orange', label: 'Naranja', hex: '#bd590c' },
  { id: 'yellow', label: 'Amarillo', hex: '#9b7600' },
  { id: 'burgundy', label: 'Guinda', hex: '#943552' },
  { id: 'blue', label: 'Azul', hex: '#2169c2' },
  { id: 'indigo', label: 'Índigo', hex: '#604bc3' },
  { id: 'red', label: 'Rojo', hex: '#c73542' },
  { id: 'pink', label: 'Rosa', hex: '#b43d87' },
  { id: 'unassigned', label: 'Sin color asignado', hex: '#66717f' },
];

export const normalizeService = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

export function appointmentAgendaColor(appointment, providers) {
  const provider = providers.find(item => item.id === appointment.providerId);
  const settings = provider?.branchSettings?.[appointment.branchId];
  if (!settings) return 'unassigned';
  const service = normalizeService(appointment.service);
  // A review remains red even when its description also names the procedure.
  const rules = Object.entries(settings.serviceColors || {}).sort(([a], [b]) => Number(normalizeService(b).startsWith('revision')) - Number(normalizeService(a).startsWith('revision')) || b.length - a.length || a.localeCompare(b));
  const rule = rules.find(([keyword]) => {
    const normalized = normalizeService(keyword);
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = ['revision','revisiones'].includes(normalized) ? 'revisi(?:on|ones)' : normalized === 'morpheus' ? 'morpheus(?:\\s*8)?' : escaped;
    return normalized && new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`).test(service);
  });
  const color = rule?.[1] || settings.color;
  return agendaPalette.some(item => item.id === color) ? color : 'unassigned';
}

export function colorStyle(color) {
  return { '--appointment-color': (agendaPalette.find(item => item.id === color) || agendaPalette.at(-1)).hex };
}

export function filterAgendaAppointments(appointments, { providerIds = [], colors = [], query = '', onlyMine = false, currentProviderId = '' } = {}) {
  const search = normalizeService(query);
  return appointments.filter(item => (!onlyMine || Boolean(currentProviderId) && item.providerId === currentProviderId)
    && (!providerIds.length || providerIds.includes(item.providerId))
    && (!colors.length || colors.includes(item.agendaColor))
    && (!search || normalizeService([item.patient, item.service, item.clinician, item.branch].join(' ')).includes(search)));
}

export function sortAgendaAppointments(appointments, sort = 'date') {
  return [...appointments].sort((a, b) => {
    const dateOrder = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    if (sort === 'patient') return a.patient.localeCompare(b.patient, 'es') || dateOrder;
    if (sort === 'provider') return a.clinician.localeCompare(b.clinician, 'es') || dateOrder;
    return sort === 'date-desc' ? -dateOrder : dateOrder;
  });
}

import { agendaPalette } from './agenda-colors.js';

export function compactAgendaColors(providers) {
  const palette = agendaPalette.filter(color => color.id !== 'unassigned');
  return [...providers].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id))
    .map((provider, index) => ({
      id: provider.id,
      label: provider.name,
      hex: palette[index]?.hex ?? `hsl(${Math.round(index * 137.508) % 360} 57% 40%)`,
    }));
}

export function packAgendaAppointments(appointments, startMinute, endMinute) {
  const events = appointments.map(appointment => {
    const [hour, minute] = String(appointment.time).split(':').map(Number);
    const start = hour * 60 + minute;
    return { appointment, start: Math.max(startMinute, start), end: Math.min(endMinute, start + (parseInt(appointment.duration, 10) || 45)) };
  }).filter(event => event.start < event.end).sort((a, b) => a.start - b.start || b.end - a.end);
  const packed = [];
  let columns = [];
  let groupEnd = -Infinity;
  function finishGroup() {
    columns.forEach((column, index) => {
      for (const event of column) {
        let span = 1;
        while (index + span < columns.length && !columns[index + span].some(other => other.start < event.end && event.start < other.end)) span++;
        packed.push({ ...event, column: index, span, columnCount: columns.length });
      }
    });
    columns = [];
  }

  for (const event of events) {
    if (event.start >= groupEnd) {
      finishGroup();
      groupEnd = event.end;
    }
    groupEnd = Math.max(groupEnd, event.end);
    const column = columns.find(items => items.at(-1).end <= event.start);
    if (column) column.push(event);
    else columns.push([event]);
  }
  finishGroup();
  return packed.sort((a, b) => a.start - b.start || a.column - b.column);
}

import { clinicDateTimeToIso } from '@elixir-clinic/crm-core/clinic-time';

export const defaultAgendaHours = { start: 9 * 60, end: 18 * 60 };

export function agendaClock(minutes) {
  return [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, '0')).join(':');
}

export function agendaWorkingHours(hours, date, providerId, branchId) {
  const assigned = hours.filter(row => row.provider_id === providerId && row.branch_id === branchId);
  if (!assigned.length) return { windows: [defaultAgendaHours], assumed: true };
  const overrides = assigned.filter(row => row.on_date === date);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const applicable = overrides.length ? overrides : assigned.filter(row => row.day_of_week === weekday);
  return {
    windows: applicable.filter(row => !row.closed).map(row => ({
      start: Math.max(6 * 60, row.opens_minute),
      end: Math.min(24 * 60, row.closes_minute),
    })),
    assumed: false,
  };
}

export function agendaFreeBlocks({ date, timeZone, provider, branchId, windows, appointments, blocks, duration }) {
  const busy = appointments.filter(item => item.status !== 'Cancelada' && (item.startsAt || /^\d{2}:\d{2}$/.test(item.time))
    && (item.providerId ? item.providerId === provider.id : item.clinician === provider.name)).map(item => {
    const start = Date.parse(item.startsAt ?? clinicDateTimeToIso(item.date || date, item.time, timeZone));
    return { start, end: Date.parse(item.endsAt) || start + (parseInt(item.duration, 10) || 45) * 60000 };
  });
  for (const block of blocks) {
    if (block.scope === 'clinic' || (block.scope === 'provider' && block.provider_id === provider.id)
      || (block.scope === 'branch' && block.branch_id === branchId)) {
      busy.push({ start: Date.parse(block.starts_at), end: Date.parse(block.ends_at) });
    }
  }

  const free = [];
  for (const { start, end } of windows) {
    for (let minute = Math.ceil(start / 15) * 15; minute + 15 <= end; minute += 15) {
      const instant = Date.parse(clinicDateTimeToIso(date, agendaClock(minute), timeZone));
      if (!busy.some(block => block.start < instant + 15 * 60000 && instant < block.end)) {
        free.push(minute);
      }
    }
  }
  const ranges = [];
  for (const minute of [...new Set(free)].sort((a, b) => a - b)) {
    const previous = ranges.at(-1);
    if (previous?.end === minute) previous.end += 15;
    else ranges.push({ start: minute, end: minute + 15 });
  }
  return ranges.filter(range => range.end - range.start >= duration);
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function localDayKey(value) {
  const date = toDate(value);
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'invalid-date';
}

export function buildWhatsAppTimeline(messages, now = new Date()) {
  let previousDay = '';
  return messages.flatMap(message => {
    const dayKey = localDayKey(message.created_at);
    const newDay = dayKey !== previousDay;
    previousDay = dayKey;
    return [
      ...(newDay ? [{ type: 'day', key: `day-${dayKey}`, label: formatWhatsAppDayLabel(message.created_at, now) }] : []),
      { type: 'message', key: message.id, message },
    ];
  });
}

export function formatWhatsAppMessageTime(value) {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(date) : '';
}

export function formatWhatsAppDayLabel(value, now = new Date()) {
  const date = toDate(value);
  const current = toDate(now);
  if (!date || !current) return '';
  const difference = localDayNumber(current) - localDayNumber(date);
  if (difference === 0) return 'Hoy';
  if (difference === 1) return 'Ayer';
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(date.getFullYear() === current.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

export function formatWhatsAppThreadTime(value, now = new Date()) {
  const date = toDate(value);
  const current = toDate(now);
  if (!date || !current) return '';
  const difference = localDayNumber(current) - localDayNumber(date);
  if (difference === 0) return formatWhatsAppMessageTime(date);
  if (difference === 1) return 'Ayer';
  if (difference > 1 && difference < 7) return new Intl.DateTimeFormat('es-MX', { weekday: 'short' }).format(date);
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
}

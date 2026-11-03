function datePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

export function clinicDateTimeToIso(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = desiredUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observedDate = datePartsInZone(new Date(candidate), timeZone);
    const observedTime = timePartsInZone(new Date(candidate), timeZone);
    const [observedYear, observedMonth, observedDay] = observedDate.split('-').map(Number);
    const [observedHour, observedMinute] = observedTime.split(':').map(Number);
    const observedUtc = Date.UTC(observedYear, observedMonth - 1, observedDay, observedHour, observedMinute, 0);
    const difference = desiredUtc - observedUtc;
    candidate += difference;
    if (difference === 0) break;
  }
  return new Date(candidate).toISOString();
}

function rangeFor(date, period, timeZone) {
  const selected = new Date(`${date}T12:00:00`);
  let start = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 12);
  let end = new Date(start);
  if (period === 'Semana') {
    const offsetFromMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offsetFromMonday);
    end = new Date(start); end.setDate(end.getDate() + 7);
  } else if (period === 'Mes') {
    start = new Date(selected.getFullYear(), selected.getMonth(), 1, 12);
    end = new Date(selected.getFullYear(), selected.getMonth() + 1, 1, 12);
  } else if (period === 'Año') {
    start = new Date(selected.getFullYear(), 0, 1, 12);
    end = new Date(selected.getFullYear() + 1, 0, 1, 12);
  } else {
    end.setDate(end.getDate() + 1);
  }
  return {
    from: clinicDateTimeToIso(datePartsInZone(start, timeZone), '00:00', timeZone),
    to: clinicDateTimeToIso(datePartsInZone(end, timeZone), '00:00', timeZone),
  };
}

export function agendaQueryRange(date, period, timeZone, listEnd) {
  const range = rangeFor(date, period, timeZone);
  if (period === 'Lista' && listEnd >= date) range.to = rangeFor(listEnd, 'Día', timeZone).to;
  return range;
}

export { datePartsInZone, timePartsInZone };

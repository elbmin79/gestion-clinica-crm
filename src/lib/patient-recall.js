function dateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
}

export function buildPatientRecallQueue(patients, appointments, packages = [], timeZone = 'America/Tijuana', now = new Date()) {
  const today = dateKeyInTimeZone(now, timeZone);
  const todayNoon = new Date(`${today}T12:00:00`);
  const queue = [];

  for (const patient of patients) {
    const visits = appointments.filter(item => item.patientId === patient.id || item.patient === patient.name);
    const hasUpcoming = visits.some(item => item.date >= today && !['Cancelada', 'Completada'].includes(item.status));
    for (const purchase of packages.filter(item => item.patientId === (patient.databaseId || patient.id))) {
      const hasPackageAppointment = visits.some(item => item.packageId === purchase.id
        && item.date >= today && !['Cancelada', 'Completada'].includes(item.status));
      const availableSessions = Number(purchase.availableSessions) || 0;
      if (availableSessions > 0 && !hasPackageAppointment) {
        const completedForPackage = visits.filter(item => item.packageId === purchase.id && item.status === 'Completada' && item.date < today)
          .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
        queue.push({
          kind: 'package', patient, package: purchase, lastVisit: completedForPackage,
          daysSince: completedForPackage ? Math.floor((todayNoon - new Date(`${completedForPackage.date}T12:00:00`)) / 86400000) : null,
          reason: `Continuar ${purchase.serviceName || 'paquete'} · ${availableSessions} ${availableSessions === 1 ? 'sesión disponible' : 'sesiones disponibles'}`,
        });
      }
    }

    if (hasUpcoming) continue;
    const completed = visits.filter(item => item.status === 'Completada' && item.date < today).sort((a, b) => b.date.localeCompare(a.date));
    const last = completed[0];
    const daysSince = last ? Math.floor((todayNoon - new Date(`${last.date}T12:00:00`)) / 86400000) : null;
    const facialVisit = Boolean(last && /(facial|limpieza|peeling|botox|relleno|est[eé]tico)/i.test(`${last.service || ''} ${patient.treatment || ''}`));
    const explicitlyFollowUp = patient.status === 'Seguimiento';
    if (!explicitlyFollowUp && !(facialVisit && daysSince >= 30)) continue;
    queue.push({
      kind: 'return', patient, package: null, lastVisit: last || null, daysSince,
      reason: explicitlyFollowUp ? 'Seguimiento pendiente' : `Regreso recomendado · ${last?.service || 'tratamiento estético'}`,
    });
  }

  return queue.sort((a, b) => (b.daysSince || 0) - (a.daysSince || 0));
}

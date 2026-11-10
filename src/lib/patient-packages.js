import { parseSessionPrice } from './appointment-pricing.js';

export function parsePackagePurchase(sessions, amount) {
  const totalSessions = Number(sessions);
  if (!Number.isInteger(totalSessions) || totalSessions < 1 || totalSessions > 1000) {
    throw new Error('Indica entre 1 y 1,000 sesiones.');
  }
  const price = parseSessionPrice(amount, 'MXN');
  if (!price) throw new Error('Indica el precio acordado del paquete.');
  return { totalSessions, agreedAmount: price.amount };
}

export function packageBalance(purchase) {
  const remainingSessions = Math.max(0, purchase.totalSessions - purchase.completedSessions);
  const availableSessions = Math.max(0, remainingSessions - purchase.reservedSessions);
  const outstandingAmount = Math.max(0, Math.round(purchase.agreedAmount * 100) - Math.round(purchase.paidAmount * 100)) / 100;
  return { ...purchase, remainingSessions, availableSessions, outstandingAmount };
}

export function demoPackageBalances(purchases, patientId, appointments, payments) {
  return purchases.filter(purchase => purchase.patientId === patientId).map(purchase => {
    const bookings = appointments.filter(appointment => appointment.packageId === purchase.id);
    const paidCents = payments.filter(payment => payment.packageId === purchase.id).reduce(
      (total, payment) => total + Math.round(payment.amount * 100) * (payment.direction === 'Reembolso' ? -1 : 1), 0);
    return packageBalance({
      ...purchase,
      completedSessions: bookings.filter(appointment => appointment.status === 'Completada').length,
      reservedSessions: bookings.filter(appointment => ['Por confirmar', 'Confirmada'].includes(appointment.status)).length,
      paidAmount: paidCents / 100,
    });
  });
}

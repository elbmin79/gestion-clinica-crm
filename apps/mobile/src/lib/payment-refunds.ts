export type RefundPayment = { direction: 'Ingreso' | 'Reembolso'; amount: number; appointmentId?: string | null; patientId: string };
export type RefundAppointment = { id: string; patientId: string; status: string; depositRequired: boolean; depositAmount: number };
export type RefundAvailability = { balance: number; protectedDeposits: number; available: number };

export function calculateRefundAvailability(
  payments: RefundPayment[],
  appointments: RefundAppointment[],
  patientId: string | undefined,
  appointment?: RefundAppointment | null,
): RefundAvailability {
  if (!patientId) return { balance: 0, protectedDeposits: 0, available: 0 };
  const related = payments.filter(payment => appointment
    ? payment.appointmentId === appointment.id
    : payment.patientId === patientId);
  const balance = related.reduce((sum, payment) => sum + (payment.direction === 'Reembolso' ? -payment.amount : payment.amount), 0);
  const confirmed = (status: string) => ['confirmed', 'Confirmada'].includes(status);
  const protectedDeposits = appointment
    ? confirmed(appointment.status) && appointment.depositRequired ? appointment.depositAmount : 0
    : appointments.filter(item => item.patientId === patientId && confirmed(item.status) && item.depositRequired)
      .reduce((sum, item) => sum + item.depositAmount, 0);
  return { balance, protectedDeposits, available: Math.max(0, balance - protectedDeposits) };
}

export function refundValidationError({
  isRefund, canRefund, amount, availability, appointment,
}: {
  isRefund: boolean;
  canRefund: boolean;
  amount: number;
  availability: RefundAvailability;
  appointment?: RefundAppointment | null;
}): string | null {
  if (!isRefund) return null;
  if (!canRefund) return 'Tu cuenta no tiene permiso para registrar reembolsos.';
  if (amount > availability.balance + 0.001) return 'El reembolso no puede superar los ingresos registrados para este expediente o cita.';
  if (amount > availability.available + 0.001) return appointment
    ? 'Ese reembolso dejaría una cita confirmada por debajo del anticipo requerido.'
    : 'Ese reembolso usaría fondos reservados para anticipos de citas confirmadas. Vincúlalo a otra cita o reduce el monto.';
  return null;
}

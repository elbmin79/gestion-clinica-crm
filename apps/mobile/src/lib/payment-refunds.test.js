import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRefundAvailability, refundValidationError } from './payment-refunds.ts';

const payments = [
  { patientId: 'patient-1', appointmentId: 'appointment-1', direction: 'Ingreso', amount: 800 },
  { patientId: 'patient-1', appointmentId: 'appointment-1', direction: 'Reembolso', amount: 100 },
  { patientId: 'patient-1', appointmentId: 'appointment-2', direction: 'Ingreso', amount: 500 },
  { patientId: 'patient-2', appointmentId: 'appointment-3', direction: 'Ingreso', amount: 400 },
];
const appointments = [
  { id: 'appointment-1', patientId: 'patient-1', status: 'confirmed', depositRequired: true, depositAmount: 300 },
  { id: 'appointment-2', patientId: 'patient-1', status: 'pending', depositRequired: true, depositAmount: 200 },
  { id: 'appointment-3', patientId: 'patient-2', status: 'Confirmada', depositRequired: false, depositAmount: 0 },
];

test('patient refund availability preserves confirmed deposits and subtracts prior refunds', () => {
  const availability = calculateRefundAvailability(payments, appointments, 'patient-1');
  assert.deepEqual(availability, { balance: 1200, protectedDeposits: 300, available: 900 });
  assert.equal(refundValidationError({ isRefund: true, canRefund: true, amount: 901, availability }),
    'Ese reembolso usaría fondos reservados para anticipos de citas confirmadas. Vincúlalo a otra cita o reduce el monto.');
});

test('appointment refund availability uses only its own movements and protects its deposit', () => {
  const appointment = appointments[0];
  const availability = calculateRefundAvailability(payments, appointments, 'patient-1', appointment);
  assert.deepEqual(availability, { balance: 700, protectedDeposits: 300, available: 400 });
  assert.equal(refundValidationError({ isRefund: true, canRefund: true, amount: 400.0005, availability, appointment }), null);
  assert.match(refundValidationError({ isRefund: true, canRefund: true, amount: 401, availability, appointment }), /anticipo requerido/);
});

test('refund guards reject missing permission or amounts above the net patient balance', () => {
  const availability = calculateRefundAvailability(payments, appointments, 'patient-1');
  assert.match(refundValidationError({ isRefund: true, canRefund: false, amount: 1, availability }), /permiso/);
  assert.match(refundValidationError({ isRefund: true, canRefund: true, amount: 1201, availability }), /no puede superar los ingresos/);
  assert.equal(refundValidationError({ isRefund: false, canRefund: false, amount: 1, availability }), null);
});

test('refund calculations return zero for no selected patient and ignore unrelated appointments', () => {
  assert.deepEqual(calculateRefundAvailability(payments, appointments, undefined), { balance: 0, protectedDeposits: 0, available: 0 });
  assert.deepEqual(calculateRefundAvailability(payments, appointments, 'patient-2'), { balance: 400, protectedDeposits: 0, available: 400 });
});

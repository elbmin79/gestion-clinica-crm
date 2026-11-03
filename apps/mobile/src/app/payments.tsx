import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { Colors } from '@/constants/theme';
import { createClinicPayment, loadClinicPayments, type ClinicPaymentsWorkspace } from '@/lib/crm-data';
import { useCrmRouter } from '@/lib/use-crm-router';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { datePartsInZone } from '@elixir-clinic/crm-core/clinic-time';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import { calculateRefundAvailability, refundValidationError } from '@/lib/payment-refunds';

type FinanceData = ClinicPaymentsWorkspace;
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export default function PaymentsScreen() {
  const router = useCrmRouter();
  const { appointmentId: requestedAppointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [patientId, setPatientId] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyDirection, setHistoryDirection] = useState<'Todos' | 'Ingreso' | 'Reembolso'>('Todos');
  const [historyLimit, setHistoryLimit] = useState(80);
  const [appointmentId, setAppointmentId] = useState('');
  const [direction, setDirection] = useState<'Ingreso' | 'Reembolso'>('Ingreso');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Transferencia');
  const [date, setDate] = useState(clinic ? datePartsInZone(new Date(), clinic.timeZone) : new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [prefillApplied, setPrefillApplied] = useState(false);

  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try { setData(await loadClinicPayments(clinic)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los pagos.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!requestedAppointmentId || !data || prefillApplied) return;
    const linkedAppointment = data.appointments.find(item => item.id === requestedAppointmentId);
    if (linkedAppointment) {
      setPatientId(linkedAppointment.patientId);
      setAppointmentId(linkedAppointment.id);
      setDate(linkedAppointment.date);
      setDirection('Ingreso');
      setFormOpen(true);
    } else setError('No encontramos la cita para vincular este movimiento.');
    setPrefillApplied(true);
  }, [data, prefillApplied, requestedAppointmentId]);
  const selectedPatient = data?.patients.find(patient => patient.id === patientId);
  const patientMatches = useMemo(() => {
    const query = patientSearch.trim().toLocaleLowerCase('es-MX');
    if (!data || !query || selectedPatient) return [];
    return data.patients.filter(patient => `${patient.name} ${patient.id}`.toLocaleLowerCase('es-MX').includes(query)).slice(0, 8);
  }, [data, patientSearch, selectedPatient]);
  const appointmentOptions = data?.appointments.filter(item => item.patientId === selectedPatient?.id) || [];
  const selectedAppointment = appointmentOptions.find(item => item.id === appointmentId) || null;
  const refundAvailability = useMemo(() => {
    return calculateRefundAvailability(data?.payments || [], data?.appointments || [], selectedPatient?.id, selectedAppointment);
  }, [data, selectedAppointment, selectedPatient]);
  const totals = useMemo(() => (data?.payments || []).reduce((result, item) => {
    result[item.direction === 'Ingreso' ? 'income' : 'refund'] += item.amount;
    return result;
  }, { income: 0, refund: 0 }), [data]);
  const visiblePayments = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase('es-MX');
    return (data?.payments || []).filter(payment => {
      if (historyDirection !== 'Todos' && payment.direction !== historyDirection) return false;
      if (!query) return true;
      const appointment = data?.appointments.find(item => item.id === payment.appointmentId);
      return `${payment.patientNameSnapshot} ${payment.date} ${payment.method} ${payment.note} ${appointment?.service || ''} ${payment.branchName || ''}`.toLocaleLowerCase('es-MX').includes(query);
    });
  }, [data, historyDirection, historySearch]);
  useEffect(() => { setHistoryLimit(80); }, [historyDirection, historySearch]);
  const canCreate = clinic && hasClinicPermission(clinic.role, clinic.permissions, 'payments.create');
  const canRefund = clinic && hasClinicPermission(clinic.role, clinic.permissions, 'payments.refund');

  const submit = async () => {
    if (!clinic || !data || !selectedPatient || saving) return;
    setSaving(true); setError('');
    try {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('Ingresa un monto mayor que cero.');
      if (!/^\d*(?:\.\d{0,2})?$/.test(amount.trim())) throw new Error('El monto debe tener como máximo dos decimales.');
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00.000Z`) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error('Ingresa una fecha válida.');
      if (note.trim().length > 240) throw new Error('La nota no puede superar 240 caracteres.');
      const refundError = refundValidationError({ isRefund: direction === 'Reembolso', canRefund: Boolean(canRefund), amount: numericAmount, availability: refundAvailability, appointment: selectedAppointment });
      if (refundError) throw new Error(refundError);
      await createClinicPayment(clinic, selectedPatient, selectedAppointment, { direction, amount: numericAmount, method, date, note: note.trim() });
      setFormOpen(false); setAmount(''); setNote(''); setAppointmentId('');
      await refresh();
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('No se pudo registrar el movimiento.');
      const databaseCause = Reflect.get(error, 'cause');
      const nestedDatabaseDetail = databaseCause && typeof databaseCause === 'object'
        ? ['code', 'constraint', 'details'].map(key => Reflect.get(databaseCause, key))
        : [];
      const databaseDetail = [Reflect.get(error, 'code'), Reflect.get(error, 'constraint'), Reflect.get(error, 'details'), ...nestedDatabaseDetail, error.message].filter(Boolean).join(' ');
      setError(databaseDetail.includes('payments_refund_preserves_appointment_deposit')
        ? 'Ese reembolso dejaría una cita confirmada por debajo del anticipo requerido.'
        : databaseDetail.includes('payments_refund_preserves_patient_deposits')
          ? 'Ese reembolso usaría fondos reservados para anticipos de citas confirmadas. Vincula el reembolso a una cita o reduce el monto.'
          : databaseDetail.includes('payments_refund_within_balance') || databaseDetail.includes('23514')
            ? 'El reembolso supera el saldo disponible.'
            : error.message || 'No se pudo registrar el movimiento.');
    }
    finally { setSaving(false); }
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'payments.view')) return <Redirect href="/(tabs)/more" />;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Pagos</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic.name}</Text></View>{canCreate ? <Pressable accessibilityRole="button" onPress={() => setFormOpen(value => !value)} style={[styles.addButton, { backgroundColor: palette.primary }]}><Text style={styles.addButtonText}>{formOpen ? 'Cerrar' : '＋ Registrar'}</Text></Pressable> : null}</View>
    {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando historial…</Text></View> : <>
      <View style={styles.metrics}><Metric label="Ingresos" value={money.format(totals.income)} palette={palette} /><Metric label="Reembolsos" value={money.format(totals.refund)} palette={palette} /><Metric label="Neto" value={money.format(totals.income - totals.refund)} palette={palette} /></View>
      {!!error && !formOpen && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
      {formOpen && canCreate && <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.sectionTitle, { color: palette.text }]}>Nuevo movimiento</Text>
        <Text style={[styles.label, { color: palette.text }]}>Paciente</Text>
        {selectedPatient ? <View style={[styles.selectedPatient, { backgroundColor: palette.primarySoft, borderColor: palette.primary }]}><View style={styles.selectedPatientCopy}><Text style={[styles.selectedPatientName, { color: palette.text }]}>{selectedPatient.name}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Expediente {selectedPatient.id}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cambiar paciente" onPress={() => { setPatientId(''); setAppointmentId(''); setPatientSearch(''); }} style={styles.changePatient}><Text style={[styles.changePatientText, { color: palette.primary }]}>Cambiar</Text></Pressable></View> : <>
          <TextInput accessibilityLabel="Buscar paciente por nombre o expediente" value={patientSearch} onChangeText={setPatientSearch} placeholder="Nombre o número de expediente" placeholderTextColor={palette.textSecondary} autoCapitalize="none" style={[styles.input, { backgroundColor: palette.background, borderColor: palette.line, color: palette.text }]} />
          {patientMatches.length ? <View style={[styles.patientResults, { borderColor: palette.line }]}>{patientMatches.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => { setPatientId(item.id); setPatientSearch(''); setAppointmentId(''); }} style={[styles.patientResult, { borderBottomColor: palette.line }]}><Text style={[styles.patientResultName, { color: palette.text }]}>{item.name}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Expediente {item.id}</Text></Pressable>)}</View> : patientSearch.trim() ? <Text style={[styles.copy, { color: palette.textSecondary }]}>No encontramos pacientes con ese nombre o expediente.</Text> : <Text style={[styles.copy, { color: palette.textSecondary }]}>Busca por nombre o número de expediente.</Text>}
        </>}
        {!!selectedPatient && <><Text style={[styles.label, { color: palette.text }]}>Cita vinculada</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}><Chip label="Sin cita" selected={!appointmentId} onPress={() => setAppointmentId('')} palette={palette} />{appointmentOptions.map(item => <Chip key={item.id} label={`${item.date} · ${item.service}`} selected={item.id === appointmentId} onPress={() => setAppointmentId(item.id)} palette={palette} />)}</ScrollView></>}
        <View style={styles.row}><Chip label="Ingreso" selected={direction === 'Ingreso'} onPress={() => setDirection('Ingreso')} palette={palette} />{canRefund ? <Chip label="Reembolso" selected={direction === 'Reembolso'} onPress={() => setDirection('Reembolso')} palette={palette} /> : null}</View>
        <View style={styles.row}><Input label="Monto · MXN" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" palette={palette} /><Input label="Fecha · AAAA-MM-DD" value={date} onChangeText={setDate} placeholder="2026-11-02" palette={palette} /></View>
        <Text style={[styles.label, { color: palette.text }]}>Método</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{['Efectivo', 'Tarjeta', 'Transferencia', 'Otro'].map(item => <Chip key={item} label={item} selected={method === item} onPress={() => setMethod(item)} palette={palette} />)}</ScrollView>
        <Input label="Nota opcional" value={note} onChangeText={setNote} placeholder="Referencia o concepto" palette={palette} maxLength={240} />
        {direction === 'Reembolso' && selectedPatient ? <View style={[styles.refundSummary, { backgroundColor: palette.background, borderColor: palette.line }]}>
          <Text style={[styles.refundContext, { color: palette.text }]}>{selectedAppointment ? `${selectedAppointment.service} · ${selectedAppointment.date}` : `Saldo del expediente de ${selectedPatient.name}`}</Text>
          <Text style={[styles.copy, { color: palette.textSecondary }]}>Saldo: {money.format(refundAvailability.balance)} · Anticipos reservados: {money.format(refundAvailability.protectedDeposits)}</Text>
          <Text style={[styles.refundAvailable, { color: palette.primary }]}>Disponible para reembolso: {money.format(refundAvailability.available)}</Text>
        </View> : null}
        <Text style={[styles.copy, { color: palette.textSecondary }]}>Los movimientos se conservan en el historial. Para corregir un ingreso registra un reembolso, no edites el movimiento.</Text>
        {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={saving || !selectedPatient} onPress={() => void submit()} style={[styles.submit, { backgroundColor: palette.primary, opacity: saving || !selectedPatient ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Guardar movimiento</Text>}</Pressable>
      </View>}
      <Text style={[styles.sectionTitle, styles.listHeading, { color: palette.text }]}>Historial de movimientos</Text>
      {!!data?.payments.length && <><TextInput accessibilityLabel="Buscar movimientos" value={historySearch} onChangeText={setHistorySearch} placeholder="Paciente, fecha, método o nota" placeholderTextColor={palette.textSecondary} style={[styles.input, { backgroundColor: palette.backgroundElement, borderColor: palette.line, color: palette.text }]} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{(['Todos', 'Ingreso', 'Reembolso'] as const).map(value => <Chip key={value} label={value} selected={historyDirection === value} onPress={() => setHistoryDirection(value)} palette={palette} />)}</ScrollView><Text style={[styles.copy, { color: palette.textSecondary }]}>{visiblePayments.length} de {data.payments.length} movimientos</Text></>}
      {data?.payments.length ? visiblePayments.slice(0, historyLimit).map(payment => <View key={payment.id} style={[styles.payment, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><View style={[styles.indicator, { backgroundColor: payment.direction === 'Ingreso' ? palette.primary : palette.danger }]} /><View style={styles.paymentMain}><Text style={[styles.paymentName, { color: palette.text }]}>{payment.patientNameSnapshot}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{payment.date} · {payment.method}{payment.appointmentId ? ` · ${payment.branchName || 'Cita'}` : ''}</Text>{payment.note ? <Text numberOfLines={1} style={[styles.copy, { color: palette.textSecondary }]}>{payment.note}</Text> : null}</View><Text style={[styles.amount, { color: payment.direction === 'Ingreso' ? palette.primary : palette.danger }]}>{payment.direction === 'Reembolso' ? '−' : '+'}{money.format(payment.amount)}</Text></View>) : <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.paymentName, { color: palette.text }]}>Aún no hay movimientos</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Los ingresos y reembolsos de la clínica aparecerán aquí.</Text></View>}
      {visiblePayments.length > historyLimit ? <Pressable accessibilityRole="button" accessibilityLabel={`Mostrar ${Math.min(80, visiblePayments.length - historyLimit)} movimientos más`} onPress={() => setHistoryLimit(limit => limit + 80)} style={[styles.moreHistory, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.moreHistoryText, { color: palette.primary }]}>Mostrar {Math.min(80, visiblePayments.length - historyLimit)} movimientos más</Text></Pressable> : null}
      {data?.payments.length && visiblePayments.length === 0 ? <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.paymentName, { color: palette.text }]}>Sin resultados</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Prueba con otro texto o tipo de movimiento.</Text></View> : null}
    </>}
  </ScrollView></SafeAreaView>;
}

function Metric({ label, value, palette }: { label: string; value: string; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={[styles.metric, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.metricLabel, { color: palette.textSecondary }]}>{label}</Text><Text numberOfLines={1} style={[styles.metricValue, { color: palette.text }]}>{value}</Text></View>; }
function Chip({ label, selected, onPress, palette }: { label: string; selected: boolean; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? palette.primarySoft : palette.background, borderColor: selected ? palette.primary : palette.line }]}><Text numberOfLines={1} style={{ color: selected ? palette.primary : palette.textSecondary, fontSize: 13, fontWeight: '600' }}>{label}</Text></Pressable>; }
function Input({ label, value, onChangeText, placeholder, palette, keyboardType, maxLength }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; palette: (typeof Colors)[keyof typeof Colors]; keyboardType?: 'decimal-pad'; maxLength?: number }) { return <View style={styles.inputWrap}><Text style={[styles.label, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} maxLength={maxLength} style={[styles.input, { backgroundColor: palette.background, borderColor: palette.line, color: palette.text }]} /></View>; }

const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: '100%', maxWidth: 780, alignSelf: 'center', padding: 20, paddingTop: 8, paddingBottom: 30, gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 4 }, back: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34 }, heading: { flex: 1 }, title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { fontSize: 13, marginTop: 2 }, addButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 13, justifyContent: 'center' }, addButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 14, padding: 11, gap: 9 }, metricLabel: { fontSize: 11, fontWeight: '600' }, metricValue: { fontSize: 15, fontWeight: '700' }, center: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 }, copy: { fontSize: 12, lineHeight: 18 }, card: { borderWidth: 1, borderRadius: 17, padding: 15, gap: 11 }, sectionTitle: { fontSize: 17, fontWeight: '700' }, label: { fontSize: 12, fontWeight: '700', marginBottom: -4 }, choices: { gap: 7, paddingVertical: 3 }, chip: { minHeight: 39, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', maxWidth: 230 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, inputWrap: { flex: 1, gap: 7 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, fontSize: 14 }, selectedPatient: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, gap: 8 }, selectedPatientCopy: { flex: 1, gap: 2 }, selectedPatientName: { fontSize: 14, fontWeight: '700' }, changePatient: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }, changePatientText: { fontSize: 13, fontWeight: '700' }, patientResults: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' }, patientResult: { minHeight: 55, justifyContent: 'center', gap: 2, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth }, patientResultName: { fontSize: 14, fontWeight: '700' }, refundSummary: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 5 }, refundContext: { fontSize: 13, fontWeight: '700' }, refundAvailable: { fontSize: 14, fontWeight: '800' }, submit: { minHeight: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 }, submitText: { color: '#fff', fontSize: 14, fontWeight: '700' }, moreHistory: { minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, moreHistoryText: { fontSize: 13, fontWeight: '700' }, error: { fontSize: 13, lineHeight: 19 }, listHeading: { marginTop: 14, marginBottom: 0 }, payment: { minHeight: 75, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 }, indicator: { width: 4, minHeight: 40, borderRadius: 4 }, paymentMain: { flex: 1, gap: 3 }, paymentName: { fontSize: 14, fontWeight: '700' }, amount: { fontSize: 14, fontWeight: '800' }, empty: { minHeight: 90, borderWidth: 1, borderRadius: 14, padding: 16, justifyContent: 'center', gap: 5 } });

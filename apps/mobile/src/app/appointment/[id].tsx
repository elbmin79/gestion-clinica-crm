import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppointmentServicePicker } from '@/components/appointment-service-picker';
import { AppointmentReminderPreview } from '@/components/appointment-reminder-preview';

import { Colors } from '@/constants/theme';
import { useCrmRouter } from '@/lib/use-crm-router';
import { loadAppointmentCatalog, loadClinicAppointment, loadClinicAppointmentPayments, updateClinicAppointment, type AgendaItem, type AppointmentCatalog, type ClinicAppointmentPayment } from '@/lib/crm-data';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';

const emptyCatalog: AppointmentCatalog = { businesses: [], branches: [], providers: [], services: [] };

export default function AppointmentDetailScreen() {
  const router = useCrmRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const { session, loading: authLoading } = useAuth();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const canViewPayments = clinic ? hasClinicPermission(clinic.role, clinic.permissions, 'payments.view') : false;
  const [appointment, setAppointment] = useState<AgendaItem | null>(null);
  const [appointmentPayments, setAppointmentPayments] = useState<ClinicAppointmentPayment[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [paymentsError, setPaymentsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editModality, setEditModality] = useState<'Presencial' | 'Virtual'>('Presencial');
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [editBusinessId, setEditBusinessId] = useState('');
  const [editBranchId, setEditBranchId] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);
  const [editManualService, setEditManualService] = useState('');
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const refresh = useCallback(async () => {
    if (!clinic || !id) return;
    setLoading(true); setError(''); setPaymentsError('');
    try {
      const loaded = await loadClinicAppointment(clinic, String(id));
      setAppointment(loaded);
      if (loaded) { setEditDate(loaded.date); setEditTime(loaded.time); setEditDuration(String(Number.parseInt(loaded.duration, 10) || 45)); setEditModality(loaded.modality === 'Virtual' ? 'Virtual' : 'Presencial'); }
      if (canViewPayments) {
        setPaymentsLoaded(false);
        try {
          setAppointmentPayments(await loadClinicAppointmentPayments(clinic, String(id)));
          setPaymentsLoaded(true);
        } catch (cause) {
          setAppointmentPayments([]);
          setPaymentsError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial de pagos.');
        }
      } else {
        setAppointmentPayments([]);
        setPaymentsLoaded(false);
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la cita.'); }
    finally { setLoading(false); }
  }, [clinic, id, canViewPayments]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const beginEditing = async () => {
    if (!clinic || !appointment) return;
    setError(''); setLoadingCatalog(true);
    setEditDate(appointment.date);
    setEditTime(appointment.time);
    setEditDuration(String(Number.parseInt(appointment.duration, 10) || 45));
    setEditModality(appointment.modality === 'Virtual' ? 'Virtual' : 'Presencial');
    try {
      const nextCatalog = await loadAppointmentCatalog(clinic, { includeInactive: true });
      setCatalog(nextCatalog);
      setEditBusinessId(appointment.businessId);
      setEditBranchId(appointment.branchId);
      setEditProviderId(appointment.providerId);
      const currentServiceIds = appointment.serviceIds?.length ? appointment.serviceIds : [appointment.serviceId].filter(Boolean);
      setEditServiceIds(currentServiceIds);
      setEditManualService(currentServiceIds.length ? '' : appointment.service);
      setEditing(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los catálogos para editar la cita.'); }
    finally { setLoadingCatalog(false); }
  };

  const branchesForBusiness = catalog.branches.filter(item => item.businessId === editBusinessId);
  const eligibleProviders = catalog.providers.filter(item => !item.branchIds.length || item.branchIds.some(branch => branchesForBusiness.some(candidate => candidate.id === branch)));
  const eligibleBranches = branchesForBusiness.filter(branch => {
    const provider = catalog.providers.find(item => item.id === editProviderId);
    return !provider?.branchIds.length || provider.branchIds.includes(branch.id);
  });
  const eligibleServices = catalog.services.filter(item => !item.branchIds?.length || item.branchIds.includes(editBranchId)).filter(item => !item.providerIds?.length || item.providerIds.includes(editProviderId));
  const eligibleServiceIds = eligibleServices.filter(item => item.active !== false).map(item => item.id).filter((id): id is string => Boolean(id));
  const selectedEditServices = editServiceIds.map(serviceId => catalog.services.find(item => item.id === serviceId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const changeEditServices = (nextIds: string[]) => {
    setEditServiceIds(nextIds);
    const nextServices = nextIds.map(serviceId => catalog.services.find(item => item.id === serviceId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (nextServices.length && nextServices.every(item => Number(item.durationMin) > 0)) {
      setEditDuration(String(nextServices.reduce((total, item) => total + Number(item.durationMax || item.durationMin), 0)));
    }
    setError('');
  };

  const changeStatus = async (status: 'Confirmada' | 'Completada' | 'Cancelada') => {
    if (!clinic || !appointment || saving) return;
    if (canViewPayments && paymentsLoaded && appointment.depositRequired && ['Confirmada', 'Completada'].includes(status)) {
      const received = appointmentPayments.reduce((total, payment) => total + (payment.direction === 'Reembolso' ? -payment.amount : payment.amount), 0);
      if (received + 0.001 < appointment.depositAmount) {
        setError(`Registra el anticipo requerido de ${formatMoney(appointment.depositAmount)} antes de confirmar esta cita.`);
        return;
      }
    }
    setSaving(true); setError('');
    try {
      await updateClinicAppointment(clinic, appointment, {
        businessId: appointment.businessId,
        branchId: appointment.branchId,
        providerId: appointment.providerId,
        date: appointment.date,
        time: appointment.time,
        durationMinutes: Number.parseInt(appointment.duration, 10) || 45,
        service: appointment.service,
        serviceId: appointment.serviceId,
        serviceIds: appointment.serviceIds,
        serviceSnapshot: appointment.serviceSnapshot || undefined,
        modality: appointment.modality,
        status,
      });
      setConfirmCancel(false);
      await refresh();
    } catch (cause) { setError(appointmentErrorMessage(cause, 'No se pudo actualizar la cita. Revisa la asignación de sucursal y tus permisos.', appointment.depositAmount)); }
    finally { setSaving(false); }
  };

  const saveSchedule = async () => {
    if (!clinic || !appointment || saving) return;
    const duration = Number(editDuration);
    if (!isValidCalendarDate(editDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { setError('Escribe una fecha YYYY-MM-DD y una hora HH:MM válidas.'); return; }
    if (!Number.isInteger(duration) || duration < 15 || duration > 720 || duration % 15 !== 0) { setError('La duración debe ser de 15 a 720 minutos, en intervalos de 15.'); return; }
    const startMinute = Number(editTime.slice(0, 2)) * 60 + Number(editTime.slice(3));
    if (startMinute < 360 || startMinute % 15 !== 0 || startMinute + duration > 1440) { setError('La cita debe iniciar desde las 06:00, en intervalos de 15 minutos, y terminar antes de medianoche.'); return; }
    setSaving(true); setError('');
    try {
      const selectedService = selectedEditServices[0];
      const originalServiceIds = appointment.serviceIds?.length ? appointment.serviceIds : [appointment.serviceId].filter(Boolean);
      const keepHistoricalSelection = editServiceIds.join('|') === originalServiceIds.join('|') && editBranchId === appointment.branchId && editProviderId === appointment.providerId;
      const unavailableService = editServiceIds.some(serviceId => !eligibleServiceIds.includes(serviceId));
      const service = selectedEditServices.length ? selectedEditServices.map(item => item.name).join(' + ') : editManualService.trim();
      if (!editBusinessId || !editBranchId || !editProviderId) throw new Error('Selecciona negocio, sucursal y profesional.');
      if (!service) throw new Error('Selecciona un servicio o escribe uno manual.');
      if (editServiceIds.length > 12 || new Set(editServiceIds).size !== editServiceIds.length || selectedEditServices.length !== editServiceIds.length || (!keepHistoricalSelection && unavailableService)) throw new Error('Cada servicio debe estar disponible para la sucursal y profesional seleccionados; elige hasta 12.');
      if (selectedEditServices.length && selectedEditServices.some(item => !(Number(item.durationMin) > 0))) throw new Error('Agrega una duración al catálogo antes de combinar estos servicios.');
      await updateClinicAppointment(clinic, appointment, {
        businessId: editBusinessId,
        branchId: editBranchId,
        providerId: editProviderId,
        date: editDate,
        time: editTime,
        durationMinutes: duration,
        service,
        serviceId: selectedService?.id || '',
        serviceIds: editServiceIds,
        serviceSnapshot: keepHistoricalSelection ? appointment.serviceSnapshot || {} : selectedService ? { code: selectedService.code, name: selectedService.name, durationMin: selectedService.durationMin, durationMax: selectedService.durationMax, capturedAt: new Date().toISOString() } : {},
        modality: editModality,
        status: appointment.status,
      });
      setEditing(false);
      await refresh();
    } catch (cause) { setError(appointmentErrorMessage(cause, 'No se pudo reprogramar la cita. Revisa el horario y tus permisos.', appointment.depositAmount)); }
    finally { setSaving(false); }
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  const canEdit = hasClinicPermission(clinic.role, clinic.permissions, 'agenda.edit');
  const canCancel = hasClinicPermission(clinic.role, clinic.permissions, 'agenda.cancel');
  const canCreatePayment = hasClinicPermission(clinic.role, clinic.permissions, 'payments.create');
  const isFinal = appointment?.status === 'Cancelada' || appointment?.status === 'Completada';
  const paymentNet = appointmentPayments.reduce((total, payment) => total + (payment.direction === 'Reembolso' ? -payment.amount : payment.amount), 0);

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver a agenda" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.headerMain}><Text style={[styles.eyebrow, { color: palette.textSecondary }]}>DETALLE DE CITA</Text><Text style={[styles.title, { color: palette.text }]}>{appointment?.patientName || 'Cita'}</Text></View></View>
    {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando cita…</Text></View> : error && !appointment ? <Card palette={palette}><Text style={[styles.copy, { color: palette.text }]}>{error}</Text><Action title="Intentar de nuevo" onPress={() => void refresh()} palette={palette} /></Card> : !appointment ? <Card palette={palette}><Text style={[styles.sectionTitle, { color: palette.text }]}>No encontramos esta cita</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Puede que se haya eliminado o que tu cuenta no tenga acceso.</Text></Card> : <>
      <Card palette={palette}><View style={styles.statusRow}><Text style={[styles.sectionTitle, { color: palette.text }]}>{appointment.service}</Text><Text style={[styles.badge, { color: palette.primary, backgroundColor: palette.primarySoft }]}>{appointment.status}</Text></View><Text style={[styles.copy, { color: palette.textSecondary }]}>{formatDate(appointment.date)} · {appointment.time} · {appointment.duration}</Text><View style={styles.divider}><LabelValue label="Paciente" value={appointment.patientName} palette={palette} /><Action title="Abrir expediente" onPress={() => router.push({ pathname: '/patients/[id]', params: { id: appointment.patientId } })} palette={palette} /></View><LabelValue label="Profesional" value={appointment.clinician} palette={palette} /><LabelValue label="Sucursal" value={`${appointment.business} · ${appointment.branch}`} palette={palette} /><LabelValue label="Modalidad" value={appointment.modality} palette={palette} />{appointment.depositRequired ? <LabelValue label="Anticipo requerido" value={formatMoney(appointment.depositAmount)} palette={palette} /> : null}{appointment.note ? <LabelValue label="Nota" value={appointment.note} palette={palette} /> : null}</Card>
      <Card palette={palette}><View style={styles.actionHeading}><Text style={[styles.sectionTitle, { color: palette.text }]}>Pagos de esta cita</Text>{canViewPayments ? <Text style={[styles.meta, { color: palette.textSecondary }]}>{paymentsLoaded ? `Saldo neto ${formatMoney(paymentNet)}` : 'Cargando pagos…'}</Text> : null}</View>{canViewPayments ? paymentsError ? <Text style={[styles.copy, { color: palette.danger }]}>{paymentsError}</Text> : paymentsLoaded && appointmentPayments.length ? appointmentPayments.map(payment => <View key={payment.id} style={[styles.paymentRow, { borderTopColor: palette.line }]}><View style={styles.paymentInfo}><Text style={[styles.paymentLabel, { color: palette.text }]}>{formatDate(payment.date)} · {payment.method}</Text><Text style={[styles.meta, { color: palette.textSecondary }]}>{payment.direction}</Text></View><Text style={[styles.paymentAmount, { color: payment.direction === 'Reembolso' ? palette.danger : palette.text }]}>{payment.direction === 'Reembolso' ? '−' : '+'}{formatMoney(payment.amount)}</Text></View>) : paymentsLoaded ? <Text style={[styles.copy, { color: palette.textSecondary }]}>Todavía no hay movimientos para esta cita.</Text> : null : appointment.depositRequired ? <Text style={[styles.copy, { color: palette.textSecondary }]}>El sistema verificará el anticipo registrado antes de confirmar la cita.</Text> : <Text style={[styles.copy, { color: palette.textSecondary }]}>El historial de pagos no está disponible para tu rol.</Text>}{canCreatePayment ? <Action title="Registrar pago" onPress={() => router.push({ pathname: '/payments', params: { appointmentId: appointment.id } })} palette={palette} primary /> : canViewPayments ? <Action title="Ver pagos" onPress={() => router.push('/payments')} palette={palette} /> : null}</Card>
      {canEdit && !isFinal ? <Card palette={palette}><View style={styles.actionHeading}><Text style={[styles.sectionTitle, { color: palette.text }]}>Cita</Text><Action title={editing ? 'Cerrar' : loadingCatalog ? 'Cargando…' : 'Editar cita'} disabled={loadingCatalog} onPress={() => { if (editing) setEditing(false); else void beginEditing(); }} palette={palette} /></View>{editing ? <><ChoiceField title="Negocio" items={catalog.businesses} value={editBusinessId} onChange={value => { setEditBusinessId(value); setEditBranchId(''); setEditProviderId(''); }} palette={palette} /><ChoiceField title="Sucursal" items={eligibleBranches} value={editBranchId} onChange={value => { setEditBranchId(value); const provider = catalog.providers.find(item => item.id === editProviderId); if (provider?.branchIds.length && !provider.branchIds.includes(value)) setEditProviderId(''); }} palette={palette} /><ChoiceField title="Profesional" items={eligibleProviders} value={editProviderId} onChange={value => { setEditProviderId(value); const provider = catalog.providers.find(item => item.id === value); if (provider?.branchIds.length && !provider.branchIds.includes(editBranchId)) setEditBranchId(provider.branchIds.find(id => branchesForBusiness.some(branch => branch.id === id)) || ''); }} palette={palette} /><AppointmentServicePicker services={catalog.services} eligibleIds={eligibleServiceIds} selectedIds={editServiceIds} onChange={changeEditServices} palette={palette} />{!editServiceIds.length ? <Field label="Servicio manual" value={editManualService} onChangeText={setEditManualService} palette={palette} /> : null}<Field label="Fecha (AAAA-MM-DD)" value={editDate} onChangeText={setEditDate} palette={palette} /><View style={styles.fieldRow}><Field label="Hora" value={editTime} onChangeText={setEditTime} palette={palette} /><Field label="Duración (min)" value={editDuration} onChangeText={setEditDuration} keyboardType="number-pad" palette={palette} /></View><View style={styles.fieldRow}><Action title="Presencial" onPress={() => setEditModality('Presencial')} palette={palette} primary={editModality === 'Presencial'} /><Action title="Virtual" onPress={() => setEditModality('Virtual')} palette={palette} primary={editModality === 'Virtual'} /></View><AppointmentReminderPreview status={appointment.status} palette={palette} /><Action title={saving ? 'Guardando…' : 'Guardar cambios'} disabled={saving} onPress={() => void saveSchedule()} palette={palette} primary /></> : <Text style={[styles.copy, { color: palette.textSecondary }]}>Edita ubicación, profesional, varios servicios, horario y modalidad. La clínica validará permisos y disponibilidad al guardar.</Text>}{appointment.status === 'Por confirmar' ? <Action title={saving ? 'Guardando…' : 'Confirmar cita'} disabled={saving} onPress={() => void changeStatus('Confirmada')} palette={palette} primary /> : null}{appointment.status !== 'Completada' ? <Action title={saving ? 'Guardando…' : 'Marcar como completada'} disabled={saving} onPress={() => void changeStatus('Completada')} palette={palette} primary /> : null}</Card> : null}
      {canCancel && !isFinal ? <Card palette={palette}><Text style={[styles.sectionTitle, { color: palette.text }]}>Cancelar cita</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>La cancelación queda sujeta a los permisos de tu clínica.</Text><Action title="Cancelar cita" disabled={saving} onPress={() => setConfirmCancel(true)} palette={palette} danger /></Card> : null}
      {!!error ? <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    </>}
  </ScrollView>
  <Modal transparent animationType="fade" visible={confirmCancel} onRequestClose={() => setConfirmCancel(false)}><View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.sectionTitle, { color: palette.text }]}>¿Cancelar esta cita?</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>La cita de {appointment?.patientName} se marcará como cancelada.</Text><View style={styles.modalActions}><Action title="Volver" onPress={() => setConfirmCancel(false)} palette={palette} /><Action title={saving ? 'Cancelando…' : 'Sí, cancelar'} disabled={saving} onPress={() => void changeStatus('Cancelada')} palette={palette} danger /></View></View></View></Modal>
  </SafeAreaView>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function isValidCalendarDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T12:00:00`); return Number.isFinite(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === value; }
function appointmentErrorMessage(error: unknown, fallback: string, depositAmount: number) {
  const value = error as { code?: string; constraint?: string; cause?: { constraint?: string; message?: string; details?: string } };
  if (value?.code === '23P01') return 'El paciente o profesional ya tiene una cita en ese horario.';
  const details = [value?.constraint, value?.cause?.constraint, value?.cause?.message, value?.cause?.details].join(' ');
  if (details.includes('appointments_schedule_bounds')) return 'La cita debe iniciar a partir de las 06:00, en intervalos de 15 minutos, y terminar a más tardar a medianoche.';
  if (value?.code === '23514' && depositAmount > 0 && details.includes('appointments_deposit_required')) return `Registra el anticipo requerido de ${formatMoney(depositAmount)} antes de confirmar esta cita.`;
  return fallback;
}
function formatMoney(value: number) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value); }
function Card({ palette, children }: { palette: (typeof Colors)[keyof typeof Colors]; children: React.ReactNode }) { return <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>{children}</View>; }
function LabelValue({ label, value, palette }: { label: string; value: string; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={styles.labelValue}><Text style={[styles.meta, { color: palette.textSecondary }]}>{label}</Text><Text style={[styles.value, { color: palette.text }]}>{value}</Text></View>; }
function Action({ title, onPress, palette, disabled = false, primary = false, danger = false }: { title: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors]; disabled?: boolean; primary?: boolean; danger?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, { backgroundColor: primary ? palette.primary : danger ? `${palette.danger}18` : palette.primarySoft, opacity: disabled ? 0.55 : 1 }]}><Text style={{ color: primary ? '#fff' : danger ? palette.danger : palette.primary, fontSize: 14, fontWeight: '700' }}>{title}</Text></Pressable>; }
function Field({ label, value, onChangeText, keyboardType, palette }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'number-pad'; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={styles.field}><Text style={[styles.meta, { color: palette.textSecondary }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} /></View>; }

function ChoiceField({ title, items, value, onChange, palette }: { title: string; items: { id: string; name: string }[]; value: string; onChange: (value: string) => void; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={styles.field}><Text style={[styles.meta, { color: palette.textSecondary }]}>{title}</Text>{items.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: value === item.id }} onPress={() => onChange(item.id)} style={[styles.choice, { backgroundColor: value === item.id ? palette.primarySoft : palette.background, borderColor: value === item.id ? palette.primary : palette.line }]}><Text numberOfLines={1} style={{ color: value === item.id ? palette.primary : palette.text }}>{item.name}</Text></Pressable>)}</ScrollView> : <Text style={[styles.copy, { color: palette.textSecondary }]}>No hay opciones disponibles.</Text>}</View>; }

const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingTop: 7, paddingBottom: 32, gap: 13 }, header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }, back: { width: 40, height: 45, justifyContent: 'center', alignItems: 'center' }, backText: { fontSize: 34 }, headerMain: { flex: 1, gap: 3 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1 }, title: { fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.5 }, card: { borderWidth: 1, borderRadius: 17, padding: 16, gap: 13 }, sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' }, statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, actionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, badge: { borderRadius: 9, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: '700' }, copy: { fontSize: 13, lineHeight: 20 }, divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#88798544', paddingTop: 12, gap: 10 }, labelValue: { gap: 4 }, paymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 }, paymentInfo: { flex: 1, gap: 3 }, paymentLabel: { fontSize: 13, fontWeight: '600' }, paymentAmount: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }, meta: { fontSize: 12 }, value: { fontSize: 14, fontWeight: '600' }, fieldRow: { flexDirection: 'row', gap: 10 }, field: { flex: 1, gap: 6 }, choices: { gap: 8, paddingVertical: 2 }, choice: { minHeight: 40, maxWidth: 220, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center' }, input: { minHeight: 45, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, action: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, center: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 12 }, error: { fontSize: 14, lineHeight: 20 }, modalBackdrop: { flex: 1, padding: 24, backgroundColor: '#0009', justifyContent: 'center', alignItems: 'center' }, modal: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 18, padding: 20, gap: 12 }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 6 } });

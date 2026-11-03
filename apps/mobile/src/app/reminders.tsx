import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useCrmRouter } from '@/lib/use-crm-router';
import { loadClinicReminders, type ClinicReminder } from '@/lib/crm-data';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';

type ReminderRows = ClinicReminder[];
const labels: Record<string, string> = { pending: 'Pendiente', sending: 'En preparación', sent: 'Enviado', failed: 'Error', unknown: 'Entrega incierta', blocked: 'Bloqueado', skipped: 'Omitido', cancelled: 'Cancelado' };

export default function RemindersScreen() {
  const router = useCrmRouter();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [items, setItems] = useState<ReminderRows>([]);
  const [kindFilter, setKindFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try { setItems(await loadClinicReminders(clinic)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los recordatorios.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { void refresh(); }, [refresh]);
  const counts = useMemo(() => ({
    pending: items.filter(item => ['pending', 'sending'].includes(item.status) && item.deliveryEligible && !item.simulated).length,
    blocked: items.filter(item => item.status === 'blocked' || (['pending', 'failed'].includes(item.status) && !item.deliveryEligible)).length,
    sent: items.filter(item => item.status === 'sent' && !item.simulated).length,
    attention: items.filter(item => ['failed', 'unknown'].includes(item.status) && !item.simulated).length,
  }), [items]);
  const filteredItems = useMemo(() => items.filter(item => {
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    if (statusFilter === 'pending' && !(['pending', 'sending'].includes(item.status) && item.deliveryEligible && !item.simulated)) return false;
    if (statusFilter === 'blocked' && !(item.status === 'blocked' || (['pending', 'failed'].includes(item.status) && !item.deliveryEligible))) return false;
    if (statusFilter === 'sent' && !(item.status === 'sent' && !item.simulated)) return false;
    if (statusFilter === 'attention' && !(['failed', 'unknown'].includes(item.status) && !item.simulated)) return false;
    if (statusFilter === 'closed' && !['skipped', 'cancelled'].includes(item.status)) return false;
    return true;
  }), [items, kindFilter, statusFilter]);

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'reminders.view')) return <Redirect href="/(tabs)/more" />;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.headMain}><Text style={[styles.title, { color: palette.text }]}>Recordatorios</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>Confirmaciones y avisos de citas</Text></View><Pressable accessibilityRole="button" onPress={() => void refresh()} style={[styles.refresh, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.refreshText, { color: palette.primary }]}>Actualizar</Text></Pressable></View>
    <View style={styles.metrics}><Metric title="Pendientes" value={counts.pending} palette={palette} /><Metric title="Bloqueados" value={counts.blocked} palette={palette} /><Metric title="Enviados" value={counts.sent} palette={palette} /><Metric title="Revisar" value={counts.attention} palette={palette} /></View>
    <View style={[styles.note, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.noteTitle, { color: palette.text }]}>Los avisos respetan autorización y ventana de WhatsApp</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>La clínica requiere un proveedor conectado y consentimiento vigente para enviar mensajes. Los intentos simulados se identifican y no cuentan como entregas reales.</Text></View>
    <Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Tipo de aviso</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {kindOptions.map(option => <FilterChip key={option.value} label={option.label} selected={kindFilter === option.value} onPress={() => setKindFilter(option.value)} palette={palette} />)}
    </ScrollView>
    <Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Estado</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
      {statusOptions.map(option => <FilterChip key={option.value} label={option.label} selected={statusFilter === option.value} onPress={() => setStatusFilter(option.value)} palette={palette} />)}
    </ScrollView>
    {!loading && !error ? <Text style={[styles.resultsCount, { color: palette.textSecondary }]}>{filteredItems.length} de {items.length} avisos</Text> : null}
    {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando agenda de avisos…</Text></View> : error ? <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.copy, { color: palette.text }]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.refreshText, { color: palette.primary }]}>Intentar de nuevo</Text></Pressable></View> : filteredItems.length ? filteredItems.map(item => <View key={item.id} style={[styles.reminder, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><View style={styles.rowTop}><Text style={[styles.reminderKind, { color: palette.text }]}>{item.label}</Text><Text style={[styles.status, statusStyle(item.status, item.simulated, palette)]}>{item.simulated ? 'Simulado' : labels[item.status] || item.status}</Text></View><Text style={[styles.patient, { color: palette.text }]}>{item.patientName}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{item.appointmentLabel} · {item.service}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{item.providerName} · {item.branchName}</Text><Text style={[styles.scheduled, { color: palette.textSecondary }]}>Programado: {item.scheduledLabel}</Text>{item.deliveryBlockReason ? <Text style={[styles.blockReason, { color: palette.danger }]}>{item.deliveryBlockReason}</Text> : null}</View>) : <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.noteTitle, { color: palette.text }]}>{items.length ? 'No hay avisos con estos filtros' : 'No hay recordatorios en este periodo'}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{items.length ? 'Cambia el tipo o el estado para ver otros avisos.' : 'Los avisos se programan al confirmar una cita.'}</Text></View>}
  </ScrollView></SafeAreaView>;
}

function statusStyle(status: string, simulated: boolean, palette: (typeof Colors)[keyof typeof Colors]) { const color = status === 'sent' && !simulated ? palette.primary : status === 'failed' || status === 'unknown' || status === 'blocked' ? palette.danger : palette.textSecondary; return { color, backgroundColor: palette.primarySoft }; }
const kindOptions = [{ value: 'all', label: 'Todos' }, { value: 'confirmation_2d', label: 'Confirmación · 2 días' }, { value: 'reminder_1d', label: 'Recordatorio · 1 día' }, { value: 'reminder_5h', label: 'Recordatorio · 5 horas' }];
const statusOptions = [{ value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendientes' }, { value: 'blocked', label: 'Bloqueados' }, { value: 'sent', label: 'Enviados' }, { value: 'attention', label: 'Revisar' }, { value: 'closed', label: 'Omitidos o cancelados' }];
function FilterChip({ label, selected, onPress, palette }: { label: string; selected: boolean; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.filterChip, { backgroundColor: selected ? palette.primarySoft : palette.backgroundElement, borderColor: selected ? palette.primary : palette.line }]}><Text style={[styles.filterText, { color: selected ? palette.primary : palette.textSecondary }]}>{label}</Text></Pressable>; }
function Metric({ title, value, palette }: { title: string; value: number; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={[styles.metric, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.metricLabel, { color: palette.textSecondary }]}>{title}</Text><Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text></View>; }
const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: '100%', maxWidth: 780, alignSelf: 'center', padding: 20, paddingTop: 8, paddingBottom: 30, gap: 11 }, header: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 5 }, back: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34 }, headMain: { flex: 1 }, title: { fontSize: 26, fontWeight: '700' }, subtitle: { fontSize: 12, marginTop: 3 }, refresh: { minHeight: 40, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, justifyContent: 'center' }, refreshText: { fontSize: 12, fontWeight: '700' }, metrics: { flexDirection: 'row', gap: 7 }, metric: { flex: 1, borderWidth: 1, borderRadius: 13, minHeight: 72, padding: 10, justifyContent: 'space-between' }, metricLabel: { fontSize: 10, fontWeight: '700' }, metricValue: { fontSize: 23, fontWeight: '700' }, note: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 5, marginBottom: 2 }, noteTitle: { fontSize: 14, fontWeight: '700' }, copy: { fontSize: 12, lineHeight: 18 }, filterLabel: { fontSize: 11, fontWeight: '700', marginBottom: -7 }, filterRow: { gap: 7, paddingVertical: 2 }, filterChip: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' }, filterText: { fontSize: 11, fontWeight: '700' }, resultsCount: { fontSize: 11, textAlign: 'right', marginTop: -7 }, center: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 }, reminder: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 4 }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }, reminderKind: { flex: 1, fontSize: 13, fontWeight: '700' }, status: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '700' }, patient: { fontSize: 14, fontWeight: '700' }, scheduled: { fontSize: 11, marginTop: 3 }, blockReason: { fontSize: 12, lineHeight: 18, marginTop: 3 }, empty: { borderWidth: 1, borderRadius: 15, minHeight: 100, justifyContent: 'center', padding: 15, gap: 5 } });

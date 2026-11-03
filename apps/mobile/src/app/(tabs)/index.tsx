import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, type AppPalette } from '@/constants/theme';
import { loadPatientCount, loadTodayAgenda, type AgendaItem } from '@/lib/crm-data';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';

export default function OverviewScreen() {
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { clinic } = useClinicWorkspace();
  const [appointments, setAppointments] = useState<AgendaItem[]>([]);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try {
      const [nextAppointments, nextCount] = await Promise.all([loadTodayAgenda(clinic), loadPatientCount(clinic)]);
      setAppointments(nextAppointments); setPatientCount(nextCount);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el resumen.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { void refresh(); }, [refresh]);
  const dateLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: clinic?.timeZone || 'America/Tijuana' }).format(new Date());

  return (
    <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topLine}><View><Text style={[styles.brand, { color: palette.primary }]}>elixir <Text style={[styles.brandClinic, { color: palette.textSecondary }]}>CLINIC</Text></Text><Text style={[styles.clinicName, { color: palette.text }]}>{clinic?.name || 'Clínica'}</Text></View><View style={[styles.avatar, { backgroundColor: palette.primarySoft }]}><Text style={[styles.avatarText, { color: palette.primary }]}>{clinic?.name?.slice(0, 1).toLocaleUpperCase() || 'E'}</Text></View></View>
        <View style={styles.greeting}><Text style={[styles.title, { color: palette.text }]}>Resumen de hoy</Text><Text style={[styles.date, { color: palette.textSecondary }]}>{dateLabel}</Text></View>
        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.statLabel, { color: palette.textSecondary }]}>CITAS DE HOY</Text><Text style={[styles.statNumber, { color: palette.text }]}>{loading ? '—' : appointments.length}</Text></View>
          <View style={[styles.stat, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.statLabel, { color: palette.textSecondary }]}>PACIENTES</Text><Text style={[styles.statNumber, { color: palette.text }]}>{loading || patientCount === null ? '—' : patientCount}</Text></View>
        </View>
        <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: palette.text }]}>Próximas citas</Text><Text style={[styles.sectionCount, { color: palette.textSecondary }]}>{appointments.length}</Text></View>
        {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.muted, { color: palette.textSecondary }]}>Cargando agenda…</Text></View> : error ? <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.emptyText, { color: palette.text }]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.retry, { color: palette.primary }]}>Intentar de nuevo</Text></Pressable></View> : appointments.length ? <View style={[styles.list, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>{appointments.slice(0, 8).map((item, index) => <AppointmentRow key={item.id} item={item} last={index === Math.min(appointments.length, 8) - 1} palette={palette} />)}</View> : <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.emptyTitle, { color: palette.text }]}>No hay citas para hoy</Text><Text style={[styles.emptyText, { color: palette.textSecondary }]}>Las nuevas citas de la clínica aparecerán aquí.</Text></View>}
        {!!error && !loading && <Pressable onPress={() => void refresh()} style={styles.refresh}><Text style={[styles.retry, { color: palette.primary }]}>Actualizar resumen</Text></Pressable>}
      </ScrollView>
    </SafeAreaView>
  );
}

function AppointmentRow({ item, last, palette }: { item: AgendaItem; last: boolean; palette: AppPalette }) {
  return <View style={[styles.row, !last && { borderBottomColor: palette.line, borderBottomWidth: StyleSheet.hairlineWidth }]}><View style={[styles.timeBlock, { backgroundColor: palette.primarySoft }]}><Text style={[styles.time, { color: palette.primary }]}>{item.time}</Text></View><View style={styles.rowMain}><Text numberOfLines={1} style={[styles.patient, { color: palette.text }]}>{item.patientName}</Text><Text numberOfLines={1} style={[styles.service, { color: palette.textSecondary }]}>{item.service}</Text></View><Text style={[styles.status, { color: item.status === 'Confirmada' ? palette.primary : palette.textSecondary }]}>{item.status === 'Por confirmar' ? 'Pendiente' : item.status}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 30 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 }, brandClinic: { fontSize: 10, letterSpacing: 2, fontWeight: '800' }, clinicName: { fontSize: 13, marginTop: 3 }, avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 17, fontWeight: '800' },
  greeting: { marginTop: 34, marginBottom: 21, gap: 6 }, title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 }, date: { fontSize: 15, textTransform: 'capitalize' },
  stats: { flexDirection: 'row', gap: 12 }, stat: { flex: 1, minHeight: 110, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 15, justifyContent: 'space-between' }, statLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, statNumber: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 30, marginBottom: 13 }, sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 }, sectionCount: { fontSize: 14, fontWeight: '600' },
  list: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 14 }, row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 }, timeBlock: { width: 58, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, time: { fontSize: 15, fontWeight: '800' }, rowMain: { flex: 1, gap: 4 }, patient: { fontSize: 15, fontWeight: '700' }, service: { fontSize: 13 }, status: { fontSize: 11, fontWeight: '700', maxWidth: 86, textAlign: 'right' },
  empty: { minHeight: 116, borderRadius: 16, borderWidth: 1, padding: 17, justifyContent: 'center', gap: 5 }, emptyTitle: { fontSize: 16, fontWeight: '700' }, emptyText: { fontSize: 14, lineHeight: 20 }, retry: { fontSize: 14, fontWeight: '700', marginTop: 8 }, loading: { minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 11 }, muted: { fontSize: 14 }, refresh: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
});

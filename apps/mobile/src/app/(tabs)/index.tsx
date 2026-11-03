import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { setToolsButtonVisible } from 'expo-dev-menu';
import { CrmText as Text } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, type AppPalette } from '@/constants/theme';
import { loadPatientCount, loadTodayAgenda, type AgendaItem } from '@/lib/crm-data';
import { createClient } from '@/lib/supabase';
import { useCrmRouter } from '@/lib/use-crm-router';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';

const clinicLogos = {
  light: require('../../../../../public/elixirclinic-logo.png'),
  dark: require('../../../../../public/elixirclinic-logo-dark.png'),
};

export default function OverviewScreen() {
  const theme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = Colors[theme];
  const router = useCrmRouter();
  const { session } = useAuth();
  const client = useMemo(() => createClient(), []);
  const { clinic } = useClinicWorkspace();
  const metadata = session?.user.user_metadata || {};
  const profileName = [metadata.names, metadata.firstLastName, metadata.secondLastName].filter((part): part is string => typeof part === 'string' && Boolean(part.trim())).join(' ') || (typeof metadata.full_name === 'string' ? metadata.full_name : typeof metadata.name === 'string' ? metadata.name : '') || session?.user.email || '';
  const profileInitials = profileName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]?.toLocaleUpperCase('es-MX') || '').join('') || 'U';
  const avatarPath = typeof metadata.avatar_path === 'string' ? metadata.avatar_path : '';
  const avatarUrl = avatarPath && client ? client.storage.from('profile-avatars').getPublicUrl(avatarPath).data.publicUrl : '';
  useEffect(() => {
    if (__DEV__) setToolsButtonVisible(false);
  }, []);
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
        <View style={styles.topLine}>
          <Image source={clinicLogos[theme]} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="Elixir Clinic" accessible />
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir mi perfil" onPress={() => router.push('/profile' as never)} style={[styles.profileButton, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.profileAvatar} resizeMode="cover" accessibilityLabel="Foto de perfil" /> : <Text style={[styles.profileInitials, { color: palette.primary }]}>{profileInitials}</Text>}
          </Pressable>
        </View>
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
  topLine: { height: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brandLogo: { width: 104, height: 86 }, profileButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, profileAvatar: { width: '100%', height: '100%' }, profileInitials: { fontSize: 15, fontWeight: '800' },
  greeting: { marginTop: 14, marginBottom: 21, gap: 6 }, title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 }, date: { fontSize: 15, textTransform: 'capitalize' },
  stats: { flexDirection: 'row', gap: 12 }, stat: { flex: 1, minHeight: 110, borderWidth: 1, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 15, justifyContent: 'space-between' }, statLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }, statNumber: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 30, marginBottom: 13 }, sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 }, sectionCount: { fontSize: 14, fontWeight: '600' },
  list: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 14 }, row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12 }, timeBlock: { width: 58, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, time: { fontSize: 15, fontWeight: '800' }, rowMain: { flex: 1, gap: 4 }, patient: { fontSize: 15, fontWeight: '700' }, service: { fontSize: 13 }, status: { fontSize: 11, fontWeight: '700', maxWidth: 86, textAlign: 'right' },
  empty: { minHeight: 116, borderRadius: 16, borderWidth: 1, padding: 17, justifyContent: 'center', gap: 5 }, emptyTitle: { fontSize: 16, fontWeight: '700' }, emptyText: { fontSize: 14, lineHeight: 20 }, retry: { fontSize: 14, fontWeight: '700', marginTop: 8 }, loading: { minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: 11 }, muted: { fontSize: 14 }, refresh: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
});

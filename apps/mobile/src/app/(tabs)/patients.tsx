import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { useCrmRouter } from '@/lib/use-crm-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { loadPatientList, type PatientListItem } from '@/lib/crm-data';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';

export default function PatientsScreen() {
  const router = useCrmRouter();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { clinic } = useClinicWorkspace();
  const canCreatePatient = clinic ? hasClinicPermission(clinic.role, clinic.permissions, 'patients.create') : false;
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try { setPatients(await loadPatientList(clinic)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el directorio.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { void refresh(); }, [refresh]);
  const filtered = useMemo(() => patients.filter(patient => `${patient.name} ${patient.recordNumber} ${patient.service}`.toLocaleLowerCase('es-MX').includes(query.toLocaleLowerCase('es-MX'))), [patients, query]);
  const renderItem = ({ item }: { item: PatientListItem }) => <Pressable accessibilityRole="button" accessibilityLabel={`Abrir expediente de ${item.name}`} onPress={() => router.push({ pathname: '/patients/[id]', params: { id: item.databaseId } })} style={({ pressed }) => [styles.patient, { backgroundColor: palette.backgroundElement, borderColor: palette.line, opacity: pressed ? 0.75 : 1 }]}><View style={[styles.initial, { backgroundColor: palette.primarySoft }]}><Text style={[styles.initialText, { color: palette.primary }]}>{item.name.trim().slice(0, 1).toLocaleUpperCase('es-MX')}</Text></View><View style={styles.details}><Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>{item.name}</Text><Text numberOfLines={1} style={[styles.info, { color: palette.textSecondary }]}>{item.recordNumber} · {item.service}</Text></View><Text style={[styles.chevron, { color: palette.textSecondary }]}>›</Text></Pressable>;
  return (
    <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
      <View style={styles.content}>
        <View style={styles.heading}><View><Text style={[styles.title, { color: palette.text }]}>Pacientes</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{loading ? 'Cargando directorio…' : `${patients.length}${patients.length === 100 ? '+' : ''} expedientes recientes`}</Text></View>{canCreatePatient ? <Pressable accessibilityRole="button" onPress={() => router.push('/patients/new')} style={({ pressed }) => [styles.newButton, { backgroundColor: palette.primary, opacity: pressed ? 0.78 : 1 }]}><Text style={styles.newButtonText}>＋ Nuevo</Text></Pressable> : null}</View>
        <TextInput accessibilityLabel="Buscar pacientes" value={query} onChangeText={setQuery} placeholder="Buscar por nombre o expediente" placeholderTextColor={palette.textSecondary} autoCapitalize="none" returnKeyType="search" style={[styles.search, { backgroundColor: palette.backgroundElement, borderColor: palette.line, color: palette.text }]} />
        {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} /></View> : error ? <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.info, { color: palette.text }]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.retry, { color: palette.primary }]}>Intentar de nuevo</Text></Pressable></View> : filtered.length ? <FlatList data={filtered} keyExtractor={item => item.id} renderItem={renderItem} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" /> : <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.name, { color: palette.text }]}>{query ? 'No hay resultados' : 'Aún no hay pacientes'}</Text><Text style={[styles.info, { color: palette.textSecondary }]}>{query ? 'Prueba con otro nombre o número de expediente.' : 'Los expedientes de tu clínica aparecerán aquí.'}</Text></View>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: '100%', maxWidth: 760, flex: 1, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 22 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, newButton: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 }, newButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, title: { fontSize: 29, fontWeight: '700', letterSpacing: -0.6 }, subtitle: { fontSize: 14, marginTop: 5, marginBottom: 16 }, search: { height: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, fontSize: 15, marginBottom: 14 }, list: { gap: 9, paddingBottom: 24 }, patient: { minHeight: 72, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, initial: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, initialText: { fontSize: 17, fontWeight: '800' }, details: { flex: 1, gap: 4 }, name: { fontSize: 15, fontWeight: '700' }, info: { fontSize: 13, lineHeight: 18 }, chevron: { fontSize: 24, paddingHorizontal: 3 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, empty: { borderWidth: 1, borderRadius: 15, minHeight: 110, justifyContent: 'center', gap: 6, padding: 16 }, retry: { fontSize: 14, fontWeight: '700', marginTop: 4 } });

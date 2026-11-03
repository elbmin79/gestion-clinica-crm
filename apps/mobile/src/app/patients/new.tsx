import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useCrmRouter } from '@/lib/use-crm-router';
import { createClinicPatient, loadAppointmentCatalog, type AppointmentCatalog } from '@/lib/crm-data';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import { useAuth } from '@/providers/auth-provider';

const emptyCatalog: AppointmentCatalog = { businesses: [], branches: [], providers: [], services: [] };

export default function NewPatientScreen() {
  const router = useCrmRouter();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const { session, loading: authLoading } = useAuth();
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [treatment, setTreatment] = useState('');
  const [branchId, setBranchId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canCreate = clinic ? hasClinicPermission(clinic.role, clinic.permissions, 'patients.create') : false;

  useEffect(() => {
    if (!clinic) return;
    void loadAppointmentCatalog(clinic).then(setCatalog).catch(() => {});
  }, [clinic]);

  const save = async () => {
    if (!clinic || !name.trim() || !canCreate || loading) return;
    setLoading(true); setError('');
    try {
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Revisa el correo electrónico.');
      const saved = await createClinicPatient(clinic, { name: name.trim(), email: email.trim(), phone: phone.trim(), treatment: treatment.trim(), branchId, providerId });
      router.replace({ pathname: '/patients/[id]', params: { id: saved.id } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el expediente.');
    } finally { setLoading(false); }
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!canCreate) return <Redirect href="/(tabs)/patients" />;

  return <SafeAreaView edges={['top', 'bottom']} style={[styles.page, { backgroundColor: palette.background }]}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View><Text style={[styles.title, { color: palette.text }]}>Nuevo paciente</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>Crea el expediente en el directorio de la clínica.</Text></View></View>
    {!canCreate ? <Text style={[styles.error, { color: palette.danger }]}>Tu cuenta no tiene permiso para crear pacientes.</Text> : <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
      <Field label="Nombre completo" value={name} onChangeText={setName} placeholder="Ej. Andrea García" palette={palette} />
      <View style={styles.row}><Field label="Correo electrónico (opcional)" value={email} onChangeText={setEmail} placeholder="correo@ejemplo.com" keyboardType="email-address" palette={palette} /><Field label="Teléfono (opcional)" value={phone} onChangeText={setPhone} placeholder="Teléfono de contacto" keyboardType="phone-pad" palette={palette} /></View>
      <Field label="Tratamiento o servicio" value={treatment} onChangeText={setTreatment} placeholder="Por definir" palette={palette} />
      <Choice title="Sucursal de referencia" value={branchId} items={catalog.branches.map(item => ({ id: item.id, name: item.name }))} onChange={setBranchId} palette={palette} />
      <Choice title="Profesional de referencia" value={providerId} items={catalog.providers} onChange={setProviderId} palette={palette} />
      <Text style={[styles.note, { color: palette.textSecondary }]}>El profesional de referencia solo sirve como sugerencia. Puedes elegir a alguien más al agendar cada cita.</Text>
      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
      <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.cancel, { borderColor: palette.line }]}><Text style={[styles.cancelText, { color: palette.textSecondary }]}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={loading || !name.trim()} onPress={() => void save()} style={[styles.save, { backgroundColor: palette.primary, opacity: loading || !name.trim() ? 0.55 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Crear expediente</Text>}</Pressable></View>
    </View>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, palette }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'email-address' | 'phone-pad'; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={styles.field}><Text style={[styles.label, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} /></View>;
}

function Choice({ title, value, items, onChange, palette }: { title: string; value: string; items: { id: string; name: string }[]; onChange: (value: string) => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={styles.field}><Text style={[styles.label, { color: palette.text }]}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}><Pressable onPress={() => onChange('')} style={[styles.chip, { backgroundColor: !value ? palette.primarySoft : palette.background, borderColor: !value ? palette.primary : palette.line }]}><Text style={{ color: !value ? palette.primary : palette.textSecondary }}>Sin asignar</Text></Pressable>{items.map(item => <Pressable key={item.id} onPress={() => onChange(item.id)} style={[styles.chip, { backgroundColor: value === item.id ? palette.primarySoft : palette.background, borderColor: value === item.id ? palette.primary : palette.line }]}><Text numberOfLines={1} style={{ color: value === item.id ? palette.primary : palette.text }}>{item.name}</Text></Pressable>)}</ScrollView></View>;
}

const styles = StyleSheet.create({ page: { flex: 1 }, flex: { flex: 1 }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 16 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34 }, title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { fontSize: 13, marginTop: 3 }, card: { borderWidth: 1, borderRadius: 18, padding: 17, gap: 16 }, field: { flex: 1, gap: 7 }, label: { fontSize: 13, fontWeight: '700' }, input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 }, row: { flexDirection: 'row', gap: 11 }, choices: { gap: 8 }, chip: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, note: { fontSize: 12, lineHeight: 18 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 2 }, cancel: { minWidth: 100, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, cancelText: { fontSize: 14, fontWeight: '700' }, save: { minWidth: 150, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, saveText: { color: '#fff', fontSize: 14, fontWeight: '700' }, error: { fontSize: 14, lineHeight: 20 } });

import { useCallback, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View, type SwitchProps } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CrmText as Text } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { createClient } from '@/lib/supabase';
import { useCrmRouter } from '@/lib/use-crm-router';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { normalizeNotificationPreferences, notificationPreferencesForRole, type NotificationPreferences } from '@/lib/notification-preferences';
import { disableNativePush, enableNativePush, getSavedNativePushToken, hasNativePushProject, isNativePushSupported, loadNativePushStatus, sendNativePushTest } from '@/lib/native-push';

const options: { key: keyof NotificationPreferences; title: string; description: string }[] = [
  { key: 'new_appointment', title: 'Nuevas citas', description: 'Cuando se registra una cita nueva en la clínica.' },
  { key: 'agenda_change', title: 'Cambios en la agenda', description: 'Cancelaciones y cambios de horario, sucursal o profesional.' },
  { key: 'include_self', title: 'Incluir mis cambios', description: 'Recibir avisos también de las citas que yo registro o modifico.' },
  { key: 'push_enabled', title: 'Enviar a mis dispositivos', description: 'Entregar estos avisos por notificación push en dispositivos activados.' },
];
const ThemedSwitch = Switch as ComponentType<SwitchProps & { activeTrackColor?: string; activeThumbColor?: string }>;

export default function NotificationSettingsScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme()];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => notificationPreferencesForRole(''));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!clinic || !session?.user) return;
    setLoading(true); setError('');
    const client = createClient();
    if (!client) { setError('La conexión con Supabase no está configurada.'); setLoading(false); return; }
    try {
      const { data, error: readError } = await client.from('staff_notification_preferences')
        .select('new_appointment,agenda_change,include_self,push_enabled')
        .eq('clinic_id', clinic.clinicId)
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (readError) throw new Error('No se pudieron cargar tus preferencias. Revisa tu conexión e inténtalo de nuevo.');
      setPreferences(normalizeNotificationPreferences(clinic.role, data));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus preferencias.');
    } finally { setLoading(false); }
  }, [clinic, session?.user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async () => {
    if (!clinic || !session?.user || saving) return;
    const client = createClient();
    if (!client) { setError('La conexión con Supabase no está configurada.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const { error: saveError } = await client.from('staff_notification_preferences').upsert({
        clinic_id: clinic.clinicId,
        user_id: session.user.id,
        ...preferences,
      });
      if (saveError) throw new Error('No se pudieron guardar tus preferencias. Vuelve a intentarlo.');
      setNotice('Preferencias guardadas para esta clínica.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar tus preferencias.');
    } finally { setSaving(false); }
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;

  const roleHint = clinic.role === 'billing'
    ? 'Los avisos de agenda están desactivados por defecto para el rol de pagos.'
    : clinic.role === 'clinician'
      ? 'Los avisos de agenda están activados por defecto para el equipo clínico.'
      : 'Los avisos de agenda están activados por defecto para esta clínica.';

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable>
        <View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Notificaciones</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic.name}</Text></View>
        <Pressable accessibilityRole="button" disabled={loading || saving} onPress={() => void refresh()} style={[styles.refresh, { borderColor: palette.line, opacity: loading || saving ? 0.5 : 1 }]}><Text style={[styles.refreshText, { color: palette.primary }]}>Actualizar</Text></Pressable>
      </View>

      <View style={[styles.intro, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
        <Text style={[styles.introTitle, { color: palette.text }]}>Preferencias por clínica</Text>
        <Text style={[styles.copy, { color: palette.textSecondary }]}>Estas opciones se guardan para tu cuenta y se aplican en tus dispositivos. Los avisos no incluyen datos de pacientes.</Text>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando preferencias…</Text></View> : <>
        <View style={[styles.preferenceGroup, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Qué avisos recibir</Text>
          <Text style={[styles.copy, { color: palette.textSecondary }]}>{roleHint} Puedes ajustar las opciones en cualquier momento.</Text>
          {options.map((option, index) => <View key={option.key} style={[styles.preference, index > 0 && { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: palette.text }]}>{option.title}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{option.description}</Text></View>
            <ThemedSwitch
              accessibilityLabel={option.title}
              value={preferences[option.key]}
              onValueChange={value => { setPreferences(current => ({ ...current, [option.key]: value })); setNotice(''); setError(''); }}
              trackColor={{ false: palette.line, true: palette.primarySoft }}
              thumbColor={preferences[option.key] ? palette.primary : palette.textSecondary}
              activeTrackColor={palette.primarySoft}
              activeThumbColor={palette.primary}
            />
          </View>)}
        </View>
        {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: palette.danger }]}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="status" style={[styles.feedback, { color: palette.primary }]}>{notice}</Text> : null}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: palette.primary, opacity: saving ? 0.55 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar preferencias</Text>}</Pressable>
      </>}
      {!loading ? <DevicePushPanel clinicId={clinic.clinicId} palette={palette} /> : null}
    </ScrollView>
  </SafeAreaView>;
}

function DevicePushPanel({ clinicId, palette }: { clinicId: string; palette: (typeof Colors)[keyof typeof Colors] }) {
  const supported = isNativePushSupported();
  const [token, setToken] = useState('');
  const [registered, setRegistered] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(supported);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!supported) return;
    setLoading(true); setError('');
    try {
      const savedToken = await getSavedNativePushToken();
      setToken(savedToken);
      const status = await loadNativePushStatus(clinicId, savedToken);
      setRegistered(status.currentDeviceRegistered);
      setDeviceCount(status.deviceCount);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar este dispositivo.'); }
    finally { setLoading(false); }
  }, [clinicId, supported]);
  useEffect(() => { void refresh(); }, [refresh]);

  const activate = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await enableNativePush(clinicId);
      setToken(result.token); setRegistered(true); setDeviceCount(result.deviceCount);
      setNotice('Dispositivo activado para esta clínica.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo activar este dispositivo.'); }
    finally { setBusy(false); }
  };
  const deactivate = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await disableNativePush(clinicId); setToken(''); setRegistered(false); setNotice('Notificaciones desactivadas en este dispositivo.'); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo desactivar este dispositivo.'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await sendNativePushTest(clinicId);
      setNotice(result.counts?.sent ? 'Prueba enviada. Comprueba las notificaciones del dispositivo.' : result.counts?.skipped ? 'No se envió. Revisa que “Enviar a mis dispositivos” esté activado y guardado.' : 'Prueba enviada a la cola de entrega.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo enviar la prueba.'); }
    finally { setBusy(false); }
  };

  const description = !supported
    ? 'Activa las notificaciones push desde la app instalada en iPhone o Android.'
    : !hasNativePushProject()
      ? 'Vincula esta app con un proyecto EAS para obtener su token push.'
      : registered
        ? 'Este dispositivo está activado para esta clínica.'
        : `Este dispositivo no está activado para esta clínica.${deviceCount ? ` Hay ${deviceCount} ${deviceCount === 1 ? 'otro dispositivo' : 'otros dispositivos'} activado(s).` : ''}`;

  return <View style={[styles.deviceCard, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
    <View style={styles.deviceHeading}><View style={[styles.deviceIcon, { backgroundColor: palette.primarySoft }]}><SymbolView name={{ ios: 'bell.badge', android: 'notifications_active', web: 'notifications_active' }} tintColor={palette.primary} size={19} /></View><View style={styles.preferenceCopy}><Text style={[styles.sectionTitle, { color: palette.text }]}>Este dispositivo</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{description}</Text></View>{loading ? <ActivityIndicator color={palette.primary} /> : <Text style={[styles.deviceStatus, { color: registered ? palette.primary : palette.textSecondary }]}>{registered ? 'Activado' : supported ? 'Sin activar' : 'iOS / Android'}</Text>}</View>
    {!supported ? <Text style={[styles.copy, { color: palette.textSecondary }]}>En la web puedes revisar tus avisos en el centro de notificaciones.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: palette.danger }]}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="status" style={[styles.feedback, { color: palette.primary }]}>{notice}</Text> : null}
    <View style={styles.deviceActions}>
      {registered ? <>
        <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void test()} style={[styles.deviceButton, { borderColor: palette.line, opacity: busy || loading ? 0.55 : 1 }]}><Text style={[styles.deviceButtonText, { color: palette.primary }]}>{busy ? 'Enviando…' : 'Enviar prueba'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void deactivate()} style={[styles.deviceButton, { borderColor: palette.line, opacity: busy || loading ? 0.55 : 1 }]}><Text style={[styles.deviceButtonText, { color: palette.danger }]}>Desactivar</Text></Pressable>
      </> : <Pressable accessibilityRole="button" disabled={!supported || !hasNativePushProject() || busy || loading} onPress={() => void activate()} style={[styles.devicePrimary, { backgroundColor: palette.primary, opacity: !supported || !hasNativePushProject() || busy || loading ? 0.45 : 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.devicePrimaryText}>Activar este dispositivo</Text>}</Pressable>}
    </View>
    <Text style={[styles.copy, { color: palette.textSecondary }]}>Los avisos muestran solo actividad general de la clínica, sin datos de pacientes.</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingTop: 8, paddingBottom: 28, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, back: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34 }, heading: { flex: 1 }, title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.45 }, subtitle: { fontSize: 13, marginTop: 2 }, refresh: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center' }, refreshText: { fontSize: 12, fontWeight: '700' },
  intro: { borderWidth: 1, borderRadius: 15, padding: 15, gap: 6 }, introTitle: { fontSize: 15, fontWeight: '700' }, copy: { fontSize: 12, lineHeight: 18 }, loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 }, preferenceGroup: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, paddingTop: 15 }, sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 5 }, preference: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }, preferenceCopy: { flex: 1, gap: 3 }, preferenceTitle: { fontSize: 14, fontWeight: '700' }, feedback: { fontSize: 13, lineHeight: 19, paddingHorizontal: 2 }, save: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#fff', fontSize: 14, fontWeight: '700' }, deviceCard: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 12 }, deviceHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, deviceIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, deviceStatus: { fontSize: 11, fontWeight: '700' }, deviceActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, deviceButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, deviceButtonText: { fontSize: 12, fontWeight: '700' }, devicePrimary: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, devicePrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

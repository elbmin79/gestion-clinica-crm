import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { CrmText as Text } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { googleCalendarRequest, type GoogleCalendarHistoryItem, type GoogleCalendarItem, type GoogleCalendarStatus } from '@/lib/google-calendar-api';
import { useCrmRouter } from '@/lib/use-crm-router';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function historyLabel(item: GoogleCalendarHistoryItem) {
  const status = item.status === 'succeeded' ? 'Correcta' : item.status === 'failed' ? 'Fallida' : item.status === 'processing' ? 'En curso' : 'Pendiente';
  return `${status} · ${formatDate(item.updated_at || item.created_at)}${item.last_error ? ` · ${item.last_error}` : ''}`;
}

export default function GoogleCalendarScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme() === 'dark' ? 'dark' : 'light'];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [data, setData] = useState<GoogleCalendarStatus | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [calendarError, setCalendarError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError(''); setCalendarError('');
    try {
      const status = await googleCalendarRequest<GoogleCalendarStatus>(clinic.clinicId, 'GET');
      setData(status);
      if (status.connection) {
        try {
          const result = await googleCalendarRequest<{ calendars: GoogleCalendarItem[] }>(clinic.clinicId, 'GET', undefined, 'calendars');
          setCalendars(result.calendars || []);
        } catch (cause) {
          setCalendars([]);
          setCalendarError(cause instanceof Error ? cause.message : 'No se pudieron consultar tus calendarios.');
        }
      } else setCalendars([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la conexión con Google Calendar.');
    } finally { setLoading(false); }
  }, [clinic]);

  useEffect(() => { void refresh(); }, [refresh]);

  const startConnect = async (replace: boolean) => {
    if (!clinic || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await googleCalendarRequest<{ authorizationUrl: string }>(clinic.clinicId, 'POST', { action: 'connect' });
      if (Platform.OS === 'web') {
        setError('La conexión de Google debe iniciarse desde la app instalada en iPhone o Android.');
        return;
      }
      if (replace) setNotice('Al cambiar la cuenta, los eventos ya creados permanecerán en el calendario anterior.');
      const returnUrl = 'elixirclinic://google-calendar';
      const authResult = await WebBrowser.openAuthSessionAsync(result.authorizationUrl, returnUrl);
      if (authResult.type === 'success' && authResult.url) {
        const callback = new URL(authResult.url).searchParams.get('googleCalendar');
        if (callback === 'connected') setNotice('Tu cuenta de Google quedó conectada.');
        else if (callback === 'cancelled') setNotice('Se canceló la autorización de Google.');
        else if (callback === 'unauthorized') setError('Tu cuenta no tiene permiso para administrar este calendario.');
        else if (callback === 'error') setError('No se pudo terminar la conexión. Revisa la configuración de Google y vuelve a intentarlo.');
        if (callback === 'connected') await refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la conexión con Google.');
    } finally { setBusy(false); }
  };

  const confirmConnect = (replace: boolean) => {
    if (!replace) return void startConnect(false);
    Alert.alert('Cambiar cuenta de Google', 'Los eventos ya creados permanecerán en el calendario anterior. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Continuar', onPress: () => void startConnect(true) },
    ]);
  };

  const runSync = async () => {
    if (!clinic || syncing) return;
    setSyncing(true); setError(''); setNotice('');
    try {
      const result = await googleCalendarRequest<{ succeeded: number; failed: number; queued: number }>(clinic.clinicId, 'POST', { action: 'sync', initial: true });
      setNotice(`Sincronización ejecutada: ${result.succeeded} actualizadas, ${result.failed} con error${result.queued ? ` y ${result.queued} pendientes` : ''}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo sincronizar Google Calendar.'); }
    finally { setSyncing(false); }
  };

  const chooseCalendar = async (calendarId: string) => {
    if (!clinic || !data?.connection || busy || calendarId === data.connection.calendar_id) return;
    setBusy(true); setError('');
    try {
      await googleCalendarRequest(clinic.clinicId, 'POST', { action: 'calendar', calendarId });
      setNotice('Calendario de destino actualizado. Las próximas citas quedaron en cola para sincronización.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el calendario.'); }
    finally { setBusy(false); }
  };

  const disconnect = () => {
    if (!clinic || busy) return;
    Alert.alert('Desconectar Google Calendar', 'Los eventos ya creados permanecerán en Google Calendar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: () => void (async () => {
        setBusy(true); setError(''); setNotice('');
        try {
          await googleCalendarRequest(clinic.clinicId, 'POST', { action: 'disconnect' });
          setNotice('Tu cuenta de Google quedó desconectada.');
          await refresh();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo desconectar Google Calendar.'); }
        finally { setBusy(false); }
      })() },
    ]);
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!['admin', 'clinician', 'receptionist', 'billing'].includes(clinic.role)) return <Redirect href="/(tabs)/more" />;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Google Calendar</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic.name}</Text></View></View>
    <View style={[styles.banner, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.bannerIcon, { color: palette.primary }]}>▦</Text><View style={styles.bannerCopy}><Text style={[styles.bannerTitle, { color: palette.text }]}>Tu cuenta de Google Calendar</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>La conexión es personal. Puedes elegir un calendario compartido si tienes permiso para editarlo. Las citas se guardan con títulos genéricos; los datos del paciente no se envían a Google.</Text></View></View>
    {!!notice && <Text accessibilityRole="status" style={[styles.notice, { backgroundColor: palette.primarySoft, color: palette.primary }]}>{notice}</Text>}
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
    {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary}/><Text style={[styles.copy, { color: palette.textSecondary }]}>Consultando tu conexión…</Text></View> : <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
      <View style={styles.cardHeading}><View><Text style={[styles.cardTitle, { color: palette.text }]}>Mi cuenta</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{data?.connection ? data.connection.google_email : 'Conecta la cuenta que quieres usar con este usuario del CRM.'}</Text></View><Text style={[styles.status, { color: data?.connection ? palette.primary : palette.textSecondary }]}>{data?.connection ? 'Conectada' : 'Sin conectar'}</Text></View>
      {data?.connection ? <>
        <Text style={[styles.label, { color: palette.text }]}>Calendario de destino</Text>
        {!!calendarError && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{calendarError}</Text>}
        {!calendarError && calendars.length === 0 && <Text style={[styles.copy, { color: palette.textSecondary }]}>No hay calendarios disponibles para esta cuenta.</Text>}
        {calendars.map(calendar => <Pressable key={calendar.id} accessibilityRole="radio" accessibilityState={{ checked: calendar.id === data?.connection?.calendar_id }} disabled={busy || syncing} onPress={() => void chooseCalendar(calendar.id)} style={[styles.calendarOption, { backgroundColor: calendar.id === data?.connection?.calendar_id ? palette.primarySoft : palette.background, borderColor: calendar.id === data?.connection?.calendar_id ? palette.primary : palette.line }]}><View style={styles.calendarCopy}><Text style={[styles.calendarName, { color: palette.text }]}>{calendar.summary}{calendar.primary ? ' · Principal' : ''}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{calendar.timeZone || calendar.accessRole}</Text></View><Text style={[styles.radio, { color: palette.primary }]}>{calendar.id === data?.connection?.calendar_id ? '●' : '○'}</Text></Pressable>)}
        {!!data?.connection?.last_sync_error && <Text style={[styles.error, { color: palette.danger }]}>{data.connection.last_sync_error}</Text>}
        <Text style={[styles.copy, { color: palette.textSecondary }]}>{data?.connection?.last_synced_at ? `Última sincronización: ${formatDate(data.connection.last_synced_at)}` : 'Aún no hay una sincronización registrada.'}{data?.queued ? ` · ${data.queued} pendientes` : ''}</Text>
        <Pressable accessibilityRole="button" disabled={busy || syncing} onPress={() => void runSync()} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: busy || syncing ? 0.6 : 1 }]}>{syncing ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryButtonText}>Resincronizar próximas citas</Text>}</Pressable>
        <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy || syncing} onPress={() => confirmConnect(true)} style={[styles.secondaryButton, { backgroundColor: palette.background, borderColor: palette.line }]}><Text style={[styles.secondaryButtonText, { color: palette.text }]}>Cambiar cuenta</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || syncing} onPress={disconnect} style={[styles.secondaryButton, { backgroundColor: palette.background, borderColor: palette.line }]}><Text style={[styles.secondaryButtonText, { color: palette.danger }]}>Desconectar</Text></Pressable></View>
        {!!data.history.length && <View style={styles.history}><Text style={[styles.label, { color: palette.text }]}>Últimos intentos</Text>{data.history.slice(0, 5).map((item, index) => <Text key={`${item.created_at}-${index}`} style={[styles.copy, { color: palette.textSecondary }]}>{historyLabel(item)}</Text>)}</View>}
      </> : <>
        {Platform.OS === 'web' ? <Text style={[styles.copy, { color: palette.textSecondary }]}>Conecta Google Calendar desde la app instalada en iPhone o Android.</Text> : <Pressable accessibilityRole="button" disabled={busy} onPress={() => confirmConnect(false)} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: busy ? 0.6 : 1 }]}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryButtonText}>Conectar Google</Text>}</Pressable>}
      </>}
    </View>}
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://calendar.google.com')} style={styles.external}><Text style={[styles.externalText, { color: palette.primary }]}>Abrir Google Calendar ↗</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingTop: 6, paddingBottom: 30, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 }, back: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34 }, heading: { flex: 1 }, title: { fontSize: 25, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { fontSize: 13, marginTop: 2 },
  banner: { borderWidth: 1, borderRadius: 15, padding: 15, flexDirection: 'row', gap: 12 }, bannerIcon: { fontSize: 24, fontWeight: '700' }, bannerCopy: { flex: 1, gap: 5 }, bannerTitle: { fontSize: 14, fontWeight: '700' }, copy: { fontSize: 12, lineHeight: 18 }, notice: { fontSize: 13, lineHeight: 19, padding: 12, borderRadius: 11 }, error: { fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 }, card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 12 }, cardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 3 }, status: { fontSize: 12, fontWeight: '700', marginTop: 3 }, label: { fontSize: 13, fontWeight: '700' }, calendarOption: { minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, calendarCopy: { flex: 1, gap: 2 }, calendarName: { fontSize: 14, fontWeight: '700' }, radio: { fontSize: 20, fontWeight: '700' },
  primaryButton: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' }, actions: { flexDirection: 'row', gap: 9 }, secondaryButton: { minHeight: 44, flex: 1, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, secondaryButtonText: { fontSize: 13, fontWeight: '700' }, history: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8A7488', paddingTop: 12 }, external: { minHeight: 42, alignItems: 'center', justifyContent: 'center' }, externalText: { fontSize: 13, fontWeight: '700' },
});

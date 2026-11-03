import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CrmText as Text } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { createClient } from '@/lib/supabase';
import { useCrmRouter } from '@/lib/use-crm-router';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';

type InboxItem = {
  id: string;
  message: string;
  kind: string;
  created_at: string;
  read_at: string | null;
  appointment_id: string | null;
  booking_request_id: string | null;
};
type Filter = 'all' | 'unread';

export default function NotificationsScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme()];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [busyAll, setBusyAll] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!clinic || !session?.user) return;
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    const client = createClient();
    if (!client) {
      setError('La conexión con Supabase no está configurada.');
      setLoading(false); setRefreshing(false); return;
    }
    try {
      const { data, error: queryError } = await client.from('staff_notifications')
        .select('id,message,kind,created_at,read_at,appointment_id,booking_request_id')
        .eq('clinic_id', clinic.clinicId)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (queryError) throw new Error('No se pudieron cargar los avisos guardados. Revisa tu conexión.');
      setItems((data || []) as InboxItem[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los avisos guardados.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [clinic, session?.user]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => {
    const timer = setInterval(() => { void refresh(true); }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const unreadCount = useMemo(() => items.filter(item => !item.read_at).length, [items]);
  const visibleItems = useMemo(() => filter === 'unread' ? items.filter(item => !item.read_at) : items, [filter, items]);

  const markRead = async (item: InboxItem) => {
    if (!clinic || !session?.user || item.read_at || busyId) return;
    const client = createClient();
    if (!client) { setActionError('La conexión con Supabase no está configurada.'); return; }
    setBusyId(item.id); setActionError('');
    try {
      const { error: updateError } = await client.from('staff_notifications').update({ read_at: new Date().toISOString() })
        .eq('id', item.id).eq('clinic_id', clinic.clinicId).eq('user_id', session.user.id).is('read_at', null);
      if (updateError) throw new Error('No se pudo actualizar el aviso. Vuelve a intentarlo.');
      setItems(current => current.map(value => value.id === item.id ? { ...value, read_at: new Date().toISOString() } : value));
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No se pudo actualizar el aviso.'); }
    finally { setBusyId(''); }
  };

  const markAllRead = async () => {
    if (!clinic || !session?.user || !unreadCount || busyAll) return;
    const client = createClient();
    if (!client) { setActionError('La conexión con Supabase no está configurada.'); return; }
    setBusyAll(true); setActionError('');
    const readAt = new Date().toISOString();
    try {
      const { error: updateError } = await client.from('staff_notifications').update({ read_at: readAt })
        .eq('clinic_id', clinic.clinicId).eq('user_id', session.user.id).is('read_at', null);
      if (updateError) throw new Error('No se pudieron marcar los avisos como leídos. Vuelve a intentarlo.');
      setItems(current => current.map(item => item.read_at ? item : { ...item, read_at: readAt }));
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No se pudieron marcar los avisos como leídos.'); }
    finally { setBusyAll(false); }
  };

  const clearAll = async () => {
    if (!clinic || !session?.user || !items.length || busyAll) return;
    Alert.alert('Borrar notificaciones', 'Se borrarán tus avisos guardados de esta clínica.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar todas', style: 'destructive', onPress: () => { void performClearAll(); } },
    ]);
  };

  const performClearAll = async () => {
    if (!clinic || !session?.user || busyAll) return;
    const client = createClient();
    if (!client) { setActionError('La conexión con Supabase no está configurada.'); return; }
    setBusyAll(true); setActionError('');
    try {
      const { error: deleteError } = await client.from('staff_notifications').delete()
        .eq('clinic_id', clinic.clinicId).eq('user_id', session.user.id);
      if (deleteError) throw new Error('No se pudieron borrar los avisos. Vuelve a intentarlo.');
      setItems([]);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No se pudieron borrar los avisos.'); }
    finally { setBusyAll(false); }
  };

  const openItem = (item: InboxItem) => {
    void markRead(item);
    if (item.kind === 'whatsapp_message' || item.kind === 'whatsapp_confirmation') router.push('/whatsapp' as never);
    else if (item.booking_request_id || item.message === 'Nueva solicitud de cita') router.push('/public-agenda' as never);
    else if (item.appointment_id) router.push({ pathname: '/appointment/[id]', params: { id: item.appointment_id } } as never);
    else router.push('/(tabs)/agenda' as never);
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}><SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={palette.primary} size={22} /></Pressable>
        <View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Notificaciones</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{unreadCount ? `${unreadCount} ${unreadCount === 1 ? 'aviso sin leer' : 'avisos sin leer'}` : 'Estás al día'} · {clinic.name}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Actualizar notificaciones" disabled={refreshing || loading} onPress={() => void refresh(true)} style={[styles.refresh, { borderColor: palette.line, opacity: refreshing || loading ? 0.5 : 1 }]}><SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} tintColor={palette.primary} size={19} /></Pressable>
      </View>

      <View style={styles.toolbar}>
        <View style={[styles.filters, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <FilterButton label={`Todas · ${items.length}`} selected={filter === 'all'} palette={palette} onPress={() => setFilter('all')} />
          <FilterButton label={`Sin leer · ${unreadCount}`} selected={filter === 'unread'} palette={palette} onPress={() => setFilter('unread')} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Marcar todas como leídas" disabled={!unreadCount || busyAll} onPress={() => void markAllRead()} style={[styles.toolbarAction, { borderColor: palette.line, opacity: !unreadCount || busyAll ? 0.45 : 1 }]}><SymbolView name={{ ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }} tintColor={palette.primary} size={18} /></Pressable>
      </View>

      {error ? <Feedback message={error} action="Reintentar" onPress={() => void refresh()} palette={palette} /> : null}
      {actionError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: palette.danger }]}>{actionError}</Text> : null}
      {loading ? <View style={[styles.stateCard, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><ActivityIndicator color={palette.primary} /><Text style={[styles.bodyText, { color: palette.textSecondary }]}>Cargando notificaciones…</Text></View> : visibleItems.length ? <View style={[styles.list, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
        {visibleItems.map(item => <NotificationCard key={item.id} item={item} palette={palette} busy={busyId === item.id} onOpen={() => openItem(item)} onRead={() => void markRead(item)} />)}
      </View> : <View style={[styles.emptyCard, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
        <View style={[styles.emptyIcon, { backgroundColor: palette.primarySoft }]}><SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} tintColor={palette.primary} size={24} /></View>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>{filter === 'unread' && items.length ? 'Todo al día' : 'Sin notificaciones'}</Text>
        <Text style={[styles.bodyText, { color: palette.textSecondary }]}>{filter === 'unread' && items.length ? 'Ya leíste todos tus avisos.' : 'Los nuevos avisos de tu actividad aparecerán aquí.'}</Text>
      </View>}

      <View style={[styles.footer, { borderTopColor: palette.line }]}>
        <Text style={[styles.footerText, { color: palette.textSecondary }]}>Avisos guardados · hasta 100 recientes</Text>
        <Pressable accessibilityRole="button" disabled={!items.length || busyAll} onPress={clearAll} style={({ pressed }) => [styles.clearButton, { opacity: !items.length || busyAll ? 0.45 : pressed ? 0.65 : 1 }]}><Text style={[styles.clearText, { color: palette.danger }]}>Borrar todas</Text></Pressable>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function FilterButton({ label, selected, palette, onPress }: { label: string; selected: boolean; palette: (typeof Colors)[keyof typeof Colors]; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.filterButton, selected && { backgroundColor: palette.primarySoft }]}><Text style={[styles.filterText, { color: selected ? palette.primary : palette.textSecondary }]}>{label}</Text></Pressable>;
}

function NotificationCard({ item, palette, busy, onOpen, onRead }: { item: InboxItem; palette: (typeof Colors)[keyof typeof Colors]; busy: boolean; onOpen: () => void; onRead: () => void }) {
  const time = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.created_at));
  const actionLabel = item.kind === 'whatsapp_message' || item.kind === 'whatsapp_confirmation' ? 'Abrir WhatsApp' : item.booking_request_id || item.message === 'Nueva solicitud de cita' ? 'Revisar solicitudes' : item.appointment_id ? 'Ver cita en agenda' : 'Abrir agenda';
  return <View style={[styles.card, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.message}, ${actionLabel}`} onPress={onOpen} style={({ pressed }) => [styles.cardMain, { opacity: pressed ? 0.75 : 1 }]}>
      <View style={[styles.noticeIcon, { backgroundColor: palette.primarySoft }]}><SymbolView name={{ ios: iconFor(item.kind), android: androidIconFor(item.kind), web: androidIconFor(item.kind) }} tintColor={palette.primary} size={17} /></View>
      <View style={styles.copy}><Text style={[styles.message, { color: palette.text }]}>{item.message}</Text><View style={styles.metaRow}><Text style={[styles.time, { color: palette.textSecondary }]}>{time}</Text>{!item.read_at ? <Text style={[styles.unreadLabel, { color: palette.primary }]}>Sin leer</Text> : null}</View><Text style={[styles.link, { color: palette.primary }]}>{actionLabel} ›</Text></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={item.read_at ? 'Leída' : `Marcar como leída: ${item.message}`} disabled={Boolean(item.read_at) || busy} onPress={onRead} style={[styles.readButton, { borderColor: palette.line, opacity: item.read_at ? 0.35 : 1 }]}>
      {busy ? <ActivityIndicator size="small" color={palette.primary} /> : <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={palette.primary} size={16} />}
    </Pressable>
  </View>;
}

function Feedback({ message, action, onPress, palette }: { message: string; action: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={[styles.feedback, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text accessibilityRole="alert" style={[styles.bodyText, { color: palette.danger }]}>{message}</Text><Pressable accessibilityRole="button" onPress={onPress}><Text style={[styles.link, { color: palette.primary }]}>{action}</Text></Pressable></View>;
}

function iconFor(kind: string) { return kind.startsWith('whatsapp') ? 'message' : kind === 'test' ? 'bell.badge' : 'calendar'; }
function androidIconFor(kind: string) { return kind.startsWith('whatsapp') ? 'chat' : kind === 'test' ? 'notifications_active' : 'event'; }

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingTop: 8, paddingBottom: 28, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 }, back: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' }, heading: { flex: 1 }, title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.45 }, subtitle: { fontSize: 12, marginTop: 2 }, refresh: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 }, filters: { flex: 1, borderWidth: 1, borderRadius: 13, padding: 4, flexDirection: 'row', gap: 4 }, filterButton: { minHeight: 44, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, filterText: { fontSize: 12, fontWeight: '700' }, toolbarAction: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  list: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' }, card: { minHeight: 88, paddingLeft: 12, paddingRight: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, cardMain: { flex: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10 }, noticeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 3 }, message: { fontSize: 14, fontWeight: '700', lineHeight: 19 }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, time: { fontSize: 11 }, unreadLabel: { fontSize: 10, fontWeight: '700' }, link: { fontSize: 12, fontWeight: '700', marginTop: 2 }, readButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stateCard: { minHeight: 160, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 }, emptyCard: { minHeight: 220, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 8 }, emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }, emptyTitle: { fontSize: 17, fontWeight: '700' }, bodyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' }, feedback: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 }, errorText: { fontSize: 13, lineHeight: 19 }, footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, footerText: { fontSize: 11, flex: 1 }, clearButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 }, clearText: { fontSize: 12, fontWeight: '700' },
});

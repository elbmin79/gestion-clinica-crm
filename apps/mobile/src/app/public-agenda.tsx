import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { CrmText as Text } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useCrmRouter } from '@/lib/use-crm-router';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import { loadPublicAgendaReadiness, type PublicAgendaReadiness } from '@/lib/public-agenda-api';
import { loadPublicAgendaWorkspace, refreshPublicBookingRequests, reviewPublicBooking, savePublicAgenda, type PublicAgendaHour, type PublicAgendaOffer, type PublicAgendaSettings, type PublicAgendaWorkspace, type PublicBookingRequest } from '@/lib/public-agenda-data';

const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const statuses = [{ id: 'pending', label: 'Por revisar' }, { id: 'approved', label: 'Aprobadas' }, { id: 'rejected', label: 'Rechazadas' }, { id: 'all', label: 'Todas' }];
type Palette = (typeof Colors)[keyof typeof Colors];

export default function PublicAgendaScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme()];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [data, setData] = useState<PublicAgendaWorkspace | null>(null);
  const [readiness, setReadiness] = useState<PublicAgendaReadiness>({ configured: false, secretConfigured: false, databaseConfigured: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyRequest, setBusyRequest] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('pending');
  const [patientLinks, setPatientLinks] = useState<Record<string, string>>({});

  const canManage = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'public_agenda.manage'));
  const canApprove = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'agenda.create'));
  const canReject = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'agenda.cancel'));
  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try {
      const [workspace, serverStatus] = await Promise.all([loadPublicAgendaWorkspace(clinic), loadPublicAgendaReadiness(clinic.clinicId)]);
      setData(workspace); setReadiness(serverStatus);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la agenda pública.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { void refresh(); }, [refresh]);

  const combinations = useMemo(() => [...new Map((data?.offers || []).filter(item => item.branch_id && item.provider_id).map(item => [`${item.branch_id}:${item.provider_id}`, item])).entries()], [data?.offers]);
  const filteredRequests = useMemo(() => (data?.requests || []).filter(item => filter === 'all' || item.status === filter), [data?.requests, filter]);

  const save = async () => {
    if (!clinic || !data || saving || !canManage) return;
    setSaving(true); setError(''); setNotice('');
    try {
      if (data.settings.published && !readiness.configured) throw new Error('El servidor todavía no está configurado para recibir solicitudes públicas. Revisa la configuración del servidor antes de publicar.');
      await savePublicAgenda(clinic, data.settings, data.offers, data.hours);
      await refresh(); setNotice('Configuración de agenda pública guardada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la agenda pública.'); }
    finally { setSaving(false); }
  };

  const updateSettings = <K extends keyof PublicAgendaSettings>(key: K, value: PublicAgendaSettings[K]) => setData(current => current ? { ...current, settings: { ...current.settings, [key]: value } } : current);
  const updateOffer = (id: string, key: keyof PublicAgendaOffer, value: string | number) => setData(current => current ? { ...current, offers: current.offers.map(item => {
    if (item.id !== id) return item;
    const next = { ...item, [key]: value };
    if (key === 'service_id') {
      const service = current.catalog.services.find(entry => entry.id === value);
      next.duration_minutes = service?.durationMin && service.durationMin === service.durationMax ? service.durationMin : '';
    }
    return next;
  }) } : current);
  const updateHour = (id: string, values: Partial<PublicAgendaHour>) => setData(current => current ? { ...current, hours: current.hours.map(item => item.id === id ? { ...item, ...values } : item) } : current);
  const addOffer = () => setData(current => current ? { ...current, offers: [...current.offers, { id: crypto.randomUUID(), service_id: '', branch_id: '', provider_id: '', duration_minutes: '', deposit_amount: '', saved: false }] } : current);
  const removeOffer = (id: string) => setData(current => current ? { ...current, offers: current.offers.filter(item => item.id !== id) } : current);
  const addHour = () => setData(current => current ? { ...current, hours: [...current.hours, { id: crypto.randomUUID(), branch_id: combinations[0]?.[1].branch_id || '', provider_id: combinations[0]?.[1].provider_id || '', day_of_week: 1, on_date: null, closed: false, opens_minute: 540, closes_minute: 1020 }] } : current);
  const removeHour = (id: string) => setData(current => current ? { ...current, hours: current.hours.filter(item => item.id !== id) } : current);

  const askReview = (request: PublicBookingRequest, action: 'approve' | 'reject') => {
    const label = action === 'approve' ? 'crear una cita pendiente y expediente' : 'rechazar esta solicitud';
    Alert.alert(action === 'approve' ? 'Crear cita pendiente' : 'Rechazar solicitud', `¿Confirmas ${label} para ${request.full_name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: action === 'approve' ? 'Crear cita' : 'Rechazar', style: action === 'reject' ? 'destructive' : 'default', onPress: () => void performReview(request, action) },
    ]);
  };
  const performReview = async (request: PublicBookingRequest, action: 'approve' | 'reject') => {
    if (!clinic || busyRequest) return;
    setBusyRequest(request.id); setError(''); setNotice('');
    try {
      await reviewPublicBooking(clinic, request.id, action, patientLinks[request.id] || null);
      const requests = await refreshPublicBookingRequests(clinic);
      setData(current => current ? { ...current, requests } : current);
      setNotice(action === 'approve' ? 'Cita pendiente creada. Registra el anticipo antes de confirmarla.' : 'Solicitud rechazada. No se creó una cita.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo revisar la solicitud.'); }
    finally { setBusyRequest(''); }
  };

  if (authLoading || session && workspaceLoading) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'public_agenda.view')) return <Redirect href="/(tabs)/more" />;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background}]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}><Text style={[styles.backLabel, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Agenda pública</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic.name} · {clinic.timeZone}</Text></View><Pressable accessibilityRole="button" onPress={() => void refresh()} style={[styles.refresh, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.refreshLabel, { color: palette.primary }]}>Actualizar</Text></Pressable></View>
      <View style={[styles.banner, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.bannerTitle, { color: palette.text }]}>Solicitudes con revisión del equipo</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Enviar una solicitud no reserva el espacio ni confirma la cita. Al aprobar, la disponibilidad se vuelve a comprobar.</Text></View>
      {error ? <Feedback message={error} palette={palette} danger /> : null}{notice ? <Feedback message={notice} palette={palette} /> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando agenda pública…</Text></View> : data ? <>
        {!readiness.configured ? <View style={[styles.warning, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.warningTitle, { color: palette.danger }]}>La agenda pública no puede recibir solicitudes</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>El equipo administrador debe configurar el secreto de reservas y el acceso seguro a la base de datos.</Text></View> : null}
        <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <View style={styles.cardHeading}><View style={styles.grow}><Text style={[styles.sectionTitle, { color: palette.text }]}>Página de reservas</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Define el enlace y cuándo puede usarse.</Text></View>{canManage ? <View style={styles.publish}><Text style={[styles.label, { color: palette.text }]}>Publicada</Text><Switch value={data.settings.published} onValueChange={value => updateSettings('published', value)} trackColor={{ false: palette.line, true: palette.primarySoft }} thumbColor={data.settings.published ? palette.primary : palette.backgroundElement} accessibilityLabel="Publicar agenda" /></View> : <Badge label={data.settings.published ? readiness.configured ? 'Disponible' : 'No disponible' : 'No publicada'} palette={palette} active={data.settings.published && readiness.configured} />}</View>
          {canManage ? <>
            <Input label="Identificador del enlace" value={data.settings.slug} onChangeText={value => updateSettings('slug', value.toLocaleLowerCase('en-US').replace(/[^a-z0-9-]/g, ''))} placeholder="mi-clinica" palette={palette} autoCapitalize="none" />
            <View style={styles.row}><Input label="Anticipación mínima · min" value={String(data.settings.min_notice_minutes)} onChangeText={value => updateSettings('min_notice_minutes', numeric(value))} keyboardType="number-pad" placeholder="1440" palette={palette} /><Input label="Días por adelantado" value={String(data.settings.max_days)} onChangeText={value => updateSettings('max_days', numeric(value))} keyboardType="number-pad" placeholder="90" palette={palette} /></View>
            <Input label="Separación entre citas · min" value={String(data.settings.buffer_minutes)} onChangeText={value => updateSettings('buffer_minutes', numeric(value))} keyboardType="number-pad" placeholder="0" palette={palette} />
            <Toggle label="Solicitar correo electrónico obligatorio" value={data.settings.require_email} onChange={value => updateSettings('require_email', value)} palette={palette} />
            <Text style={[styles.hint, { color: palette.textSecondary }]}>Nombre, teléfono internacional y autorización de contacto son obligatorios. Zona horaria: {clinic.timeZone}.</Text>
          </> : <SettingsSummary settings={data.settings} timeZone={clinic.timeZone} readiness={readiness} palette={palette} />}
        </View>

        <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <View style={styles.cardHeading}><View style={styles.grow}><Text style={[styles.sectionTitle, { color: palette.text }]}>Servicios visibles</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Cada opción necesita una duración y un anticipo.</Text></View>{canManage ? <SmallButton label="＋ Agregar" onPress={addOffer} palette={palette} /> : null}</View>
          {!data.offers.length ? <Text style={[styles.copy, { color: palette.textSecondary }]}>No hay opciones públicas configuradas.</Text> : data.offers.map((offer, index) => <View key={offer.id} style={[styles.itemCard, { borderColor: palette.line }]}>
            <View style={styles.itemHeading}><Text style={[styles.label, { color: palette.text }]}>Opción {index + 1}</Text>{canManage ? <SmallButton label="Quitar" onPress={() => removeOffer(offer.id)} palette={palette} danger /> : null}</View>
            <OptionField label="Servicio" value={offer.service_id} options={data.catalog.services.filter(item => item.active !== false || item.id === offer.service_id).map(item => ({ id: item.id, label: item.name }))} onChange={value => updateOffer(offer.id, 'service_id', value)} disabled={!canManage || offer.saved} palette={palette} />
            <OptionField label="Sucursal" value={offer.branch_id} options={data.catalog.branches.map(item => ({ id: item.id, label: item.name }))} onChange={value => updateOffer(offer.id, 'branch_id', value)} disabled={!canManage || offer.saved} palette={palette} />
            <OptionField label="Profesional" value={offer.provider_id} options={data.catalog.providers.filter(item => !offer.branch_id || item.branchIds.includes(offer.branch_id) || item.id === offer.provider_id).map(item => ({ id: item.id, label: item.name }))} onChange={value => updateOffer(offer.id, 'provider_id', value)} disabled={!canManage || offer.saved} palette={palette} />
            <View style={styles.row}><Input label="Duración · min" value={String(offer.duration_minutes)} onChangeText={value => updateOffer(offer.id, 'duration_minutes', value)} keyboardType="number-pad" placeholder="45" palette={palette} editable={canManage} /><Input label="Anticipo · MXN" value={String(offer.deposit_amount)} onChangeText={value => updateOffer(offer.id, 'deposit_amount', value)} keyboardType="decimal-pad" placeholder="500" palette={palette} editable={canManage} /></View>
          </View>)}
          {canManage ? <Text style={[styles.hint, { color: palette.textSecondary }]}>Para cambiar la asignación de una opción guardada, quítala y agrega una nueva.</Text> : <Text style={[styles.hint, { color: palette.textSecondary }]}>{data.offers.length} opciones públicas activas.</Text>}
        </View>

        <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <View style={styles.cardHeading}><View style={styles.grow}><Text style={[styles.sectionTitle, { color: palette.text }]}>Horarios para pacientes</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Los bloqueos y citas existentes se respetan.</Text></View>{canManage ? <SmallButton label="＋ Agregar" onPress={addHour} palette={palette} /> : null}</View>
          {!data.hours.length ? <Text style={[styles.copy, { color: palette.textSecondary }]}>No hay horarios públicos configurados.</Text> : data.hours.map((hour, index) => <View key={hour.id} style={[styles.itemCard, { borderColor: palette.line }]}>
            <View style={styles.itemHeading}><Text style={[styles.label, { color: palette.text }]}>Horario {index + 1}</Text>{canManage ? <SmallButton label="Quitar" onPress={() => removeHour(hour.id)} palette={palette} danger /> : null}</View>
            <OptionField label="Sucursal y profesional" value={hour.branch_id && hour.provider_id ? `${hour.branch_id}:${hour.provider_id}` : ''} options={combinations.map(([key, item]) => ({ id: key, label: `${branchName(data, item.branch_id)} · ${providerName(data, item.provider_id)}` }))} onChange={value => { const [branch_id, provider_id] = value.split(':'); updateHour(hour.id, { branch_id, provider_id }); }} disabled={!canManage} palette={palette} />
            <OptionField label="Tipo" value={hour.on_date !== null ? 'date' : 'weekly'} options={[{ id: 'weekly', label: 'Semanal' }, { id: 'date', label: 'Fecha específica' }]} onChange={value => updateHour(hour.id, value === 'weekly' ? { day_of_week: 1, on_date: null, closed: false, opens_minute: 540, closes_minute: 1020 } : { day_of_week: null, on_date: '', closed: false, opens_minute: 540, closes_minute: 1020 })} disabled={!canManage} palette={palette} />
            {hour.on_date !== null ? <Input label="Fecha · AAAA-MM-DD" value={hour.on_date} onChangeText={value => updateHour(hour.id, { on_date: value })} placeholder="2026-11-02" palette={palette} editable={canManage} /> : <OptionField label="Día" value={String(hour.day_of_week ?? 1)} options={dayNames.map((label, id) => ({ id: String(id), label }))} onChange={value => updateHour(hour.id, { day_of_week: Number(value) })} disabled={!canManage} palette={palette} />}
            {hour.on_date !== null ? <Toggle label="Cerrado" value={hour.closed} onChange={value => updateHour(hour.id, value ? { closed: true, opens_minute: null, closes_minute: null } : { closed: false, opens_minute: 540, closes_minute: 1020 })} palette={palette} disabled={!canManage} /> : null}
            {!hour.closed ? <View style={styles.row}><Input label="Desde · HH:mm" value={minuteText(hour.opens_minute)} onChangeText={value => updateHour(hour.id, { opens_minute: minuteValue(value) })} placeholder="09:00" palette={palette} editable={canManage} /><Input label="Hasta · HH:mm" value={minuteText(hour.closes_minute)} onChangeText={value => updateHour(hour.id, { closes_minute: minuteValue(value, true) })} placeholder="17:00" palette={palette} editable={canManage} /></View> : null}
          </View>)}
          {canManage ? <Text style={[styles.hint, { color: palette.textSecondary }]}>Las horas usan intervalos de 15 minutos entre 06:00 y medianoche. Las fechas específicas reemplazan los horarios semanales de ese día.</Text> : null}
        </View>
        {canManage ? <Pressable accessibilityRole="button" disabled={saving || loading} onPress={() => void save()} style={[styles.save, { backgroundColor: palette.primary, opacity: saving ? 0.55 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar agenda pública</Text>}</Pressable> : null}

        <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <View style={styles.cardHeading}><View style={styles.grow}><Text style={[styles.sectionTitle, { color: palette.text }]}>Solicitudes de pacientes</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Últimas {data.requests.length}; aprobar vuelve a comprobar el horario.</Text></View><SmallButton label={busyRequest ? 'Actualizando…' : 'Actualizar'} onPress={() => void refreshRequestsForScreen(clinic, setData, setError, setBusyRequest)} palette={palette} disabled={Boolean(busyRequest)} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{statuses.map(item => <Chip key={item.id} label={item.label} selected={filter === item.id} onPress={() => setFilter(item.id)} palette={palette} />)}</ScrollView>
          {!filteredRequests.length ? <Text style={[styles.copy, { color: palette.textSecondary }]}>No hay solicitudes en este estado.</Text> : filteredRequests.map(request => <View key={request.id} style={[styles.requestCard, { borderColor: palette.line }]}>
            <View style={styles.requestHeading}><View style={styles.grow}><Text style={[styles.requestName, { color: palette.text }]}>{request.full_name}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{request.service_name} · {formatDate(request.starts_at, clinic.timeZone)}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{request.phone}{request.email ? ` · ${request.email}` : ''}</Text><Text style={[styles.hint, { color: palette.textSecondary }]}>Anticipo {money(request.deposit_amount)} MXN · Folio {request.id.slice(0, 8)}</Text></View><Badge label={statusLabel(request.status)} palette={palette} active={request.status === 'approved'} danger={request.status === 'rejected'} /></View>
            {request.status === 'pending' ? <>
              {canApprove ? <OptionField label="Expediente" value={patientLinks[request.id] || ''} options={[{ id: '', label: 'Crear nuevo expediente al aprobar' }, ...data.patients.filter(item => item.databaseId).map(item => ({ id: item.databaseId, label: `${item.name} · ${item.recordNumber}` }))]} onChange={value => setPatientLinks(current => ({ ...current, [request.id]: value }))} disabled={Boolean(busyRequest)} palette={palette} /> : null}
              <View style={styles.rowActions}>{canApprove ? <SmallButton label="Crear cita pendiente" onPress={() => askReview(request, 'approve')} palette={palette} disabled={Boolean(busyRequest)} /> : null}{canReject ? <SmallButton label="Rechazar" onPress={() => askReview(request, 'reject')} palette={palette} danger disabled={Boolean(busyRequest)} /> : null}</View>
            </> : request.appointment_id ? <Text style={[styles.hint, { color: palette.primary }]}>Se creó una cita pendiente · {request.appointment_id.slice(0, 8)}</Text> : null}
          </View>)}
          <Text style={[styles.hint, { color: palette.textSecondary }]}>La aprobación crea una cita “Por confirmar”. Registra el anticipo en Pagos; esta agenda no envía confirmaciones ni autoriza mensajes de WhatsApp.</Text>
        </View>
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function refreshRequestsForScreen(clinic: NonNullable<ReturnType<typeof useClinicWorkspace>['clinic']>, setData: React.Dispatch<React.SetStateAction<PublicAgendaWorkspace | null>>, setError: (message: string) => void, setBusy: (value: string) => void) {
  return (async () => { setBusy('refresh'); setError(''); try { const requests = await refreshPublicBookingRequests(clinic); setData(current => current ? { ...current, requests } : current); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron actualizar las solicitudes.'); } finally { setBusy(''); } })();
}
function branchName(data: PublicAgendaWorkspace, id: string) { return data.catalog.branches.find(item => item.id === id)?.name || 'Sucursal'; }
function providerName(data: PublicAgendaWorkspace, id: string) { return data.catalog.providers.find(item => item.id === id)?.name || 'Profesional'; }
function numeric(value: string) { return value === '' ? 0 : Number(value); }
function minuteText(value: number | null) { if (value == null) return ''; return `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function minuteValue(value: string, end = false) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null; const [hour, minute] = value.split(':').map(Number); return end && hour === 0 && minute === 0 ? 1440 : hour * 60 + minute; }
function formatDate(value: string, timeZone: string) { return new Intl.DateTimeFormat('es-MX', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function money(value: number) { return Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function statusLabel(status: string) { return status === 'pending' ? 'Por revisar' : status === 'approved' ? 'Aprobada' : 'Rechazada'; }

function Feedback({ message, palette, danger = false }: { message: string; palette: Palette; danger?: boolean }) { return <View style={[styles.feedback, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text accessibilityRole={danger ? 'alert' : 'status'} style={[styles.copy, { color: danger ? palette.danger : palette.primary }]}>{message}</Text></View>; }
function Badge({ label, palette, active = false, danger = false }: { label: string; palette: Palette; active?: boolean; danger?: boolean }) { return <View style={[styles.badge, { backgroundColor: active ? palette.primarySoft : palette.background, borderColor: active ? palette.primary : palette.line }]}><Text style={[styles.badgeText, { color: danger ? palette.danger : active ? palette.primary : palette.textSecondary }]}>{label}</Text></View>; }
function SmallButton({ label, onPress, palette, danger = false, disabled = false }: { label: string; onPress: () => void; palette: Palette; danger?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.smallButton, { borderColor: danger ? palette.danger : palette.line, opacity: disabled ? 0.5 : 1 }]}><Text style={[styles.smallButtonText, { color: danger ? palette.danger : palette.primary }]}>{label}</Text></Pressable>; }
function Chip({ label, selected, onPress, palette }: { label: string; selected: boolean; onPress: () => void; palette: Palette }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? palette.primarySoft : palette.background, borderColor: selected ? palette.primary : palette.line }]}><Text style={[styles.chipText, { color: selected ? palette.primary : palette.textSecondary }]}>{label}</Text></Pressable>; }
function Input({ label, value, onChangeText, placeholder, palette, keyboardType, editable = true, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; palette: Palette; keyboardType?: 'number-pad' | 'decimal-pad'; editable?: boolean; autoCapitalize?: 'none' }) { return <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} editable={editable} keyboardType={keyboardType} autoCapitalize={autoCapitalize} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line, opacity: editable ? 1 : 0.65 }]} /></View>; }
function OptionField({ label, value, options, onChange, disabled, palette }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (value: string) => void; disabled: boolean; palette: Palette }) { return <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.text }]}>{label}</Text>{options.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{options.map(item => <Pressable key={item.id || 'none'} accessibilityRole="button" accessibilityState={{ selected: value === item.id, disabled }} disabled={disabled} onPress={() => onChange(item.id)} style={[styles.choice, { backgroundColor: value === item.id ? palette.primarySoft : palette.background, borderColor: value === item.id ? palette.primary : palette.line, opacity: disabled ? 0.65 : 1 }]}><Text numberOfLines={1} style={[styles.choiceText, { color: value === item.id ? palette.primary : palette.textSecondary }]}>{item.label}</Text></Pressable>)}</ScrollView> : <Text style={[styles.hint, { color: palette.textSecondary }]}>No hay opciones disponibles.</Text>}</View>; }
function Toggle({ label, value, onChange, palette, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; palette: Palette; disabled?: boolean }) { return <View style={styles.toggle}><Text style={[styles.copy, styles.grow, { color: palette.text }]}>{label}</Text><Switch disabled={disabled} value={value} onValueChange={onChange} trackColor={{ false: palette.line, true: palette.primarySoft }} thumbColor={value ? palette.primary : palette.backgroundElement} accessibilityLabel={label} /></View>; }
function SettingsSummary({ settings, timeZone, readiness, palette }: { settings: PublicAgendaSettings; timeZone: string; readiness: PublicAgendaReadiness; palette: Palette }) { return <View style={styles.summary}><Summary label="Enlace público" value={`/reservar/${settings.slug || '—'}`} palette={palette} /><Summary label="Anticipación mínima" value={`${settings.min_notice_minutes} min`} palette={palette} /><Summary label="Días por adelantado" value={String(settings.max_days)} palette={palette} /><Summary label="Separación entre citas" value={`${settings.buffer_minutes} min`} palette={palette} /><Summary label="Correo obligatorio" value={settings.require_email ? 'Sí' : 'No'} palette={palette} /><Summary label="Zona horaria" value={timeZone} palette={palette} /><Summary label="Estado" value={settings.published ? readiness.configured ? 'Disponible' : 'No disponible' : 'No publicada'} palette={palette} /></View>; }
function Summary({ label, value, palette }: { label: string; value: string; palette: Palette }) { return <View style={[styles.summaryRow, { borderBottomColor: palette.line }]}><Text style={[styles.copy, { color: palette.textSecondary }]}>{label}</Text><Text selectable style={[styles.summaryValue, { color: palette.text }]}>{value}</Text></View>; }

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 18, paddingTop: 8, paddingBottom: 32, gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }, back: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }, backLabel: { fontSize: 34 }, heading: { flex: 1 }, title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }, subtitle: { fontSize: 12, marginTop: 3 }, refresh: { minHeight: 38, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, justifyContent: 'center' }, refreshLabel: { fontSize: 12, fontWeight: '700' }, banner: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 4 }, bannerTitle: { fontSize: 14, fontWeight: '800' }, copy: { fontSize: 12, lineHeight: 18 }, hint: { fontSize: 11, lineHeight: 16 }, loading: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 9 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, grow: { flex: 1, minWidth: 0 }, sectionTitle: { fontSize: 16, fontWeight: '800' }, publish: { alignItems: 'center' }, label: { fontSize: 11, fontWeight: '700' }, inputGroup: { flex: 1, minWidth: 0, gap: 6 }, input: { minHeight: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 13 }, row: { flexDirection: 'row', gap: 9, alignItems: 'center' }, toggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 }, summary: { gap: 0 }, summaryRow: { minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, summaryValue: { maxWidth: '62%', fontSize: 12, fontWeight: '700', textAlign: 'right' }, warning: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 5 }, warningTitle: { fontSize: 13, fontWeight: '800' }, itemCard: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 10 }, itemHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, smallButton: { minHeight: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, justifyContent: 'center' }, smallButtonText: { fontSize: 11, fontWeight: '700' }, chips: { gap: 6, paddingVertical: 2 }, chip: { minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, chipText: { fontSize: 11, fontWeight: '700' }, choice: { minHeight: 35, maxWidth: 230, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, justifyContent: 'center' }, choiceText: { fontSize: 11, fontWeight: '600' }, requestCard: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 9 }, requestHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, requestName: { fontSize: 14, fontWeight: '800' }, badge: { minHeight: 26, maxWidth: 120, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, badgeText: { fontSize: 10, fontWeight: '800' }, rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, feedback: { borderWidth: 1, borderRadius: 12, padding: 11 }, save: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});

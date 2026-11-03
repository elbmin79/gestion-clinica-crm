import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { mobileApiBaseUrl } from '@/lib/clinic-access-api';

type PublicOffer = { id: string; branchId: string; branch: string; serviceId: string; service: string; providerId: string; provider: string; duration: number; deposit: number };
type PublicCatalog = { name: string; timezone: string; today: string; lastDate: string; minNotice: number; maxDays: number; requireEmail: boolean; challenge: string; offers: PublicOffer[] };
type PublicSlot = { starts_at: string; ends_at: string };
type ApiResult = { error?: string; id?: string; slots?: PublicSlot[] };

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export default function PublicBookingScreen() {
  const { slug: routeSlug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(routeSlug) ? routeSlug[0] || '' : routeSlug || '';
  const palette = Colors[useCrmColorScheme()];
  const baseUrl = useMemo(() => mobileApiBaseUrl(), []);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branchId, setBranchId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [selectedStart, setSelectedStart] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [formLoadedAt, setFormLoadedAt] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const apiUrl = useMemo(() => baseUrl && slug ? `${baseUrl}/api/public-agenda/${encodeURIComponent(slug)}` : '', [baseUrl, slug]);
  const branches = useMemo(() => uniqueOptions(catalog?.offers || [], 'branchId', 'branch'), [catalog]);
  const services = useMemo(() => uniqueOptions((catalog?.offers || []).filter(item => item.branchId === branchId), 'serviceId', 'service'), [catalog, branchId]);
  const providers = useMemo(() => uniqueOptions((catalog?.offers || []).filter(item => item.branchId === branchId && item.serviceId === serviceId), 'providerId', 'provider'), [catalog, branchId, serviceId]);
  const offer = catalog?.offers.find(item => item.branchId === branchId && item.serviceId === serviceId && item.providerId === providerId) || null;

  useEffect(() => {
    if (!apiUrl) { setLoading(false); setError('Configura la dirección del CRM para consultar esta agenda.'); return; }
    const controller = new AbortController();
    setLoading(true); setError(''); setCatalog(null); setReceipt(''); setBranchId(''); setServiceId(''); setProviderId(''); setSelectedStart('');
    void fetch(apiUrl, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as PublicCatalog & ApiResult;
      if (!response.ok) throw new Error(data.error || 'La agenda no está disponible.');
      setCatalog(data); setDate(data.today); setFormLoadedAt(Date.now());
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la agenda.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiUrl, loadAttempt]);

  useEffect(() => {
    setSelectedStart(''); setSlots([]); setSlotError('');
    if (!apiUrl || !offer || !date) { setSlotsLoading(false); return; }
    const controller = new AbortController();
    const url = new URL(apiUrl); url.searchParams.set('offer', offer.id); url.searchParams.set('date', date);
    setSlotsLoading(true);
    void fetch(url.toString(), { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as ApiResult;
      if (!response.ok) throw new Error(data.error || 'No se pudieron consultar los horarios.');
      setSlots(data.slots || []);
    }).catch(cause => { if (!controller.signal.aborted) setSlotError(cause instanceof Error ? cause.message : 'No se pudieron consultar los horarios.'); })
      .finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); });
    return () => controller.abort();
  }, [apiUrl, offer?.id, date]);

  const retry = () => { setLoading(true); setError(''); setCatalog(null); setDate(''); setBranchId(''); setServiceId(''); setProviderId(''); setReceipt(''); setSelectedStart(''); setLoadAttempt(value => value + 1); };

  const submit = async () => {
    if (!catalog || !offer || !selectedStart || !consent || sending) return;
    setSending(true); setError('');
    try {
      const wait = 2200 - (Date.now() - formLoadedAt);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: catalog.challenge, offerId: offer.id, startsAt: selectedStart, name, phone, email, consent, website: '' }) });
      const data = await response.json() as ApiResult;
      if (!response.ok) throw new Error(data.error || 'No se pudo enviar tu solicitud.');
      setReceipt(data.id || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo enviar tu solicitud. Vuelve a intentarlo.'); }
    finally { setSending(false); }
  };

  const changeDate = (direction: -1 | 1) => {
    if (!catalog || !date) return;
    const next = addDays(date, direction);
    if (next >= catalog.today && next <= catalog.lastDate) setDate(next);
  };

  return <SafeAreaView edges={['top', 'bottom']} style={[styles.page, { backgroundColor: palette.background }]}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: palette.primarySoft }]}><Text style={[styles.brandIcon, { color: palette.primary }]}>✦</Text></View>
          <View style={styles.brandCopy}><Text style={[styles.brandName, { color: palette.text }]}>{catalog?.name || 'Agenda de citas'}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Solicitudes de citas en línea</Text></View>
        </View>
        {loading ? <Panel palette={palette}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Consultando la agenda…</Text></Panel>
          : !catalog ? <Panel palette={palette}><Text style={[styles.title, { color: palette.text }]}>Agenda no disponible</Text><Text accessibilityRole="alert" style={[styles.copy, { color: palette.danger }]}>{error}</Text><Button label="Volver a intentar" onPress={retry} palette={palette} /></Panel>
          : receipt ? <Panel palette={palette}><Text style={[styles.receiptIcon, { color: palette.primary }]}>✓</Text><Text style={[styles.title, { color: palette.text }]}>Recibimos tu solicitud</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>La clínica revisará el horario y te contactará con los datos que proporcionaste.</Text><Text style={[styles.receiptWarning, { color: palette.text }]}>Tu cita todavía no está confirmada. No se reservó el horario ni se realizó ningún cobro.</Text><Text selectable style={[styles.reference, { color: palette.textSecondary }]}>Folio: {receipt}</Text><Button label="Volver a la agenda" onPress={retry} palette={palette} />
          </Panel>
          : !catalog.offers.length ? <Panel palette={palette}><Text style={[styles.title, { color: palette.text }]}>No hay servicios disponibles</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>La clínica no tiene opciones habilitadas para solicitudes en línea en este momento. Intenta más tarde.</Text></Panel>
          : <Panel palette={palette}>
            <Text style={[styles.title, { color: palette.text }]}>Solicitar una cita</Text>
            <Text style={[styles.description, { color: palette.textSecondary }]}>Elige dónde quieres atenderte y consulta los horarios disponibles. La solicitud queda sujeta a revisión de la clínica.</Text>
            <OptionGroup title="Sucursal" options={branches} value={branchId} onChange={value => { setBranchId(value); setServiceId(''); setProviderId(''); }} palette={palette} />
            <OptionGroup title="Servicio" options={services} value={serviceId} onChange={value => { setServiceId(value); setProviderId(''); }} palette={palette} disabled={!branchId} />
            <OptionGroup title="Profesional" options={providers} value={providerId} onChange={setProviderId} palette={palette} disabled={!serviceId} />
            <View style={styles.dateSection}><Text style={[styles.label, { color: palette.text }]}>Fecha</Text><View style={[styles.datePicker, { backgroundColor: palette.background, borderColor: palette.line }]}><Pressable accessibilityRole="button" accessibilityLabel="Día anterior" disabled={!catalog || date <= catalog.today} onPress={() => changeDate(-1)} style={styles.dateArrow}><Text style={[styles.arrowText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.dateCopy}><Text style={[styles.dateLabel, { color: palette.text }]}>{formatDate(date)}</Text><Text style={[styles.dateIso, { color: palette.textSecondary }]}>{date}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" disabled={!catalog || date >= catalog.lastDate} onPress={() => changeDate(1)} style={styles.dateArrow}><Text style={[styles.arrowText, { color: palette.primary }]}>›</Text></Pressable></View></View>
            {offer ? <View style={[styles.summary, { backgroundColor: palette.primarySoft }]}><Text style={[styles.summaryLine, { color: palette.text }]}>◷  {offer.duration} minutos · {offer.branch}</Text><Text style={[styles.summaryLine, { color: palette.text }]}>Anticipo requerido: {currency.format(offer.deposit)} MXN</Text></View> : null}
            <View style={styles.slotSection}><Text style={[styles.label, { color: palette.text }]}>Horarios disponibles</Text>{slotsLoading ? <View style={styles.loadingRow}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Consultando horarios…</Text></View> : slotError ? <Text accessibilityRole="alert" style={[styles.copy, { color: palette.danger }]}>{slotError}</Text> : !offer ? <Text style={[styles.copy, { color: palette.textSecondary }]}>Selecciona una sucursal, servicio y profesional.</Text> : !slots.length ? <Text style={[styles.copy, { color: palette.textSecondary }]}>No hay horarios disponibles. Prueba otra fecha o profesional.</Text> : <View style={styles.slotGrid}>{slots.map(slot => <Pressable key={slot.starts_at} accessibilityRole="button" accessibilityState={{ selected: selectedStart === slot.starts_at }} onPress={() => setSelectedStart(slot.starts_at)} style={[styles.slot, { backgroundColor: selectedStart === slot.starts_at ? palette.primarySoft : palette.background, borderColor: selectedStart === slot.starts_at ? palette.primary : palette.line }]}><Text style={[styles.slotText, { color: selectedStart === slot.starts_at ? palette.primary : palette.text }]}>{formatTime(slot.starts_at, catalog.timezone)}</Text></Pressable>)}</View>}</View>
            <Text style={[styles.hint, { color: palette.textSecondary }]}>Horarios en {catalog.timezone}. Anticipación mínima: {catalog.minNotice} minutos. Puedes solicitar hasta {catalog.maxDays} días por adelantado.</Text>
            <View style={[styles.divider, { backgroundColor: palette.line }]} />
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Tus datos de contacto</Text>
            <Input label="Nombre completo" value={name} onChangeText={setName} placeholder="Tu nombre" autoComplete="name" maxLength={160} palette={palette} />
            <Input label="Teléfono internacional" value={phone} onChangeText={setPhone} placeholder="+526641234567" keyboardType="phone-pad" autoComplete="tel" maxLength={16} palette={palette} />
            <Input label={`Correo electrónico${catalog.requireEmail ? '' : ' (opcional)'}`} value={email} onChangeText={setEmail} placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} palette={palette} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(value => !value)} style={styles.consent}><View style={[styles.checkbox, { borderColor: consent ? palette.primary : palette.line, backgroundColor: consent ? palette.primary : palette.background }]}><Text style={styles.check}>{consent ? '✓' : ''}</Text></View><Text style={[styles.copy, styles.consentCopy, { color: palette.text }]}>Acepto que la clínica me contacte para atender esta solicitud.</Text></Pressable>
            {error ? <Text accessibilityRole="alert" style={[styles.copy, { color: palette.danger }]}>{error}</Text> : null}
            <View style={[styles.submitNote, { borderTopColor: palette.line }]}><Text style={[styles.hint, styles.disclaimer, { color: palette.textSecondary }]}>Enviar la solicitud no confirma la cita ni realiza un cobro. La clínica te indicará cómo registrar el anticipo.</Text><Pressable accessibilityRole="button" disabled={!canSubmit({ name, phone, email, requireEmail: catalog.requireEmail, consent, selectedStart, sending })} onPress={() => void submit()} style={[styles.submit, { backgroundColor: palette.primary, opacity: canSubmit({ name, phone, email, requireEmail: catalog.requireEmail, consent, selectedStart, sending }) ? 1 : 0.5 }]}>{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Enviar solicitud</Text>}</Pressable></View>
          </Panel>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function uniqueOptions(offers: PublicOffer[], idKey: 'branchId' | 'serviceId' | 'providerId', nameKey: 'branch' | 'service' | 'provider') {
  return [...new Map(offers.map(item => [item[idKey], { id: item[idKey], name: item[nameKey] }])).values()];
}
function addDays(value: string, amount: number) { const date = new Date(`${value}T12:00:00.000Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function formatDate(value: string) { if (!value) return '—'; return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00.000Z`)); }
function formatTime(value: string, timezone: string) { try { return new Intl.DateTimeFormat('es-MX', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return value.slice(11, 16); } }
function canSubmit(value: { name: string; phone: string; email: string; requireEmail: boolean; consent: boolean; selectedStart: string; sending: boolean }) { return !value.sending && Boolean(value.selectedStart && value.consent && value.name.trim().length >= 2 && /^\+[1-9][0-9]{7,14}$/.test(value.phone.trim()) && (!value.requireEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) && (!value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()))); }

function Panel({ children, palette }: { children: React.ReactNode; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={[styles.panel, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>{children}</View>; }
function Button({ label, onPress, palette }: { label: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.secondaryButton, { borderColor: palette.line, backgroundColor: palette.background }]}><Text style={[styles.secondaryText, { color: palette.primary }]}>{label}</Text></Pressable>; }
function OptionGroup({ title, options, value, onChange, palette, disabled = false }: { title: string; options: { id: string; name: string }[]; value: string; onChange: (value: string) => void; palette: (typeof Colors)[keyof typeof Colors]; disabled?: boolean }) {
  return <View style={[styles.optionGroup, { opacity: disabled ? 0.48 : 1 }]}><Text style={[styles.label, { color: palette.text }]}>{title}</Text>{options.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{options.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: value === option.id, disabled }} disabled={disabled} onPress={() => onChange(option.id)} style={[styles.chip, { backgroundColor: value === option.id ? palette.primarySoft : palette.background, borderColor: value === option.id ? palette.primary : palette.line }]}><Text numberOfLines={1} style={[styles.chipText, { color: value === option.id ? palette.primary : palette.text }]}>{option.name}</Text></Pressable>)}</ScrollView> : <Text style={[styles.copy, { color: palette.textSecondary }]}>{disabled ? `Primero selecciona ${title === 'Servicio' ? 'una sucursal' : 'un servicio'}.` : `No hay opciones de ${title.toLocaleLowerCase('es-MX')}.`}</Text>}</View>;
}
function Input({ label, value, onChangeText, placeholder, palette, keyboardType, autoCapitalize, autoComplete, maxLength }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; palette: (typeof Colors)[keyof typeof Colors]; keyboardType?: 'phone-pad' | 'email-address'; autoCapitalize?: 'none'; autoComplete: 'name' | 'tel' | 'email'; maxLength: number }) { return <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoComplete={autoComplete} maxLength={maxLength} style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} /></View>; }

const styles = StyleSheet.create({
  page: { flex: 1 }, flex: { flex: 1 }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, paddingBottom: 34, gap: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 }, brandMark: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, brandIcon: { fontSize: 22, fontWeight: '800' }, brandCopy: { flex: 1, gap: 2 }, brandName: { fontSize: 17, fontWeight: '800' }, copy: { fontSize: 13, lineHeight: 19 }, panel: { borderWidth: 1, borderRadius: 19, padding: 17, gap: 13 }, title: { fontSize: 23, lineHeight: 29, fontWeight: '800', letterSpacing: -0.35 }, description: { fontSize: 13, lineHeight: 20, marginTop: -5, marginBottom: 1 }, optionGroup: { gap: 7 }, label: { fontSize: 12, fontWeight: '700' }, chips: { gap: 7, paddingVertical: 2 }, chip: { minHeight: 39, maxWidth: 220, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, justifyContent: 'center' }, chipText: { fontSize: 12, fontWeight: '700' }, dateSection: { gap: 7 }, datePicker: { minHeight: 56, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dateArrow: { width: 48, height: 54, alignItems: 'center', justifyContent: 'center' }, arrowText: { fontSize: 29, lineHeight: 32, fontWeight: '600' }, dateCopy: { flex: 1, alignItems: 'center', gap: 2 }, dateLabel: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' }, dateIso: { fontSize: 11 }, summary: { borderRadius: 12, padding: 11, gap: 5 }, summaryLine: { fontSize: 12, fontWeight: '600' }, slotSection: { gap: 8 }, loadingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 }, slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, slot: { minHeight: 43, minWidth: '30%', flexGrow: 1, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, slotText: { fontSize: 13, fontWeight: '700' }, hint: { fontSize: 11, lineHeight: 16 }, divider: { height: StyleSheet.hairlineWidth, marginVertical: 1 }, sectionTitle: { fontSize: 16, fontWeight: '800' }, inputGroup: { gap: 6 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 3 }, checkbox: { width: 20, height: 20, borderWidth: 1, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, check: { color: '#fff', fontSize: 13, fontWeight: '800' }, consentCopy: { flex: 1 }, submitNote: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, gap: 10 }, disclaimer: { flex: 1 }, submit: { minHeight: 47, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 }, submitText: { color: '#fff', fontSize: 14, fontWeight: '800' }, receiptIcon: { fontSize: 30, fontWeight: '800' }, receiptWarning: { fontSize: 13, fontWeight: '700', lineHeight: 19 }, reference: { fontSize: 11, lineHeight: 16 }, secondaryButton: { minHeight: 43, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, secondaryText: { fontSize: 13, fontWeight: '700' },
});

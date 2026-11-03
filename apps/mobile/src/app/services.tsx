import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useCrmRouter } from '@/lib/use-crm-router';
import { loadClinicServiceWorkspace, saveClinicService, seedClinicServices, serviceCategories, serviceSetupState, type ClinicService, type ClinicServiceWorkspace } from '@/lib/crm-data';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';

type Palette = (typeof Colors)[keyof typeof Colors];
const emptyService = (): ClinicService => ({ code: '', category: serviceCategories[0], name: '', description: '', durationMin: null, durationMax: null, offers: [], variants: [], notes: '', source: 'Capturado por la clínica', status: 'setup_needed', active: true, branchIds: [], providerIds: [] });

export default function ServicesScreen() {
  const router = useCrmRouter();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [data, setData] = useState<ClinicServiceWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [lifecycle, setLifecycle] = useState('Activos');
  const [branchFilter, setBranchFilter] = useState('Todas');
  const [editing, setEditing] = useState<ClinicService | null>(null);

  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try { setData(await loadClinicServiceWorkspace(clinic)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => (data?.services || []).filter(service => {
    const text = `${service.name} ${service.category} ${service.code} ${service.notes}`.toLocaleLowerCase('es-MX');
    const setup = serviceSetupState(service);
    return (!query || text.includes(query.toLocaleLowerCase('es-MX')))
      && (category === 'Todas' || service.category === category)
      && (branchFilter === 'Todas' || !service.branchIds.length || service.branchIds.includes(branchFilter))
      && (lifecycle === 'Todos' || lifecycle === 'Activos' && service.active !== false || lifecycle === 'Inactivos' && service.active === false || lifecycle === 'Listos para agenda' && service.active !== false && setup === 'ready' || lifecycle === 'Pendientes de configuración' && service.active !== false && setup !== 'ready');
  }), [data, query, category, lifecycle, branchFilter]);

  const persist = async (service: ClinicService) => {
    if (!clinic || saving) return;
    setSaving(true); setError('');
    try {
      const saved = await saveClinicService(clinic, service);
      setData(current => current ? { ...current, services: current.services.some(item => item.id === saved.id) ? current.services.map(item => item.id === saved.id ? saved as ClinicService : item) : [...current.services, saved as ClinicService] } : current);
      setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el servicio.'); }
    finally { setSaving(false); }
  };

  const importInitial = async () => {
    if (!clinic || saving) return;
    setSaving(true); setError('');
    try { await seedClinicServices(clinic); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo importar la lista.'); }
    finally { setSaving(false); }
  };

  if (authLoading || session && workspaceLoading) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'services.manage')) return <Redirect href="/(tabs)/more" />;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Servicios</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic.name} · catálogo y disponibilidad</Text></View><Pressable accessibilityRole="button" onPress={() => setEditing(emptyService())} style={[styles.addButton, { backgroundColor: palette.primary }]}><Text style={styles.addButtonText}>＋ Nuevo</Text></Pressable></View>
    <TextInput accessibilityLabel="Buscar servicios" value={query} onChangeText={setQuery} placeholder="Buscar servicio, categoría o nota" placeholderTextColor={palette.textSecondary} style={[styles.search, { backgroundColor: palette.backgroundElement, borderColor: palette.line, color: palette.text }]} />
    <Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Categoría</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{['Todas', ...serviceCategories].map(item => <Chip key={item} label={item} selected={category === item} onPress={() => setCategory(item)} palette={palette} />)}</ScrollView>
    <Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Estado</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{['Activos', 'Todos', 'Listos para agenda', 'Pendientes de configuración', 'Inactivos'].map(item => <Chip key={item} label={item} selected={lifecycle === item} onPress={() => setLifecycle(item)} palette={palette} />)}</ScrollView>
    {data?.branches.length ? <><Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Sucursal</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Chip label="Todas" selected={branchFilter === 'Todas'} onPress={() => setBranchFilter('Todas')} palette={palette} />{data.branches.map(item => <Chip key={item.id} label={item.name} selected={branchFilter === item.id} onPress={() => setBranchFilter(item.id)} palette={palette} />)}</ScrollView></> : null}
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
    {editing ? <ServiceEditor service={editing} workspace={data} palette={palette} saving={saving} onCancel={() => setEditing(null)} onSave={service => void persist(service)} /> : null}
    {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando catálogo…</Text></View> : <>
      {!data?.services.length ? <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Prepara el catálogo de la clínica</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Importa la lista inicial para revisar los servicios y completar los datos pendientes.</Text><Pressable accessibilityRole="button" disabled={saving} onPress={() => void importInitial()} style={[styles.submit, { backgroundColor: palette.primary, opacity: saving ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Importar lista inicial</Text>}</Pressable></View> : null}
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{filtered.length} {filtered.length === 1 ? 'servicio' : 'servicios'}</Text>
      {filtered.map(service => <ServiceCard key={service.id || service.code} service={service} workspace={data!} palette={palette} onEdit={() => setEditing(service)} onToggle={() => void persist({ ...service, active: service.active === false })} saving={saving} />)}
      {!filtered.length && data?.services.length ? <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Sin resultados</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Prueba otro texto o filtro.</Text></View> : null}
    </>}
  </ScrollView></SafeAreaView>;
}

function ServiceCard({ service, workspace, palette, onEdit, onToggle, saving }: { service: ClinicService; workspace: ClinicServiceWorkspace; palette: Palette; onEdit: () => void; onToggle: () => void; saving: boolean }) {
  const branches = service.branchIds.length ? service.branchIds.map(id => workspace.branches.find(branch => branch.id === id)?.name).filter(Boolean).join(', ') : 'Todas las sucursales';
  const providers = service.providerIds.length ? `${service.providerIds.length} profesionales` : 'Todos los profesionales elegibles';
  const duration = service.durationMin ? `${service.durationMin}${service.durationMax && service.durationMax !== service.durationMin ? `–${service.durationMax}` : ''} min` : 'Duración por definir';
  const price = service.offers.length ? service.offers.map(item => {
    const currency = item.currency === 'USD' ? 'USD' : item.currency === 'MXN' ? 'MXN' : 'Moneda por confirmar';
    const amount = item.amount == null ? 'Por cotizar' : `${currency} ${Number(item.amount).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
    return `${item.kind === 'package' ? 'Paquete' : 'Sesión'}: ${amount}${item.sessions ? ` · ${item.sessions} sesiones` : item.kind === 'package' ? ' · sesiones por definir' : ''}`;
  }).join('  ·  ') : 'Precio por definir';
  const state = service.active === false ? 'Inactivo' : serviceSetupState(service) === 'ready' ? 'Listo para agendar' : 'Datos pendientes';
  return <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><View style={styles.cardTop}><View style={styles.cardHeading}><Text style={[styles.cardTitle, { color: palette.text }]}>{service.name}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{service.category} · {duration}</Text></View><Text style={[styles.badge, { color: service.active === false ? palette.danger : serviceSetupState(service) === 'ready' ? palette.primary : palette.textSecondary, backgroundColor: palette.background }]}>{state}</Text></View>
    <Text style={[styles.copy, { color: palette.text }]}>{price}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{branches} · {providers}</Text>
    {service.variants.length ? <Text style={[styles.copy, { color: palette.textSecondary }]}>Opciones: {service.variants.join(', ')}</Text> : null}{service.notes ? <Text style={[styles.copy, { color: palette.textSecondary }]}>{service.notes}</Text> : null}
    <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={onEdit} style={[styles.secondaryButton, { borderColor: palette.line }]}><Text style={[styles.secondaryText, { color: palette.primary }]}>Editar</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={onToggle} style={[styles.secondaryButton, { borderColor: palette.line }]}><Text style={[styles.secondaryText, { color: palette.textSecondary }]}>{service.active === false ? 'Reactivar' : 'Archivar'}</Text></Pressable></View>
  </View>;
}

function ServiceEditor({ service, workspace, palette, saving, onCancel, onSave }: { service: ClinicService; workspace: ClinicServiceWorkspace | null; palette: Palette; saving: boolean; onCancel: () => void; onSave: (service: ClinicService) => void }) {
  const [record, setRecord] = useState<ClinicService>({ ...service, offers: [...service.offers], variants: [...service.variants], branchIds: [...service.branchIds], providerIds: [...service.providerIds] });
  const [singleAmount, setSingleAmount] = useState(String(service.offers.find(item => item.kind === 'single')?.amount ?? ''));
  const [singleCurrency, setSingleCurrency] = useState(service.offers.find(item => item.kind === 'single')?.currency || 'MXN');
  const [packAmount, setPackAmount] = useState(String(service.offers.find(item => item.kind === 'package')?.amount ?? ''));
  const [packCurrency, setPackCurrency] = useState(service.offers.find(item => item.kind === 'package')?.currency || 'MXN');
  const [packSessions, setPackSessions] = useState(String(service.offers.find(item => item.kind === 'package')?.sessions ?? ''));
  const set = <K extends keyof ClinicService>(key: K, value: ClinicService[K]) => setRecord(current => ({ ...current, [key]: value }));
  const save = () => onSave({ ...record, offers: [
    ...(singleAmount ? [{ kind: 'single' as const, amount: singleAmount, currency: singleCurrency }] : []),
    ...(packAmount ? [{ kind: 'package' as const, amount: packAmount, currency: packCurrency, sessions: packSessions ? Number(packSessions) : null }] : []),
  ] });
  const allProviders = workspace?.providers || [];
  const eligibleProviders = allProviders.filter(provider => !record.branchIds.length || record.branchIds.some(id => provider.branchIds.includes(id)));
  return <View style={[styles.editor, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
    <View style={styles.cardTop}><Text style={[styles.sectionTitle, { color: palette.text }]}>{service.id ? 'Editar servicio' : 'Nuevo servicio'}</Text><Pressable accessibilityRole="button" onPress={onCancel}><Text style={[styles.secondaryText, { color: palette.primary }]}>Cerrar</Text></Pressable></View>
    <Field label="Nombre" value={record.name} onChangeText={value => set('name', value)} palette={palette} placeholder="Nombre del servicio" />
    <Text style={[styles.filterLabel, { color: palette.text }]}>Categoría</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{serviceCategories.map(item => <Chip key={item} label={item} selected={record.category === item} onPress={() => set('category', item)} palette={palette} />)}</ScrollView>
    <View style={styles.row}><Field label="Duración mínima · min" value={String(record.durationMin ?? '')} onChangeText={value => set('durationMin', value ? Number(value) : null)} palette={palette} placeholder="Por definir" keyboardType="number-pad" /><Field label="Máxima · min" value={String(record.durationMax ?? '')} onChangeText={value => set('durationMax', value ? Number(value) : null)} palette={palette} placeholder="Igual a mínima" keyboardType="number-pad" /></View>
    <Field label="Descripción" value={record.description || ''} onChangeText={value => set('description', value)} palette={palette} placeholder="Opcional" />
    <View style={styles.row}><PriceField label="Sesión individual" amount={singleAmount} setAmount={setSingleAmount} currency={singleCurrency} setCurrency={setSingleCurrency} palette={palette} /><PriceField label="Paquete" amount={packAmount} setAmount={setPackAmount} currency={packCurrency} setCurrency={setPackCurrency} palette={palette} /></View>
    {!!packAmount && <Field label="Sesiones por paquete" value={packSessions} onChangeText={setPackSessions} palette={palette} placeholder="Por definir" keyboardType="number-pad" />}
    <Text style={[styles.filterLabel, { color: palette.text }]}>Sucursales · vacío significa todas</Text><View style={styles.wrapChips}>{(workspace?.branches || []).map(branch => <Chip key={branch.id} label={branch.name} selected={record.branchIds.includes(branch.id)} onPress={() => { const branchIds = record.branchIds.includes(branch.id) ? record.branchIds.filter(id => id !== branch.id) : [...record.branchIds, branch.id]; set('branchIds', branchIds); if (branchIds.length) set('providerIds', record.providerIds.filter(id => allProviders.some(provider => provider.id === id && provider.branchIds.some(branchId => branchIds.includes(branchId))))); }} palette={palette} />)}</View>
    <Text style={[styles.filterLabel, { color: palette.text }]}>Profesionales · vacío significa todos</Text><View style={styles.wrapChips}>{eligibleProviders.map(provider => <Chip key={provider.id} label={provider.name} selected={record.providerIds.includes(provider.id)} onPress={() => set('providerIds', record.providerIds.includes(provider.id) ? record.providerIds.filter(id => id !== provider.id) : [...record.providerIds, provider.id])} palette={palette} />)}</View>
    <Field label="Variantes y opciones · separadas por comas" value={record.variants.join(', ')} onChangeText={value => set('variants', value.split(',').map(item => item.trim()).filter(Boolean))} palette={palette} placeholder="Zona, producto, unidades" />
    <Field label="Notas de configuración" value={record.notes} onChangeText={value => set('notes', value)} palette={palette} placeholder="Datos pendientes o notas de origen" multiline />
    <Text style={[styles.copy, { color: palette.textSecondary }]}>Las monedas se guardan por separado. Los paquetes no se convierten en precio por sesión.</Text>
    <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={onCancel} style={[styles.secondaryButton, { borderColor: palette.line }]}><Text style={[styles.secondaryText, { color: palette.textSecondary }]}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={save} style={[styles.submit, styles.saveButton, { backgroundColor: palette.primary, opacity: saving ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Guardar servicio</Text>}</Pressable></View>
  </View>;
}

function PriceField({ label, amount, setAmount, currency, setCurrency, palette }: { label: string; amount: string; setAmount: (value: string) => void; currency: string; setCurrency: (value: string) => void; palette: Palette }) { return <View style={styles.priceField}><Text style={[styles.filterLabel, { color: palette.text }]}>{label}</Text><Field label="Precio" value={amount} onChangeText={setAmount} palette={palette} placeholder="Por cotizar" keyboardType="decimal-pad" /><View style={styles.row}>{['MXN', 'USD', 'UNRESOLVED'].map(item => <Chip key={item} label={item === 'UNRESOLVED' ? 'Confirmar' : item} selected={currency === item} onPress={() => setCurrency(item)} palette={palette} />)}</View></View>; }
function Field({ label, value, onChangeText, palette, placeholder, keyboardType, multiline }: { label: string; value: string; onChangeText: (value: string) => void; palette: Palette; placeholder: string; keyboardType?: 'number-pad' | 'decimal-pad'; multiline?: boolean }) { return <View style={styles.field}><Text style={[styles.filterLabel, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline && styles.multiline, { backgroundColor: palette.background, borderColor: palette.line, color: palette.text }]} /></View>; }
function Chip({ label, selected, onPress, palette }: { label: string; selected: boolean; onPress: () => void; palette: Palette }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? palette.primarySoft : palette.backgroundElement, borderColor: selected ? palette.primary : palette.line }]}><Text style={{ color: selected ? palette.primary : palette.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 19, paddingBottom: 40, gap: 11 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }, back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 33 }, heading: { flex: 1 }, title: { fontSize: 27, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { fontSize: 12, marginTop: 3 }, addButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' }, addButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, search: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 14 }, filterLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 }, chips: { flexDirection: 'row', gap: 7, paddingVertical: 2 }, wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, card: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 9 }, cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, cardHeading: { flex: 1, gap: 3 }, cardTitle: { fontSize: 15, fontWeight: '700' }, badge: { borderRadius: 20, overflow: 'hidden', fontSize: 10, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 5 }, copy: { fontSize: 12, lineHeight: 18 }, cardActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 3 }, secondaryButton: { minHeight: 39, paddingHorizontal: 13, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, secondaryText: { fontSize: 12, fontWeight: '700' }, sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 6 }, editor: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }, field: { flex: 1, gap: 5 }, input: { minHeight: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 13 }, multiline: { minHeight: 76, paddingTop: 10 }, row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, priceField: { flex: 1, gap: 6 }, submit: { minHeight: 43, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 }, saveButton: { minWidth: 145 }, submitText: { color: '#fff', fontSize: 13, fontWeight: '700' }, error: { fontSize: 13, lineHeight: 19 }, center: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 }, empty: { borderWidth: 1, borderRadius: 15, padding: 15, gap: 9 } });

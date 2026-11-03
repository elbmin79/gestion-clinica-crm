import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useCrmRouter } from '@/lib/use-crm-router';
import { createClinicAvailabilityBlock, deleteClinicAvailabilityBlock, loadClinicAvailability, saveClinicProviderOverlaps, type AvailabilityBlock, type ClinicAvailabilityWorkspace } from '@/lib/crm-data';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { datePartsInZone } from '@elixir-clinic/crm-core/clinic-time';
import { hasClinicPermission, normalizeClinicPermissions } from '@elixir-clinic/crm-core/permissions';

type Palette = (typeof Colors)[keyof typeof Colors];
type BlockScope = 'clinic' | 'branch' | 'provider';
type BlockForm = { title: string; startDate: string; startTime: string; endDate: string; endTime: string; branchId: string; providerId: string };
const blankForm = (today: string): BlockForm => ({ title: '', startDate: today, startTime: '09:00', endDate: today, endTime: '10:00', branchId: '', providerId: '' });

export default function AvailabilityScreen() {
  const router = useCrmRouter();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const today = useMemo(() => clinic ? datePartsInZone(new Date(), clinic.timeZone) : new Date().toISOString().slice(0, 10), [clinic]);
  const permissionScope = clinic ? normalizeClinicPermissions(clinic.permissions, clinic.role)['availability.scope'] : 'self';
  const canManageClinic = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_clinic'));
  const canManageBranch = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_branch'));
  const canManageSelf = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'availability.manage_self'));
  const [data, setData] = useState<ClinicAvailabilityWorkspace | null>(null);
  const [form, setForm] = useState<BlockForm>(() => blankForm(today));
  const [scope, setScope] = useState<BlockScope>('clinic');
  const selectedScope: BlockScope = permissionScope === 'clinic' ? scope : permissionScope === 'branch' ? 'branch' : 'provider';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try { setData(await loadClinicAvailability(clinic)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la disponibilidad.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { setForm(blankForm(today)); }, [today]);
  useEffect(() => { void refresh(); }, [refresh]);

  const currentProvider = data?.providers.find(item => item.active && item.userId === session?.user.id);
  const canCreateBlocks = canManageClinic || canManageBranch || canManageSelf;
  const canDelete = (block: AvailabilityBlock) => canManageClinic
    || permissionScope === 'branch' && block.scope === 'branch' && canManageBranch
    || permissionScope === 'self' && block.scope === 'provider' && block.provider_id === currentProvider?.id && canManageSelf;
  const providersForScope = data?.providers.filter(item => item.active) || [];
  const visibleBlocks = useMemo(() => (data?.blocks || []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [data]);

  const saveOverlaps = async (value: boolean) => {
    if (!clinic || !data || saving) return;
    setSaving(true); setError('');
    try { await saveClinicProviderOverlaps(clinic, value); setData(current => current ? { ...current, allowProviderOverlaps: value } : current); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la regla de citas simultáneas.'); }
    finally { setSaving(false); }
  };

  const addBlock = async () => {
    if (!clinic || !session || saving) return;
    setSaving(true); setError('');
    try {
      const created = await createClinicAvailabilityBlock(clinic, session.user.id, { ...form, scope: selectedScope, providerId: selectedScope === 'provider' && permissionScope === 'self' ? currentProvider?.id : form.providerId });
      setData(current => current ? { ...current, blocks: [...current.blocks, created as AvailabilityBlock] } : current);
      setForm(blankForm(today));
      if (permissionScope === 'clinic') setScope('clinic');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo bloquear ese horario.'); }
    finally { setSaving(false); }
  };

  const removeBlock = async (block: AvailabilityBlock) => {
    if (!clinic || !session || !canDelete(block) || saving) return;
    setSaving(true); setError('');
    try {
      await deleteClinicAvailabilityBlock(clinic, block, session.user.id);
      setData(current => current ? { ...current, blocks: current.blocks.filter(item => item.id !== block.id) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el bloqueo.'); }
    finally { setSaving(false); }
  };

  if (authLoading || session && workspaceLoading) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!canCreateBlocks) return <Redirect href="/(tabs)/more" />;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Disponibilidad</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic.name} · zona horaria {clinic.timeZone}</Text></View><Pressable accessibilityRole="button" onPress={() => void refresh()} style={[styles.refresh, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.refreshText, { color: palette.primary }]}>Actualizar</Text></Pressable></View>
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
    {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando disponibilidad…</Text></View> : <>
      {canManageClinic && data ? <View style={[styles.ruleCard, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><View style={styles.ruleText}><Text style={[styles.cardTitle, { color: palette.text }]}>Permitir citas simultáneas</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Permite que un profesional atienda citas traslapadas. Los conflictos de horario del mismo paciente siguen bloqueados.</Text><Text style={[styles.ruleState, { color: data.allowProviderOverlaps ? palette.primary : palette.textSecondary }]}>{data.allowProviderOverlaps ? 'Activadas' : 'Desactivadas'}</Text></View><Switch accessibilityLabel="Permitir citas simultáneas del mismo profesional" value={data.allowProviderOverlaps} disabled={saving} onValueChange={value => void saveOverlaps(value)} trackColor={{ false: palette.line, true: palette.primarySoft }} thumbColor={data.allowProviderOverlaps ? palette.primary : palette.textSecondary} /></View> : null}
      {canCreateBlocks ? <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.cardTitle, { color: palette.text }]}>Bloquear un horario</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Las citas nuevas y las citas reprogramadas respetarán este bloqueo.</Text>
        {permissionScope === 'self' && !currentProvider ? <Text style={[styles.error, { color: palette.danger }]}>Tu cuenta aún no está vinculada a un perfil profesional activo.</Text> : <>
          {permissionScope === 'clinic' ? <><Text style={[styles.label, { color: palette.text }]}>Aplicar a</Text><View style={styles.row}><Chip label="Toda la clínica" selected={scope === 'clinic'} onPress={() => setScope('clinic')} palette={palette} /><Chip label="Una sucursal" selected={scope === 'branch'} onPress={() => setScope('branch')} palette={palette} /><Chip label="Un profesional" selected={scope === 'provider'} onPress={() => setScope('provider')} palette={palette} /></View></> : null}
          {selectedScope === 'branch' ? <><Text style={[styles.label, { color: palette.text }]}>Sucursal</Text>{data?.branches.length ? <View style={styles.wrap}>{data.branches.map(item => <Chip key={item.id} label={item.name} selected={form.branchId === item.id} onPress={() => setForm(current => ({ ...current, branchId: item.id }))} palette={palette} />)}</View> : <Text style={[styles.copy, { color: palette.textSecondary }]}>No hay sucursales activas disponibles.</Text>}</> : null}
          {selectedScope === 'provider' && permissionScope === 'clinic' ? <><Text style={[styles.label, { color: palette.text }]}>Profesional</Text><View style={styles.wrap}>{providersForScope.map(item => <Chip key={item.id} label={item.name} selected={form.providerId === item.id} onPress={() => setForm(current => ({ ...current, providerId: item.id }))} palette={palette} />)}</View></> : null}
          <Field label="Motivo" value={form.title} onChangeText={value => setForm(current => ({ ...current, title: value.slice(0, 100) }))} placeholder="Ej. Vacaciones, comida, capacitación" palette={palette} />
          <View style={styles.row}><Field label="Desde · fecha AAAA-MM-DD" value={form.startDate} onChangeText={value => setForm(current => ({ ...current, startDate: value, endDate: current.endDate < value ? value : current.endDate }))} placeholder={today} palette={palette} /><Field label="Hora 24 h" value={form.startTime} onChangeText={value => setForm(current => ({ ...current, startTime: value }))} placeholder="09:00" palette={palette} keyboardType="numbers-and-punctuation" /></View>
          <View style={styles.row}><Field label="Hasta · fecha AAAA-MM-DD" value={form.endDate} onChangeText={value => setForm(current => ({ ...current, endDate: value }))} placeholder={today} palette={palette} /><Field label="Hora 24 h" value={form.endTime} onChangeText={value => setForm(current => ({ ...current, endTime: value }))} placeholder="10:00" palette={palette} keyboardType="numbers-and-punctuation" /></View>
          <Pressable accessibilityRole="button" disabled={saving || !form.title.trim() || selectedScope === 'branch' && !form.branchId || selectedScope === 'provider' && permissionScope === 'clinic' && !form.providerId} onPress={() => void addBlock()} style={[styles.submit, { backgroundColor: palette.primary, opacity: saving ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>＋ Bloquear horario</Text>}</Pressable>
        </>}
      </View> : null}
      <View style={styles.listHeading}><Text style={[styles.sectionTitle, { color: palette.text }]}>Horarios bloqueados</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{visibleBlocks.length ? `${visibleBlocks.length} ${visibleBlocks.length === 1 ? 'bloqueo' : 'bloqueos'} guardados` : 'No hay horarios bloqueados.'}</Text></View>
      {visibleBlocks.map(block => <BlockCard key={block.id} block={block} workspace={data!} timeZone={clinic.timeZone} palette={palette} canDelete={canDelete(block)} saving={saving} onDelete={() => void removeBlock(block)} />)}
      {!visibleBlocks.length ? <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.copy, { color: palette.textSecondary }]}>No hay bloqueos activos; la agenda usa las reglas normales de citas.</Text></View> : null}
    </>}
  </ScrollView></SafeAreaView>;
}

function BlockCard({ block, workspace, timeZone, palette, canDelete, saving, onDelete }: { block: AvailabilityBlock; workspace: ClinicAvailabilityWorkspace; timeZone: string; palette: Palette; canDelete: boolean; saving: boolean; onDelete: () => void }) {
  const dateFmt = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('es-MX', { timeZone, hour: '2-digit', minute: '2-digit' });
  const start = new Date(block.starts_at), end = new Date(block.ends_at);
  const sameDay = dateFmt.format(start) === dateFmt.format(end);
  const range = `${dateFmt.format(start)} · ${timeFmt.format(start)}–${sameDay ? timeFmt.format(end) : `${dateFmt.format(end)} · ${timeFmt.format(end)}`}`;
  const target = block.scope === 'clinic' ? 'Toda la clínica' : block.scope === 'branch' ? `Sucursal · ${workspace.branches.find(item => item.id === block.branch_id)?.name || 'Sucursal'}` : `Profesional · ${workspace.providers.find(item => item.id === block.provider_id)?.name || 'Profesional'}`;
  return <View style={[styles.block, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><View style={[styles.blockMarker, { backgroundColor: palette.primary }]} /><View style={styles.blockMain}><Text style={[styles.cardTitle, { color: palette.text }]}>{block.title}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{range}</Text><Text style={[styles.target, { color: palette.textSecondary }]}>{target}</Text></View>{canDelete ? <Pressable accessibilityRole="button" accessibilityLabel={`Eliminar bloqueo ${block.title}`} disabled={saving} onPress={onDelete} style={[styles.deleteButton, { borderColor: palette.line }]}><Text style={[styles.deleteText, { color: palette.danger }]}>Eliminar</Text></Pressable> : null}</View>;
}

function Field({ label, value, onChangeText, placeholder, palette, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; palette: Palette; keyboardType?: 'numbers-and-punctuation' }) { return <View style={styles.field}><Text style={[styles.label, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} autoCapitalize="none" style={[styles.input, { backgroundColor: palette.background, borderColor: palette.line, color: palette.text }]} /></View>; }
function Chip({ label, selected, onPress, palette }: { label: string; selected: boolean; onPress: () => void; palette: Palette }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? palette.primarySoft : palette.background, borderColor: selected ? palette.primary : palette.line }]}><Text style={{ color: selected ? palette.primary : palette.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 19, paddingBottom: 36, gap: 13 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }, back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 33 }, heading: { flex: 1 }, title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 }, subtitle: { fontSize: 12, marginTop: 3 }, refresh: { minHeight: 39, paddingHorizontal: 11, borderWidth: 1, borderRadius: 10, justifyContent: 'center' }, refreshText: { fontSize: 12, fontWeight: '700' }, card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }, ruleCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, ruleText: { flex: 1, gap: 6 }, cardTitle: { fontSize: 15, fontWeight: '700' }, copy: { fontSize: 12, lineHeight: 18 }, ruleState: { fontSize: 11, fontWeight: '700' }, label: { fontSize: 12, fontWeight: '700', marginBottom: -4 }, row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, field: { flex: 1, gap: 6 }, input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 13 }, chip: { minHeight: 38, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, submit: { minHeight: 45, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 3 }, submitText: { color: '#fff', fontSize: 13, fontWeight: '700' }, sectionTitle: { fontSize: 18, fontWeight: '700' }, listHeading: { gap: 3, marginTop: 3 }, block: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, blockMarker: { width: 4, alignSelf: 'stretch', borderRadius: 4 }, blockMain: { flex: 1, gap: 4 }, target: { fontSize: 11, fontWeight: '600' }, deleteButton: { minHeight: 37, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, deleteText: { fontSize: 11, fontWeight: '700' }, empty: { borderWidth: 1, borderRadius: 14, padding: 15 }, error: { fontSize: 13, lineHeight: 19 }, center: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 9 } });

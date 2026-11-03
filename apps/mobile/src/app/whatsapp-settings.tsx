import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CrmText as Text } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useCrmRouter } from '@/lib/use-crm-router';
import { loadWhatsAppSettings, saveWhatsAppSettings, type WhatsAppSender, type WhatsAppSettings } from '@/lib/whatsapp-settings-api';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';

const defaults: WhatsAppSettings = { notifyWhatsAppMessages: true, notifyWhatsAppConfirmations: true, providerMode: 'twilio' };
const snapshot = (settings: WhatsAppSettings, senders: WhatsAppSender[]) => JSON.stringify({
  settings: { notifyWhatsAppMessages: settings.notifyWhatsAppMessages, notifyWhatsAppConfirmations: settings.notifyWhatsAppConfirmations },
  senders: senders.map(sender => ({ whatsappNumber: sender.whatsappNumber, active: sender.active, branchIds: [...sender.branchIds].sort() })).sort((a, b) => a.whatsappNumber.localeCompare(b.whatsappNumber)),
});

export default function WhatsAppSettingsScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme()];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const [settings, setSettings] = useState(defaults);
  const [senders, setSenders] = useState<WhatsAppSender[]>([]);
  const [available, setAvailable] = useState<{ phoneNumber: string; displayLabel: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [inboxSender, setInboxSender] = useState('');
  const [senderLookupError, setSenderLookupError] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try {
      const workspace = await loadWhatsAppSettings(clinic.clinicId);
      const persisted = workspace.settings.senders;
      const existing = new Set(persisted.map(sender => sender.whatsappNumber));
      const nextSenders = [...persisted, ...workspace.availableSenders.filter(sender => !existing.has(sender.phoneNumber)).map(sender => ({
        senderKey: `available:${sender.phoneNumber}`, whatsappNumber: sender.phoneNumber,
        displayLabel: sender.displayLabel || sender.phoneNumber, branchIds: [], active: true,
      }))];
      setSettings(workspace.settings.settings);
      setSenders(nextSenders);
      setAvailable(workspace.availableSenders);
      setBranches(workspace.branches);
      setCanManage(workspace.canManage);
      setInboxSender(workspace.inboxSender?.phoneNumber || '');
      setSenderLookupError(workspace.senderLookupError);
      setSavedSnapshot(snapshot(workspace.settings.settings, nextSenders));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la configuración de WhatsApp.'); }
    finally { setLoading(false); }
  }, [clinic]);
  useEffect(() => { void refresh(); }, [refresh]);

  const currentSnapshot = useMemo(() => snapshot(settings, senders), [settings, senders]);
  const dirty = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const setBranch = (senderKey: string, branchId: string, checked: boolean) => setSenders(current => current.map(sender => {
    if (sender.senderKey !== senderKey) return sender;
    const branchIds = checked ? [...sender.branchIds, branchId] : sender.branchIds.filter(id => id !== branchId);
    return { ...sender, branchIds };
  }));
  const removeSender = (senderKey: string) => setSenders(current => current.filter(sender => sender.senderKey !== senderKey));

  const save = async () => {
    if (!clinic || !canManage || !dirty || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await saveWhatsAppSettings(clinic.clinicId, settings, senders);
      setSettings(result.settings);
      setSenders(result.senders);
      setSavedSnapshot(snapshot(result.settings, result.senders));
      setNotice(result.message || 'Configuración guardada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración.'); }
    finally { setSaving(false); }
  };

  const back = () => {
    if (!dirty) { router.back(); return; }
    Alert.alert('Cambios sin guardar', '¿Quieres descartar los cambios de WhatsApp?', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  if (authLoading || workspaceLoading) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'whatsapp.view')) return <Redirect href="/(tabs)/more" />;

  const connectedCount = new Set([inboxSender, ...available.map(sender => sender.phoneNumber)].filter(Boolean)).size;
  const readyCount = senders.filter(sender => sender.active && available.some(item => item.phoneNumber === sender.whatsappNumber) && sender.branchIds.length > 0).length;

  return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Pressable accessibilityRole="button" onPress={back} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>WhatsApp</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic.name} · Números y avisos</Text></View><Pressable accessibilityRole="button" disabled={!dirty || saving || !canManage} onPress={() => void save()} style={[styles.saveButton, { backgroundColor: palette.primary, opacity: !dirty || saving || !canManage ? 0.48 : 1 }]}><Text style={styles.saveButtonText}>{saving ? 'Guardando…' : 'Guardar'}</Text></Pressable></View>
      {error ? <Feedback text={error} color={palette.danger} palette={palette} /> : null}
      {notice ? <Feedback text={notice} color={palette.primary} palette={palette} /> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando configuración…</Text></View> : <>
        <View style={styles.metrics}>
          <Metric label="Bandeja" value={inboxSender || available.length ? 'Conectada' : 'No conectada'} palette={palette} />
          <Metric label="Números" value={String(connectedCount)} palette={palette} />
          <Metric label="Asignados" value={`${readyCount} de ${available.length}`} palette={palette} />
        </View>
        {!canManage ? <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.rowTitle, { color: palette.text }]}>Solo lectura</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Puedes consultar la configuración; solicita a una persona con permisos que la cambie.</Text></View> : <>
          <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Números de WhatsApp</Text>
            <Text style={[styles.copy, { color: palette.textSecondary }]}>Asigna cada número a las sucursales que lo utilizan. Una sucursal puede tener un solo número.</Text>
            {senderLookupError ? <Feedback text={senderLookupError} color={palette.danger} palette={palette} /> : null}
            {senders.length ? senders.map(sender => {
              const isAvailable = available.some(item => item.phoneNumber === sender.whatsappNumber);
              return <View key={sender.senderKey} style={[styles.senderCard, { borderColor: palette.line, backgroundColor: palette.background }]}>
                <View style={styles.senderHeader}><View style={styles.senderCopy}><Text style={[styles.rowTitle, { color: palette.text }]}>{sender.displayLabel}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{sender.whatsappNumber}{isAvailable ? '' : ' · Ya no disponible'}</Text></View>{!isAvailable ? <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${sender.whatsappNumber}`} onPress={() => removeSender(sender.senderKey)} style={styles.remove}><Text style={[styles.removeText, { color: palette.danger }]}>Quitar</Text></Pressable> : null}</View>
                <Text style={[styles.branchHeading, { color: palette.textSecondary }]}>Sucursales asignadas</Text>
                {branches.map(branch => {
                  const checked = sender.branchIds.includes(branch.id);
                  const assignedElsewhere = senders.some(other => other.senderKey !== sender.senderKey && other.branchIds.includes(branch.id));
                  return <Pressable key={branch.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: assignedElsewhere && !checked }} disabled={assignedElsewhere && !checked} onPress={() => setBranch(sender.senderKey, branch.id, !checked)} style={[styles.branchRow, { borderTopColor: palette.line, opacity: assignedElsewhere && !checked ? 0.5 : 1 }]}>
                    <View style={[styles.checkbox, { borderColor: checked ? palette.primary : palette.line, backgroundColor: checked ? palette.primary : 'transparent' }]}>{checked ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                    <Text style={[styles.branchName, { color: palette.text }]}>{branch.name}</Text>
                    {assignedElsewhere && !checked ? <Text style={[styles.copy, { color: palette.textSecondary }]}>Asignada a otro número</Text> : null}
                  </Pressable>;
                })}
              </View>;
            }) : <View style={[styles.empty, { borderColor: palette.line }]}><Text style={[styles.rowTitle, { color: palette.text }]}>Sin números asignables</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Conecta un número de WhatsApp en el servidor de Twilio para poder asignarlo.</Text></View>}
          </View>
          <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Avisos dentro del CRM</Text>
            <Text style={[styles.copy, { color: palette.textSecondary }]}>Elige qué actividad de WhatsApp aparecerá en el centro de notificaciones.</Text>
            <NoticeSwitch title="Nuevos mensajes" detail="Avisar cuando llegue un mensaje nuevo a la bandeja." value={settings.notifyWhatsAppMessages} onChange={value => setSettings(current => ({ ...current, notifyWhatsAppMessages: value }))} palette={palette} />
            <NoticeSwitch title="Confirmaciones de citas" detail="Avisar cuando un paciente confirme su cita por WhatsApp." value={settings.notifyWhatsAppConfirmations} onChange={value => setSettings(current => ({ ...current, notifyWhatsAppConfirmations: value }))} palette={palette} />
          </View>
          {dirty ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.submit, { backgroundColor: palette.primary, opacity: saving ? 0.5 : 1 }]}><Text style={styles.saveButtonText}>{saving ? 'Guardando…' : 'Guardar configuración'}</Text></Pressable> : null}
        </>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ label, value, palette }: { label: string; value: string; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={[styles.metric, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.metricLabel, { color: palette.textSecondary }]}>{label}</Text><Text numberOfLines={1} style={[styles.metricValue, { color: palette.text }]}>{value}</Text></View>; }
function NoticeSwitch({ title, detail, value, onChange, palette }: { title: string; detail: string; value: boolean; onChange: (value: boolean) => void; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={[styles.noticeRow, { borderTopColor: palette.line }]}><View style={styles.noticeCopy}><Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>{detail}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: palette.line, true: palette.primarySoft }} thumbColor={value ? palette.primary : palette.backgroundElement} accessibilityLabel={title} /></View>; }
function Feedback({ text, color, palette }: { text: string; color: string; palette: (typeof Colors)[keyof typeof Colors] }) { return <View accessibilityRole="alert" style={[styles.feedback, { borderColor: palette.line, backgroundColor: palette.background }]}><Text style={[styles.copy, { color }]}>{text}</Text></View>; }

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 780, alignSelf: 'center', padding: 18, paddingTop: 7, paddingBottom: 32, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 }, back: { width: 39, height: 46, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34 }, heading: { flex: 1, minWidth: 0 }, title: { fontSize: 24, fontWeight: '700' }, subtitle: { fontSize: 11, marginTop: 2 }, saveButton: { minHeight: 40, borderRadius: 11, paddingHorizontal: 12, justifyContent: 'center' }, saveButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loading: { minHeight: 150, justifyContent: 'center', alignItems: 'center', gap: 10 }, copy: { fontSize: 12, lineHeight: 18 }, metrics: { flexDirection: 'row', gap: 7 }, metric: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 13, padding: 10, gap: 7 }, metricLabel: { fontSize: 10 }, metricValue: { fontSize: 12, fontWeight: '700' }, card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 }, sectionTitle: { fontSize: 17, fontWeight: '700' }, rowTitle: { fontSize: 13, fontWeight: '700' },
  senderCard: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 5 }, senderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, senderCopy: { flex: 1, gap: 2 }, remove: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 }, removeText: { fontSize: 12, fontWeight: '700' }, branchHeading: { fontSize: 11, fontWeight: '700', marginTop: 5 }, branchRow: { minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 1 }, checkbox: { width: 21, height: 21, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, checkmark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 }, branchName: { flex: 1, fontSize: 13 },
  empty: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 5 }, noticeRow: { minHeight: 65, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8 }, noticeCopy: { flex: 1, gap: 3 }, submit: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, feedback: { borderWidth: 1, borderRadius: 12, padding: 11 },
});

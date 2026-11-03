import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';

import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';
import { Colors } from '@/constants/theme';
import { createClinicDocumentTemplate, loadClinicConsentDocuments, loadClinicDocumentTemplates, loadPatientList, prepareClinicPatientDocument, type ClinicConsentDocument, type PatientListItem } from '@/lib/crm-data';
import { useCrmRouter } from '@/lib/use-crm-router';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import { useAuth } from '@/providers/auth-provider';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';

type ConsentTemplate = { id: string; title: string; type: string; content: string; version: string };
type ConsentDraft = { title: string; type: string; content: string };

export default function ConsentsScreen() {
  const router = useCrmRouter();
  const palette = Colors[useCrmColorScheme()];
  const { session, loading: authLoading } = useAuth();
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const canView = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'documents.view'));
  const canPrepare = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'documents.create'));
  const canManageTemplates = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'documents.manage_templates'));
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [documents, setDocuments] = useState<ClinicConsentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ClinicConsentDocument | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateDraft, setTemplateDraft] = useState<ConsentDraft>({ title: '', type: 'Documento clínico', content: '' });
  const [versionOf, setVersionOf] = useState('');

  const refresh = useCallback(async () => {
    if (!clinic || !canView) return;
    setLoading(true); setError('');
    try {
      const [nextPatients, nextTemplates, nextDocuments] = await Promise.all([
        loadPatientList(clinic),
        loadClinicDocumentTemplates(clinic),
        loadClinicConsentDocuments(clinic),
      ]);
      setPatients(nextPatients);
      setTemplates(nextTemplates.filter(template => template.kind === 'consent'));
      setDocuments(nextDocuments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los consentimientos.');
    } finally { setLoading(false); }
  }, [clinic, canView]);

  useEffect(() => { void refresh(); }, [refresh]);

  const patientById = useMemo(() => new Map(patients.map(patient => [patient.databaseId, patient])), [patients]);
  const latestByPatient = useMemo(() => {
    const latest = new Map<string, ClinicConsentDocument>();
    for (const document of documents) if (!latest.has(document.patientId)) latest.set(document.patientId, document);
    return latest;
  }, [documents]);
  const pendingCount = [...latestByPatient.values()].filter(document => document.status === 'Pendiente').length;
  const signedCount = [...latestByPatient.values()].filter(document => document.status === 'Firmado').length;
  const readyTemplates = templates.filter(template => template.content.trim());
  const pendingDocuments = documents.filter(document => document.status === 'Pendiente' && latestByPatient.get(document.patientId)?.id === document.id);
  const filteredPatients = patients.filter(patient => patient.name.toLocaleLowerCase('es-MX').includes(patientQuery.trim().toLocaleLowerCase('es-MX'))).slice(0, 8);

  const openPrepare = (templateId = '') => {
    setError(''); setNotice(''); setSelectedPatientId(''); setPatientQuery('');
    setSelectedTemplateId(templateId || readyTemplates[0]?.id || '');
    setPrepareOpen(true);
  };

  const submitPreparation = async () => {
    if (!clinic || !canPrepare || saving) return;
    const patient = patientById.get(selectedPatientId);
    const template = readyTemplates.find(item => item.id === selectedTemplateId);
    if (!patient) { setError('Selecciona un paciente de la lista.'); return; }
    if (!template) { setError('Selecciona un formato con contenido aprobado.'); return; }
    setSaving(true); setError('');
    try {
      await prepareClinicPatientDocument(clinic, { databaseId: patient.databaseId, treatment: patient.service }, 'consent', { id: template.id });
      setPrepareOpen(false);
      setNotice(`Consentimiento preparado para ${patient.name}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo preparar el consentimiento.'); }
    finally { setSaving(false); }
  };

  const openNewTemplate = (previous?: ConsentTemplate) => {
    setVersionOf(previous?.id || '');
    setTemplateDraft(previous ? { title: previous.title, type: previous.type || 'Documento clínico', content: previous.content } : { title: '', type: 'Documento clínico', content: '' });
    setError(''); setNotice(''); setTemplateOpen(true);
  };

  const saveTemplate = async () => {
    if (!clinic || !canManageTemplates || saving) return;
    if (!templateDraft.title.trim() || !templateDraft.content.trim()) { setError('Completa el nombre y el texto aprobado del formato.'); return; }
    setSaving(true); setError('');
    try {
      await createClinicDocumentTemplate(clinic, templateDraft);
      setTemplateOpen(false);
      setNotice(versionOf ? 'Nueva versión guardada en la biblioteca.' : 'Formato agregado a la biblioteca.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el formato.'); }
    finally { setSaving(false); }
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session) return <Redirect href="/" />;

  return (
    <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
      {!canView ? <View style={styles.denied}><Text style={[styles.title, { color: palette.text }]}>Consentimientos</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Tu cuenta no tiene acceso a los documentos de esta clínica.</Text></View> : <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: palette.primary }]}>DOCUMENTACIÓN DIGITAL</Text><Text style={[styles.title, { color: palette.text }]}>Consentimientos</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Gestiona formatos, solicitudes de firma y documentos informados.</Text></View>
          {canPrepare ? <Pressable accessibilityRole="button" onPress={() => openPrepare()} style={[styles.primaryButton, { backgroundColor: palette.primary }]}><Text style={styles.primaryButtonText}>＋ Preparar</Text></Pressable> : null}
        </View>

        {notice ? <Text accessibilityRole="status" style={[styles.notice, { color: palette.primary }]}>{notice}</Text> : null}
        {error && !prepareOpen && !templateOpen ? <Card palette={palette}><Text style={[styles.copy, { color: palette.danger }]}>{error}</Text><Action title="Intentar de nuevo" onPress={() => void refresh()} palette={palette} /></Card> : null}
        {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando consentimientos…</Text></View> : <>
          <View style={styles.stats}>
            <Stat label="Firmas pendientes" value={pendingCount} detail="Expedientes que necesitan seguimiento" palette={palette} />
            <Stat label="Firmados" value={signedCount} detail="Según el último documento por paciente" palette={palette} />
            <Stat label="Formatos listos" value={readyTemplates.length} detail="Con contenido aprobado" palette={palette} />
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}><Text style={[styles.sectionTitle, { color: palette.text }]}>Biblioteca de formatos</Text><Text style={[styles.copySmall, { color: palette.textSecondary }]}>Los documentos preparados guardan una copia inmutable del contenido.</Text></View>
            {canManageTemplates ? <Action title="＋ Crear formato" onPress={() => openNewTemplate()} palette={palette} /> : null}
          </View>
          {templates.length ? templates.map(template => {
            const linked = documents.filter(document => document.title === template.title).length;
            const ready = Boolean(template.content.trim());
            return <Card key={template.id} palette={palette}>
              <View style={styles.templateTop}><View style={[styles.fileMark, { backgroundColor: palette.primarySoft }]}><Text style={{ color: palette.primary, fontWeight: '800' }}>▤</Text></View><Text style={[styles.version, { color: palette.textSecondary }]}>{template.type || 'Documento clínico'} · {template.version}</Text></View>
              <Text style={[styles.templateTitle, { color: palette.text }]}>{template.title}</Text>
              <Text style={[styles.copySmall, { color: ready ? palette.textSecondary : palette.danger }]}>{ready ? 'Texto disponible para revisión' : 'Falta agregar el texto oficial aprobado por la clínica'}</Text>
              <Text style={[styles.copySmall, { color: palette.textSecondary, marginTop: 8 }]}>{linked} expedientes vinculados</Text>
              <View style={styles.cardActions}>
                {canManageTemplates ? <Action title="Nueva versión" onPress={() => openNewTemplate(template)} palette={palette} /> : null}
                {canPrepare ? <Action title="Solicitar firma" onPress={() => openPrepare(template.id)} palette={palette} disabled={!ready} /> : null}
              </View>
            </Card>;
          }) : <Card palette={palette}><Text style={[styles.templateTitle, { color: palette.text }]}>Aún no hay formatos</Text><Text style={[styles.copy, { color: palette.textSecondary }]}>Agrega el documento validado por la clínica para poder preparar consentimientos.</Text>{canManageTemplates ? <Action title="＋ Crear formato" onPress={() => openNewTemplate()} palette={palette} /> : null}</Card>}

          <View style={styles.sectionHeader}><View style={styles.sectionCopy}><Text style={[styles.sectionTitle, { color: palette.text }]}>Firmas que requieren atención</Text><Text style={[styles.copySmall, { color: palette.textSecondary }]}>{pendingDocuments.length} solicitudes pendientes en los expedientes.</Text></View></View>
          {pendingDocuments.length ? pendingDocuments.map(document => {
            const patient = patientById.get(document.patientId);
            if (!patient) return null;
            return <Card key={document.id} palette={palette}>
              <View style={styles.pendingTop}><View style={[styles.patientMark, { backgroundColor: palette.primarySoft }]}><Text style={[styles.patientMarkText, { color: palette.primary }]}>{patient.name.trim().slice(0, 1).toLocaleUpperCase('es-MX')}</Text></View><View style={styles.patientCopy}><Text numberOfLines={1} style={[styles.pendingName, { color: palette.text }]}>{patient.name}</Text><Text style={[styles.copySmall, { color: palette.textSecondary }]}>{patient.id} · {patient.service}</Text></View><View style={[styles.statusPill, { backgroundColor: palette.primarySoft }]}><Text style={[styles.statusText, { color: palette.primary }]}>Pendiente</Text></View></View>
              <Text style={[styles.documentName, { color: palette.text }]}>{document.title || 'Consentimiento informado'}</Text>
              <Text style={[styles.copySmall, { color: palette.textSecondary }]}>{document.requestedAt ? formatDate(document.requestedAt) : 'Fecha no disponible'} · Firma electrónica por conectar</Text>
              <View style={styles.cardActions}><Action title="Ver documento" onPress={() => setSelectedDocument(document)} palette={palette} /><Action title="Abrir expediente" onPress={() => router.push(`/patients/${patient.databaseId}` as never)} palette={palette} /></View>
            </Card>;
          }) : <Card palette={palette}><Text style={[styles.copy, { color: palette.textSecondary }]}>Todo está al día, no hay firmas pendientes.</Text></Card>}
        </>}
      </ScrollView>}

      <Modal transparent animationType="slide" visible={prepareOpen} onRequestClose={() => setPrepareOpen(false)}>
        <Sheet palette={palette} title="Preparar consentimiento" subtitle="El documento se guarda en el expediente del paciente. La firma electrónica requiere una integración posterior." onClose={() => setPrepareOpen(false)}>
          <Text style={[styles.fieldLabel, { color: palette.text }]}>Paciente</Text>
          <TextInput accessibilityLabel="Buscar paciente" value={patientQuery} onChangeText={value => { setPatientQuery(value); setSelectedPatientId(''); }} placeholder="Buscar por nombre o expediente…" placeholderTextColor={palette.textSecondary} style={[styles.input, { color: palette.text, borderColor: palette.line, backgroundColor: palette.background }]} />
          {selectedPatientId ? <View style={[styles.selectedPatient, { backgroundColor: palette.primarySoft }]}><Text style={[styles.selectedPatientText, { color: palette.primary }]}>{patientById.get(selectedPatientId)?.name} · seleccionado</Text><Action title="Cambiar" onPress={() => { setSelectedPatientId(''); setPatientQuery(''); }} palette={palette} /></View> : patientQuery.trim() ? <View style={styles.patientResults}>{filteredPatients.map(patient => <Pressable key={patient.databaseId} onPress={() => { setSelectedPatientId(patient.databaseId); setPatientQuery(patient.name); }} style={[styles.patientResult, { borderColor: palette.line }]}><Text style={[styles.patientResultName, { color: palette.text }]}>{patient.name}</Text><Text style={[styles.copySmall, { color: palette.textSecondary }]}>{patient.id}</Text></Pressable>)}{filteredPatients.length === 0 ? <Text style={[styles.copySmall, { color: palette.textSecondary }]}>No hay pacientes que coincidan.</Text> : null}</View> : null}
          <Text style={[styles.fieldLabel, { color: palette.text, marginTop: 14 }]}>Formato</Text>
          {readyTemplates.length ? readyTemplates.map(template => <Pressable key={template.id} onPress={() => setSelectedTemplateId(template.id)} style={[styles.templateChoice, { backgroundColor: selectedTemplateId === template.id ? palette.primarySoft : palette.background, borderColor: selectedTemplateId === template.id ? palette.primary : palette.line }]}><View style={styles.patientCopy}><Text style={[styles.patientResultName, { color: palette.text }]}>{template.title}</Text><Text style={[styles.copySmall, { color: palette.textSecondary }]}>{template.type} · {template.version}</Text></View><Text style={{ color: palette.primary }}>{selectedTemplateId === template.id ? '✓' : '○'}</Text></Pressable>) : <Text style={[styles.copySmall, { color: palette.textSecondary }]}>No hay formatos con texto aprobado. Agrega uno antes de preparar el documento.</Text>}
          {canManageTemplates && !readyTemplates.length ? <Action title="＋ Crear formato" onPress={() => { setPrepareOpen(false); openNewTemplate(); }} palette={palette} /> : null}
          {error ? <Text accessibilityRole="alert" style={[styles.copySmall, { color: palette.danger }]}>{error}</Text> : null}
          <View style={styles.sheetActions}><Action title="Cancelar" onPress={() => setPrepareOpen(false)} palette={palette} /><Pressable accessibilityRole="button" disabled={saving || !readyTemplates.length} onPress={() => void submitPreparation()} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: saving || !readyTemplates.length ? 0.55 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Preparar documento</Text>}</Pressable></View>
        </Sheet>
      </Modal>

      <Modal transparent animationType="slide" visible={templateOpen} onRequestClose={() => setTemplateOpen(false)}>
        <Sheet palette={palette} title={versionOf ? 'Nueva versión de consentimiento' : 'Crear formato de consentimiento'} subtitle={versionOf ? 'Los documentos ya preparados conservan su copia y versión.' : 'Agrega el texto oficial que proporcione y valide la clínica.'} onClose={() => setTemplateOpen(false)}>
          <FormField label="Nombre del formato" value={templateDraft.title} onChangeText={title => setTemplateDraft(current => ({ ...current, title }))} palette={palette} placeholder="Ej. Consentimiento para tratamiento" />
          <FormField label="Tipo" value={templateDraft.type} onChangeText={type => setTemplateDraft(current => ({ ...current, type }))} palette={palette} placeholder="Documento clínico" />
          <FormField label="Contenido del documento" value={templateDraft.content} onChangeText={content => setTemplateDraft(current => ({ ...current, content }))} palette={palette} placeholder="Pega aquí el texto revisado por la clínica." multiline />
          <Text style={[styles.copySmall, { color: palette.textSecondary }]}>El formato se comparte con el equipo clínico y se guarda con versiones.</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.copySmall, { color: palette.danger }]}>{error}</Text> : null}
          <View style={styles.sheetActions}><Action title="Cancelar" onPress={() => setTemplateOpen(false)} palette={palette} /><Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveTemplate()} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: saving ? 0.6 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{versionOf ? 'Guardar nueva versión' : 'Guardar formato'}</Text>}</Pressable></View>
        </Sheet>
      </Modal>

      <Modal transparent animationType="fade" visible={Boolean(selectedDocument)} onRequestClose={() => setSelectedDocument(null)}>
        <View style={styles.backdrop}><View style={[styles.preview, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.templateTitle, { color: palette.text }]}>{selectedDocument?.title}</Text><Text style={[styles.copySmall, { color: palette.textSecondary }]}>Consentimiento informado · {selectedDocument?.status}</Text><ScrollView style={styles.previewContent}><Text selectable style={[styles.documentText, { color: palette.text }]}>{selectedDocument?.contentSnapshot || 'Este documento no tiene contenido guardado.'}</Text></ScrollView><Action title="Cerrar" onPress={() => setSelectedDocument(null)} palette={palette} /></View></View>
      </Modal>
    </SafeAreaView>
  );
}

function Card({ palette, children }: { palette: (typeof Colors)[keyof typeof Colors]; children: React.ReactNode }) {
  return <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>{children}</View>;
}

function Stat({ label, value, detail, palette }: { label: string; value: number; detail: string; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={[styles.stat, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.statLabel, { color: palette.textSecondary }]}>{label}</Text><Text style={[styles.statValue, { color: palette.text }]}>{String(value).padStart(2, '0')}</Text><Text style={[styles.copyTiny, { color: palette.textSecondary }]}>{detail}</Text></View>;
}

function Action({ title, onPress, palette, disabled = false }: { title: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors]; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, { backgroundColor: palette.primarySoft, opacity: disabled ? 0.5 : 1 }]}><Text style={{ color: palette.primary, fontSize: 13, fontWeight: '700' }}>{title}</Text></Pressable>;
}

function FormField({ label, value, onChangeText, palette, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; palette: (typeof Colors)[keyof typeof Colors]; placeholder: string; multiline?: boolean }) {
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} placeholder={placeholder} placeholderTextColor={palette.textSecondary} style={[styles.input, multiline && styles.multiline, { color: palette.text, backgroundColor: palette.background, borderColor: palette.line }]} /></View>;
}

function Sheet({ palette, title, subtitle, onClose, children }: { palette: (typeof Colors)[keyof typeof Colors]; title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><View style={styles.sheetHeader}><View style={styles.sectionCopy}><Text style={[styles.templateTitle, { color: palette.text }]}>{title}</Text><Text style={[styles.copySmall, { color: palette.textSecondary }]}>{subtitle}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose}><Text style={[styles.close, { color: palette.textSecondary }]}>×</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>{children}</ScrollView></View></View></KeyboardAvoidingView>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value)); }

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 12 }, denied: { flex: 1, padding: 22, justifyContent: 'center', gap: 10 }, pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }, headerCopy: { flex: 1, gap: 4 }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }, copy: { fontSize: 14, lineHeight: 20 }, copySmall: { fontSize: 12, lineHeight: 17 }, copyTiny: { fontSize: 10, lineHeight: 14 }, notice: { fontSize: 13, fontWeight: '700' }, primaryButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, stat: { flexGrow: 1, flexBasis: 104, minHeight: 112, borderWidth: 1, borderRadius: 15, padding: 12, justifyContent: 'space-between' }, statLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }, statValue: { fontSize: 27, fontWeight: '800', lineHeight: 32 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, marginBottom: 2 }, sectionCopy: { flex: 1, gap: 3 }, sectionTitle: { fontSize: 18, fontWeight: '800' }, card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 9 }, templateTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, fileMark: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, version: { fontSize: 11, fontWeight: '700' }, templateTitle: { fontSize: 16, fontWeight: '800', lineHeight: 21 }, cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }, action: { minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11 }, pendingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, patientMark: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, patientMarkText: { fontSize: 15, fontWeight: '800' }, patientCopy: { flex: 1, gap: 3 }, pendingName: { fontSize: 14, fontWeight: '800' }, statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 }, statusText: { fontSize: 10, fontWeight: '800' }, documentName: { fontSize: 14, fontWeight: '700' }, loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 }, field: { gap: 7, marginBottom: 11 }, fieldLabel: { fontSize: 13, fontWeight: '700' }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, multiline: { minHeight: 180, paddingTop: 12, lineHeight: 20 }, selectedPatient: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: 11, marginTop: 8 }, selectedPatientText: { fontSize: 12, fontWeight: '700', flex: 1 }, patientResults: { marginTop: 6, borderRadius: 12, overflow: 'hidden' }, patientResult: { paddingVertical: 10, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth }, patientResultName: { fontSize: 13, fontWeight: '700' }, templateChoice: { minHeight: 56, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center' }, sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 13 }, modalRoot: { flex: 1 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,8,13,0.55)', padding: 12 }, sheet: { maxHeight: '92%', borderWidth: 1, borderRadius: 20, padding: 16, paddingBottom: 22 }, sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(130,110,130,0.35)' }, sheetContent: { paddingTop: 14, paddingBottom: 8 }, close: { fontSize: 27, lineHeight: 30, paddingHorizontal: 6 }, preview: { maxHeight: '80%', borderWidth: 1, borderRadius: 18, padding: 17, gap: 9 }, previewContent: { minHeight: 200, maxHeight: 440, borderRadius: 10, padding: 12, backgroundColor: 'rgba(120,100,120,0.08)' }, documentText: { fontSize: 13, lineHeight: 20 },
});

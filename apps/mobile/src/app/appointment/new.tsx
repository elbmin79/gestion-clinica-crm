import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppointmentServicePicker } from '@/components/appointment-service-picker';
import { AppointmentReminderPreview } from '@/components/appointment-reminder-preview';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useCrmRouter } from '@/lib/use-crm-router';
import { createClinicAppointment, createClinicPatient, loadAppointmentCatalog, loadPatientList, type AppointmentCatalog, type PatientListItem } from '@/lib/crm-data';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { useAuth } from '@/providers/auth-provider';
import { datePartsInZone } from '@elixir-clinic/crm-core/clinic-time';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';

const emptyCatalog: AppointmentCatalog = { businesses: [], branches: [], providers: [], services: [] };

export default function NewAppointmentScreen() {
  const router = useCrmRouter();
  const params = useLocalSearchParams<{ date?: string; time?: string; providerId?: string }>();
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const requestedTime = Array.isArray(params.time) ? params.time[0] : params.time;
  const requestedProviderId = Array.isArray(params.providerId) ? params.providerId[0] : params.providerId;
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { clinic, loading: workspaceLoading } = useClinicWorkspace();
  const { session, loading: authLoading } = useAuth();
  const canCreatePatient = clinic ? hasClinicPermission(clinic.role, clinic.permissions, 'patients.create') : false;
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [patientId, setPatientId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [manualService, setManualService] = useState('');
  const [date, setDate] = useState(clinic ? datePartsInZone(new Date(), clinic.timeZone) : new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => requestedTime && /^\d{2}:\d{2}$/.test(requestedTime) ? requestedTime : '09:00');
  const [duration, setDuration] = useState('45');
  const [deposit, setDeposit] = useState('');
  const [modality, setModality] = useState<'Presencial' | 'Virtual'>('Presencial');
  const [patientSearch, setPatientSearch] = useState('');
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [morePatientFields, setMorePatientFields] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientTreatment, setPatientTreatment] = useState('');
  const [patientBranchId, setPatientBranchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try {
      const [nextPatients, nextCatalog] = await Promise.all([loadPatientList(clinic), loadAppointmentCatalog(clinic)]);
      setPatients(nextPatients); setCatalog(nextCatalog);
      const presetProvider = nextCatalog.providers.find(item => item.id === requestedProviderId);
      const presetBranch = presetProvider?.branchIds.length
        ? nextCatalog.branches.find(item => presetProvider.branchIds.includes(item.id))
        : undefined;
      setBusinessId(current => current || presetBranch?.businessId || nextCatalog.businesses[0]?.id || '');
      if (presetProvider) {
        setProviderId(presetProvider.id);
        if (presetBranch) setBranchId(presetBranch.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos para agendar.');
    } finally { setLoading(false); }
  }, [clinic, requestedProviderId]);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!clinic) return;
    setDate(requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : datePartsInZone(new Date(), clinic.timeZone));
  }, [clinic, requestedDate]);

  const branchesForBusiness = catalog.branches.filter(item => item.businessId === businessId);
  const eligibleProviders = catalog.providers.filter(item => !item.branchIds.length || item.branchIds.some(id => branchesForBusiness.some(branch => branch.id === id)));
  const eligibleBranches = branchesForBusiness.filter(item => {
    const provider = catalog.providers.find(candidate => candidate.id === providerId);
    return !provider?.branchIds.length || provider.branchIds.includes(item.id);
  });
  const selectedPatient = patients.find(item => item.id === patientId);
  const eligibleServices = catalog.services.filter(item => !item.branchIds?.length || item.branchIds.includes(branchId)).filter(item => !item.providerIds?.length || item.providerIds.includes(providerId));
  const filteredPatients = useMemo(() => patients.filter(item => `${item.name} ${item.recordNumber}`.toLocaleLowerCase('es-MX').includes(patientSearch.toLocaleLowerCase('es-MX'))).slice(0, 24), [patients, patientSearch]);
  const selectedServices = serviceIds.map(id => catalog.services.find(item => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const selectedService = selectedServices[0];
  const eligibleServiceIds = eligibleServices.map(item => item.id).filter((id): id is string => Boolean(id));

  useEffect(() => {
    if (!branchesForBusiness.some(item => item.id === branchId)) setBranchId(branchesForBusiness[0]?.id || '');
  }, [businessId, branchesForBusiness, branchId]);
  useEffect(() => {
    if (!eligibleProviders.some(item => item.id === providerId)) setProviderId(eligibleProviders[0]?.id || '');
  }, [eligibleProviders, providerId]);
  useEffect(() => {
    if (!eligibleBranches.some(item => item.id === branchId)) setBranchId(eligibleBranches[0]?.id || '');
  }, [eligibleBranches, branchId]);
  const changeServices = (nextIds: string[]) => {
    setServiceIds(nextIds);
    const nextServices = nextIds.map(id => catalog.services.find(item => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (nextServices.length && nextServices.every(item => Number(item.durationMin) > 0)) {
      setDuration(String(nextServices.reduce((total, item) => total + Number(item.durationMax || item.durationMin), 0)));
    }
    setError('');
  };

  const savePatient = async () => {
    if (!clinic || !patientName.trim() || saving) return;
    setSaving(true); setError('');
    try {
      if (patientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail.trim())) throw new Error('Revisa el correo electrónico del paciente.');
      const saved = await createClinicPatient(clinic, { name: patientName.trim(), email: patientEmail.trim(), phone: patientPhone.trim(), treatment: patientTreatment.trim(), branchId: patientBranchId || branchId });
      const newPatient: PatientListItem = { id: saved.id, databaseId: saved.id, recordNumber: saved.record_number, name: patientName.trim(), service: patientTreatment.trim() || 'Por definir', status: 'Nuevo' };
      setPatients(current => [newPatient, ...current.filter(item => item.id !== newPatient.id)]);
      setPatientId(newPatient.id); setPatientSearch(''); setPatientName(''); setPatientEmail(''); setPatientPhone(''); setPatientTreatment(''); setCreatingPatient(false); setMorePatientFields(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear el expediente.');
    } finally { setSaving(false); }
  };

  const saveAppointment = async () => {
    if (!clinic || !selectedPatient || saving) return;
    setSaving(true); setError('');
    try {
      const durationMinutes = Number(duration);
      const amount = Number(deposit);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`))) throw new Error('Elige una fecha válida.');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720 || durationMinutes % 15 !== 0) throw new Error('Revisa la hora y la duración (15 a 720 minutos, en intervalos de 15).');
      const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
      if (start < 360 || start + durationMinutes > 1440 || start % 15 !== 0) throw new Error('La cita debe iniciar desde las 06:00, en intervalos de 15 minutos, y terminar antes de medianoche.');
      if (!businessId || !branchId || !providerId) throw new Error('Selecciona negocio, sucursal y profesional.');
      if (!serviceIds.length && !manualService.trim()) throw new Error('Selecciona al menos un servicio del catálogo o escribe un servicio manual.');
      if (serviceIds.length > 12 || new Set(serviceIds).size !== serviceIds.length || selectedServices.length !== serviceIds.length || serviceIds.some(id => !eligibleServiceIds.includes(id))) throw new Error('Cada servicio debe estar disponible para la sucursal y profesional seleccionados; elige hasta 12.');
      if (selectedServices.length && selectedServices.some(item => !(Number(item.durationMin) > 0))) throw new Error('Agrega una duración al catálogo antes de combinar estos servicios.');
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Indica el monto del anticipo requerido.');
      const service = selectedServices.length ? selectedServices.map(item => item.name).join(' + ') : manualService.trim();
      const saved = await createClinicAppointment(clinic, {
        patient: selectedPatient,
        businessId,
        branchId,
        providerId,
        date,
        time,
        service,
        serviceId: selectedService?.id || '',
        serviceIds,
        serviceSnapshot: selectedService ? { code: selectedService.code, name: selectedService.name, durationMin: selectedService.durationMin, durationMax: selectedService.durationMax, capturedAt: new Date().toISOString() } : {},
        durationMinutes,
        modality,
        depositRequired: true,
        depositAmount: amount,
        note: '',
      });
      if (!saved?.id) throw new Error('La base de datos no devolvió la cita guardada.');
      router.back();
    } catch (cause) {
      const errorWithCode = cause as Error & { code?: string };
      if (errorWithCode.code === '23P01') setError('El paciente o profesional ya tiene una cita en ese horario.');
      else if (String((cause as Error)?.cause || '').includes('appointments_schedule_bounds')) setError('La hora de esta cita no está dentro del horario permitido.');
      else setError(cause instanceof Error ? cause.message : 'No se pudo guardar la cita.');
    } finally { setSaving(false); }
  };

  if (authLoading || (session && workspaceLoading)) return null;
  if (!session || !clinic) return <Redirect href="/" />;
  if (!hasClinicPermission(clinic.role, clinic.permissions, 'agenda.create')) return <Redirect href="/(tabs)/agenda" />;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.page, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} style={styles.back}><Text style={[styles.backText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.headerTitle}><Text style={[styles.title, { color: palette.text }]}>Nueva cita</Text><Text style={[styles.subtitle, { color: palette.textSecondary }]}>{clinic?.name || 'Agenda de la clínica'}</Text></View></View>
          {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.help, { color: palette.textSecondary }]}>Cargando directorio y horarios…</Text></View> : <>
            <Section title="Paciente" palette={palette}>
              <TextInput accessibilityLabel="Buscar paciente" value={patientSearch} onChangeText={setPatientSearch} placeholder="Buscar por nombre o expediente" placeholderTextColor={palette.textSecondary} style={[styles.input, fieldStyle(palette)]} />
              <View style={styles.patientList}>{filteredPatients.map(patient => <Option key={patient.id} selected={patientId === patient.id} label={patient.name} detail={`${patient.recordNumber} · ${patient.service}`} onPress={() => { setPatientId(patient.id); setCreatingPatient(false); }} palette={palette} />)}</View>
              {canCreatePatient && <Pressable accessibilityRole="button" onPress={() => { setCreatingPatient(value => !value); setPatientName(''); setError(''); }} style={[styles.secondaryButton, { borderColor: palette.line }]}><Text style={[styles.secondaryButtonText, { color: palette.primary }]}>{creatingPatient ? 'Cerrar nuevo expediente' : '＋  Crear paciente aquí'}</Text></Pressable>}
              {creatingPatient && <View style={[styles.quickCreate, { backgroundColor: palette.background, borderColor: palette.line }]}><Text style={[styles.quickTitle, { color: palette.text }]}>Expediente nuevo</Text><Text style={[styles.help, { color: palette.textSecondary }]}>La cita se conservará y seleccionaremos el expediente al guardarlo.</Text>
                <Field label="Nombre completo" value={patientName} onChangeText={setPatientName} placeholder="Ej. Andrea García" palette={palette} />
                <View style={styles.twoCol}><Field label="Correo (opcional)" value={patientEmail} onChangeText={setPatientEmail} placeholder="correo@ejemplo.com" keyboardType="email-address" palette={palette} /><Field label="Teléfono (opcional)" value={patientPhone} onChangeText={setPatientPhone} placeholder="Teléfono" keyboardType="phone-pad" palette={palette} /></View>
                <Pressable accessibilityRole="button" onPress={() => setMorePatientFields(value => !value)} style={styles.expand}><Text style={[styles.expandText, { color: palette.primary }]}>{morePatientFields ? '− Ocultar datos adicionales' : '＋ Tratamiento y sucursal (opcional)'}</Text></Pressable>
                {morePatientFields && <><Field label="Tratamiento o servicio" value={patientTreatment} onChangeText={setPatientTreatment} placeholder="Por definir" palette={palette} /><ChoiceField title="Sucursal del expediente" items={catalog.branches} value={patientBranchId || branchId} onChange={setPatientBranchId} palette={palette} /></>}
                <Pressable accessibilityRole="button" disabled={saving || !patientName.trim()} onPress={() => void savePatient()} style={[styles.primaryButton, { backgroundColor: palette.primary, opacity: saving || !patientName.trim() ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Crear y seleccionar paciente</Text>}</Pressable>
              </View>}
            </Section>
            <Section title="Horario" palette={palette}><View style={styles.twoCol}><Field label="Fecha · AAAA-MM-DD" value={date} onChangeText={setDate} placeholder="2026-11-02" keyboardType="numbers-and-punctuation" palette={palette} /><Field label="Hora · 24 horas" value={time} onChangeText={setTime} placeholder="09:00" keyboardType="numbers-and-punctuation" palette={palette} /></View><View style={styles.twoCol}><Field label="Duración · minutos" value={duration} onChangeText={setDuration} placeholder="45" keyboardType="number-pad" palette={palette} /><View style={styles.choiceField}><Text style={[styles.label, { color: palette.text }]}>Modalidad</Text><ChoiceField title="Modalidad" items={[{ id: 'Presencial', name: 'Presencial' }, { id: 'Virtual', name: 'Virtual' }]} value={modality} onChange={value => setModality(value as 'Presencial' | 'Virtual')} palette={palette} compact /></View></View></Section>
            <Section title="Atención" palette={palette}><ChoiceField title="Negocio" items={catalog.businesses} value={businessId} onChange={value => { setBusinessId(value); setBranchId(''); setProviderId(''); }} palette={palette} /><ChoiceField title="Sucursal" items={eligibleBranches} value={branchId} onChange={value => setBranchId(value)} palette={palette} /><ChoiceField title="Profesional" items={eligibleProviders} value={providerId} onChange={value => setProviderId(value)} palette={palette} /><AppointmentServicePicker services={catalog.services} eligibleIds={eligibleServiceIds} selectedIds={serviceIds} onChange={changeServices} palette={palette} />{!serviceIds.length ? <Field label="Servicio manual" value={manualService} onChangeText={setManualService} placeholder="Si no aparece en el catálogo" palette={palette} /> : null}{!eligibleServices.length && <Text style={[styles.help, { color: palette.textSecondary }]}>No hay servicios configurados para esta sucursal y profesional.</Text>}</Section>
            <Section title="Anticipo" palette={palette}><Field label="Monto requerido · MXN" value={deposit} onChangeText={setDeposit} placeholder="Ej. 500" keyboardType="decimal-pad" palette={palette} /><Text style={[styles.help, { color: palette.textSecondary }]}>El CRM requiere registrar el anticipo en Pagos antes de confirmar la cita.</Text></Section>
            <AppointmentReminderPreview status="Por confirmar" palette={palette} />
          </>}
          {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger, backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>{error}</Text>}
          <View style={styles.footer}><Pressable accessibilityRole="button" disabled={saving} onPress={() => router.back()} style={[styles.secondaryButton, styles.footerCancel, { borderColor: palette.line }]}><Text style={[styles.secondaryButtonText, { color: palette.textSecondary }]}>Cancelar</Text></Pressable><Pressable accessibilityRole="button" disabled={loading || saving || !selectedPatient} onPress={() => void saveAppointment()} style={[styles.primaryButton, styles.footerSave, { backgroundColor: palette.primary, opacity: loading || saving || !selectedPatient ? 0.5 : 1 }]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Agendar cita</Text>}</Pressable></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function fieldStyle(palette: (typeof Colors)[keyof typeof Colors]) { return { backgroundColor: palette.backgroundElement, borderColor: palette.line, color: palette.text } as const; }

function Section({ title, palette, children }: { title: string; palette: (typeof Colors)[keyof typeof Colors]; children: React.ReactNode }) {
  return <View style={[styles.section, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>{children}</View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, palette }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'email-address' | 'phone-pad' | 'numbers-and-punctuation' | 'number-pad' | 'decimal-pad'; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={styles.field}><Text style={[styles.label, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} style={[styles.input, fieldStyle(palette)]} /></View>;
}

function ChoiceField({ title, items, value, onChange, palette, compact = false }: { title: string; items: { id: string; name: string }[]; value: string; onChange: (value: string) => void; palette: (typeof Colors)[keyof typeof Colors]; compact?: boolean }) {
  return <View style={[styles.field, compact && styles.compactChoice]}><Text style={[styles.label, { color: palette.text }]}>{title}</Text>{items.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{items.map(item => <Option key={item.id} selected={value === item.id} label={item.name} onPress={() => onChange(item.id)} palette={palette} />)}</ScrollView> : <Text style={[styles.help, { color: palette.textSecondary }]}>No hay opciones disponibles.</Text>}</View>;
}

function Option({ selected, label, detail, onPress, palette }: { selected: boolean; label: string; detail?: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.option, { backgroundColor: selected ? palette.primarySoft : palette.background, borderColor: selected ? palette.primary : palette.line, opacity: pressed ? 0.75 : 1 }]}><Text numberOfLines={1} style={[styles.optionText, { color: selected ? palette.primary : palette.text }]}>{label}</Text>{detail ? <Text numberOfLines={1} style={[styles.optionDetail, { color: palette.textSecondary }]}>{detail}</Text> : null}</Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, flex: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 22, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 }, back: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34, lineHeight: 38 }, headerTitle: { flex: 1 }, title: { fontSize: 27, lineHeight: 33, fontWeight: '700', letterSpacing: -0.5 }, subtitle: { fontSize: 13, marginTop: 2 },
  section: { borderRadius: 17, borderWidth: 1, padding: 15, gap: 12 }, sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 1 }, field: { flex: 1, gap: 7 }, label: { fontSize: 13, fontWeight: '600' }, input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 }, twoCol: { flexDirection: 'row', gap: 10 }, choiceField: { flex: 1, gap: 6 }, compactChoice: { marginTop: 1 }, choices: { gap: 8, paddingVertical: 2 }, option: { minHeight: 42, maxWidth: 220, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' }, optionText: { fontSize: 13, fontWeight: '600' }, optionDetail: { fontSize: 11, marginTop: 2 },
  patientList: { gap: 7, maxHeight: 250, overflow: 'hidden' }, quickCreate: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 11 }, quickTitle: { fontSize: 15, fontWeight: '700' }, expand: { minHeight: 34, justifyContent: 'center' }, expandText: { fontSize: 13, fontWeight: '700' }, secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, secondaryButtonText: { fontSize: 14, fontWeight: '700' }, primaryButton: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  help: { fontSize: 12, lineHeight: 18 }, loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 }, error: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 14, lineHeight: 20 }, footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, paddingTop: 2 }, footerCancel: { minWidth: 100 }, footerSave: { minWidth: 150 },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text } from '@/components/crm-text';
import { AgendaCalendarView } from '@/components/agenda-calendar-view';

import { useCrmColorScheme as useColorScheme } from '@/providers/crm-theme-provider';
import { useCrmRouter } from '@/lib/use-crm-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { hasClinicPermission } from '@elixir-clinic/crm-core/permissions';
import { loadAgendaFilterCatalog, loadAgendaForDate, type AgendaItem, type AgendaFilterCatalog } from '@/lib/crm-data';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { datePartsInZone } from '@elixir-clinic/crm-core/clinic-time';

type Period = 'Día' | 'Semana' | 'Mes' | 'Año' | 'Lista';
const periods: Period[] = ['Día', 'Semana', 'Mes', 'Año', 'Lista'];
const emptyCatalog: AgendaFilterCatalog = { branches: [], providers: [] };

export default function AgendaScreen() {
  const router = useCrmRouter();
  const palette = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { clinic } = useClinicWorkspace();
  const [date, setDate] = useState(() => clinic ? datePartsInZone(new Date(), clinic.timeZone) : new Date().toISOString().slice(0, 10));
  const [listEnd, setListEnd] = useState(() => shiftDate(clinic ? datePartsInZone(new Date(), clinic.timeZone) : new Date().toISOString().slice(0, 10), 29, 'Día'));
  const [period, setPeriod] = useState<Period>('Día');
  const [listSort, setListSort] = useState<'date' | 'date-desc' | 'patient' | 'provider'>('date');
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [branchFilter, setBranchFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!clinic) return;
    setLoading(true); setError('');
    try {
      const [agenda, options] = await Promise.all([
        loadAgendaForDate(clinic, date, period, period === 'Lista' ? listEnd : undefined),
        loadAgendaFilterCatalog(clinic),
      ]);
      setItems(agenda);
      setCatalog(options);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la agenda.'); }
    finally { setLoading(false); }
  }, [clinic, date, period, listEnd]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (clinic) { const today = datePartsInZone(new Date(), clinic.timeZone); setDate(today); setListEnd(shiftDate(today, 29, 'Día')); } }, [clinic]);

  const todayDate = clinic ? datePartsInZone(new Date(), clinic.timeZone) : new Date().toISOString().slice(0, 10);
  const dateLabel = periodLabel(date, period, listEnd);
  const visibleItems = useMemo(() => items.filter(item => (!branchFilter || item.branchId === branchFilter) && (!providerFilter || item.providerId === providerFilter)), [items, branchFilter, providerFilter]);
  const visibleProviders = useMemo(() => catalog.providers.filter(item => (!providerFilter || item.id === providerFilter) && (!branchFilter || Boolean(item.branchSettings[branchFilter]))), [catalog.providers, branchFilter, providerFilter]);
  const canCreateAppointment = Boolean(clinic && hasClinicPermission(clinic.role, clinic.permissions, 'agenda.create'));
  const shift = (amount: number) => {
    const delta = period === 'Lista' ? amount * 30 : amount;
    setDate(current => shiftDate(current, amount, period === 'Lista' ? 'Lista' : period));
    if (period === 'Lista') setListEnd(current => shiftDate(current, delta, 'Día'));
  };
  const setView = (value: Period) => {
    if (value === 'Lista' && period !== 'Lista') setListEnd(shiftDate(date, 29, 'Día'));
    setPeriod(value);
  };
  const orderedItems = useMemo(() => sortAppointments(visibleItems, listSort), [visibleItems, listSort]);

  return (
    <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}><View><Text style={[styles.title, { color: palette.text }]}>Agenda</Text><Text style={[styles.caption, { color: palette.textSecondary }]}>Citas del equipo por fecha y profesional</Text></View>{clinic && hasClinicPermission(clinic.role, clinic.permissions, 'agenda.create') ? <Pressable accessibilityRole="button" onPress={() => router.push('/appointment/new')} style={({ pressed }) => [styles.newButton, { backgroundColor: palette.primary, opacity: pressed ? 0.78 : 1 }]}><Text style={styles.newButtonText}>＋ Nueva cita</Text></Pressable> : null}</View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>{periods.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: period === value }} onPress={() => setView(value)} style={[styles.period, { backgroundColor: period === value ? palette.primarySoft : palette.backgroundElement, borderColor: period === value ? palette.primary : palette.line }]}><Text style={[styles.periodText, { color: period === value ? palette.primary : palette.textSecondary }]}>{value}</Text></Pressable>)}</ScrollView>

        <View style={[styles.dateBar, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Pressable accessibilityRole="button" accessibilityLabel={`Anterior ${period.toLocaleLowerCase('es-MX')}`} onPress={() => shift(-1)} style={styles.dateArrow}><Text style={[styles.dateArrowText, { color: palette.primary }]}>‹</Text></Pressable><View style={styles.dateCenter}><Text style={[styles.subtitle, { color: palette.text }]}>{dateLabel}</Text><Text style={[styles.dateCaption, { color: palette.textSecondary }]}>{date === todayDate ? 'Hoy' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`))}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Siguiente ${period.toLocaleLowerCase('es-MX')}`} onPress={() => shift(1)} style={styles.dateArrow}><Text style={[styles.dateArrowText, { color: palette.primary }]}>›</Text></Pressable>{date !== todayDate ? <Pressable accessibilityRole="button" onPress={() => { setDate(todayDate); if (period === 'Lista' && listEnd < todayDate) setListEnd(todayDate); }} style={styles.todayButton}><Text style={[styles.todayText, { color: palette.primary }]}>Hoy</Text></Pressable> : null}</View>

        {period === 'Lista' ? <View style={rangeStyles.listControls}>
          <View style={rangeStyles.dateRangeRow}>
            <DateRangeButton label="Desde" value={date} onPress={() => setDatePicker('start')} palette={palette} />
            <DateRangeButton label="Hasta" value={listEnd} onPress={() => setDatePicker('end')} palette={palette} />
          </View>
          <Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Ordenar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {sortOptions.map(option => <FilterChip key={option.value} label={option.label} selected={listSort === option.value} onPress={() => setListSort(option.value)} palette={palette} />)}
          </ScrollView>
        </View> : null}

        <View style={styles.filterBlock}><Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Sucursal</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><FilterChip label="Todas" selected={!branchFilter} onPress={() => setBranchFilter('')} palette={palette}/>{catalog.branches.map(item => <FilterChip key={item.id} label={item.name} selected={branchFilter === item.id} onPress={() => setBranchFilter(item.id)} palette={palette}/>)}</ScrollView></View>
        <View style={styles.filterBlock}><Text style={[styles.filterLabel, { color: palette.textSecondary }]}>Profesional</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><FilterChip label="Todos" selected={!providerFilter} onPress={() => setProviderFilter('')} palette={palette}/>{catalog.providers.map(item => <FilterChip key={item.id} label={item.name} selected={providerFilter === item.id} onPress={() => setProviderFilter(item.id)} palette={palette}/>)}</ScrollView></View>

        {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} /><Text style={[styles.copy, { color: palette.textSecondary }]}>Cargando citas…</Text></View> : error ? <View style={[styles.message, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Text style={[styles.copy, { color: palette.text }]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.action, { color: palette.primary }]}>Intentar de nuevo</Text></Pressable></View> : <AgendaCalendarView date={date} todayDate={todayDate} period={period} items={period === 'Lista' ? orderedItems : visibleItems} providers={visibleProviders} canCreateAppointment={canCreateAppointment} palette={palette} onSelectDate={(nextDate, nextPeriod) => { setDate(nextDate); setPeriod(nextPeriod); }} onCreateAppointment={(appointmentDate, appointmentTime, providerId) => router.push({ pathname: '/appointment/new', params: { date: appointmentDate, time: appointmentTime, providerId } } as never)} onOpenAppointment={id => router.push({ pathname: '/appointment/[id]', params: { id } } as never)} />}
        <Pressable onPress={() => void refresh()} style={styles.refresh}><Text style={[styles.action, { color: palette.primary }]}>Actualizar</Text></Pressable>
      </ScrollView>
      <DateSelectSheet visible={datePicker !== null} value={datePicker === 'end' ? listEnd : date} todayDate={todayDate} title={datePicker === 'end' ? 'Hasta' : 'Desde'} palette={palette} onClose={() => setDatePicker(null)} onSelect={value => {
        if (datePicker === 'end') setListEnd(value < date ? date : value);
        else { setDate(value); if (listEnd < value) setListEnd(value); }
        setDatePicker(null);
      }} />
    </SafeAreaView>
  );
}

const sortOptions = [
  { value: 'date', label: 'Fecha ↑' },
  { value: 'date-desc', label: 'Fecha ↓' },
  { value: 'patient', label: 'Paciente' },
  { value: 'provider', label: 'Profesional' },
] as const;

function sortAppointments(items: AgendaItem[], order: typeof sortOptions[number]['value']) {
  return [...items].sort((a, b) => {
    const byDate = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    if (order === 'date-desc') return -byDate;
    if (order === 'patient') return a.patientName.localeCompare(b.patientName, 'es-MX') || byDate;
    if (order === 'provider') return a.clinician.localeCompare(b.clinician, 'es-MX') || byDate;
    return byDate;
  });
}

function DateRangeButton({ label, value, onPress, palette }: { label: string; value: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${dateLong(value)}; cambiar fecha`} onPress={onPress} style={[rangeStyles.rangeButton, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
    <Text style={[rangeStyles.rangeLabel, { color: palette.textSecondary }]}>{label}</Text>
    <Text style={[rangeStyles.rangeValue, { color: palette.text }]}>{shortDate(value)}</Text>
  </Pressable>;
}

function DateSelectSheet({ visible, value, todayDate, title, palette, onClose, onSelect }: { visible: boolean; value: string; todayDate: string; title: string; palette: (typeof Colors)[keyof typeof Colors]; onClose: () => void; onSelect: (value: string) => void }) {
  const [month, setMonth] = useState(`${value.slice(0, 7)}-01`);
  useEffect(() => { if (visible) setMonth(`${value.slice(0, 7)}-01`); }, [value, visible]);
  const monthDate = new Date(`${month}T12:00:00`);
  const offset = (monthDate.getDay() + 6) % 7;
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= daysInMonth ? `${month.slice(0, 8)}${String(day).padStart(2, '0')}` : '';
  });
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={rangeStyles.sheetBackdrop}>
      <View style={[rangeStyles.dateSheet, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
        <View style={rangeStyles.sheetHeading}><View style={rangeStyles.sheetHeadingCopy}><Text style={[rangeStyles.sheetTitle, { color: palette.text }]}>{title}</Text><Text style={[rangeStyles.sheetSubtitle, { color: palette.textSecondary }]}>{dateLong(value)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar selector de fecha" onPress={onClose} style={[rangeStyles.sheetClose, { backgroundColor: palette.background }]}><Text style={[rangeStyles.sheetCloseText, { color: palette.textSecondary }]}>×</Text></Pressable></View>
        <View style={rangeStyles.monthHeading}><Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => setMonth(shiftDate(month, -1, 'Mes'))} style={rangeStyles.monthArrow}><Text style={[rangeStyles.monthArrowText, { color: palette.primary }]}>‹</Text></Pressable><Text style={[rangeStyles.monthTitle, { color: palette.text }]}>{new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(monthDate)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => setMonth(shiftDate(month, 1, 'Mes'))} style={rangeStyles.monthArrow}><Text style={[rangeStyles.monthArrowText, { color: palette.primary }]}>›</Text></Pressable></View>
        <View style={rangeStyles.calendarGrid}>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <Text key={day} style={[rangeStyles.weekday, { color: palette.textSecondary }]}>{day}</Text>)}{cells.map((cell, index) => cell ? <Pressable key={cell} accessibilityRole="button" accessibilityLabel={dateLong(cell)} accessibilityState={{ selected: cell === value }} onPress={() => onSelect(cell)} style={[rangeStyles.calendarDay, { backgroundColor: cell === value ? palette.primary : 'transparent', borderColor: cell === value ? palette.primary : 'transparent' }]}><Text style={[rangeStyles.calendarDayText, { color: cell === value ? '#fff' : palette.text }]}>{String(Number(cell.slice(-2)))}</Text></Pressable> : <View key={`blank-${index}`} style={rangeStyles.calendarBlank} />)}</View>
        <View style={[rangeStyles.sheetFooter, { borderTopColor: palette.line }]}><Pressable accessibilityRole="button" onPress={() => onSelect(todayDate)} style={[rangeStyles.sheetToday, { backgroundColor: palette.primarySoft }]}><Text style={[rangeStyles.sheetTodayText, { color: palette.primary }]}>Hoy</Text></Pressable><Pressable accessibilityRole="button" onPress={onClose} style={[rangeStyles.sheetCancel, { borderColor: palette.line }]}><Text style={[rangeStyles.sheetCancelText, { color: palette.textSecondary }]}>Cancelar</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}

function shiftDate(date: string, amount: number, period: Period | 'Lista') {
  const next = new Date(`${date}T12:00:00`);
  if (period === 'Semana') next.setDate(next.getDate() + amount * 7);
  else if (period === 'Mes') {
    const day = next.getDate();
    next.setDate(1); next.setMonth(next.getMonth() + amount);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  } else if (period === 'Año') {
    const month = next.getMonth(); const day = next.getDate();
    next.setDate(1); next.setFullYear(next.getFullYear() + amount); next.setMonth(month);
    next.setDate(Math.min(day, new Date(next.getFullYear(), month + 1, 0).getDate()));
  }
  else if (period === 'Lista') next.setDate(next.getDate() + amount * 30);
  else next.setDate(next.getDate() + amount);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

function dateLong(value: string) { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`)); }

function periodLabel(date: string, period: Period, listEnd: string) {
  const selected = new Date(`${date}T12:00:00`);
  if (period === 'Día') return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(selected);
  if (period === 'Mes') return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(selected);
  if (period === 'Año') return String(selected.getFullYear());
  if (period === 'Semana') {
    const monday = new Date(selected); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
    return `${shortDate(dateKey(monday))} – ${new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(sunday)}`;
  }
  return `${shortDate(date)} – ${shortDate(listEnd)}`;
}

function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function shortDate(value: string) { return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)); }
function FilterChip({ label, selected, onPress, palette }: { label: string; selected: boolean; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.filterChip, { backgroundColor: selected ? palette.primarySoft : palette.backgroundElement, borderColor: selected ? palette.primary : palette.line }]}><Text numberOfLines={1} style={[styles.filterText, { color: selected ? palette.primary : palette.textSecondary }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 30, gap: 13 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, newButton: { minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, newButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' }, title: { fontSize: 29, fontWeight: '700', letterSpacing: -0.6 }, caption: { fontSize: 12, marginTop: 3 }, periods: { gap: 7, paddingVertical: 2 }, period: { minHeight: 37, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' }, periodText: { fontSize: 12, fontWeight: '700' }, subtitle: { fontSize: 15, textTransform: 'capitalize', fontWeight: '700', textAlign: 'center' }, dateCaption: { fontSize: 11, textTransform: 'capitalize' }, dateBar: { minHeight: 64, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }, dateArrow: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center' }, dateArrowText: { fontSize: 32, lineHeight: 36 }, dateCenter: { flex: 1, alignItems: 'center', gap: 3 }, todayButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, backgroundColor: '#b85d8418' }, todayText: { fontSize: 12, fontWeight: '800' }, filterBlock: { gap: 5 }, filterLabel: { fontSize: 11, fontWeight: '700', marginLeft: 3 }, filters: { gap: 7 }, filterChip: { minHeight: 34, maxWidth: 180, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, justifyContent: 'center' }, filterText: { fontSize: 11, fontWeight: '600' }, list: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 13 }, item: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10 }, timePill: { minWidth: 54, minHeight: 48, paddingHorizontal: 5, borderRadius: 11, justifyContent: 'center', alignItems: 'center', gap: 2 }, dateText: { fontSize: 10, fontWeight: '700' }, time: { fontSize: 14, fontWeight: '800' }, main: { flex: 1, gap: 3 }, name: { fontSize: 15, fontWeight: '700' }, copy: { fontSize: 12, lineHeight: 17 }, meta: { fontSize: 10 }, state: { maxWidth: 80, fontSize: 10, textAlign: 'right', fontWeight: '700' }, chevron: { fontSize: 23 }, center: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 12 }, message: { borderWidth: 1, minHeight: 102, borderRadius: 16, padding: 17, justifyContent: 'center', gap: 6 }, action: { fontSize: 14, fontWeight: '700' }, refresh: { alignSelf: 'center', minHeight: 50, justifyContent: 'center', paddingHorizontal: 12 } });

const rangeStyles = StyleSheet.create({
  listControls: { gap: 8 },
  dateRangeRow: { flexDirection: 'row', gap: 9 },
  rangeButton: { flex: 1, minHeight: 56, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, justifyContent: 'center', gap: 3 },
  rangeLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  rangeValue: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(22, 14, 21, 0.55)', justifyContent: 'flex-end', alignItems: 'center' },
  dateSheet: { width: '100%', maxWidth: 520, borderWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 25, gap: 16 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetHeadingCopy: { flex: 1, gap: 2 },
  sheetTitle: { fontSize: 19, fontWeight: '800' },
  sheetSubtitle: { fontSize: 12 },
  sheetClose: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 25, lineHeight: 28 },
  monthHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthArrow: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  monthArrowText: { fontSize: 32, lineHeight: 36 },
  monthTitle: { fontSize: 15, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', height: 34, textAlign: 'center', textAlignVertical: 'center', fontSize: 10, fontWeight: '700' },
  calendarDay: { width: '14.2857%', height: 44, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  calendarBlank: { width: '14.2857%', height: 44 },
  calendarDayText: { fontSize: 13, fontWeight: '700' },
  sheetFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetToday: { minWidth: 88, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetTodayText: { fontSize: 13, fontWeight: '800' },
  sheetCancel: { minWidth: 100, minHeight: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetCancelText: { fontSize: 13, fontWeight: '700' },
});

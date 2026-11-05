import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { CrmText as Text } from '@/components/crm-text';

import { agendaPalette } from '@elixir-clinic/crm-core/agenda-colors';
import type { AgendaItem } from '@/lib/crm-data';
import { Colors } from '@/constants/theme';

type Period = 'Día' | 'Semana' | 'Mes' | 'Año' | 'Lista';
type Palette = (typeof Colors)[keyof typeof Colors];

export function AgendaCalendarView({
  date,
  period,
  todayDate,
  dayGrid = false,
  onShowGrid,
  items,
  palette,
  onSelectDate,
  onOpenAppointment,
  providers = [],
  canCreateAppointment = false,
  onCreateAppointment,
}: {
  date: string;
  period: Period;
  todayDate?: string;
  dayGrid?: boolean;
  onShowGrid?: () => void;
  items: AgendaItem[];
  palette: Palette;
  onSelectDate: (date: string, period: Period) => void;
  onOpenAppointment: (id: string) => void;
  providers?: { id: string; name: string }[];
  canCreateAppointment?: boolean;
  onCreateAppointment?: (date: string, time: string, providerId: string) => void;
}) {
  if (period === 'Día' && dayGrid) return <DayView date={date} todayDate={todayDate} items={items} palette={palette} providers={providers} canCreateAppointment={canCreateAppointment} onCreateAppointment={onCreateAppointment} onOpenAppointment={onOpenAppointment} />;
  if (period === 'Mes') return <MonthView date={date} items={items} palette={palette} onSelectDate={onSelectDate} />;
  if (period === 'Año') return <YearView date={date} items={items} palette={palette} onSelectDate={onSelectDate} />;

  const schedule = period === 'Lista' ? items : items.filter(item => item.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const now = Date.now();
  const nextAppointment = period !== 'Lista' && date === todayDate
    ? schedule.find(item => Date.parse(item.startsAt) >= now)
    : undefined;
  return <View style={{ gap: 10 }}>
    {period === 'Semana' && <View style={{ flexDirection: 'row', gap: 3 }}>
      {weekDates(date).map(day => {
        const count = items.filter(item => item.date === day).length;
        return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: day === date }}
          accessibilityLabel={longDate(day) + ', ' + appointmentCount(count)} onPress={() => onSelectDate(day, 'Semana')}
          style={{ flex: 1, minHeight: 64, paddingVertical: 7, alignItems: 'center', borderRadius: 10, backgroundColor: day === date ? palette.primarySoft : palette.backgroundElement }}>
          <Text style={{ color: palette.textSecondary, fontSize: 11 }}>{weekdayShort(day)}</Text>
          <Text style={{ color: palette.text, fontWeight: '700' }}>{Number(day.slice(-2))}</Text>
          <Text style={{ color: palette.textSecondary, fontSize: 11 }}>{count}</Text>
        </Pressable>;
      })}
    </View>}
    <Text style={{ color: palette.textSecondary }}>
      {appointmentCount(schedule.length)}{nextAppointment ? ` · Próxima a las ${nextAppointment.time}` : ''}
    </Text>
    {schedule.length ? <View style={[styles.list, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
      {schedule.map((item, index) => <AppointmentRow key={item.id} item={item} palette={palette} showDate={period === 'Lista'} onPress={() => onOpenAppointment(item.id)} last={index === schedule.length - 1} />)}
    </View> : <EmptyState date={date} period={period === 'Semana' ? 'Día' : period} palette={palette} />}
    {!schedule.length && period === 'Día' && <Pressable accessibilityRole="button" onPress={onShowGrid} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: palette.primary }}>Ver disponibilidad</Text>
    </Pressable>}
  </View>;
}

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT = 176;
const TIME_GUTTER_WIDTH = 54;
const PROVIDER_LANE_WIDTH = 196;

function DayView({ date, todayDate, items, palette, providers, canCreateAppointment, onCreateAppointment, onOpenAppointment }: {
  date: string;
  todayDate?: string;
  items: AgendaItem[];
  palette: Palette;
  providers: { id: string; name: string }[];
  canCreateAppointment: boolean;
  onCreateAppointment?: (date: string, time: string, providerId: string) => void;
  onOpenAppointment: (id: string) => void;
}) {
  const dayItems = items.filter(item => item.date === date);
  const lanes = providers.length ? providers : [{ id: '', name: 'Sin profesional asignado' }];
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;
  const slots = Array.from({ length: (DAY_END_HOUR - DAY_START_HOUR) * 4 - 2 }, (_, index) => {
    const minutes = DAY_START_HOUR * 60 + index * 15;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  });

  return <View style={[styles.dayFrame, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.dayScroll}>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.dayHorizontal} contentContainerStyle={styles.dayContent}>
        <View style={styles.timeGutter}>
          <View style={[styles.providerSpacer, { borderBottomColor: palette.line }]} />
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => <View key={index} style={[styles.hourLabel, { height: HOUR_HEIGHT }]}><Text style={[styles.hourText, { color: palette.textSecondary }]}>{String(index + DAY_START_HOUR).padStart(2, '0')}:00</Text></View>)}
        </View>
        {lanes.map(provider => {
          const appointments = dayItems.filter(item => item.providerId === provider.id).sort((a, b) => a.time.localeCompare(b.time));
          return <View key={provider.id || 'unassigned'} style={[styles.providerLane, { width: PROVIDER_LANE_WIDTH, borderColor: palette.line }]}>
            <View style={[styles.providerHeader, { backgroundColor: date === todayDate ? palette.backgroundSelected : palette.backgroundElement, borderBottomColor: palette.line }]}>
              <View style={[styles.providerAvatar, { backgroundColor: palette.primarySoft }]}><Text style={[styles.providerInitials, { color: palette.primary }]}>{initials(provider.name)}</Text></View>
              <View style={styles.providerHeaderCopy}><Text numberOfLines={1} style={[styles.providerName, { color: palette.text }]}>{provider.name}</Text><Text style={[styles.providerCount, { color: palette.textSecondary }]}>{appointments.length} {appointments.length === 1 ? 'cita' : 'citas'}</Text></View>
            </View>
            <View style={[styles.dayColumn, { height: gridHeight, backgroundColor: palette.backgroundElement }]}>
              {canCreateAppointment && onCreateAppointment ? slots.map(time => {
                const [hour, minute] = time.split(':').map(Number);
                const top = ((hour - DAY_START_HOUR) + minute / 60) * HOUR_HEIGHT;
                return <Pressable key={time} accessibilityRole="button" accessibilityLabel={`Agendar cita con ${provider.name} el ${longDate(date)} a las ${time}`} onPress={() => onCreateAppointment(date, time, provider.id)} style={({ pressed }) => [styles.bookingSlot, { top, height: HOUR_HEIGHT / 4, borderTopColor: palette.line, backgroundColor: pressed ? palette.primarySoft : 'transparent' }]}><View style={styles.slotPlus}><View style={[styles.slotPlusBar, styles.slotPlusHorizontal, { backgroundColor: palette.primary }]} /><View style={[styles.slotPlusBar, styles.slotPlusVertical, { backgroundColor: palette.primary }]} /></View></Pressable>;
              }) : null}
              {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => <View key={index} pointerEvents="none" style={[styles.hourRule, { top: (index + 1) * HOUR_HEIGHT, borderColor: palette.line }]} />)}
              {appointments.map(item => {
                const [hour, minute] = item.time.split(':').map(Number);
                const offset = (hour - DAY_START_HOUR) * 60 + minute;
                const duration = Math.max(15, Number.parseInt(item.duration, 10) || 45);
                if (offset < 0 || offset >= (DAY_END_HOUR - DAY_START_HOUR) * 60) return null;
                const top = offset / 60 * HOUR_HEIGHT + 2;
                const height = Math.max(28, duration / 60 * HOUR_HEIGHT - 4);
                const color = agendaHex(item.agendaColor, palette);
                return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.time}, ${item.patientName}, ${item.service}, ${item.status}`} onPress={() => onOpenAppointment(item.id)} style={({ pressed }) => [styles.dayAppointment, { top, height, backgroundColor: palette.backgroundSelected, borderColor: palette.line, opacity: pressed ? 0.78 : 1 }]}>
                  <View style={[styles.appointmentDot, { backgroundColor: color }]} /><Text numberOfLines={1} style={[styles.appointmentTime, { color: palette.primary }]}>{item.time}</Text><Text numberOfLines={1} style={[styles.appointmentPatient, { color: palette.text }]}>{item.patientName}</Text><Text numberOfLines={1} style={[styles.appointmentService, { color: palette.textSecondary }]}>{item.service}</Text><Text numberOfLines={1} style={[styles.appointmentService, { color: palette.textSecondary }]}>{item.status}</Text>
                </Pressable>;
              })}
            </View>
          </View>;
        })}
      </ScrollView>
    </ScrollView>
    <View style={[styles.dayEmpty, { borderTopColor: palette.line }]}><Text style={[styles.dayEmptyText, { color: palette.textSecondary }]}>{canCreateAppointment ? 'Toca una hora libre para agendar.' : dayItems.length === 0 ? 'No hay citas para este día.' : `${dayItems.length} ${dayItems.length === 1 ? 'cita programada' : 'citas programadas'}`}</Text></View>
  </View>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('es-MX') || '—';
}

function MonthView({ date, items, palette, onSelectDate }: { date: string; items: AgendaItem[]; palette: Palette; onSelectDate: (date: string, period: Period) => void }) {
  const cells = monthDates(date);
  return <View style={[styles.month, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
    <View style={styles.monthHeading}>{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <Text key={day} style={[styles.weekdayLabel, { color: palette.textSecondary }]}>{day}</Text>)}</View>
    <View style={styles.monthGrid}>{cells.map((day, index) => {
      const appointments = day ? items.filter(item => item.date === day) : [];
      const selected = day === date;
      return <Pressable key={`${day || 'empty'}-${index}`} disabled={!day} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={day ? `${longDate(day)}, ${appointments.length} ${appointments.length === 1 ? 'cita' : 'citas'}` : undefined} onPress={() => day && onSelectDate(day, 'Día')} style={[styles.monthCell, { borderColor: palette.line, backgroundColor: selected ? palette.primarySoft : 'transparent' }]}>
        {day ? <>
          <Text style={[styles.monthNumber, { color: selected ? palette.primary : palette.text }]}>{Number(day.slice(-2))}</Text>
          <View style={styles.eventDots}>{appointments.slice(0, 3).map(item => <View key={item.id} style={[styles.eventDot, { backgroundColor: agendaHex(item.agendaColor, palette) }]} />)}{appointments.length > 3 && <Text style={[styles.moreCount, { color: palette.textSecondary }]}>+{appointments.length - 3}</Text>}</View>
        </> : null}
      </Pressable>;
    })}</View>
    <Pressable accessibilityRole="button" onPress={() => onSelectDate(date, 'Día')} style={[styles.monthSelection, { borderTopColor: palette.line }]}>
      <View><Text style={[styles.monthSelectionTitle, { color: palette.text }]}>{longDate(date)}</Text><Text style={[styles.monthSelectionMeta, { color: palette.textSecondary }]}>{appointmentCount(items.filter(item => item.date === date).length)} · Ver día</Text></View>
      <Text style={[styles.monthSelectionArrow, { color: palette.primary }]}>›</Text>
    </Pressable>
  </View>;
}

function YearView({ date, items, palette, onSelectDate }: { date: string; items: AgendaItem[]; palette: Palette; onSelectDate: (date: string, period: Period) => void }) {
  const year = Number(date.slice(0, 4));
  const months = Array.from({ length: 12 }, (_, month) => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const appointments = items.filter(item => item.date.startsWith(key));
    return { month, key, appointments };
  });
  return <View style={styles.yearGrid}>{months.map(({ month, key, appointments }) => {
    const daysActive = new Set(appointments.map(item => item.date)).size;
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Ver ${monthName(year, month)}: ${appointmentCount(appointments.length)}`} onPress={() => onSelectDate(`${key}-01`, 'Mes')} style={[styles.yearMonth, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
      <Text style={[styles.yearName, { color: palette.text }]}>{monthName(year, month)}</Text>
      <Text style={[styles.yearCount, { color: palette.primary }]}>{appointmentCount(appointments.length)}</Text>
      <Text style={[styles.yearActivity, { color: palette.textSecondary }]}>{daysActive ? `${daysActive} ${daysActive === 1 ? 'día' : 'días'} con actividad` : 'Sin actividad'}</Text>
    </Pressable>;
  })}</View>;
}

function AppointmentRow({ item, palette, showDate, onPress, last }: { item: AgendaItem; palette: Palette; showDate: boolean; onPress: () => void; last: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.date}, ${item.time}, ${item.patientName}, ${item.service}, ${item.status}`} onPress={onPress} style={[styles.item, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line }]}>
    <View style={[styles.timePill, { backgroundColor: palette.primarySoft }]}>{showDate ? <Text style={[styles.dateText, { color: palette.primary }]}>{shortDate(item.date)}</Text> : null}<Text style={[styles.time, { color: palette.primary }]}>{item.time}</Text></View>
    <View style={styles.main}><Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>{item.patientName}</Text><Text style={[styles.copy, { color: palette.textSecondary }]} numberOfLines={1}>{item.service} · {item.clinician}</Text><Text style={[styles.meta, { color: palette.textSecondary }]} numberOfLines={1}>{item.branch}</Text></View>
    <View style={styles.statusWrap}><View style={[styles.colorDot, { backgroundColor: agendaHex(item.agendaColor, palette) }]} /><Text style={[styles.state, { color: palette.textSecondary }]} numberOfLines={2}>{item.status}</Text></View><Text style={[styles.chevron, { color: palette.textSecondary }]}>›</Text>
  </Pressable>;
}

function EmptyState({ date, period, palette }: { date: string; period: Period; palette: Palette }) {
  return <View style={[styles.empty, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
    <Text style={[styles.emptyTitle, { color: palette.text }]}>Agenda despejada</Text>
    <Text style={[styles.emptyCopy, { color: palette.textSecondary }]}>{period === 'Lista' ? 'No hay citas para este intervalo.' : `No hay citas para ${longDate(date)}.`}</Text>
  </View>;
}

function weekDates(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() + index);
    return dateKey(day);
  });
}

function monthDates(value: string) {
  const [year, month] = value.split('-').map(Number);
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((firstWeekday + days) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= days ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
  });
}

function dateKey(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function appointmentCount(count: number) { return `${count} ${count === 1 ? 'cita' : 'citas'}`; }
function weekdayShort(value: string) { return new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)); }
function longDate(value: string) { return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)); }
function shortDate(value: string) { return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)); }
function monthName(year: number, month: number) { return new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1, 12))); }
function agendaHex(id: string, palette: Palette) { return agendaPalette.find(item => item.id === id)?.hex || palette.textSecondary; }

const styles = StyleSheet.create({
  dayFrame: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, dayScroll: { height: 540 }, dayHorizontal: { flexGrow: 0 }, dayContent: { alignItems: 'flex-start' }, timeGutter: { width: TIME_GUTTER_WIDTH, alignItems: 'flex-end' }, providerSpacer: { height: 62, width: '100%', borderBottomWidth: StyleSheet.hairlineWidth }, hourLabel: { width: '100%', alignItems: 'flex-end', paddingRight: 7, paddingTop: 0 }, hourText: { fontSize: 10, fontVariant: ['tabular-nums'] }, providerLane: { borderLeftWidth: StyleSheet.hairlineWidth }, providerHeader: { height: 62, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }, providerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, providerInitials: { fontSize: 11, fontWeight: '800' }, providerHeaderCopy: { flex: 1, gap: 2 }, providerName: { fontSize: 12, fontWeight: '700' }, providerCount: { fontSize: 10 }, dayColumn: { position: 'relative' }, bookingSlot: { position: 'absolute', left: 0, right: 0, zIndex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6, borderTopWidth: StyleSheet.hairlineWidth }, slotPlus: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }, slotPlusBar: { position: 'absolute', borderRadius: 1 }, slotPlusHorizontal: { width: 10, height: 2 }, slotPlusVertical: { width: 2, height: 10 }, hourRule: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth }, dayAppointment: { position: 'absolute', left: 4, right: 4, zIndex: 2, borderWidth: 1, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden', gap: 1 }, appointmentDot: { position: 'absolute', top: 7, right: 7, width: 6, height: 6, borderRadius: 3 }, appointmentTime: { fontSize: 10, fontWeight: '800' }, appointmentPatient: { fontSize: 11, fontWeight: '700' }, appointmentService: { fontSize: 9, lineHeight: 12 }, dayEmpty: { minHeight: 38, justifyContent: 'center', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth }, dayEmptyText: { fontSize: 11 },
  list: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 13 },
  item: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10 },
  timePill: { minWidth: 54, minHeight: 48, paddingHorizontal: 5, borderRadius: 11, justifyContent: 'center', alignItems: 'center', gap: 2 },
  dateText: { fontSize: 10, fontWeight: '700' }, time: { fontSize: 14, fontWeight: '800' }, main: { flex: 1, gap: 3 }, name: { fontSize: 15, fontWeight: '700' }, copy: { fontSize: 12, lineHeight: 17 }, meta: { fontSize: 10 },
  statusWrap: { maxWidth: 75, flexDirection: 'row', alignItems: 'center', gap: 5 }, state: { fontSize: 10, textAlign: 'right', fontWeight: '700' }, chevron: { fontSize: 23 }, colorDot: { width: 7, height: 7, borderRadius: 4 },
  week: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 1 }, weekDay: { width: 142, borderRightWidth: StyleSheet.hairlineWidth }, weekHeading: { minHeight: 74, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 2 }, weekName: { fontSize: 12, textTransform: 'capitalize' }, weekNumber: { fontSize: 20, fontWeight: '800' }, weekCount: { fontSize: 10 }, weekEvents: { padding: 7, gap: 7 }, weekEvent: { borderWidth: 1, borderRadius: 11, padding: 8, gap: 4 }, weekEventTime: { flexDirection: 'row', alignItems: 'center', gap: 5 }, weekEventName: { fontSize: 12, fontWeight: '700' }, weekEventMeta: { fontSize: 10, lineHeight: 14 }, emptyDay: { fontSize: 11, textAlign: 'center', paddingVertical: 12 },
  month: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, monthHeading: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth }, weekdayLabel: { width: '14.2857%', height: 34, textAlign: 'center', textAlignVertical: 'center', fontSize: 10, fontWeight: '700' }, monthGrid: { flexDirection: 'row', flexWrap: 'wrap' }, monthCell: { width: '14.2857%', minHeight: 50, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', gap: 3 }, monthNumber: { fontSize: 13, fontWeight: '700' }, eventDots: { minHeight: 8, flexDirection: 'row', alignItems: 'center', gap: 3 }, eventDot: { width: 5, height: 5, borderRadius: 3 }, moreCount: { fontSize: 8, lineHeight: 9 }, monthSelection: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, monthSelectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' }, monthSelectionMeta: { fontSize: 11, marginTop: 2 }, monthSelectionArrow: { fontSize: 24 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, yearMonth: { width: '48.5%', minHeight: 91, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, justifyContent: 'center', gap: 4 }, yearName: { fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }, yearCount: { fontSize: 12, fontWeight: '700' }, yearActivity: { fontSize: 10 },
  empty: { borderWidth: 1, minHeight: 102, borderRadius: 16, padding: 17, justifyContent: 'center', gap: 6 }, emptyTitle: { fontSize: 15, fontWeight: '700' }, emptyCopy: { fontSize: 12, lineHeight: 17 },
});

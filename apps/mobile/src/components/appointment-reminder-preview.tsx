import { SymbolView } from 'expo-symbols';
import { View, StyleSheet } from 'react-native';
import { CrmText as Text } from '@/components/crm-text';
import { Colors } from '@/constants/theme';

type Palette = (typeof Colors)[keyof typeof Colors];

export function AppointmentReminderPreview({ status, palette }: { status?: string; palette: Palette }) {
  const state = status === 'Confirmada' ? 'Programados' : status === 'Cancelada' ? 'Cancelados' : status === 'Completada' ? 'Cita completada' : 'Al confirmar';
  return <View style={[styles.card, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
    <View style={styles.heading}><View style={[styles.icon, { backgroundColor: palette.primarySoft }]}><SymbolView name={{ ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' }} tintColor={palette.primary} size={17} /></View><View style={styles.headingCopy}><Text style={[styles.title, { color: palette.text }]}>Avisos de la cita</Text><Text style={[styles.state, { color: palette.primary }]}>{state}</Text></View></View>
    <View style={[styles.row, { borderTopColor: palette.line }]}><Text style={[styles.label, { color: palette.textSecondary }]}>Confirmación</Text><Text style={[styles.value, { color: palette.text }]}>2 días antes</Text></View>
    <View style={[styles.row, { borderTopColor: palette.line }]}><Text style={[styles.label, { color: palette.textSecondary }]}>Recordatorio</Text><Text style={[styles.value, { color: palette.text }]}>1 día antes</Text></View>
    <View style={[styles.row, { borderTopColor: palette.line }]}><Text style={[styles.label, { color: palette.textSecondary }]}>Recordatorio del día</Text><Text style={[styles.value, { color: palette.text }]}>5 horas antes</Text></View>
    <Text style={[styles.copy, { color: palette.textSecondary }]}>La agenda de avisos se actualiza al confirmar, reprogramar o cancelar. El envío automático requiere conectar un proveedor.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '800' },
  state: { fontSize: 10, fontWeight: '700' },
  row: { minHeight: 34, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 11 },
  value: { fontSize: 11, fontWeight: '700' },
  copy: { fontSize: 10, lineHeight: 15, marginTop: 6 },
});

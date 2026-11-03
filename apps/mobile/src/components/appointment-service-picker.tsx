import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CrmText as Text, CrmTextInput as TextInput } from '@/components/crm-text';
import { Colors } from '@/constants/theme';

type Palette = (typeof Colors)[keyof typeof Colors];
type ServiceOption = { id: string; name: string; code?: string; category?: string; durationMin?: number; durationMax?: number; active?: boolean };

export function AppointmentServicePicker({ services, eligibleIds, selectedIds, onChange, palette }: {
  services: ServiceOption[];
  eligibleIds: string[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  palette: Palette;
}) {
  const [query, setQuery] = useState('');
  const eligible = useMemo(() => new Set(eligibleIds), [eligibleIds]);
  const selected = selectedIds.map(id => services.find(service => service.id === id)).filter((service): service is ServiceOption => Boolean(service));
  const matches = services.filter(service => service.active !== false && eligible.has(service.id) && service.name.toLocaleLowerCase('es-MX').includes(query.trim().toLocaleLowerCase('es-MX'))).slice(0, 30);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(item => item !== id));
    else if (selectedIds.length < 12 && eligible.has(id)) onChange([...selectedIds, id]);
  };

  return <View style={styles.container}>
    <View style={styles.heading}><Text style={[styles.label, { color: palette.text }]}>Servicios del catálogo</Text><Text style={[styles.count, { color: palette.textSecondary }]}>{selectedIds.length}/12</Text></View>
    {selected.length ? <View style={styles.selectedList}>{selected.map(service => {
      const isEligible = eligible.has(service.id);
      return <View key={service.id} style={[styles.selectedChip, { backgroundColor: isEligible ? palette.primarySoft : palette.background, borderColor: isEligible ? palette.primary : palette.danger }]}>
        <View style={styles.selectedCopy}><Text numberOfLines={1} style={[styles.selectedName, { color: isEligible ? palette.primary : palette.danger }]}>{service.name}</Text>{!isEligible ? <Text style={[styles.unavailable, { color: palette.danger }]}>Ya no disponible para esta asignación</Text> : null}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${service.name}`} onPress={() => toggle(service.id)} style={styles.remove}><Text style={[styles.removeText, { color: isEligible ? palette.primary : palette.danger }]}>×</Text></Pressable>
      </View>;
    })}</View> : <Text style={[styles.help, { color: palette.textSecondary }]}>Elige uno o varios servicios. La duración total se suma automáticamente.</Text>}
    <TextInput accessibilityLabel="Buscar servicio" value={query} onChangeText={setQuery} placeholder="Buscar servicio" placeholderTextColor={palette.textSecondary} style={[styles.search, { backgroundColor: palette.background, borderColor: palette.line, color: palette.text }]} />
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator style={[styles.results, { borderColor: palette.line, backgroundColor: palette.background }]}>
      {matches.map(service => {
        const isSelected = selectedIds.includes(service.id);
        const disabled = !isSelected && selectedIds.length >= 12;
        return <Pressable key={service.id} accessibilityRole="button" accessibilityState={{ selected: isSelected, disabled }} disabled={disabled} onPress={() => toggle(service.id)} style={({ pressed }) => [styles.result, { borderBottomColor: palette.line, backgroundColor: pressed ? palette.backgroundSelected : palette.background, opacity: disabled ? 0.48 : 1 }]}>
          <View style={[styles.check, { borderColor: isSelected ? palette.primary : palette.line, backgroundColor: isSelected ? palette.primary : 'transparent' }]}>{isSelected ? <Text style={styles.checkmark}>✓</Text> : null}</View>
          <View style={styles.resultCopy}><Text numberOfLines={1} style={[styles.resultName, { color: palette.text }]}>{service.name}</Text><Text numberOfLines={1} style={[styles.resultMeta, { color: palette.textSecondary }]}>{serviceDuration(service)}{service.category ? ` · ${service.category}` : ''}</Text></View>
        </Pressable>;
      })}
      {!matches.length ? <Text style={[styles.empty, { color: palette.textSecondary }]}>{eligibleIds.length ? 'No hay servicios que coincidan con la búsqueda.' : 'No hay servicios habilitados para esta sucursal y profesional.'}</Text> : null}
      {matches.length === 30 ? <Text style={[styles.help, styles.more, { color: palette.textSecondary }]}>Hay más resultados. Escribe para acotar la búsqueda.</Text> : null}
    </ScrollView>
  </View>;
}

function serviceDuration(service: ServiceOption) {
  const min = Number(service.durationMin || 0);
  const max = Number(service.durationMax || min);
  if (!min) return 'Duración pendiente';
  return `${min}${max > min ? `–${max}` : ''} min`;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '700' },
  count: { fontSize: 11, fontWeight: '700' },
  help: { fontSize: 12, lineHeight: 18 },
  selectedList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectedChip: { minHeight: 42, maxWidth: '100%', borderWidth: 1, borderRadius: 12, paddingLeft: 10, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectedCopy: { flexShrink: 1, minWidth: 0, paddingVertical: 4, gap: 1 },
  selectedName: { fontSize: 11, fontWeight: '800' },
  unavailable: { fontSize: 9, fontWeight: '700' },
  remove: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 23, lineHeight: 26 },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 13 },
  results: { maxHeight: 220, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  result: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { width: 21, height: 21, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 15 },
  resultCopy: { flex: 1, minWidth: 0, gap: 2 },
  resultName: { fontSize: 12, fontWeight: '700' },
  resultMeta: { fontSize: 10 },
  empty: { padding: 13, fontSize: 12, lineHeight: 18 },
  more: { paddingHorizontal: 11, paddingVertical: 8 },
});

export const serviceCategories = ['Faciales', 'Corporales', 'Depilación', 'Inyectables', 'Sueroterapia', 'Lipoláser', 'Consultas y revisiones'];

const row = (code, category, name, durationMin = null, durationMax = durationMin, offers = [], extra = {}) => ({
  code, category, name, durationMin, durationMax, offers, status: 'setup_needed', active: true,
  source: extra.source || 'Lista de servicios proporcionada por la clínica', variants: extra.variants || [], notes: extra.notes || '',
});
const offer = (kind, amount, currency = 'MXN', sessions = null, label = '') => ({ kind, amount, currency, sessions, label });

// Preserve the source's distinctions and unknowns. Null is never interpreted as zero.
export const initialClinicServices = [
  row('fac-limpieza', 'Faciales', 'Facial Limpieza', 30, 30, [offer('single', 700), offer('package', 2500, 'MXN', null, 'Número de sesiones por definir')]),
  row('fac-dermapen-ha', 'Faciales', 'Dermapen ácido hialurónico', 30, 30, [offer('single', 1000), offer('package', 2500, 'MXN', null, 'Número de sesiones por definir')]),
  row('fac-dermapen-pdrn', 'Faciales', 'Dermapen PDRN de Salmón', 30, 30, [offer('single', 1000), offer('package', 3500, 'MXN', null, 'Número de sesiones por definir')]),
  row('fac-pink-k', 'Faciales', 'Dermapen Pink K Coreano', 30, 30, [offer('single', 799), offer('package', 3500, 'MXN', null, 'Número de sesiones por definir')]),
  row('fac-mesoject-pink', 'Faciales', 'Mesoject Gun + Dermapen PINK', 30, 30, [offer('single', 80, 'USD')]),
  row('fac-mesoject', 'Faciales', 'Mesoject Gun', 30, 30, [offer('single', 3500), offer('package', 5000, 'MXN', 5)]),
  row('fac-oxygen', 'Faciales', 'Oxygen Bubbles', 30, 30, [offer('single', 999), offer('package', 4000, 'MXN', 5)]),
  row('fac-radiofrecuencia', 'Faciales', 'Radiofrecuencia Fraccionada', 30, 30, [offer('single', 100, 'USD'), offer('package', 250, 'USD', 3)]),
  row('fac-morpheus8', 'Faciales', 'Morpheus 8', 30, 30, [offer('single', 300, 'USD'), offer('package', 500, 'USD', 3)]),
  row('corp-drenaje', 'Corporales', 'Drenaje Linfático', 25, 30, [offer('package', 2500, 'MXN', null, 'Número de sesiones por definir')], { notes: 'Duración fuente: 25–30 min. La agenda puede sugerir 30 min.' }),
  row('corp-masaje', 'Corporales', 'Masaje relajante / Descontracturante', 60, 60, [offer('single', 800), offer('package', 2500, 'MXN', null, 'Número de sesiones por definir')]),
  row('corp-emszero', 'Corporales', 'Emszero', 30, 30, [offer('single', 500), offer('package', 2500, 'MXN', null, 'Número de sesiones por definir')]),
  row('corp-emszero-peptonas', 'Corporales', 'Emszero – Peptonas', 30, 30, [offer('package', 3500, 'MXN', null, 'Número de sesiones por definir')], { notes: 'La fuente indica que no se ha vendido una sesión individual.' }),
  row('corp-dermalift', 'Corporales', 'Dermalift', 30, 30, [offer('package', 4000, 'MXN', null, 'Número de sesiones por definir')], { notes: 'Mantener separado de Dermalift Profiler.' }),
  row('dep-general', 'Depilación', 'Depilación láser', 15, 60, [], { variants: ['Piernas completas','Rostro completo','Medias piernas','Brazos completos','Bikini Hollywood','Media cara','Medios brazos','Bikini Brasileño','Axilas','Bikini','Patillas','Línea interglúteo','Bigote','Mentón','Nariz','Entrecejo'], notes: 'Duración y precio individual varían por zona. Los importes publicados son paquetes de 10 sesiones.' }),
  row('fz-hifu-full', 'Faciales', 'HIFU 7D Ultraformer – Full Face', null, null, [offer('single', 130, 'USD')], { source: 'Lista FloreZen by Úrsula' }),
  row('fz-exilis-full', 'Corporales', 'Exilis Luxury 360', null, null, [offer('single', 2000)], { source: 'Lista FloreZen by Úrsula', notes: 'Área no especificada en esta entrada.' }),
  row('fz-dermalift-profiler', 'Faciales', 'Dermalift Profiler', null, null, [offer('single', 1500)], { source: 'Lista FloreZen by Úrsula', notes: 'No combinar con Dermalift sin confirmar equivalencia.' }),
  row('fz-hifu-face-area', 'Faciales', 'HIFU 7D Ultraformer – 1 Área Facial', null, null, [offer('single', 1200)], { source: 'Lista FloreZen by Úrsula' }),
  row('fz-hifu-body-area', 'Corporales', 'HIFU 7D Ultraformer – 1 Área Corporal', null, null, [offer('single', 50, 'USD')], { source: 'Lista FloreZen by Úrsula' }),
  row('fz-exilis-body-area', 'Corporales', 'Exilis Luxury 360 – 1 Área Corporal', null, null, [offer('single', 1200)], { source: 'Lista FloreZen by Úrsula' }),
  row('fz-vlase', 'Faciales', "Hifu V'lase – Full Face", null, null, [offer('single', 70, 'USD')], { source: 'Lista FloreZen by Úrsula' }),
  row('fz-hydrafacial', 'Faciales', 'Hydrafacial GlowUp – Rostro / Full Face', null, null, [offer('single', 1200)], { source: 'Lista FloreZen by Úrsula' }),
  row('sue-boost', 'Sueroterapia', 'EL BOOST', null, null, [offer('single', 1500)]),
  ...[['Piernas completas',4000],['Rostro completo',3000],['Medias piernas',3000],['Brazos completos',3000],['Bikini Hollywood',2500],['Media cara',2500],['Medios brazos',2500],['Bikini Brasileño',1800],['Axilas',1500],['Bikini',1500],['Patillas',1500],['Línea interglúteo',1500],['Bigote',999],['Mentón',999],['Nariz',999],['Entrecejo',999]].map(([name,amount], i) => row(`dep-area-${String(i+1).padStart(2,'0')}`, 'Depilación', name, null, null, [offer('package', amount, 'MXN', 10)])),
  row('iny-frente', 'Inyectables', 'Toxina botulínica · Frente', null, null, [offer('single', 2000)], { variants: ['20 unidades'] }),
  row('iny-entrecejo', 'Inyectables', 'Toxina botulínica · Entrecejo', null, null, [offer('single', 1200)], { variants: ['12 unidades'] }),
  row('iny-patitas', 'Inyectables', 'Toxina botulínica · Patitas de Gallo', null, null, [offer('single', 1800)], { variants: ['18 unidades'] }),
  row('iny-antifaz', 'Inyectables', 'Toxina botulínica · Antifaz Completo', null, null, [offer('single', 4000)], { variants: ['50 unidades'], notes: 'Oferta publicada independiente; no se calcula sumando zonas.' }),
  row('iny-hialuronico', 'Inyectables', 'Relleno de Ácido Hialurónico', null, null, [offer('single', 4000)], { notes: 'Posible equivalencia con Ácido Hialurónico de Velka; confirmar antes de vincular historial.' }),
  row('iny-enzimas', 'Inyectables', 'Aplicación de Enzimas', null, null, [offer('single', 1500)]),
  row('iny-nctf-ncpr', 'Inyectables', 'NCTF o NCPR', null, null, [offer('single', 1800)], { notes: 'Confirmar si son variantes de un producto o servicios separados.' }),
  row('iny-adn-salmon', 'Inyectables', 'ADN de Salmón', null, null, [offer('single', 1500)], { notes: 'Servicio independiente de Dermapen PDRN.' }),
  row('iny-sculptra', 'Inyectables', 'Sculptra', null, null, [offer('single', 450, 'USD'), offer('package', 1200, 'USD', 3)]),
  row('lipo-assessment', 'Lipoláser', 'Valoración Lipoláser', null, null, [offer('single', 500, 'MXN')], { notes: 'Moneda aclarada por la clínica: MXN.' }),
  ...[['1/2 área',300],['1 área',550],['2 áreas',850],['3 áreas',1100]].map(([name,amount], i) => row(`lipo-${i+1}`, 'Lipoláser', `Lipoláser · ${name}`, null, null, [offer('single', amount, 'USD')], { variants: ['Brazos','Papada','Entrepierna','Vientre bajo','Banana rolls','Joroba','Área del brasier','Piernas','Monte venus','Rodillas','Tobillos','Chaparreras','Love handles','Espalda','Abdomen alto','Jowls'] })),
  row('velka-alopecia', 'Consultas y revisiones', 'Alopecia / Caída de Cabello', 30, 30, [offer('single', 2000)], { source: 'Entrada existente en Velka; confirmar que siga vigente.' }),
];

export function normalizeServiceRow(record) {
  return { id: record.id, code: record.code, category: record.category, name: record.name, description: record.description || '', durationMin: record.duration_min ?? record.durationMin ?? null, durationMax: record.duration_max ?? record.durationMax ?? null, offers: record.offers || [], variants: record.variants || [], notes: record.notes || '', source: record.source || '', status: record.status || 'setup_needed', active: record.active !== false, branchIds: record.branch_ids || [], updatedAt: record.updated_at || null };
}

export function serviceSetupState(service) {
  if (!service.durationMin || !service.offers?.length || service.offers.some(item => item.currency === 'UNRESOLVED')) return 'setup_needed';
  return 'ready';
}

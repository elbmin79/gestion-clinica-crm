import { createClient } from './client.js';
import { initialClinicServices, normalizeServiceRow } from '../clinic-services.js';

function raise(error, fallback) {
  if (!error) return;
  if (error.code === '42501') throw new Error('Tu cuenta no tiene permiso para modificar el catálogo de servicios.');
  if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('Falta aplicar la migración del catálogo de servicios.');
  throw new Error(error.message || fallback);
}

export function createClinicServicesStore({ clientFactory = createClient } = {}) {
  return {
    async load(clinicId) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const [result, branchLinks, providerLinks] = await Promise.all([
        client.from('clinic_services').select('*').eq('clinic_id', clinicId).order('category').order('name'),
        client.from('clinic_service_branches').select('service_id, branch_id').eq('clinic_id', clinicId),
        client.from('clinic_service_providers').select('service_id, provider_id').eq('clinic_id', clinicId),
      ]);
      raise(result.error, 'No se pudo cargar el catálogo.');
      raise(branchLinks.error, 'No se pudieron cargar las sucursales asignadas a servicios.');
      raise(providerLinks.error, 'No se pudieron cargar los profesionales asignados a servicios.');
      const branchesByService = new Map();
      for (const link of branchLinks.data || []) branchesByService.set(link.service_id, [...(branchesByService.get(link.service_id) || []), link.branch_id]);
      const providersByService = new Map();
      for (const link of providerLinks.data || []) providersByService.set(link.service_id, [...(providersByService.get(link.service_id) || []), link.provider_id]);
      return (result.data || []).map(row => ({ ...normalizeServiceRow(row), branchIds: branchesByService.get(row.id) || [], providerIds: providersByService.get(row.id) || [] }));
    },
    async save(clinicId, service) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const result = await client.rpc('save_clinic_service', {
        target_clinic_id: clinicId, target_service_id: service.id || null, target_code: service.code,
        target_category: service.category, target_name: service.name.trim(), target_description: service.description?.trim() || null,
        target_duration_min: service.durationMin ? Number(service.durationMin) : null,
        target_duration_max: service.durationMax ? Number(service.durationMax) : null,
        target_offers: service.offers || [], target_variants: service.variants || [], target_notes: service.notes?.trim() || null,
        target_source: service.source?.trim() || 'Capturado por la clínica', target_status: service.status || 'setup_needed',
        target_active: service.active !== false, target_branch_ids: service.branchIds || [], target_provider_ids: service.providerIds || [],
      });
      raise(result.error, 'No se pudo guardar el servicio.');
      const saved = await client.from('clinic_services').select('*').eq('clinic_id', clinicId).eq('id', result.data).single();
      raise(saved.error, 'El servicio se guardó, pero no se pudo volver a leer.');
      return { ...normalizeServiceRow(saved.data), branchIds: service.branchIds || [], providerIds: service.providerIds || [] };
    },
    async seed(clinicId) {
      const client = clientFactory();
      if (!client) throw new Error('La conexión con Supabase no está configurada.');
      const rows = initialClinicServices.map(service => ({
        clinic_id: clinicId, code: service.code, category: service.category, name: service.name,
        duration_min: service.durationMin, duration_max: service.durationMax, offers: service.offers,
        variants: service.variants, notes: service.notes || null, source: service.source, active: true,
        status: 'setup_needed',
      }));
      const result = await client.from('clinic_services').upsert(rows, { onConflict: 'clinic_id,code', ignoreDuplicates: true }).select('*');
      raise(result.error, 'No se pudo preparar la lista inicial.');
      return (result.data || []).map(normalizeServiceRow);
    },
  };
}

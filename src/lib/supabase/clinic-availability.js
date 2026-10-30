import { createClient } from './client.js';
import { clinicDateTimeToIso } from './clinic-agenda.js';

function throwDatabaseError(result, fallback) {
  if (!result.error) return;
  const error = new Error(result.error.message || fallback);
  error.code = result.error.code;
  error.cause = result.error;
  throw error;
}

export function createClinicAvailabilityStore({ clientFactory = createClient } = {}) {
  const clientOrThrow = () => {
    const client = clientFactory();
    if (!client) throw new Error('La conexión con Supabase no está configurada.');
    return client;
  };

  return {
    async load(clinicId) {
      const client = clientOrThrow();
      const [settingsResult, blocksResult] = await Promise.all([
        client.from('clinic_availability_settings').select('allow_provider_overlaps').eq('clinic_id', clinicId).maybeSingle(),
        client.from('clinic_availability_blocks').select('id, title, scope, branch_id, provider_id, starts_at, ends_at, created_at').eq('clinic_id', clinicId).order('starts_at', { ascending: true }),
      ]);
      throwDatabaseError(settingsResult, 'No se pudo cargar la configuración de disponibilidad.');
      throwDatabaseError(blocksResult, 'No se pudieron cargar los horarios bloqueados.');
      return {
        allowProviderOverlaps: settingsResult.data?.allow_provider_overlaps === true,
        blocks: blocksResult.data || [],
      };
    },

    async saveProviderOverlaps(clinicId, allowProviderOverlaps) {
      const result = await clientOrThrow().from('clinic_availability_settings').upsert({
        clinic_id: clinicId,
        allow_provider_overlaps: allowProviderOverlaps === true,
      }, { onConflict: 'clinic_id' });
      throwDatabaseError(result, 'No se pudo guardar la regla de citas simultáneas.');
    },

    async createBlock(clinicId, input, timeZone, userId) {
      const startsAt = clinicDateTimeToIso(input.startDate, input.startTime, timeZone);
      const endsAt = clinicDateTimeToIso(input.endDate, input.endTime, timeZone);
      if (new Date(endsAt) <= new Date(startsAt)) throw new Error('La hora de fin debe ser posterior a la hora de inicio.');
      const scope = input.scope || 'clinic';
      const result = await clientOrThrow().from('clinic_availability_blocks').insert({
        clinic_id: clinicId,
        title: input.title.trim(),
        scope,
        branch_id: scope === 'branch' ? input.branchId : null,
        provider_id: scope === 'provider' ? input.providerId : null,
        starts_at: startsAt,
        ends_at: endsAt,
        created_by: userId || null,
      }).select('id, title, scope, branch_id, provider_id, starts_at, ends_at, created_at').single();
      throwDatabaseError(result, 'No se pudo bloquear ese horario.');
      return result.data;
    },

    async deleteBlock(clinicId, blockId) {
      const result = await clientOrThrow().from('clinic_availability_blocks').delete().eq('clinic_id', clinicId).eq('id', blockId);
      throwDatabaseError(result, 'No se pudo eliminar el horario bloqueado.');
    },
  };
}

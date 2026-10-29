import { resolveMockSender, templateReadyForKind } from './provider-core.js';

export async function loadClinicWhatsAppRoute(client, clinicId, branchId, templateKind) {
  const { data: settings, error: settingsError } = await client
    .from('clinic_whatsapp_configurations')
    .select('clinic_id, provider_mode, allow_default_fallback, template_readiness')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (settingsError) return { ok: false, reason: 'No se pudo cargar la configuración de WhatsApp de la clínica.' };
  if (!settings) return { ok: false, reason: 'La clínica no tiene configuración de WhatsApp en modo de prueba.' };

  const { data: senders, error: sendersError } = await client
    .from('clinic_whatsapp_senders')
    .select('sender_key, display_label, branch_id, is_default, active')
    .eq('clinic_id', clinicId)
    .eq('active', true);
  if (sendersError) return { ok: false, reason: 'No se pudieron cargar los números simulados de la clínica.' };

  const route = resolveMockSender(settings, senders, branchId);
  if (!route.ok) return route;
  if (!templateReadyForKind(settings, templateKind)) {
    return { ok: false, reason: 'La plantilla de prueba para este tipo de aviso no está marcada como lista.' };
  }
  return { ok: true, ...route, settings };
}

export async function resolveInboundWhatsAppSender(client, phoneNumberId) {
  const normalizedId = String(phoneNumberId || '').trim();
  if (!normalizedId || !/^\d{5,30}$/.test(normalizedId)) return null;
  const { data, error } = await client
    .from('clinic_whatsapp_senders')
    .select('clinic_id, branch_id, meta_phone_number_id, clinic_whatsapp_configurations!inner(provider_mode)')
    .eq('meta_phone_number_id', normalizedId)
    .eq('active', true)
    .maybeSingle();
  if (error || !data || data.clinic_whatsapp_configurations?.provider_mode !== 'cloud') return null;
  return { clinicId: data.clinic_id, branchId: data.branch_id || null };
}

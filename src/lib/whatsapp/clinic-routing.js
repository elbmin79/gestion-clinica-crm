import { resolveMockSender, resolveTwilioSender, templateReadyForKind } from './provider-core.js';

async function loadSenderBranchIds(client, clinicId, senderKey) {
  const { data, error } = await client
    .from('clinic_whatsapp_sender_branches')
    .select('branch_id')
    .eq('clinic_id', clinicId)
    .eq('sender_key', senderKey);
  return error ? null : (data || []).map(assignment => assignment.branch_id);
}

export async function loadClinicWhatsAppRoute(client, clinicId, branchId, templateKind) {
  const { data: settings, error: settingsError } = await client
    .from('clinic_whatsapp_configurations')
    .select('clinic_id, provider_mode, allow_default_fallback, template_readiness')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (settingsError) return { ok: false, reason: 'No se pudo cargar la configuración de WhatsApp de la clínica.' };
  if (!settings) return { ok: false, reason: 'La clínica no tiene configuración de WhatsApp.' };

  const { data: senders, error: sendersError } = await client
    .from('clinic_whatsapp_senders')
    .select('sender_key, display_label, branch_id, is_default, active')
    .eq('clinic_id', clinicId)
    .eq('active', true);
  if (sendersError) return { ok: false, reason: 'No se pudieron cargar los números de WhatsApp de la clínica.' };

  const { data: branchAssignments, error: branchAssignmentsError } = await client
    .from('clinic_whatsapp_sender_branches')
    .select('sender_key, branch_id')
    .eq('clinic_id', clinicId);
  if (branchAssignmentsError) return { ok: false, reason: 'No se pudieron cargar las sucursales asignadas a WhatsApp.' };
  const branchIdsBySender = new Map();
  for (const assignment of branchAssignments || []) {
    const branchIds = branchIdsBySender.get(assignment.sender_key) || [];
    branchIds.push(assignment.branch_id);
    branchIdsBySender.set(assignment.sender_key, branchIds);
  }
  const routedSenders = (senders || []).map(sender => ({
    ...sender,
    branch_ids: branchIdsBySender.get(sender.sender_key) || (sender.branch_id ? [sender.branch_id] : []),
  }));

  const route = resolveMockSender(settings, routedSenders, branchId);
  const selectedRoute = settings.provider_mode === 'twilio'
    ? resolveTwilioSender({ ...settings, allow_default_fallback: false }, routedSenders, branchId)
    : route;
  if (!selectedRoute.ok) return selectedRoute;
  if (!templateReadyForKind(settings, templateKind)) {
    return { ok: false, reason: 'La plantilla aprobada para este tipo de aviso no está marcada como lista.' };
  }
  return { ok: true, ...selectedRoute, settings };
}

export async function resolveInboundWhatsAppSender(client, phoneNumberId) {
  const normalizedId = String(phoneNumberId || '').trim();
  if (!normalizedId || !/^\d{5,30}$/.test(normalizedId)) return null;
  const { data, error } = await client
    .from('clinic_whatsapp_senders')
    .select('clinic_id, sender_key, branch_id, meta_phone_number_id, clinic_whatsapp_configurations!inner(provider_mode)')
    .eq('meta_phone_number_id', normalizedId)
    .eq('active', true)
    .maybeSingle();
  if (error || !data || data.clinic_whatsapp_configurations?.provider_mode !== 'cloud') return null;
  const branchIds = await loadSenderBranchIds(client, data.clinic_id, data.sender_key);
  if (!branchIds) return null;
  const assignedBranches = branchIds.length ? branchIds : data.branch_id ? [data.branch_id] : [];
  return { clinicId: data.clinic_id, branchId: assignedBranches.length === 1 ? assignedBranches[0] : null };
}

export async function resolveInboundTwilioWhatsAppSender(client, recipientPhone) {
  const normalizedPhone = String(recipientPhone || '').replace(/^whatsapp:/i, '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) return null;
  const { data, error } = await client
    .from('clinic_whatsapp_senders')
    .select('clinic_id, sender_key, branch_id, clinic_whatsapp_configurations!inner(provider_mode)')
    .eq('sender_key', `twilio:${normalizedPhone}`)
    .eq('active', true)
    .maybeSingle();
  if (error || !data || data.clinic_whatsapp_configurations?.provider_mode !== 'twilio') return null;
  const branchIds = await loadSenderBranchIds(client, data.clinic_id, data.sender_key);
  if (!branchIds) return null;
  const assignedBranches = branchIds.length ? branchIds : data.branch_id ? [data.branch_id] : [];
  return { clinicId: data.clinic_id, branchId: assignedBranches.length === 1 ? assignedBranches[0] : null };
}

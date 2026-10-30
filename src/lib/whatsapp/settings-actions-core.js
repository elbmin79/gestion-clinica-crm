import { getWhatsAppTemplateStatuses, listRegisteredTwilioWhatsAppSenders } from './twilio-whatsapp.server.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const twilioSenderKeyPattern = /^twilio:\+[1-9]\d{7,14}$/;
const templateKinds = ['confirmation_2d', 'reminder_1d', 'reminder_5h'];
const defaultReadiness = Object.freeze({ confirmation_2d: false, reminder_1d: false, reminder_5h: false });
const defaultTemplateStatuses = Object.freeze({ confirmation_2d: 'not_configured', reminder_1d: 'not_configured', reminder_5h: 'not_configured' });

export function createWhatsAppSettingsActions({
  createServerClient,
  env = process.env,
  listWhatsAppSenders = listRegisteredTwilioWhatsAppSenders,
  getTemplateStatuses = getWhatsAppTemplateStatuses,
} = {}) {
  async function authorizedAdmin(clinicId) {
    if (!uuidPattern.test(String(clinicId || ''))) return { error: 'Selecciona una clínica válida.' };
    if (typeof createServerClient !== 'function') return { error: 'La conexión con la clínica no está configurada.' };
    let client;
    try { client = await createServerClient(); } catch { return { error: 'La conexión con la clínica no está configurada.' }; }
    if (!client) return { error: 'La conexión con la clínica no está configurada.' };
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user) return { error: 'Inicia sesión de nuevo para administrar WhatsApp.' };
    const { data: membership, error: membershipError } = await client
      .from('clinic_memberships').select('role').eq('clinic_id', clinicId).eq('user_id', authData.user.id).maybeSingle();
    if (membershipError || membership?.role !== 'admin') return { error: 'Solo una persona administradora puede configurar WhatsApp.' };
    return { client };
  }

  async function readSettings(client, clinicId) {
    const [{ data: config, error: configError }, { data: senders, error: sendersError }] = await Promise.all([
      client.from('clinic_whatsapp_configurations')
        .select('clinic_id, provider_mode, allow_default_fallback, template_readiness, updated_at')
        .eq('clinic_id', clinicId).maybeSingle(),
      client.from('clinic_whatsapp_senders')
        .select('sender_key, display_label, branch_id, is_default, active')
        .eq('clinic_id', clinicId).eq('active', true).order('created_at', { ascending: true }),
    ]);
    if (configError || sendersError) return { error: 'No se pudo cargar la configuración de WhatsApp. Verifica que la base de datos esté actualizada.' };
    const clinicSenders = (senders || []).filter(sender => twilioSenderKeyPattern.test(sender.sender_key)).map(sender => ({
      senderKey: sender.sender_key,
      whatsappNumber: sender.sender_key.slice('twilio:'.length),
      displayLabel: sender.display_label,
      branchId: sender.branch_id || '',
      isDefault: sender.is_default === true,
      active: sender.active !== false,
    }));
    return {
      configured: Boolean(config),
      settings: {
        allowDefaultFallback: config?.allow_default_fallback === true && clinicSenders.some(sender => sender.isDefault && sender.active),
        templateReadiness: { ...defaultReadiness, ...(config?.template_readiness || {}) },
        providerMode: 'twilio',
      },
      senders: clinicSenders,
    };
  }

  async function load(clinicId) {
    try {
      const context = await authorizedAdmin(clinicId);
      if (context.error) return { ok: false, message: context.error };
      const result = await readSettings(context.client, clinicId);
      return result.error ? { ok: false, message: result.error } : { ok: true, ...result };
    } catch {
      return { ok: false, message: 'No se pudo cargar la configuración de WhatsApp.' };
    }
  }

  async function loadAvailableSenders(clinicId) {
    const templateStatuses = { ...defaultTemplateStatuses, ...await getTemplateStatuses({ env }) };
    const availableTemplates = Object.fromEntries(templateKinds.map(kind => [kind, templateStatuses[kind] === 'approved']));
    const deliveryEnabled = env.TWILIO_WHATSAPP_ENABLED === 'true' && env.WHATSAPP_AUTOMATION_ENABLED === 'true';
    try {
      const context = await authorizedAdmin(clinicId);
      if (context.error) return { ok: false, message: context.error };
      const senders = await listWhatsAppSenders({ env });
      return { ok: true, senders, availableTemplates, templateStatuses, deliveryEnabled };
    } catch {
      return { ok: false, message: 'No se pudieron consultar los números registrados. Verifica la conexión del servidor.', availableTemplates, templateStatuses, deliveryEnabled };
    }
  }

  async function save(input) {
    try {
      const clinicId = input?.clinicId;
      const context = await authorizedAdmin(clinicId);
      if (context.error) return { ok: false, message: context.error };
      const providerMode = 'twilio';
      const senders = Array.isArray(input?.senders) ? input.senders : null;
      if (!senders || senders.length > 50) return { ok: false, message: 'La lista de remitentes no es válida.' };
      const readiness = input?.templateReadiness || {};
      if (Object.keys(readiness).some(key => !templateKinds.includes(key))
        || templateKinds.some(key => typeof readiness[key] !== 'boolean')) {
        return { ok: false, message: 'El estado de las plantillas no es válido.' };
      }
      const templateStatuses = { ...defaultTemplateStatuses, ...await getTemplateStatuses({ env }) };
      const availableTemplates = Object.fromEntries(templateKinds.map(kind => [kind, templateStatuses[kind] === 'approved']));
      if (templateKinds.some(kind => readiness[kind] && !availableTemplates[kind])) {
        return { ok: false, message: 'Configura en el servidor la plantilla aprobada antes de activarla aquí.' };
      }
      if (senders.some(sender => sender?.branchId && !uuidPattern.test(String(sender.branchId)))) {
        return { ok: false, message: 'Selecciona una sucursal válida para cada remitente.' };
      }
      const safeSenders = senders.map(sender => ({
        sender_key: `twilio:${String(sender?.whatsappNumber || '').trim()}`,
        display_label: String(sender?.displayLabel || '').trim(),
        branch_id: sender?.branchId || null,
        is_default: sender?.isDefault === true,
        active: sender?.active !== false,
      }));
      const senderKeyPattern = /^twilio:\+[1-9]\d{7,14}$/;
      if (safeSenders.some(sender => !senderKeyPattern.test(sender.sender_key)
        || !sender.display_label || sender.display_label.length > 120)) {
        return { ok: false, message: 'Cada número de WhatsApp necesita una etiqueta y un teléfono internacional válido.' };
      }
      if (safeSenders.length) {
        let registeredSenders;
        try { registeredSenders = await listWhatsAppSenders({ env }); }
        catch { return { ok: false, message: 'No se pudieron verificar los números registrados. Inténtalo de nuevo más tarde.' }; }
        const onlineNumbers = new Set(registeredSenders.map(sender => sender.phoneNumber));
        if (safeSenders.some(sender => !onlineNumbers.has(sender.sender_key.slice('twilio:'.length)))) {
          return { ok: false, message: 'Solo puedes asignar números registrados y activos. Actualiza la lista y vuelve a intentarlo.' };
        }
      }
      const { data, error } = await context.client.rpc('save_clinic_whatsapp_settings_v2', {
        target_clinic_id: clinicId,
        target_provider_mode: providerMode,
        target_allow_default_fallback: input?.allowDefaultFallback === true,
        target_template_readiness: readiness,
        target_senders: safeSenders,
      });
      if (error || data !== true) return { ok: false, message: 'No se guardó la configuración. Verifica las sucursales y el número predeterminado.' };
      const saved = await readSettings(context.client, clinicId);
      return saved.error ? { ok: false, message: saved.error } : { ok: true, ...saved, message: 'Configuración guardada.' };
    } catch {
      return { ok: false, message: 'No se pudo guardar la configuración.' };
    }
  }

  return { load, loadAvailableSenders, save };
}

import { createMockWhatsAppProvider } from './provider-core.js';
import { loadClinicWhatsAppRoute } from './clinic-routing.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const templateKinds = ['confirmation_2d', 'reminder_1d', 'reminder_5h'];
const defaultReadiness = Object.freeze({ confirmation_2d: false, reminder_1d: false, reminder_5h: false });

export function createWhatsAppSettingsActions({
  createServerClient,
  loadRoute = loadClinicWhatsAppRoute,
  createProvider = createMockWhatsAppProvider,
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
    if (configError || sendersError) return { error: 'No se pudo cargar la configuración de WhatsApp. Revisa que esté aplicada la migración de modo de prueba.' };
    return {
      configured: Boolean(config),
      settings: {
        allowDefaultFallback: config?.allow_default_fallback === true,
        templateReadiness: { ...defaultReadiness, ...(config?.template_readiness || {}) },
        providerMode: config?.provider_mode || 'mock',
      },
      senders: (senders || []).map(sender => ({
        senderKey: sender.sender_key,
        displayLabel: sender.display_label,
        branchId: sender.branch_id || '',
        isDefault: sender.is_default === true,
        active: sender.active !== false,
      })),
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

  async function save(input) {
    try {
      const clinicId = input?.clinicId;
      const context = await authorizedAdmin(clinicId);
      if (context.error) return { ok: false, message: context.error };
      const senders = Array.isArray(input?.senders) ? input.senders : null;
      if (!senders || senders.length > 50) return { ok: false, message: 'La lista de números simulados no es válida.' };
      const readiness = input?.templateReadiness || {};
      if (Object.keys(readiness).some(key => !templateKinds.includes(key))
        || templateKinds.some(key => typeof readiness[key] !== 'boolean')) {
        return { ok: false, message: 'El estado de las plantillas simuladas no es válido.' };
      }
      if (senders.some(sender => sender?.branchId && !uuidPattern.test(String(sender.branchId)))) {
        return { ok: false, message: 'Selecciona una sucursal válida para cada remitente.' };
      }
      const safeSenders = senders.map(sender => ({
        sender_key: String(sender?.senderKey || ''),
        display_label: String(sender?.displayLabel || '').trim(),
        branch_id: sender?.branchId || null,
        is_default: sender?.isDefault === true,
        active: sender?.active !== false,
      }));
      if (safeSenders.some(sender => !/^mock:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sender.sender_key)
        || !sender.display_label || sender.display_label.length > 120)) {
        return { ok: false, message: 'Cada número debe tener una etiqueta y un identificador de prueba válido.' };
      }
      const { data, error } = await context.client.rpc('save_clinic_whatsapp_settings', {
        target_clinic_id: clinicId,
        target_allow_default_fallback: input?.allowDefaultFallback === true,
        target_template_readiness: readiness,
        target_senders: safeSenders,
      });
      if (error || data !== true) return { ok: false, message: 'No se guardó la configuración. Verifica las sucursales y el número predeterminado.' };
      const saved = await readSettings(context.client, clinicId);
      return saved.error ? { ok: false, message: saved.error } : { ok: true, ...saved, message: 'Configuración simulada guardada.' };
    } catch {
      return { ok: false, message: 'No se pudo guardar la configuración simulada.' };
    }
  }

  async function testSend(input) {
    try {
      const clinicId = input?.clinicId;
      const context = await authorizedAdmin(clinicId);
      if (context.error) return { ok: false, message: context.error };
      const templateKind = templateKinds.includes(input?.templateKind) ? input.templateKind : 'reminder_1d';
      const route = await loadRoute(context.client, clinicId, input?.branchId || null, templateKind);
      if (!route.ok) return { ok: false, message: route.reason };
      const outcome = ['accepted', 'failed', 'unknown'].includes(input?.outcome) ? input.outcome : 'accepted';
      const result = await createProvider({ outcome }).sendTemplate({ sender: route.sender, templateKind });
      return {
        ok: true,
        simulated: true,
        status: result.status,
        senderLabel: route.sender.display_label,
        route: route.route,
        messageId: result.messageId,
        message: result.error || (result.status === 'accepted' ? 'Mensaje sintético aceptado por el proveedor simulado. No se envió a WhatsApp.' : 'Resultado simulado.'),
      };
    } catch {
      return { ok: false, message: 'No se pudo ejecutar la prueba simulada.' };
    }
  }

  return { load, save, testSend };
}

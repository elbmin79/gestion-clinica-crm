import { randomUUID } from 'node:crypto';

export const whatsappTemplateKinds = Object.freeze({
  confirmation_2d: 'confirmation_2d',
  reminder_1d: 'reminder_1d',
  reminder_5h: 'reminder_5h',
});

export function resolveWhatsAppProviderMode(env = process.env) {
  const configured = String(env.WHATSAPP_PROVIDER_MODE || '').trim().toLowerCase();
  if (configured === 'twilio' && String(env.TWILIO_WHATSAPP_ENABLED || '').toLowerCase() === 'true') return 'twilio';
  if (configured === 'mock') return 'mock';
  return 'disabled';
}

export function templateReadyForKind(settings, kind) {
  return Object.hasOwn(whatsappTemplateKinds, kind)
    && settings?.template_readiness?.[kind] === true;
}

export function resolveMockSender(settings, senders, branchId) {
  if (!settings || settings.provider_mode !== 'mock') return { ok: false, reason: 'WhatsApp mock mode is not configured.' };
  const activeSenders = (senders || []).filter(sender => sender.active !== false && String(sender.sender_key || '').startsWith('mock:'));
  const branchSender = branchId
    ? activeSenders.find(sender => sender.branch_id === branchId || sender.branch_ids?.includes(branchId))
    : null;
  if (branchSender) return { ok: true, sender: branchSender, route: 'branch' };
  return { ok: false, reason: 'No se configuró un número simulado para esta sucursal.' };
}

export function resolveTwilioSender(settings, senders, branchId) {
  if (!settings || settings.provider_mode !== 'twilio') return { ok: false, reason: 'La clínica no está configurada para Twilio.' };
  const activeSenders = (senders || []).filter(sender => sender.active !== false && /^twilio:\+[1-9]\d{7,14}$/.test(String(sender.sender_key || '')));
  const branchSender = branchId ? activeSenders.find(sender => sender.branch_id === branchId || sender.branch_ids?.includes(branchId)) : null;
  if (branchSender) return { ok: true, sender: branchSender, route: 'branch' };
  return { ok: false, reason: 'No hay un número de WhatsApp de Twilio activo para esta sucursal.' };
}

export function createMockWhatsAppProvider({ outcome = 'accepted', idFactory = randomUUID } = {}) {
  const normalizedOutcome = ['accepted', 'failed', 'unknown'].includes(outcome) ? outcome : 'accepted';
  return {
    mode: 'mock',
    simulated: true,
    available: true,
    async sendTemplate({ sender, templateKind }) {
      if (!String(sender?.sender_key || '').startsWith('mock:')) {
        return { status: 'failed', messageId: null, error: 'El remitente no pertenece al proveedor simulado.', simulated: true };
      }
      if (!Object.hasOwn(whatsappTemplateKinds, templateKind)) {
        return { status: 'failed', messageId: null, error: 'La plantilla simulada no está disponible.', simulated: true };
      }
      if (normalizedOutcome === 'failed') {
        return { status: 'failed', messageId: null, error: 'Resultado simulado: el proveedor rechazó el mensaje.', simulated: true };
      }
      if (normalizedOutcome === 'unknown') {
        return { status: 'unknown', messageId: null, error: 'Resultado simulado: no se pudo confirmar la entrega.', simulated: true };
      }
      return { status: 'accepted', messageId: `mock:${idFactory()}`, error: null, simulated: true };
    },
  };
}

export function createDisabledWhatsAppProvider() {
  return {
    mode: 'disabled',
    simulated: false,
    available: false,
    error: 'WhatsApp no está configurado para enviar mensajes.',
    async sendTemplate() {
      return { status: 'failed', messageId: null, error: this.error, simulated: false };
    },
  };
}

import { createDisabledWhatsAppProvider, createMockWhatsAppProvider, resolveWhatsAppProviderMode } from './provider-core.js';
import { createTwilioWhatsAppProvider } from './twilio-whatsapp.server.js';

export function createWhatsAppProvider({ env = process.env, outcome } = {}) {
  const mode = resolveWhatsAppProviderMode(env);
  if (mode === 'twilio') return createTwilioWhatsAppProvider({ env });
  if (mode !== 'mock') return createDisabledWhatsAppProvider();
  return createMockWhatsAppProvider({ outcome: outcome || env.WHATSAPP_MOCK_OUTCOME || 'accepted' });
}

import { createDisabledWhatsAppProvider, createMockWhatsAppProvider, resolveWhatsAppProviderMode } from './provider-core.js';

export function createWhatsAppProvider({ env = process.env, outcome } = {}) {
  const mode = resolveWhatsAppProviderMode(env);
  if (mode !== 'mock') return createDisabledWhatsAppProvider();
  return createMockWhatsAppProvider({ outcome: outcome || env.WHATSAPP_MOCK_OUTCOME || 'accepted' });
}

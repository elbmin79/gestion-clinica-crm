const allowedCredentialNames = new Set([
  'cloud_access_token',
  'webhook_app_secret',
  'webhook_verify_token',
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Server-side credential lookup contract for a future approved provider.
// The current phase has no backing vault and deliberately never reads env vars.
export function createWhatsAppSecretStore(backend = null) {
  if (backend !== null && typeof backend?.getSecret !== 'function') {
    throw new TypeError('A WhatsApp secret-store backend must implement getSecret.');
  }

  return Object.freeze({
    async getSecret({ clinicId, name } = {}) {
      if (!uuidPattern.test(String(clinicId || '')) || !allowedCredentialNames.has(name)) return null;
      if (!backend) return null;
      const value = await backend.getSecret({ clinicId, name });
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
  });
}

export const whatsappSecretStore = createWhatsAppSecretStore();

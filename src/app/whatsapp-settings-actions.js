'use server';

import { createWhatsAppSettingsActions } from '../lib/whatsapp/settings-actions-core.js';
import { createClient } from '../lib/supabase/server.js';

const actions = createWhatsAppSettingsActions({ createServerClient: createClient });

export async function loadClinicWhatsAppSettings(clinicId) {
  return actions.load(clinicId);
}

export async function saveClinicWhatsAppSettings(input) {
  return actions.save(input);
}

export async function dispatchClinicWhatsAppMockTest(input) {
  return actions.testSend(input);
}

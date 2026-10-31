'use server';

import { createWhatsAppSettingsActions } from '../lib/whatsapp/settings-actions-core.js';
import { createClient } from '../lib/supabase/server.js';

const actions = createWhatsAppSettingsActions({ createServerClient: createClient });

export async function loadClinicWhatsAppSettings(clinicId) {
  return actions.load(clinicId);
}

export async function loadAvailableWhatsAppSenders(clinicId) {
  return actions.loadAvailableSenders(clinicId);
}

export async function saveClinicWhatsAppSettings(input) {
  return actions.save(input);
}

export async function createClinicWhatsAppTemplateDraft(input) {
  return actions.createTemplateDraft(input);
}

export async function submitClinicWhatsAppTemplateApproval(input) {
  return actions.submitTemplate(input);
}

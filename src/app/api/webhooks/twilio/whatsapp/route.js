import { createServiceClient } from '@/lib/supabase/service-client';
import { createTwilioWhatsAppWebhookHandler } from '@/lib/twilio-whatsapp-webhook';

export const runtime = 'nodejs';

export const POST = createTwilioWhatsAppWebhookHandler({ createServiceClient });

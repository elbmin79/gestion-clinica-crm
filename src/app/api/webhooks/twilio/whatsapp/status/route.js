import { createServiceClient } from '@/lib/supabase/service-client';
import { createTwilioWhatsAppStatusWebhookHandler } from '@/lib/twilio-whatsapp-webhook';

export const runtime = 'nodejs';

export const POST = createTwilioWhatsAppStatusWebhookHandler({ createServiceClient });

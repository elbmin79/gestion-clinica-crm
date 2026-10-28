import { createServiceClient } from '@/lib/supabase/service-client';
import { createWhatsAppWebhookHandlers } from '@/lib/whatsapp-webhook-handler';

export const runtime = 'nodejs';

const handlers = createWhatsAppWebhookHandlers({ createServiceClient });
export const GET = handlers.GET;
export const POST = handlers.POST;

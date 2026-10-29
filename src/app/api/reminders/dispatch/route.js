import { createServiceClient } from '@/lib/supabase/service-client';
import { createReminderDispatchHandler } from '@/lib/appointment-reminder-dispatch.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = createReminderDispatchHandler({ createServiceClient });

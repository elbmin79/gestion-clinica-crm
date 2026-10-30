import { createServiceClient } from '@/lib/supabase/service-client';
import { createConfirmationDispatchHandler } from '@/lib/appointment-confirmation-dispatch';

export const runtime = 'nodejs';
export const maxDuration = 60;

const dispatch = createConfirmationDispatchHandler({ createServiceClient });
export const GET = dispatch;
export const POST = dispatch;

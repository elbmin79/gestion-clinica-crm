'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '../../lib/supabase/server';

export async function signIn(formData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const requestedNext = String(formData.get('next') || '/');
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';
  const supabase = await createClient();

  if (!supabase) redirect('/login?error=not-configured');
  if (!email || !password) redirect('/login?error=invalid');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=invalid');
  redirect(next);
}

export async function signOut(formData) {
  const supabase = await createClient();
  if (supabase) {
    const endpoint=String(formData?.get('pushEndpoint') || '');
    if(endpoint && endpoint.length<=2048){
      const {data:{user}}=await supabase.auth.getUser();
      if(user)await supabase.from('staff_push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',endpoint);
    }
    await supabase.auth.signOut();
  }
  redirect('/login');
}

export async function sendPasswordReset(formData) {
  const email = String(formData.get('email') || '').trim();
  const supabase = await createClient();

  if (!supabase) redirect('/login?error=not-configured');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/forgot-password?error=invalid');
  }

  const requestHeaders = await headers();
  const requestOrigin = requestHeaders.get('origin') || 'http://localhost:3000';
  let origin;
  try {
    origin = new URL(requestOrigin).origin;
  } catch {
    origin = 'http://localhost:3000';
  }
  const redirectTo = new URL('/auth/callback', origin);
  redirectTo.searchParams.set('next', '/update-password');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
  });
  if (error) {
    // Keep provider details in server logs so failed recovery emails can be
    // diagnosed without exposing account or infrastructure details in the UI.
    console.error('[auth:password-reset] Supabase rejected email request', {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      redirect('/forgot-password?error=rate-limited');
    }
    redirect('/forgot-password?error=send-failed');
  }
  redirect('/forgot-password?sent=1');
}

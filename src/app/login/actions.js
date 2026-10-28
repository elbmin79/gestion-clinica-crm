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

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
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
  if (error) redirect('/forgot-password?error=send-failed');
  redirect('/forgot-password?sent=1');
}

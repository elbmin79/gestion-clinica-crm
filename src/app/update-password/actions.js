'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

export async function updatePassword(formData) {
  const password = String(formData.get('password') || '');
  const confirmation = String(formData.get('confirmation') || '');
  if (password.length < 8) redirect('/update-password?error=weak-password');
  if (password !== confirmation) redirect('/update-password?error=mismatch');

  const supabase = await createClient();
  if (!supabase) redirect('/login?error=not-configured');

  const { data, error: sessionError } = await supabase.auth.getUser();
  if (!data?.user || sessionError) redirect('/login?error=auth-link');

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect('/update-password?error=update-failed');
  redirect('/');
}

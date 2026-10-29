'use server';

import { createClient } from '../../lib/supabase/server';
import { createServiceClient } from '../../lib/supabase/service-client';
import { isHiddenDirectoryAccount } from '../../lib/account-visibility';

// Return identities only for this clinic's members and already-linked professionals.
// Never expose the global auth directory through the professional picker.
export async function loadProfessionalAccounts(clinicId) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(clinicId || '')) return { ok: false, message: 'Selecciona una clínica válida.' };
    const client = await createClient();
    const { data: session } = client ? await client.auth.getUser() : { data: null };
    if (!session?.user) return { ok: false, message: 'Inicia sesión para consultar las cuentas.' };
    const { data: membership } = await client.from('clinic_memberships').select('role').eq('clinic_id', clinicId).eq('user_id', session.user.id).maybeSingle();
    if (membership?.role !== 'admin') return { ok: false, message: 'Solo una persona administradora puede vincular cuentas.' };
    const service = createServiceClient();
    if (!service) return { ok: false, message: 'El acceso seguro del servidor no está configurado.' };
    const [members, providers] = await Promise.all([
      client.from('clinic_memberships').select('user_id').eq('clinic_id', clinicId),
      client.from('clinic_providers').select('user_id').eq('clinic_id', clinicId).not('user_id', 'is', null),
    ]);
    if (members.error || providers.error) throw new Error();
    const memberIds = new Set(members.data.map(row => row.user_id));
    const ids = [...new Set([...memberIds, ...providers.data.map(row => row.user_id)])];
    const accounts = await Promise.all(ids.map(async userId => {
      const { data, error } = await service.auth.admin.getUserById(userId);
      if (error) throw error;
      const user = data.user;
      if (!user || isHiddenDirectoryAccount(user)) return null;
      const metadata = user.user_metadata || {};
      const name = [metadata.names, metadata.firstLastName, metadata.secondLastName].filter(Boolean).join(' ') || metadata.full_name || metadata.name || user.email || 'Cuenta sin nombre';
      const avatarPath = metadata.avatar_path;
      return { userId, name, email: user.email || '', hasAccess: memberIds.has(userId), avatarUrl: typeof avatarPath === 'string' && avatarPath.startsWith(`${userId}/`) ? service.storage.from('profile-avatars').getPublicUrl(avatarPath).data.publicUrl : '' };
    }));
    return { ok: true, accounts: accounts.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es')) };
  } catch {
    return { ok: false, message: 'No se pudieron cargar las cuentas. Inténtalo de nuevo.' };
  }
}

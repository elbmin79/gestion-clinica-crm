import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { CrmText as Text } from '@/components/crm-text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCrmRouter } from '@/lib/use-crm-router';

import { CLINIC_PERMISSION_GROUPS, CLINIC_ROLES, permissionsForPreset, sanitizeClinicPermissions } from '@elixir-clinic/crm-core/permissions';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';
import { useClinicWorkspace } from '@/providers/clinic-workspace-provider';
import { useCrmColorScheme } from '@/providers/crm-theme-provider';
import { clinicAccessRequest, type ClinicAccessAccount, type ClinicAccessData, type ClinicAccessMember, type ClinicAccessPermissions, type ClinicAccessRole, type ClinicInvitation } from '@/lib/clinic-access-api';

const roleLabels = Object.fromEntries(CLINIC_ROLES) as Record<ClinicAccessRole, string>;
type Editor = { kind: 'assign'; account: ClinicAccessAccount; role: ClinicAccessRole; permissions: ClinicAccessPermissions }
  | { kind: 'member'; member: ClinicAccessMember; role: ClinicAccessRole; permissions: ClinicAccessPermissions };

export default function TeamScreen() {
  const router = useCrmRouter();
  const { session } = useAuth();
  const { clinic } = useClinicWorkspace();
  const theme = useCrmColorScheme();
  const palette = Colors[theme];
  const [data, setData] = useState<ClinicAccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ClinicAccessRole>('clinician');
  const [invitePermissions, setInvitePermissions] = useState<ClinicAccessPermissions>(() => preset('clinician'));
  const [customizeInvite, setCustomizeInvite] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const refresh = useCallback(async () => {
    if (!clinic || clinic.role !== 'admin') { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const result = await clinicAccessRequest<ClinicAccessData>(clinic.clinicId);
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el equipo de la clínica.');
    } finally { setLoading(false); }
  }, [clinic]);

  useEffect(() => { void refresh(); }, [refresh, session?.access_token]);

  const runAction = async (key: string, payload: Record<string, unknown>) => {
    if (!clinic) return false;
    setBusy(key); setError(''); setMessage('');
    try {
      const result = await clinicAccessRequest<{ ok: boolean; message?: string }>(clinic.clinicId, payload);
      setMessage(result.message || 'Los cambios se guardaron.');
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la solicitud.');
      return false;
    } finally { setBusy(''); }
  };

  const chooseInviteRole = (role: ClinicAccessRole) => {
    setInviteRole(role);
    setInvitePermissions(preset(role));
    setCustomizeInvite(false);
  };

  const sendInvite = async () => {
    if (!clinic) return;
    const ok = await runAction('invite', { action: 'invite', client: 'mobile', email: email.trim(), role: inviteRole, permissions: sanitizeClinicPermissions(invitePermissions, inviteRole) });
    if (ok) { setEmail(''); setCustomizeInvite(false); }
  };

  const openAssignment = (account: ClinicAccessAccount) => setEditor({ kind: 'assign', account, role: 'clinician', permissions: preset('clinician') });
  const openMember = (member: ClinicAccessMember) => setEditor({ kind: 'member', member, role: member.role, permissions: member.permissions });
  const setEditorRole = (role: ClinicAccessRole) => setEditor(current => current ? { ...current, role, permissions: preset(role) } : current);
  const setEditorPermission = (permission: string, value: boolean | 'self' | 'branch' | 'clinic') => setEditor(current => current ? { ...current, permissions: updatePermission(current.permissions, permission, value) } : current);

  const saveEditor = async () => {
    if (!clinic || !editor) return;
    const payload = {
      action: editor.kind === 'assign' ? 'assign' : 'update-member',
      userId: editor.kind === 'assign' ? editor.account.userId : editor.member.userId,
      role: editor.role,
      permissions: sanitizeClinicPermissions(editor.permissions, editor.role),
    };
    if (await runAction('editor', payload)) setEditor(null);
  };

  const revokeMember = async () => {
    if (!editor || editor.kind !== 'member') return;
    if (await runAction(editor.member.userId, { action: 'revoke-member', userId: editor.member.userId })) {
      setConfirmRevoke(false);
      setEditor(null);
    }
  };

  const inviteAgain = (invitation: ClinicInvitation) => runAction(invitation.id, {
    action: 'invite', client: 'mobile', email: invitation.email, role: invitation.role, permissions: invitation.permissions,
  });

  const revokeInvitation = (invitation: ClinicInvitation) => runAction(invitation.id, {
    action: 'revoke-invitation', invitationId: invitation.id,
  });

  if (clinic?.role !== 'admin') {
    return <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
      <View style={styles.content}><Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={[styles.back, { color: palette.primary }]}>‹ Más</Text></Pressable><Text style={[styles.title, { color: palette.text }]}>Acceso restringido</Text><Text style={[styles.body, { color: palette.textSecondary }]}>Solo una persona administradora puede administrar los accesos de la clínica.</Text></View>
    </SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.page, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={[styles.back, { color: palette.primary }]}>‹ Más</Text></Pressable>
        <View style={styles.heading}><Text style={[styles.title, { color: palette.text }]}>Equipo y accesos</Text><Text style={[styles.body, { color: palette.textSecondary }]}>Invita al equipo y administra sus permisos en {clinic.name}.</Text></View>

        <View style={[styles.sectionCard, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Invitar persona</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>Recibirá un enlace para aceptar el acceso a esta clínica.</Text>
          <Field label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="nombre@correo.com" keyboardType="email-address" palette={palette} />
          <RolePicker role={inviteRole} onChange={chooseInviteRole} palette={palette} />
          {inviteRole === 'admin' ? <View style={[styles.note, { backgroundColor: palette.primarySoft }]}><Text style={[styles.body, { color: palette.text }]}>La plantilla de administrador conserva acceso completo y no se puede personalizar.</Text></View> : <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: customizeInvite }} onPress={() => setCustomizeInvite(value => !value)} style={styles.expandButton}><Text style={[styles.expandText, { color: palette.primary }]}>{customizeInvite ? 'Ocultar permisos personalizados' : 'Personalizar permisos'}</Text><Text style={[styles.expandIcon, { color: palette.primary }]}>{customizeInvite ? '−' : '+'}</Text></Pressable>
            {customizeInvite && <PermissionFields role={inviteRole} permissions={invitePermissions} onChange={(key, value) => setInvitePermissions(current => updatePermission(current, key, value))} palette={palette} />}
          </>}
          <PrimaryButton title={busy === 'invite' ? 'Enviando invitación…' : 'Enviar invitación'} disabled={Boolean(busy) || !email.trim()} onPress={() => void sendInvite()} palette={palette} />
          <Text style={[styles.helper, { color: palette.textSecondary }]}>El correo de invitación requiere que la dirección pública del CRM esté configurada.</Text>
        </View>

        {message ? <View accessibilityRole="status" style={[styles.feedback, { backgroundColor: palette.primarySoft }]}><Text style={[styles.body, { color: palette.text }]}>{message}</Text></View> : null}
        {error ? <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: palette.backgroundElement, borderColor: palette.danger }]}><Text style={[styles.body, { color: palette.danger }]}>{error}</Text></View> : null}

        {loading ? <View style={styles.loading}><ActivityIndicator color={palette.primary} /><Text style={[styles.body, { color: palette.textSecondary }]}>Cargando equipo…</Text></View> : data ? <>
          {data.invitations.length > 0 && <View style={styles.listSection}><Text style={[styles.sectionTitle, { color: palette.text }]}>Invitaciones pendientes · {data.invitations.length}</Text>{data.invitations.map(invitation => <InvitationRow key={invitation.id} invitation={invitation} busy={busy === invitation.id} palette={palette} onResend={() => void inviteAgain(invitation)} onRevoke={() => void revokeInvitation(invitation)} />)}</View>}
          <View style={styles.listSection}><Text style={[styles.sectionTitle, { color: palette.text }]}>Cuentas con acceso · {data.members.length}</Text>{data.members.length ? data.members.map(member => <MemberRow key={member.userId} member={member} editable={member.role !== 'admin' && member.userId !== data.currentUserId} palette={palette} onEdit={() => openMember(member)} />) : <EmptyLine text="Aún no hay cuentas asignadas a esta clínica." palette={palette} />}</View>
          {data.accounts.length > 0 && <View style={styles.listSection}><Text style={[styles.sectionTitle, { color: palette.text }]}>Cuentas registradas sin acceso · {data.accounts.length}</Text>{data.accounts.map(account => <AccountRow key={account.userId} account={account} palette={palette} onAssign={() => openAssignment(account)} />)}</View>}
        </> : <Pressable accessibilityRole="button" onPress={() => void refresh()} style={[styles.retry, { borderColor: palette.line }]}><Text style={[styles.expandText, { color: palette.primary }]}>Intentar de nuevo</Text></Pressable>}
      </ScrollView>
      <Modal visible={Boolean(editor)} transparent animationType="slide" onRequestClose={() => { if (!busy) setEditor(null); }}>
        <View style={styles.modalBackdrop}><View style={[styles.modal, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}>
          {editor && <>
            <View style={styles.modalHeader}><View style={styles.modalHeadingCopy}><Text style={[styles.sectionTitle, { color: palette.text }]}>{confirmRevoke ? '¿Revocar acceso?' : editor.kind === 'assign' ? 'Configurar acceso' : 'Editar permisos'}</Text><Text style={[styles.body, { color: palette.textSecondary }]} numberOfLines={1}>{editor.kind === 'assign' ? editor.account.email : (editor.member.name || editor.member.email)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar" disabled={Boolean(busy)} onPress={() => { setConfirmRevoke(false); setEditor(null); }}><Text style={[styles.close, { color: palette.textSecondary }]}>×</Text></Pressable></View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {confirmRevoke ? <Text style={[styles.body, { color: palette.text }]}>{editor.kind === 'member' ? `${editor.member.name || editor.member.email} perderá el acceso a esta clínica.` : ''}</Text> : <>
                <Text style={[styles.label, { color: palette.textSecondary }]}>Plantilla inicial</Text>
                <RolePicker role={editor.role} onChange={setEditorRole} palette={palette} />
                {editor.role === 'admin' ? <View style={[styles.note, { backgroundColor: palette.primarySoft }]}><Text style={[styles.body, { color: palette.text }]}>La plantilla de administrador conserva acceso completo.</Text></View> : <PermissionFields role={editor.role} permissions={editor.permissions} onChange={setEditorPermission} palette={palette} />}
              </>}
            </ScrollView>
            <View style={styles.modalFooter}>
              {confirmRevoke ? <><SecondaryButton title="Cancelar" onPress={() => setConfirmRevoke(false)} palette={palette} /><PrimaryButton title={busy ? 'Revocando…' : 'Revocar acceso'} disabled={Boolean(busy)} onPress={() => void revokeMember()} palette={palette} danger /></>
                : <>{editor.kind === 'member' && editor.member.role !== 'admin' ? <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => setConfirmRevoke(true)} style={styles.revokeButton}><Text style={[styles.revokeText, { color: palette.danger }]}>Revocar acceso</Text></Pressable> : null}<SecondaryButton title="Cancelar" onPress={() => setEditor(null)} palette={palette} /><PrimaryButton title={busy === 'editor' ? 'Guardando…' : editor.kind === 'assign' ? 'Dar acceso' : 'Guardar permisos'} disabled={Boolean(busy)} onPress={() => void saveEditor()} palette={palette} /> </>}
            </View>
          </>}
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

function preset(role: ClinicAccessRole) { return permissionsForPreset(role) as ClinicAccessPermissions; }

function updatePermission(current: ClinicAccessPermissions, key: string, value: boolean | 'self' | 'branch' | 'clinic') {
  const next = { ...current, [key]: value };
  if (key === 'whatsapp.view' && value === false) { next['whatsapp.reply'] = false; next['whatsapp.manage'] = false; }
  if ((key === 'whatsapp.reply' || key === 'whatsapp.manage') && value === true) next['whatsapp.view'] = true;
  return next;
}

function RolePicker({ role, onChange, palette }: { role: ClinicAccessRole; onChange: (role: ClinicAccessRole) => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={styles.roleChoices}>{CLINIC_ROLES.map(([value, label]) => {
    const selected = role === value;
    return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange(value as ClinicAccessRole)} style={[styles.roleChoice, { backgroundColor: selected ? palette.primarySoft : palette.background, borderColor: selected ? palette.primary : palette.line }]}><Text style={[styles.roleText, { color: selected ? palette.primary : palette.textSecondary }]}>{label}</Text></Pressable>;
  })}</View>;
}

function PermissionFields({ role, permissions, onChange, palette }: { role: ClinicAccessRole; permissions: ClinicAccessPermissions; onChange: (key: string, value: boolean | 'self' | 'branch' | 'clinic') => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  if (role === 'admin') return <View style={[styles.note, { backgroundColor: palette.primarySoft }]}><Text style={[styles.body, { color: palette.text }]}>El acceso de administrador siempre está completo.</Text></View>;
  return <View style={styles.permissionGroups}>{CLINIC_PERMISSION_GROUPS.map(group => <View key={group.id} style={[styles.permissionGroup, { borderTopColor: palette.line }]}>
    <Text style={[styles.groupTitle, { color: palette.text }]}>{group.title}</Text>
    {group.permissions.map(([key, label]) => key === 'availability.scope' ? <View key={key} style={styles.scopeField}><Text style={[styles.permissionLabel, { color: palette.textSecondary }]}>{label}</Text><View style={styles.scopeChoices}>{(['self', 'branch', 'clinic'] as const).map(scope => <Pressable key={scope} accessibilityRole="button" accessibilityState={{ selected: permissions[key] === scope }} onPress={() => onChange(key, scope)} style={[styles.scopeChoice, { backgroundColor: permissions[key] === scope ? palette.primarySoft : palette.background, borderColor: permissions[key] === scope ? palette.primary : palette.line }]}><Text style={[styles.scopeText, { color: permissions[key] === scope ? palette.primary : palette.textSecondary }]}>{scope === 'self' ? 'Mi agenda' : scope === 'branch' ? 'Sucursal' : 'Clínica'}</Text></Pressable>)}</View></View> : <View key={key} style={styles.permissionRow}><Text style={[styles.permissionLabel, { color: palette.textSecondary }]}>{label}</Text><Switch accessibilityLabel={label} value={permissions[key] === true} onValueChange={value => onChange(key, value)} trackColor={{ false: palette.line, true: palette.primary }} thumbColor={palette.backgroundElement} /></View>)}
  </View>)}</View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, palette }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'email-address'; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={styles.field}><Text style={[styles.label, { color: palette.text }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.textSecondary} keyboardType={keyboardType} autoCapitalize="none" autoComplete={keyboardType === 'email-address' ? 'email' : 'off'} style={[styles.input, { backgroundColor: palette.background, borderColor: palette.line, color: palette.text }]} /></View>;
}

function PrimaryButton({ title, disabled, danger, onPress, palette }: { title: string; disabled?: boolean; danger?: boolean; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, { backgroundColor: danger ? palette.danger : palette.primary, opacity: disabled ? 0.55 : 1 }]}><Text style={styles.primaryButtonText}>{title}</Text></Pressable>;
}

function SecondaryButton({ title, onPress, palette }: { title: string; onPress: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.secondaryButton, { borderColor: palette.line }]}><Text style={[styles.secondaryText, { color: palette.text }]}>{title}</Text></Pressable>;
}

function MemberRow({ member, editable, onEdit, palette }: { member: ClinicAccessMember; editable: boolean; onEdit: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={[styles.listRow, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Avatar name={member.name || member.email} palette={palette} /><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>{member.name || member.email}</Text>{member.name ? <Text style={[styles.rowMeta, { color: palette.textSecondary }]} numberOfLines={1}>{member.email}</Text> : null}<Text style={[styles.rowRole, { color: palette.primary }]}>{roleLabels[member.role] || 'Acceso personalizado'}</Text></View>{editable && <Pressable accessibilityRole="button" onPress={onEdit} style={[styles.rowAction, { borderColor: palette.line }]}><Text style={[styles.rowActionText, { color: palette.primary }]}>Editar</Text></Pressable>}</View>;
}

function AccountRow({ account, onAssign, palette }: { account: ClinicAccessAccount; onAssign: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  return <View style={[styles.listRow, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><Avatar name={account.name || account.email} palette={palette} /><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>{account.name || account.email}</Text>{account.name ? <Text style={[styles.rowMeta, { color: palette.textSecondary }]} numberOfLines={1}>{account.email}</Text> : null}<Text style={[styles.rowRole, { color: account.confirmed ? palette.textSecondary : palette.danger }]}>{account.confirmed ? 'Cuenta confirmada' : 'Correo sin confirmar'}</Text></View>{account.confirmed && <Pressable accessibilityRole="button" onPress={onAssign} style={[styles.rowAction, { borderColor: palette.line }]}><Text style={[styles.rowActionText, { color: palette.primary }]}>Dar acceso</Text></Pressable>}</View>;
}

function InvitationRow({ invitation, busy, onResend, onRevoke, palette }: { invitation: ClinicInvitation; busy: boolean; onResend: () => void; onRevoke: () => void; palette: (typeof Colors)[keyof typeof Colors] }) {
  const expired = new Date(invitation.expires_at).getTime() <= Date.now();
  const status = invitation.delivery_status === 'failed' ? 'Envío fallido' : expired ? 'Invitación vencida' : invitation.delivery_status === 'sending' ? 'Envío en proceso' : 'Pendiente de aceptar';
  return <View style={[styles.inviteRow, { backgroundColor: palette.backgroundElement, borderColor: palette.line }]}><View style={styles.invitationCopy}><Text style={[styles.rowTitle, { color: palette.text }]}>{invitation.email}</Text><Text style={[styles.rowMeta, { color: palette.textSecondary }]}>{roleLabels[invitation.role]} · {status}</Text></View><View style={styles.invitationActions}><Pressable accessibilityRole="button" disabled={busy} onPress={onResend} style={[styles.rowAction, { borderColor: palette.line, opacity: busy ? 0.55 : 1 }]}><Text style={[styles.rowActionText, { color: palette.primary }]}>{busy ? 'Enviando…' : 'Reenviar'}</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={onRevoke}><Text style={[styles.revokeText, { color: palette.danger }]}>Revocar</Text></Pressable></View></View>;
}

function Avatar({ name, palette }: { name: string; palette: (typeof Colors)[keyof typeof Colors] }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('es') || '—';
  return <View style={[styles.avatar, { backgroundColor: palette.primarySoft }]}><Text style={[styles.avatarText, { color: palette.primary }]}>{initials}</Text></View>;
}

function EmptyLine({ text, palette }: { text: string; palette: (typeof Colors)[keyof typeof Colors] }) { return <View style={[styles.emptyLine, { borderColor: palette.line }]}><Text style={[styles.body, { color: palette.textSecondary }]}>{text}</Text></View>; }

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 34, gap: 14 },
  backButton: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }, back: { fontSize: 14, fontWeight: '700' }, heading: { gap: 5, marginBottom: 2 }, title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }, body: { fontSize: 12, lineHeight: 18 },
  sectionCard: { borderWidth: 1, borderRadius: 15, padding: 15, gap: 11 }, sectionTitle: { fontSize: 17, fontWeight: '700' }, field: { gap: 6, marginTop: 2 }, label: { fontSize: 12, fontWeight: '700' }, input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  roleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3 }, roleChoice: { minHeight: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, justifyContent: 'center' }, roleText: { fontSize: 11, fontWeight: '700' }, note: { padding: 10, borderRadius: 9 },
  expandButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, expandText: { fontSize: 12, fontWeight: '700' }, expandIcon: { fontSize: 20 }, helper: { fontSize: 10, lineHeight: 15 },
  permissionGroups: { gap: 12 }, permissionGroup: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 5 }, groupTitle: { fontSize: 12, fontWeight: '700', marginBottom: 3 }, permissionRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, permissionLabel: { flex: 1, fontSize: 11, lineHeight: 16 }, scopeField: { paddingVertical: 6, gap: 8 }, scopeChoices: { flexDirection: 'row', gap: 6 }, scopeChoice: { minHeight: 34, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, justifyContent: 'center' }, scopeText: { fontSize: 10, fontWeight: '700' },
  primaryButton: { minHeight: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 2 }, primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, secondaryButton: { minHeight: 42, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, secondaryText: { fontSize: 12, fontWeight: '700' },
  feedback: { borderWidth: 1, borderRadius: 11, padding: 12 }, loading: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 10 }, retry: { minHeight: 48, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listSection: { gap: 8, marginTop: 4 }, listRow: { minHeight: 72, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 13, fontWeight: '800' }, rowCopy: { flex: 1, minWidth: 0, gap: 2 }, rowTitle: { fontSize: 12, fontWeight: '700' }, rowMeta: { fontSize: 10 }, rowRole: { fontSize: 10, fontWeight: '700', marginTop: 2 }, rowAction: { minHeight: 35, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, rowActionText: { fontSize: 11, fontWeight: '700' }, emptyLine: { borderWidth: 1, borderRadius: 11, padding: 13 },
  inviteRow: { borderWidth: 1, borderRadius: 13, minHeight: 72, padding: 11, gap: 9 }, invitationCopy: { gap: 3 }, invitationActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, revokeText: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 8 },
  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }, modal: { maxHeight: '92%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 14 }, modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingBottom: 12 }, modalHeadingCopy: { flex: 1, gap: 4 }, close: { fontSize: 27, lineHeight: 29, paddingHorizontal: 5 }, modalScroll: { flexShrink: 1 }, modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', paddingTop: 12 }, revokeButton: { marginRight: 'auto', minHeight: 40, justifyContent: 'center' },
});

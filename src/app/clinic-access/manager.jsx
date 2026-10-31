'use client';

import { useEffect, useState } from 'react';
import { assignClinicAccess, loadClinicAccessData, revokeClinicAccess, updateClinicAccessRole } from './actions';
import { CLINIC_PERMISSION_GROUPS, CLINIC_ROLES, permissionsForPreset, sanitizeClinicPermissions } from '../../lib/clinic-permissions.js';

const roleLabels = Object.fromEntries(CLINIC_ROLES);

function AccountIdentity({ account, className }) {
  const [failedUrl, setFailedUrl] = useState('');
  const name = account.name || account.email || 'Cuenta sin nombre';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('es');
  return <div className={className}>
    <span className="clinic-access-avatar" aria-hidden="true">
      {account.avatarUrl && account.avatarUrl !== failedUrl
        ? <img src={account.avatarUrl} alt="" width={38} height={38} loading="lazy" onError={() => setFailedUrl(account.avatarUrl)}/>
        : initials}
    </span>
    <div className="clinic-access-identity-copy"><strong>{name}</strong>{account.name && account.email && <small>{account.email}</small>}</div>
  </div>;
}

export default function ClinicAccessManager({ clinicId }) {
  const [members, setMembers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState('');
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [permissionEditor, setPermissionEditor] = useState(null);
  const [permissionEditorError, setPermissionEditorError] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadClinicAccessData(clinicId).then(result => {
      if (!active) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMembers(result.members);
      setAccounts(result.accounts);
      setCurrentUserId(result.currentUserId);
      setError('');
    }).catch(() => {
      if (active) setError('No se pudieron cargar las cuentas de la clínica.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [clinicId, reloadKey]);

  useEffect(() => {
    setConfirmAction(null);
    setPermissionEditor(null);
  }, [clinicId]);

  useEffect(() => {
    if (!confirmAction) return;
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !savingUserId) setConfirmAction(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirmAction, savingUserId]);

  const openAccountPermissionEditor = account => {
    setError('');
    setPermissionEditorError('');
    setPermissionEditor({ type: 'assign', account, role: 'clinician', permissions: permissionsForPreset('clinician') });
  };
  const openMemberPermissionEditor = member => {
    if (member.role === 'admin') return;
    setError('');
    setPermissionEditorError('');
    setPermissionEditor({ type: 'update', member, role: member.role, permissions: sanitizeClinicPermissions(member.permissions, member.role) });
  };
  const setEditorRole = role => setPermissionEditor(current => current ? { ...current, role, permissions: permissionsForPreset(role) } : current);
  const setEditorPermission = (permission, value) => setPermissionEditor(current => {
    if (!current) return current;
    const permissions = { ...current.permissions, [permission]: value };
    if (permission === 'whatsapp.view' && !value) {
      permissions['whatsapp.reply'] = false;
      permissions['whatsapp.manage'] = false;
    }
    if (permission === 'whatsapp.reply' && value) permissions['whatsapp.view'] = true;
    if (permission === 'whatsapp.manage' && value) permissions['whatsapp.view'] = true;
    return { ...current, permissions };
  });
  const savePermissionEditor = async () => {
    if (!permissionEditor) return;
    setEditorSaving(true);
    setPermissionEditorError('');
    try {
      const permissions = sanitizeClinicPermissions(permissionEditor.permissions, permissionEditor.role);
      const result = permissionEditor.type === 'assign'
        ? await assignClinicAccess({ clinicId, userId: permissionEditor.account.userId, role: permissionEditor.role, permissions })
        : await updateClinicAccessRole({ clinicId, userId: permissionEditor.member.userId, role: permissionEditor.role, permissions });
      if (!result.ok) {
        setPermissionEditorError(result.message);
        return;
      }
      setPermissionEditor(null);
      setReloadKey(value => value + 1);
    } catch {
      setPermissionEditorError(permissionEditor.type === 'assign' ? 'No se pudo asignar acceso a la clínica.' : 'No se pudieron guardar los permisos.');
    } finally {
      setEditorSaving(false);
    }
  };

  const requestMemberChange = (member, value) => {
    if (value === '__revoke__') {
      setConfirmAction({ type: 'revoke', member });
      return;
    }
    if (CLINIC_ROLES.some(([role]) => role === value) && value !== member.role) {
      setConfirmAction({ type: 'role', member, role: value });
    }
  };

  const applyConfirmedAction = async () => {
    if (!confirmAction) return;
    const { member, type, role } = confirmAction;
    setSavingUserId(member.userId);
    setError('');
    try {
      const result = type === 'role'
        ? await updateClinicAccessRole({ clinicId, userId: member.userId, role })
        : await revokeClinicAccess({ clinicId, userId: member.userId });
      if (!result.ok) {
        setConfirmAction(null);
        setError(result.message);
        return;
      }
      setConfirmAction(null);
      if (type === 'revoke') setPermissionEditor(null);
      setReloadKey(value => value + 1);
    } catch {
      setConfirmAction(null);
      setError(type === 'role' ? 'No se pudo cambiar el rol de acceso.' : 'No se pudo revocar el acceso a la clínica.');
    } finally {
      setSavingUserId('');
    }
  };

  return <>
  <section className="panel team-panel clinic-access-panel" aria-busy={loading}>
    <div className="panel-heading padded">
      <div>
        <div className="panel-title">Acceso a la clínica</div>
        <p className="panel-subtitle">Asigna roles a cuentas existentes del equipo.</p>
      </div>
    </div>
    {!loading && accounts.length > 0 && <section className="clinic-access-pending has-pending" aria-labelledby="clinic-access-pending-title" aria-live="polite">
      <div className="clinic-access-pending-heading">
        <span className="clinic-access-pending-count" aria-hidden="true">{accounts.length}</span>
        <div>
          <strong id="clinic-access-pending-title">{accounts.length} {accounts.length === 1 ? 'cuenta registrada pendiente' : 'cuentas registradas pendientes'} de acceso</strong>
          <p>Elige un rol en cada cuenta para darle acceso a esta clínica.</p>
        </div>
      </div>
      <div className="clinic-access-pending-list">
        {accounts.map(account => {
          return <article className="clinic-access-pending-row" key={account.userId}>
            <AccountIdentity account={account} className="clinic-access-account"/>
            {account.confirmed ? <>
              <button className="button primary compact" type="button" onClick={() => openAccountPermissionEditor(account)} disabled={Boolean(savingUserId) || editorSaving}>
                Configurar acceso
              </button>
            </> : <span className="clinic-access-unconfirmed">Correo sin confirmar</span>}
          </article>;
        })}
      </div>
    </section>}
    {error && <p className="clinic-access-message is-error" role="alert">{error}</p>}
    <div className="clinic-access-list" aria-live="polite">
      <div className="clinic-access-list-heading">Cuentas con acceso{!loading&&` · ${members.length}`}</div>
      {loading ? <div className="empty-inline">Cargando cuentas…</div>
        : members.length ? members.map(member => {
          return <article className="clinic-access-member" key={member.userId}>
            <AccountIdentity account={member} className="clinic-access-member-identity"/>
            <span className="clinic-access-role">{roleLabels[member.role] || 'Acceso personalizado'}</span>
            {member.role !== 'admin' && member.userId !== currentUserId && <div className="clinic-access-member-controls">
              <button className="clinic-access-edit" type="button" onClick={() => openMemberPermissionEditor(member)} disabled={Boolean(savingUserId) || editorSaving}>Editar permisos</button>
            </div>}
          </article>;
        })
          : <div className="empty-inline">Aún no hay cuentas asignadas a esta clínica.</div>}
    </div>
  </section>
  {permissionEditor && <div className="clinic-access-confirm-backdrop" onMouseDown={event => event.target === event.currentTarget && !editorSaving && setPermissionEditor(null)}>
    <section className="clinic-access-permissions-modal" role="dialog" aria-modal="true" aria-labelledby="clinic-access-permissions-title">
      <header><div><span>ACCESO A LA CLÍNICA</span><h2 id="clinic-access-permissions-title">{permissionEditor.type === 'assign' ? 'Configurar acceso' : 'Editar permisos'}</h2><p>{permissionEditor.account?.name || permissionEditor.account?.email || permissionEditor.member?.name || permissionEditor.member?.email}</p></div><button type="button" aria-label="Cerrar" disabled={editorSaving} onClick={() => setPermissionEditor(null)}>×</button></header>
      <div className="clinic-access-permissions-body">
        <label className="clinic-access-template-select"><span>Plantilla inicial</span><select value={permissionEditor.role} disabled={editorSaving} onChange={event => setEditorRole(event.target.value)}>{CLINIC_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>La plantilla rellena los permisos; puedes ajustarlos antes de guardar.</small></label>
        <div className="clinic-access-read-rule"><span className="clinic-access-read-check">✓</span><div><strong>Lectura completa en la clínica</strong><p>Todos pueden consultar los módulos, incluida Agenda Pública. WhatsApp solo aparece cuando se habilita; los permisos de acción controlan qué puede modificarse.</p></div></div>
        {permissionEditor.role === 'admin' ? <div className="clinic-access-admin-note">La plantilla de administrador siempre conserva acceso completo y no se puede personalizar.</div> : <div className="clinic-access-permission-groups">{CLINIC_PERMISSION_GROUPS.map(group => <section className={`clinic-access-permission-group${group.id === 'settings' ? ' clinic-access-permission-group--settings' : ''}`} key={group.id}><h3>{group.title}</h3><div>{group.permissions.map(([permission, label]) => permission === 'availability.scope' ? <label className="clinic-access-permission-option clinic-access-scope-option" key={permission}><span>{label}</span><select value={permissionEditor.permissions[permission] || 'self'} onChange={event => setEditorPermission(permission, event.target.value)} disabled={editorSaving}><option value="self">Solo mi agenda</option><option value="branch">Una sucursal</option><option value="clinic">Toda la clínica</option></select></label> : <label className="clinic-access-permission-option" key={permission}><input type="checkbox" checked={permissionEditor.permissions[permission] === true} onChange={event => setEditorPermission(permission, event.target.checked)} disabled={editorSaving}/><span>{label}</span></label>)}</div></section>)}</div>}
      </div>
      {permissionEditorError && <p className="clinic-access-editor-error" role="alert" aria-live="assertive">{permissionEditorError}</p>}
      <footer>
        {permissionEditor.type === 'update' && <button className="clinic-access-revoke" type="button" onClick={() => requestMemberChange(permissionEditor.member, '__revoke__')} disabled={editorSaving} aria-label={`Revocar el acceso de ${permissionEditor.member.name || permissionEditor.member.email}`}>Revocar acceso</button>}
        <span className="clinic-access-permissions-footer-spacer" aria-hidden="true"/>
        <button className="button secondary" type="button" onClick={() => setPermissionEditor(null)} disabled={editorSaving}>Cancelar</button>
        <button className="button primary" type="button" onClick={savePermissionEditor} disabled={editorSaving}>{editorSaving ? 'Guardando…' : permissionEditor.type === 'assign' ? 'Dar acceso' : 'Guardar permisos'}</button>
      </footer>
    </section>
  </div>}
  {confirmAction && <div className="clinic-access-confirm-backdrop" onMouseDown={event => event.target === event.currentTarget && !savingUserId && setConfirmAction(null)}>
    <section className="clinic-access-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="clinic-access-confirm-title" aria-describedby="clinic-access-confirm-description">
      <h2 id="clinic-access-confirm-title">¿Estás seguro?</h2>
      <p id="clinic-access-confirm-description">{confirmAction.type === 'role'
        ? `Cambiarás el rol de ${confirmAction.member.name || confirmAction.member.email} a ${roleLabels[confirmAction.role]}.`
        : `${confirmAction.member.name || confirmAction.member.email} perderá el acceso a esta clínica.`}</p>
      <div className="clinic-access-confirm-actions">
        <button className="button outline compact" type="button" onClick={() => setConfirmAction(null)} disabled={Boolean(savingUserId)}>Cancelar</button>
        <button className={`button compact${confirmAction.type === 'revoke' ? ' clinic-access-confirm-revoke' : ' primary'}`} type="button" onClick={applyConfirmedAction} disabled={Boolean(savingUserId)}>{savingUserId ? 'Guardando…' : confirmAction.type === 'revoke' ? 'Revocar acceso' : 'Confirmar cambio'}</button>
      </div>
    </section>
  </div>}
  </>;
}

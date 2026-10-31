'use client';

import { useEffect, useState } from 'react';
import { assignClinicAccess, loadClinicAccessData, revokeClinicAccess, updateClinicAccessRole } from './actions';

const roles = [
  ['admin', 'Administrador'],
  ['clinician', 'Profesional clínico'],
  ['receptionist', 'Recepción'],
  ['billing', 'Pagos'],
];

const roleLabels = Object.fromEntries(roles);

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
  const [roleByUser, setRoleByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingUserId, setEditingUserId] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
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
    setRoleByUser({});
    setEditingUserId('');
    setConfirmAction(null);
  }, [clinicId]);

  useEffect(() => {
    if (!confirmAction) return;
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !savingUserId) setConfirmAction(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirmAction, savingUserId]);

  const assignAccount = async account => {
    setSavingUserId(account.userId);
    setError('');
    setSuccess('');
    try {
      const role = roleByUser[account.userId] || 'clinician';
      const result = await assignClinicAccess({ clinicId, userId: account.userId, role });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReloadKey(value => value + 1);
    } catch {
      setError('No se pudo asignar acceso a la clínica.');
    } finally {
      setSavingUserId('');
    }
  };

  const requestMemberChange = (member, value) => {
    setEditingUserId('');
    if (value === '__revoke__') {
      setConfirmAction({ type: 'revoke', member });
      return;
    }
    if (roles.some(([role]) => role === value) && value !== member.role) {
      setConfirmAction({ type: 'role', member, role: value });
    }
  };

  const applyConfirmedAction = async () => {
    if (!confirmAction) return;
    const { member, type, role } = confirmAction;
    setSavingUserId(member.userId);
    setError('');
    setSuccess('');
    try {
      const result = type === 'role'
        ? await updateClinicAccessRole({ clinicId, userId: member.userId, role })
        : await revokeClinicAccess({ clinicId, userId: member.userId });
      if (!result.ok) {
        setConfirmAction(null);
        setError(result.message);
        return;
      }
      if (type === 'role') {
        setSuccess(`${member.name || member.email}: rol actualizado a ${roleLabels[role]}.`);
      }
      if (type === 'revoke') setRoleByUser(current => {
        const next = { ...current };
        delete next[member.userId];
        return next;
      });
      setConfirmAction(null);
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
          const role = roleByUser[account.userId] || 'clinician';
          const saving = savingUserId === account.userId;
          return <article className="clinic-access-pending-row" key={account.userId}>
            <AccountIdentity account={account} className="clinic-access-account"/>
            {account.confirmed ? <>
              <div className="clinic-access-role-field">
                <select aria-label={`Rol para ${account.name || account.email}`} value={role} onChange={event => setRoleByUser(current => ({ ...current, [account.userId]: event.target.value }))} disabled={Boolean(savingUserId)}>
                  {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <button className="button primary compact" type="button" onClick={() => assignAccount(account)} disabled={Boolean(savingUserId)}>
                {saving ? 'Asignando…' : 'Asignar rol'}
              </button>
            </> : <span className="clinic-access-unconfirmed">Correo sin confirmar</span>}
          </article>;
        })}
      </div>
    </section>}
    {error && <p className="clinic-access-message is-error" role="alert">{error}</p>}
    {success && <p className="clinic-access-message" role="status">{success}</p>}
    <div className="clinic-access-list" aria-live="polite">
      <div className="clinic-access-list-heading">Cuentas con acceso{!loading&&` · ${members.length}`}</div>
      {loading ? <div className="empty-inline">Cargando cuentas…</div>
        : members.length ? members.map(member => {
          const isEditing = editingUserId === member.userId;
          const isLastAdmin = member.role === 'admin' && members.filter(item => item.role === 'admin').length <= 1;
          return <article className="clinic-access-member" key={member.userId}>
            <AccountIdentity account={member} className="clinic-access-member-identity"/>
            <div className="clinic-access-member-role">
              <select value={member.role} onChange={event => requestMemberChange(member, event.target.value)} disabled={Boolean(savingUserId) || isLastAdmin || !isEditing} aria-label={`Rol de ${member.name || member.email}`}>
                {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                <optgroup label="Acceso">
                  <option value="__revoke__">Revocar acceso</option>
                </optgroup>
              </select>
            </div>
            <div className="clinic-access-member-controls">
              {member.userId !== currentUserId && <button className="clinic-access-edit" type="button" onClick={() => setEditingUserId(isEditing ? '' : member.userId)} disabled={Boolean(savingUserId) || isLastAdmin}>{isEditing ? 'Cancelar' : 'Editar'}</button>}
            </div>
          </article>;
        })
          : <div className="empty-inline">Aún no hay cuentas asignadas a esta clínica.</div>}
    </div>
  </section>
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

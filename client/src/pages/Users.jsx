import { useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePagedList } from '../hooks/usePagedList.js';
import PasswordRules, { isStrongPassword } from '../components/PasswordRules.jsx';
import { Alert, Badge, DataTable, Field, Modal, PageHeader, Pagination, SearchInput } from '../components/ui.jsx';
import { formatDate, ROLE_LABELS } from '../utils/format.js';
import Select from '../components/Select.jsx';

const EMPTY = { name: '', email: '', phone: '', password: '', role: 'staff' };

// Admin only: manage internal users (staff and admins)
export default function Users() {
  const { user: me } = useAuth();
  const [roleFilter, setRoleFilter] = useState('');
  const list = usePagedList('/users', roleFilter ? { role: roleFilter } : {});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function openForm() {
    setForm(EMPTY);
    setErrors({});
    setError('');
    setOpen(true);
  }

  async function save(e) {
    e?.preventDefault();
    if (!isStrongPassword(form.password)) return setErrors({ password: 'Password does not meet all the rules' });
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/users', form);
      setOpen(false);
      setNotice(`${res.data.name} was added as ${ROLE_LABELS[res.data.role]}.`);
      list.reload();
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    try {
      setActionError('');
      await api.patch(`/users/${row.id}/active`, { active: !row.active });
      setNotice(`${row.name} is now ${row.active ? 'disabled' : 'active'}.`);
      list.reload();
    } catch (err) {
      setNotice('');
      setActionError(errorMessage(err));
    }
  }

  const columns = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (r) => <Badge color={r.role === 'admin' ? 'violet' : 'blue'}>{ROLE_LABELS[r.role]}</Badge> },
    { key: 'active', header: 'Status', render: (r) => <Badge color={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Disabled'}</Badge> },
    { key: 'createdAt', header: 'Added', render: (r) => formatDate(r.createdAt) },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (r) => r.id === me.id ? <span className="text-xs text-slate-400">You</span> : (
        <button className="text-sm font-medium text-brand-700 hover:underline" onClick={() => toggleActive(r)}>
          {r.active ? 'Disable' : 'Enable'}
        </button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Team" subtitle="Internal staff and admins who can access the billing system."
        actions={<button className="btn-primary" onClick={openForm}>Add staff</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name or email" />
        <Select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="staff">Internal Staff</option>
          <option value="admin">Admin</option>
        </Select>
      </div>
      <div className="mb-4 space-y-2">
        <Alert type="success">{notice}</Alert>
        <Alert>{actionError || list.error}</Alert>
      </div>

      <DataTable columns={columns} rows={list.rows} loading={list.loading} empty="No team members found" />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />

      <Modal open={open} title="Add internal staff" onClose={() => setOpen(false)}
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add staff'}</button>
        </>}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field id="u-name" label="Full name" value={form.name} onChange={set('name')} error={errors.name} />
          <Field id="u-email" type="email" label="Work email" value={form.email} onChange={set('email')} error={errors.email} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="u-phone" label="Phone (optional)" value={form.phone} onChange={set('phone')} error={errors.phone} />
            <div>
              <label className="label" htmlFor="u-role">Role</label>
              <Select id="u-role" className="input" value={form.role} onChange={set('role')}>
                <option value="staff">Internal Staff</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
          </div>
          <div>
            <Field id="u-password" type="password" label="Temporary password" value={form.password} onChange={set('password')}
              error={errors.password} autoComplete="new-password" />
            <PasswordRules password={form.password} />
          </div>
          <Alert>{error}</Alert>
        </form>
      </Modal>
    </div>
  );
}

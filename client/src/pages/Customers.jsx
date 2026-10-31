import { useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { usePagedList } from '../hooks/usePagedList.js';
import { Alert, Badge, DataTable, Field, Modal, PageHeader, Pagination, SearchInput } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

const EMPTY = { name: '', email: '', company: '', phone: '' };

// Admin and staff: customer accounts. New customers get an email link to set their own password.
export default function Customers() {
  const list = usePagedList('/customers');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function openForm() {
    setForm(EMPTY);
    setErrors({});
    setError('');
    setOpen(true);
  }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/customers', form);
      setOpen(false);
      setCreated(res.data);
      list.reload();
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: 'name', header: 'Customer', render: (r) => (
      <div>
        <div className="font-medium">{r.name}</div>
        <div className="text-xs text-slate-500">{r.company || 'Individual'}</div>
      </div>
    ) },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone || '-' },
    { key: 'active', header: 'Status', render: (r) => <Badge color={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Disabled'}</Badge> },
    { key: 'createdAt', header: 'Since', render: (r) => formatDate(r.createdAt) },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Customers" subtitle="Businesses and people who subscribe to your plans."
        actions={<button className="btn-primary" onClick={openForm}>Add customer</button>} />

      <div className="mb-4">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, email or company" />
      </div>
      <div className="mb-4 space-y-2">
        {created && (
          <Alert type="success">
            {created.devResetLink ? (
              <>{created.user.name} was added. Email is off (demo mode), so nothing was sent. Open this{' '}
                <a className="font-medium underline" href={created.devResetLink} target="_blank" rel="noreferrer">invite link</a>
                {' '}to set their password (valid for 60 minutes), or share it with them.</>
            ) : (
              <>{created.user.name} was added. A link to set their password was emailed to {created.user.email}.</>
            )}
          </Alert>
        )}
        <Alert>{list.error}</Alert>
      </div>

      <DataTable columns={columns} rows={list.rows} loading={list.loading} empty="No customers found" />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />

      <Modal open={open} title="Add customer" onClose={() => setOpen(false)}
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add customer'}</button>
        </>}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field id="c-name" label="Contact name" value={form.name} onChange={set('name')} error={errors.name} />
          <Field id="c-email" type="email" label="Email" value={form.email} onChange={set('email')} error={errors.email}
            hint="They will receive a link to set their own password." />
          <div className="grid grid-cols-2 gap-3">
            <Field id="c-company" label="Company (optional)" value={form.company} onChange={set('company')} error={errors.company} />
            <Field id="c-phone" label="Phone (optional)" value={form.phone} onChange={set('phone')} error={errors.phone} />
          </div>
          <Alert>{error}</Alert>
        </form>
      </Modal>
    </div>
  );
}

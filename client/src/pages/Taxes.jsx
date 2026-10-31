import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Badge, DataTable, Field, Modal, PageHeader } from '../components/ui.jsx';

const EMPTY = { name: '', rate: '' };

// GST rules. Admin creates and edits; staff can only view.
export default function Taxes() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, row = edit
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRows((await api.get('/taxes')).data);
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function open(row) {
    setEditing(row || {});
    setForm(row ? { name: row.name, rate: String(row.rate) } : EMPTY);
    setErrors({});
    setError('');
  }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { name: form.name, rate: form.rate };
      if (editing.id) await api.put(`/taxes/${editing.id}`, { ...body, active: editing.active });
      else await api.post('/taxes', body);
      setEditing(null);
      load();
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row) {
    try {
      await api.put(`/taxes/${row.id}`, { name: row.name, rate: row.rate, active: !row.active });
      load();
    } catch (err) {
      setListError(errorMessage(err));
    }
  }

  const columns = [
    { key: 'name', header: 'Tax rule', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'rate', header: 'Rate', render: (r) => `${r.rate}%` },
    { key: 'active', header: 'Status', render: (r) => <Badge color={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Inactive'}</Badge> },
    ...(isAdmin ? [{
      key: 'actions', header: '', className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-4">
          <button className="text-sm font-medium text-brand-700 hover:underline" onClick={() => open(r)}>Edit</button>
          <button className="text-sm font-medium text-slate-600 hover:underline" onClick={() => toggle(r)}>{r.active ? 'Deactivate' : 'Activate'}</button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Taxes" subtitle="GST rules applied automatically to every invoice line."
        actions={isAdmin && <button className="btn-primary" onClick={() => open(null)}>Add tax rule</button>} />
      {!isAdmin && <div className="mb-4"><Alert type="info">Only the admin can create or change tax rules.</Alert></div>}
      <div className="mb-4"><Alert>{listError}</Alert></div>

      <DataTable columns={columns} rows={rows} loading={loading} empty="No tax rules yet" />

      <Modal open={editing !== null} title={editing?.id ? 'Edit tax rule' : 'Add tax rule'} onClose={() => setEditing(null)}
        footer={<>
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </>}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field id="t-name" label="Name" placeholder="GST 18%" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
          <Field id="t-rate" type="number" step="0.01" min="0" max="100" label="Rate (%)" value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })} error={errors.rate} />
          {editing?.id && <Alert type="info">Changing a rate affects new invoices only. Invoices already created keep their tax.</Alert>}
          <Alert>{error}</Alert>
        </form>
      </Modal>
    </div>
  );
}

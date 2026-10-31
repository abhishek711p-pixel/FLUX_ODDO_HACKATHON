import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { useCatalog } from '../hooks/useCatalog.js';
import LinesEditor from '../components/LinesEditor.jsx';
import { Alert, DataTable, Field, Modal, PageHeader, SelectField, TextArea } from '../components/ui.jsx';
import { formatINR, PER_PERIOD } from '../utils/format.js';

const EMPTY = { name: '', validityDays: '15', planId: '', planQuantity: '1', notes: '', lines: [] };

// Quotation templates: ready-made offers (plan + seats + product lines) valid for a set number of days
export default function Templates() {
  const { products, plans } = useCatalog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    try {
      setRows((await api.get('/templates')).data);
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function open(row) {
    setErrors({});
    setError('');
    if (!row) {
      setForm(EMPTY);
      setEditing({});
      return;
    }
    const t = (await api.get(`/templates/${row.id}`)).data;
    setForm({
      name: t.name, validityDays: String(t.validityDays), planId: String(t.planId), planQuantity: String(t.planQuantity), notes: t.notes || '',
      lines: t.lines.map((l) => ({ productId: String(l.productId), variantId: l.variantId ? String(l.variantId) : '', quantity: String(l.quantity), unitPrice: String(l.unitPrice) })),
    });
    setEditing(t);
  }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, lines: form.lines.map(({ productId, variantId, quantity }) => ({ productId, variantId: variantId || null, quantity })) };
      const res = editing.id ? await api.put(`/templates/${editing.id}`, body) : await api.post('/templates', body);
      setEditing(null);
      setNotice(`${res.data.name} was saved.`);
      load();
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const plan = plans.find((p) => String(p.id) === form.planId);
  const columns = [
    { key: 'name', header: 'Template', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'planName', header: 'Plan', render: (r) => `${r.planName} × ${r.planQuantity} seats` },
    { key: 'planPrice', header: 'Plan fee', render: (r) => `${formatINR(r.planPrice * r.planQuantity)} / ${PER_PERIOD[r.billingPeriod]}` },
    { key: 'lineCount', header: 'Product lines' },
    { key: 'validityDays', header: 'Valid for', render: (r) => `${r.validityDays} days` },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Quotation templates" subtitle="Ready-made offers so sales reps never build a quotation from scratch."
        actions={<button className="btn-primary" onClick={() => open(null)}>Add template</button>} />
      <div className="mb-4 space-y-2">
        <Alert type="success">{notice}</Alert>
        <Alert>{listError}</Alert>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} empty="No templates yet" onRowClick={open} />

      <Modal wide open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit template' : 'Add template'}
        footer={<>
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</button>
        </>}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="t-name" className="sm:col-span-2" label="Template name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
            <Field id="t-valid" type="number" min="1" label="Quotation valid for (days)" value={form.validityDays}
              onChange={(e) => setForm({ ...form, validityDays: e.target.value })} error={errors.validityDays} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField id="t-plan" className="sm:col-span-2" label="Plan" value={form.planId} error={errors.planId}
              onChange={(e) => {
                const p = plans.find((x) => String(x.id) === e.target.value);
                setForm({ ...form, planId: e.target.value, planQuantity: p ? String(Math.max(p.minQuantity, Number(form.planQuantity) || 1)) : form.planQuantity });
              }}>
              <option value="">Choose plan…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatINR(p.price)} / seat / {PER_PERIOD[p.billingPeriod]})</option>)}
            </SelectField>
            <Field id="t-seats" type="number" min={plan?.minQuantity || 1} label="Seats" value={form.planQuantity}
              onChange={(e) => setForm({ ...form, planQuantity: e.target.value })} error={errors.planQuantity}
              hint={plan ? `Minimum ${plan.minQuantity}` : ''} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Product lines</h3>
            <LinesEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} products={products} showPrice={false} errors={errors} />
          </div>
          <TextArea id="t-notes" label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Alert>{error}</Alert>
        </form>
      </Modal>
    </div>
  );
}

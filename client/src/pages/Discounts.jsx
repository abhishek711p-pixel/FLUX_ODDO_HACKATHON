import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCatalog } from '../hooks/useCatalog.js';
import { Alert, Badge, CheckboxCard, Field, Modal, PageHeader, SelectField } from '../components/ui.jsx';
import FitText from '../components/FitText.jsx';
import { formatDate, formatINR, todayISO } from '../utils/format.js';

const STATUS = {
  live: { label: 'Applying now', color: 'green' },
  scheduled: { label: 'Starts later', color: 'blue' },
  expired: { label: 'Expired', color: 'gray' },
  used_up: { label: 'Used up', color: 'amber' },
  inactive: { label: 'Inactive', color: 'gray' },
};

const EMPTY = {
  name: '', type: 'percent', value: '', minPurchase: '0', minQuantity: '0', startDate: todayISO(), endDate: '',
  usageLimit: '', appliesTo: 'all', productIds: [], active: true,
};

// Discount rules. Admin creates and edits; staff can view. Billing applies them automatically.
export default function Discounts() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { products } = useCatalog();
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
      setRows((await api.get('/discounts')).data);
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function open(row) {
    setErrors({});
    setError('');
    if (row) {
      setForm({
        name: row.name, type: row.type, value: String(row.value), minPurchase: String(row.minPurchase), minQuantity: String(row.minQuantity),
        startDate: row.startDate, endDate: row.endDate, usageLimit: row.usageLimit === null ? '' : String(row.usageLimit),
        appliesTo: row.appliesTo, productIds: row.productIds, active: row.active,
      });
      setEditing(row);
    } else {
      setForm(EMPTY);
      setEditing({});
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleProduct = (id) =>
    setForm({ ...form, productIds: form.productIds.includes(id) ? form.productIds.filter((x) => x !== id) : [...form.productIds, id] });

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, usageLimit: form.usageLimit === '' ? null : form.usageLimit };
      const res = editing.id ? await api.put(`/discounts/${editing.id}`, body) : await api.post('/discounts', body);
      setEditing(null);
      setNotice(`${res.data.name} was saved. It applies automatically to the next invoices that qualify.`);
      load();
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !isAdmin;
  const describe = (d) => {
    const amount = d.type === 'percent' ? `${d.value}% off` : `${formatINR(d.value)} off`;
    const target = d.appliesTo === 'all' ? 'the whole subscription' : d.productNames.join(', ');
    const conditions = [
      d.minPurchase > 0 && `orders of ${formatINR(d.minPurchase)} or more`,
      d.minQuantity > 0 && `${d.minQuantity} or more units`,
    ].filter(Boolean);
    return `${amount} ${target}${conditions.length ? `, for ${conditions.join(' and ')}` : ''}`;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Discount rules" subtitle="Applied automatically to the next invoice that qualifies, and stopped when they expire or run out."
        actions={isAdmin && <button className="btn-primary" onClick={() => open(null)}>Add discount</button>} />
      <div className="mb-4 space-y-2">
        {!isAdmin && <Alert type="info">Only the admin can create or change discount rules.</Alert>}
        <Alert type="success">{notice}</Alert>
        <Alert>{listError}</Alert>
      </div>

      {loading && rows.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">Loading…</p> : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No discount rules yet</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((d) => (
            <button key={d.id} onClick={() => open(d)}
              className={`card-link p-5 text-left ${d.status === 'live' ? '' : 'opacity-75'}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{d.name}</h3>
                <Badge color={STATUS[d.status].color}>{STATUS[d.status].label}</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-600">{describe(d)}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-slate-500">Valid</div>
                  <div className="font-medium">{formatDate(d.startDate)}<br />to {formatDate(d.endDate)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-slate-500">Used</div>
                  <div className="text-base font-semibold">{d.usedCount}{d.usageLimit !== null ? ` / ${d.usageLimit}` : ''}</div>
                  <div className="text-slate-500">{d.usageLimit === null ? 'no limit' : `${d.usesLeft} left`}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-slate-500">Given so far</div>
                  <FitText className="text-base font-semibold text-emerald-700" min={11}>{formatINR(d.totalGiven)}</FitText>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal wide open={editing !== null} onClose={() => setEditing(null)}
        title={!editing?.id ? 'Add discount rule' : readOnly ? editing.name : 'Edit discount rule'}
        footer={readOnly ? <button className="btn-secondary" onClick={() => setEditing(null)}>Close</button> : <>
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</button>
        </>}>
        <form onSubmit={save} noValidate>
          <fieldset disabled={readOnly} className="space-y-4">
            <Field id="d-name" label="Name" placeholder="Diwali offer" value={form.name} onChange={set('name')} error={errors.name} />
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField id="d-type" label="Discount type" value={form.type} onChange={set('type')} error={errors.type}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount (₹)</option>
              </SelectField>
              <Field id="d-value" type="number" min="0" step="0.01" label={form.type === 'percent' ? 'Percent off' : 'Amount off (₹)'}
                value={form.value} onChange={set('value')} error={errors.value} />
              <Field id="d-limit" type="number" min="1" step="1" label="Usage limit (invoices)" placeholder="No limit" value={form.usageLimit}
                onChange={set('usageLimit')} error={errors.usageLimit} hint="Leave empty for no limit." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="d-minp" type="number" min="0" step="0.01" label="Minimum purchase (₹, before tax)" value={form.minPurchase}
                onChange={set('minPurchase')} error={errors.minPurchase} hint="0 means no minimum." />
              <Field id="d-minq" type="number" min="0" step="1" label="Minimum quantity" value={form.minQuantity}
                onChange={set('minQuantity')} error={errors.minQuantity} hint="Seats plus units it applies to. 0 means no minimum." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="d-start" type="date" label="Starts" value={form.startDate} onChange={set('startDate')} error={errors.startDate} />
              <Field id="d-end" type="date" label="Ends" value={form.endDate} onChange={set('endDate')} error={errors.endDate} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Applies to</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <CheckboxCard id="d-all" label="Whole subscription" description="Plan fee and every product line."
                  checked={form.appliesTo === 'all'} disabled={readOnly} onChange={() => setForm({ ...form, appliesTo: 'all' })} />
                <CheckboxCard id="d-products" label="Specific products" description="Only lines of the products chosen below."
                  checked={form.appliesTo === 'products'} disabled={readOnly} onChange={() => setForm({ ...form, appliesTo: 'products' })} />
              </div>
              {form.appliesTo === 'products' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {products.map((p) => {
                    const on = form.productIds.includes(p.id);
                    return (
                      <button type="button" key={p.id} onClick={() => toggleProduct(p.id)} disabled={readOnly}
                        className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:border-brand-200'}`}>
                        {on ? '✓ ' : ''}{p.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {errors.productIds && <p className="mt-1 text-xs text-red-600">{errors.productIds}</p>}
            </div>
            {editing?.id && (
              <CheckboxCard id="d-active" label="Active" description="Inactive rules are never applied."
                checked={form.active} disabled={readOnly} onChange={(v) => setForm({ ...form, active: v })} />
            )}
          </fieldset>
          <div className="mt-4 space-y-2">
            <Alert type="info">
              Rules apply on their own when an invoice is created. If several qualify, the customer gets the single best one.
              The discount is taken before GST and counts as one use per invoice.
            </Alert>
            <Alert>{error}</Alert>
          </div>
        </form>
      </Modal>
    </div>
  );
}

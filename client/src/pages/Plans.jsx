import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTaxes } from '../hooks/useTaxes.js';
import { Alert, Badge, CheckboxCard, Field, Modal, PageHeader, SelectField, TextArea } from '../components/ui.jsx';
import { formatDate, formatINR, PER_PERIOD, PERIOD_LABELS, todayISO } from '../utils/format.js';

const EMPTY = {
  name: '', description: '', price: '', billingPeriod: 'monthly', minQuantity: '1', taxId: '',
  startDate: todayISO(), endDate: '', autoClose: false, closable: true, pausable: false, renewable: true, active: true,
};

// The per-plan rules from the problem statement, with plain explanations
const RULES = [
  { key: 'autoClose', label: 'Closes on its own', help: 'Subscriptions close automatically on the end date.' },
  { key: 'closable', label: 'Can be closed early', help: 'The subscription can be closed before it expires.' },
  { key: 'pausable', label: 'Can be paused', help: 'Billing stops while the subscription is paused.' },
  { key: 'renewable', label: 'Can be renewed', help: 'The subscription can be extended for another period.' },
];

// Recurring plans. Admin creates and edits; staff can view.
export default function Plans() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const taxes = useTaxes();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('active'); // active | inactive | all
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
      setPlans((await api.get('/plans')).data);
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function open(plan) {
    setErrors({});
    setError('');
    if (plan) {
      setForm({
        ...EMPTY, ...plan, price: String(plan.price), minQuantity: String(plan.minQuantity),
        taxId: plan.taxId ? String(plan.taxId) : '', description: plan.description || '', endDate: plan.endDate || '',
      });
      setEditing(plan);
    } else {
      const gst18 = taxes.find((t) => t.active && Number(t.rate) === 18);
      setForm({ ...EMPTY, startDate: todayISO(), taxId: gst18 ? String(gst18.id) : '' });
      setEditing({});
    }
  }

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name, description: form.description, price: form.price, billingPeriod: form.billingPeriod,
        minQuantity: form.minQuantity, taxId: form.taxId || null, startDate: form.startDate, endDate: form.endDate || null,
        autoClose: form.autoClose, closable: form.closable, pausable: form.pausable, renewable: form.renewable, active: form.active,
      };
      const res = editing.id ? await api.put(`/plans/${editing.id}`, body) : await api.post('/plans', body);
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

  const readOnly = !isAdmin;

  const counts = { active: plans.filter((p) => p.active).length, inactive: plans.filter((p) => !p.active).length, all: plans.length };
  const shown = view === 'all' ? plans : plans.filter((p) => (view === 'active' ? p.active : !p.active));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Recurring plans" subtitle="What each plan costs per seat, how often it bills, and what customers can do with it."
        actions={isAdmin && <button className="btn-primary" onClick={() => open(null)}>Add plan</button>} />

      <div className="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
        {[['active', 'Active', counts.active], ['inactive', 'Inactive', counts.inactive], ['all', 'All', counts.all]].map(([key, label, n]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
              view === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${view === key ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 space-y-2">
        <Alert type="success">{notice}</Alert>
        <Alert>{listError}</Alert>
      </div>

      {loading && plans.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="card py-10 text-center text-sm text-slate-400">
          {view === 'inactive' ? 'No inactive plans. Open a plan and untick "Active" to retire it; customers on it keep their subscription.'
            : view === 'active' ? 'No active plans. Add one, or reactivate a plan from the Inactive tab.' : 'No plans yet.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <button key={p.id} onClick={() => open(p)}
              className={`card-link flex flex-col p-5 text-left ${p.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{p.name}</h3>
                <Badge color={p.availableNow ? 'green' : p.active ? 'amber' : 'gray'}>
                  {!p.active ? 'Inactive' : p.availableNow ? 'Available' : 'Not in dates'}
                </Badge>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-semibold">{formatINR(p.price)}</span>
                <span className="text-sm text-slate-500"> / seat / {PER_PERIOD[p.billingPeriod]}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {PERIOD_LABELS[p.billingPeriod]} billing · min {p.minQuantity} seat{p.minQuantity > 1 ? 's' : ''} · {p.taxName || 'No tax'}
              </p>
              {p.description && <p className="mt-3 text-sm text-slate-600">{p.description}</p>}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.autoClose && <Badge color="amber">Auto close</Badge>}
                {p.closable && <Badge>Closable</Badge>}
                {p.pausable && <Badge>Pausable</Badge>}
                {p.renewable && <Badge>Renewable</Badge>}
              </div>
              <div className="mt-auto pt-4 text-xs text-slate-500">
                {formatDate(p.startDate)} to {p.endDate ? formatDate(p.endDate) : 'no end date'}
                <span className="float-right">{p.activeSubscriptions} active</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal wide open={editing !== null} onClose={() => setEditing(null)}
        title={!editing?.id ? 'Add plan' : readOnly ? editing.name : 'Edit plan'}
        footer={readOnly ? <button className="btn-secondary" onClick={() => setEditing(null)}>Close</button> : <>
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save plan'}</button>
        </>}>
        <form onSubmit={save} noValidate>
          <fieldset disabled={readOnly} className="space-y-4">
            <Field id="pl-name" label="Plan name" value={form.name} onChange={set('name')} error={errors.name} />
            <div className="grid gap-4 sm:grid-cols-4">
              <Field id="pl-price" type="number" min="0" step="0.01" label="Price per seat (₹)" value={form.price}
                onChange={set('price')} error={errors.price} />
              <SelectField id="pl-period" label="Bills every" value={form.billingPeriod} onChange={set('billingPeriod')} error={errors.billingPeriod}>
                <option value="daily">Day</option>
                <option value="weekly">Week</option>
                <option value="monthly">Month</option>
                <option value="quarterly">Quarter (3 months)</option>
                <option value="yearly">Year</option>
              </SelectField>
              <Field id="pl-min" type="number" min="1" step="1" label="Minimum seats" value={form.minQuantity}
                onChange={set('minQuantity')} error={errors.minQuantity} />
              <SelectField id="pl-tax" label="Tax rule" value={form.taxId} onChange={set('taxId')} error={errors.taxId}>
                <option value="">No tax</option>
                {taxes.filter((t) => t.active || String(t.id) === form.taxId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pl-start" type="date" label="Available from" value={form.startDate} onChange={set('startDate')} error={errors.startDate} />
              <Field id="pl-end" type="date" label="Available until (optional)" value={form.endDate} onChange={set('endDate')}
                error={errors.endDate} hint="Leave empty for no end date." />
            </div>
            <TextArea id="pl-desc" label="Description (optional)" value={form.description} onChange={set('description')} error={errors.description} />
            <div>
              <h3 className="mb-2 text-sm font-semibold">What customers can do</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {RULES.map((r) => (
                  <CheckboxCard key={r.key} id={`pl-${r.key}`} label={r.label} description={r.help} checked={form[r.key]}
                    disabled={readOnly} onChange={(v) => setForm({ ...form, [r.key]: v })} />
                ))}
                {editing?.id && (
                  <CheckboxCard id="pl-active" label="Active" description="Inactive plans cannot be used for new subscriptions."
                    checked={form.active} disabled={readOnly} onChange={(v) => setForm({ ...form, active: v })} />
                )}
              </div>
            </div>
          </fieldset>
          {form.price && form.minQuantity && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Smallest subscription on this plan: {form.minQuantity} × {formatINR(form.price)} ={' '}
              <span className="font-semibold">{formatINR(Number(form.price) * Number(form.minQuantity))}</span> per {PER_PERIOD[form.billingPeriod]}, before tax.
            </p>
          )}
          <div className="mt-4 space-y-2">
            {readOnly && <Alert type="info">Only the admin can add or change plans.</Alert>}
            <Alert>{error}</Alert>
          </div>
        </form>
      </Modal>
    </div>
  );
}

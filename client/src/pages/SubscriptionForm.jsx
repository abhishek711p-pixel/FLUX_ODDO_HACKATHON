import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { useCatalog } from '../hooks/useCatalog.js';
import CustomerPicker from '../components/CustomerPicker.jsx';
import LinesEditor, { lineAmounts } from '../components/LinesEditor.jsx';
import Icon from '../components/Icon.jsx';
import { Alert, Field, PageHeader, SelectField, TextArea } from '../components/ui.jsx';
import { formatDate, formatINR, PER_PERIOD, todayISO } from '../utils/format.js';

const EMPTY = { templateId: '', planId: '', quantity: '1', startDate: todayISO(), expiryDate: '', paymentTermsDays: '15', notes: '', lines: [] };

// Create or edit a subscription (edit only while Draft or Quotation)
export default function SubscriptionForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { products, plans, loading: catalogLoading } = useCatalog();
  const [templates, setTemplates] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    api.get('/templates').then((res) => setTemplates(res.data)).catch(() => {});
    if (!id) return;
    api.get(`/subscriptions/${id}`).then(({ data: s }) => {
      setCustomer(s.customer);
      setForm({
        templateId: s.templateId ? String(s.templateId) : '', planId: String(s.planId), quantity: String(s.quantity),
        startDate: s.startDate, expiryDate: s.expiryDate || '', paymentTermsDays: String(s.paymentTermsDays), notes: s.notes || '',
        lines: s.lines.map((l) => ({ productId: String(l.productId), variantId: l.variantId ? String(l.variantId) : '', quantity: String(l.quantity), unitPrice: String(l.unitPrice) })),
      });
      setLoaded(true);
    }).catch((err) => setError(errorMessage(err)));
  }, [id]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const plan = plans.find((p) => String(p.id) === form.planId);

  // Picking a template fills plan, seats and lines in one go
  async function applyTemplate(templateId) {
    if (!templateId) return setForm({ ...form, templateId: '' });
    try {
      const t = (await api.get(`/templates/${templateId}`)).data;
      setForm({
        ...form, templateId, planId: String(t.planId), quantity: String(t.planQuantity), notes: form.notes || t.notes || '',
        lines: t.lines.map((l) => ({ productId: String(l.productId), variantId: l.variantId ? String(l.variantId) : '', quantity: String(l.quantity), unitPrice: String(l.unitPrice) })),
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function pickPlan(planId) {
    const p = plans.find((x) => String(x.id) === planId);
    setForm({
      ...form, planId,
      quantity: p ? String(Math.max(p.minQuantity, Number(form.quantity) || 1)) : form.quantity,
      expiryDate: p?.endDate && (!form.expiryDate || form.expiryDate > p.endDate) ? p.endDate : form.expiryDate,
    });
  }

  // Live preview (the server recalculates and is the source of truth)
  const preview = useMemo(() => {
    const planLine = plan ? lineAmounts(form.quantity || 0, plan.price, plan.taxRate) : { subtotal: 0, tax: 0, total: 0 };
    const lines = form.lines.map((l) => {
      const p = products.find((x) => String(x.id) === String(l.productId));
      return lineAmounts(l.quantity || 0, l.unitPrice || 0, p?.taxRate);
    });
    const all = [planLine, ...lines];
    const sum = (k) => all.reduce((s, x) => s + x[k], 0);
    return { planLine, untaxed: sum('subtotal'), tax: sum('tax'), total: sum('total') };
  }, [form, plan, products]);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        customerId: customer?.id, planId: form.planId, quantity: form.quantity, startDate: form.startDate,
        expiryDate: form.expiryDate || null, paymentTermsDays: form.paymentTermsDays, templateId: form.templateId || null, notes: form.notes,
        lines: form.lines.filter((l) => l.productId).map((l) => ({
          productId: l.productId, variantId: l.variantId || null, quantity: l.quantity, unitPrice: l.unitPrice === '' ? null : l.unitPrice,
        })),
      };
      const res = id ? await api.put(`/subscriptions/${id}`, body) : await api.post('/subscriptions', body);
      navigate(`/subscriptions/${res.data.id}`);
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || catalogLoading) return <p className="py-10 text-center text-sm text-slate-400">{error || 'Loading…'}</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to={id ? `/subscriptions/${id}` : '/subscriptions'} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <Icon name="arrow" className="h-4 w-4" /> Back
      </Link>
      <PageHeader title={id ? 'Edit subscription' : 'New subscription'} subtitle="Saved as a Draft. Send it as a quotation when it is ready." />

      <form onSubmit={save} className="space-y-6" noValidate>
        <div className="card space-y-4 p-5">
          <SelectField id="s-template" label="Start from a quotation template (optional)" value={form.templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">No template, build from scratch</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.planName} × {t.planQuantity}, valid {t.validityDays} days)</option>)}
          </SelectField>
          <CustomerPicker value={customer} onChange={setCustomer} error={errors.customerId} />
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="font-semibold">Plan and dates</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField id="s-plan" className="sm:col-span-2" label="Recurring plan" value={form.planId} onChange={(e) => pickPlan(e.target.value)} error={errors.planId}>
              <option value="">Choose plan…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatINR(p.price)} / seat / {PER_PERIOD[p.billingPeriod]})</option>)}
            </SelectField>
            <Field id="s-qty" type="number" min={plan?.minQuantity || 1} label="Seats" value={form.quantity} onChange={set('quantity')}
              error={errors.quantity || errors.planQuantity} hint={plan ? `Minimum ${plan.minQuantity}` : ''} />
          </div>
          {plan && (
            <p className="text-xs text-slate-500">
              Available {formatDate(plan.startDate)} to {plan.endDate ? formatDate(plan.endDate) : 'no end date'} ·
              {plan.pausable ? ' pausable' : ' not pausable'} · {plan.closable ? 'closable early' : 'not closable early'} ·
              {plan.renewable ? ' renewable' : ' not renewable'}{plan.autoClose ? ' · closes on its own at the end' : ''}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="s-start" type="date" label="Start date" value={form.startDate} onChange={set('startDate')} error={errors.startDate} />
            <Field id="s-expiry" type="date" label="Expiry date (optional)" value={form.expiryDate} onChange={set('expiryDate')} error={errors.expiryDate}
              hint="Billing stops after this date." />
            <Field id="s-terms" type="number" min="0" label="Payment terms (days)" value={form.paymentTermsDays} onChange={set('paymentTermsDays')}
              error={errors.paymentTermsDays} hint="Invoice due date = invoice date + these days." />
          </div>
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">Order lines</h2>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span>{plan ? `${plan.name}: ${form.quantity || 0} seats × ${formatINR(plan.price)} (${plan.taxName || 'no tax'})` : 'Choose a plan to see the plan fee'}</span>
            <span className="font-medium">{formatINR(preview.planLine.total)}</span>
          </div>
          <LinesEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} products={products} errors={errors} />
          <div className="ml-auto w-full max-w-xs space-y-1 pt-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Untaxed</span><span>{formatINR(preview.untaxed)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{formatINR(preview.tax)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <span>Total{plan ? ` / ${PER_PERIOD[plan.billingPeriod]}` : ''}</span><span>{formatINR(preview.total)}</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <TextArea id="s-notes" label="Notes (optional)" value={form.notes} onChange={set('notes')} />
        </div>

        <Alert>{error}</Alert>
        <div className="flex justify-end gap-2">
          <Link to={id ? `/subscriptions/${id}` : '/subscriptions'} className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : id ? 'Save changes' : 'Create draft'}</button>
        </div>
      </form>
    </div>
  );
}

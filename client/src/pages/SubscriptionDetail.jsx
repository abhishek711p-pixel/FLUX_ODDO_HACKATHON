import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCrumb } from '../context/CrumbContext.jsx';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusStepper from '../components/StatusStepper.jsx';
import Icon from '../components/Icon.jsx';
import { Alert, Badge, Modal } from '../components/ui.jsx';
import { formatDate, formatINR, INVOICE_STATUS, PER_PERIOD, SUB_STATUS, todayISO } from '../utils/format.js';

// Buttons for each action, with a confirmation message for the ones that matter
const ACTIONS = {
  send_quotation: { label: 'Send quotation', style: 'btn-primary' },
  confirm: { label: 'Confirm', customerLabel: 'Accept quotation', style: 'btn-primary' },
  activate: { label: 'Activate', style: 'btn-primary' },
  pause: { label: 'Pause', style: 'btn-secondary', ask: 'Pause this subscription? It will not be billed while paused.' },
  resume: { label: 'Resume', style: 'btn-primary' },
  renew: { label: 'Renew', style: 'btn-secondary', ask: 'Renew this subscription? The expiry date moves forward by one billing period.' },
  close: { label: 'Close subscription', style: 'btn-danger', ask: 'Close this subscription? No further invoices will be created.' },
  cancel: { label: 'Cancel', style: 'btn-secondary', ask: 'Cancel this offer? It will be closed and cannot be activated or renewed.' },
};

export default function SubscriptionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const internal = user.role !== 'customer';
  const [sub, setSub] = useState(null);
  useCrumb(sub?.number);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [asking, setAsking] = useState(null);
  const [addons, setAddons] = useState([]);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setSub((await api.get(`/subscriptions/${id}`)).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function run(action) {
    setAsking(null);
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/subscriptions/${id}/transition`, { action });
      setSub(res.data);
      setNotice(`Done: ${ACTIONS[action].label.toLowerCase()}. Status is now ${SUB_STATUS[res.data.status].label}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function invoiceNow() {
    setBusy('invoice');
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/invoices/for-subscription/${id}`);
      setNotice(`Invoice ${res.data.number} created for ${formatDate(res.data.periodStart)} to ${formatDate(res.data.periodEnd)}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function openAddons() {
    setAddOpen(true);
    const params = { active: 'true', pageSize: 100, include: 'variants', ...(internal ? {} : { isAddon: 'true' }) };
    const res = await api.get('/products', { params });
    setAddons(res.data.data);
  }

  async function addLine(product) {
    setError('');
    try {
      const res = await api.post(`/subscriptions/${id}/lines`, { productId: product.id, variantId: product.variants?.[0]?.id || null, quantity: 1 });
      setSub(res.data);
      setAddOpen(false);
      setNotice(`${product.name} added. It will appear on the next invoice.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeLine(line) {
    setError('');
    try {
      const res = await api.delete(`/subscriptions/${id}/lines/${line.id}`);
      setSub(res.data);
      setNotice(`${line.productName} removed. It will not be billed on the next invoice.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!sub) return <p className="py-10 text-center text-sm text-slate-400">{error || 'Loading…'}</p>;

  const st = SUB_STATUS[sub.status];
  const per = PER_PERIOD[sub.plan.billingPeriod];
  const actionButtons = Object.keys(ACTIONS).filter((a) => sub.allowedActions.includes(a));
  const canEditLines = sub.allowedActions.includes('manage_lines');
  const canEditAddons = sub.allowedActions.includes('manage_addons');
  const canRemove = (line) => canEditLines || (canEditAddons && line.isAddon);
  const existing = new Set(sub.lines.map((l) => l.productId));

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <Icon name="arrow" className="h-4 w-4" /> All subscriptions
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{sub.number}</h1>
            <Badge color={st.color}>{st.label}</Badge>
            {sub.isExpired && <Badge color="red">Expired</Badge>}
            {sub.isQuotationExpired && <Badge color="red">Quotation expired</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {sub.plan.name} · {sub.quantity} seat{sub.quantity > 1 ? 's' : ''} · {formatINR(sub.totals.total)} / {per}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sub.allowedActions.includes('edit') && <Link to={`/subscriptions/${id}/edit`} className="btn-secondary">Edit</Link>}
          {internal && sub.status === 'active' && sub.nextInvoiceDate && sub.nextInvoiceDate <= todayISO() && (sub.expiryDate === null || sub.nextInvoiceDate <= sub.expiryDate) && (
            <button className="btn-secondary" disabled={!!busy} onClick={invoiceNow}>{busy === 'invoice' ? 'Creating…' : 'Create invoice now'}</button>
          )}
          {actionButtons.map((a) => (
            <button key={a} className={ACTIONS[a].style} disabled={!!busy}
              onClick={() => (ACTIONS[a].ask ? setAsking(a) : run(a))}>
              {busy === a ? 'Working…' : (!internal && ACTIONS[a].customerLabel) || ACTIONS[a].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <Alert type="success">{notice}</Alert>
        <Alert>{error}</Alert>
        {sub.nextDiscount && (
          <Alert type="success">
            Discount <span className="font-semibold">{sub.nextDiscount.name}</span> will be applied automatically to the next invoice
            (saves about {formatINR(sub.nextDiscount.amount)} before GST).
          </Alert>
        )}
        {sub.status === 'quotation' && !sub.isQuotationExpired && (
          <Alert type="info">This quotation is valid until {formatDate(sub.quotationValidUntil)}.</Alert>
        )}
      </div>

      <div className="card mb-5 px-5 py-4"><StatusStepper status={sub.status} /></div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Details */}
        <div className="card p-5 lg:col-span-1">
          <h2 className="mb-3 font-semibold">Details</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Customer', <span key="c">{sub.customer.name}<br /><span className="text-slate-500">{sub.customer.company || sub.customer.email}</span></span>],
              ['Plan', `${sub.plan.name} (${sub.plan.billingPeriod})`],
              ['Seats', sub.quantity],
              ['Start date', formatDate(sub.startDate)],
              ['Expiry date', formatDate(sub.expiryDate)],
              ['Next invoice', sub.status === 'active' ? formatDate(sub.nextInvoiceDate) : '-'],
              ['Payment terms', `${sub.paymentTermsDays} days`],
              ['Template', sub.templateName || '-'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            <Badge color={sub.plan.pausable ? 'green' : 'gray'}>{sub.plan.pausable ? 'Pausable' : 'Not pausable'}</Badge>
            <Badge color={sub.plan.closable ? 'green' : 'gray'}>{sub.plan.closable ? 'Closable early' : 'Not closable early'}</Badge>
            <Badge color={sub.plan.renewable ? 'green' : 'gray'}>{sub.plan.renewable ? 'Renewable' : 'Not renewable'}</Badge>
            {sub.plan.autoClose && <Badge color="amber">Closes at end</Badge>}
          </div>
          {sub.notes && <p className="mt-4 whitespace-pre-line border-t border-slate-100 pt-3 text-sm text-slate-600">{sub.notes}</p>}
        </div>

        {/* Lines and totals */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="font-semibold">Order lines <span className="text-sm font-normal text-slate-500">(billed every {per})</span></h2>
            {(canEditLines || canEditAddons) && (
              <button className="btn-secondary px-3 py-1.5" onClick={openAddons}>
                <Icon name="plus" className="h-4 w-4" /> {canEditLines ? 'Add product' : 'Add an add-on'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="mt-3 min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-2">Product</th><th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2">Tax</th>
                  <th className="px-5 py-2 text-right">Amount</th><th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-brand-50/40">
                  <td className="px-5 py-2.5 font-medium">{sub.planLine.description}</td>
                  <td className="px-3 py-2.5 text-right">{sub.planLine.quantity}</td>
                  <td className="px-3 py-2.5 text-right">{formatINR(sub.planLine.unitPrice)}</td>
                  <td className="px-3 py-2.5">{sub.planLine.taxName || 'No tax'}</td>
                  <td className="px-5 py-2.5 text-right font-medium">{formatINR(sub.planLine.total)}</td><td />
                </tr>
                {sub.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{l.productName} {l.isAddon && <Badge color="violet">Add-on</Badge>}</div>
                      {l.variantLabel && <div className="text-xs text-slate-500">{l.variantLabel}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right">{l.quantity}</td>
                    <td className="px-3 py-2.5 text-right">{formatINR(l.unitPrice)}</td>
                    <td className="px-3 py-2.5">{l.taxName || 'No tax'}</td>
                    <td className="px-5 py-2.5 text-right font-medium">{formatINR(l.total)}</td>
                    <td className="pr-3 text-right">
                      {canRemove(l) && (
                        <button className="text-slate-400 hover:text-red-600" onClick={() => removeLine(l)} aria-label={`Remove ${l.productName}`}>
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto w-full max-w-xs space-y-1 px-5 py-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Untaxed</span><span>{formatINR(sub.totals.untaxed)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">GST</span><span>{formatINR(sub.totals.tax)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold"><span>Total / {per}</span><span>{formatINR(sub.totals.total)}</span></div>
          </div>
        </div>
      </div>

      {/* Invoices */}
      <div className="card mt-5 overflow-hidden">
        <h2 className="px-5 pt-5 font-semibold">Invoices</h2>
        {sub.invoices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">
            {sub.status === 'active' ? `No invoices yet. The first one is due on ${formatDate(sub.nextInvoiceDate)}.` : 'Invoices are created once the subscription is active.'}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto"><table className="min-w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr><th className="px-5 py-2">Number</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Due amount</th><th className="px-5 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sub.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-5 py-2.5"><Link className="font-medium text-brand-700 hover:underline" to={`/invoices/${inv.id}`}>{inv.number}</Link></td>
                  <td className="px-3 py-2.5">{formatDate(inv.periodStart)} to {formatDate(inv.periodEnd)}</td>
                  <td className="px-3 py-2.5">{formatDate(inv.dueDate)}</td>
                  <td className="px-3 py-2.5 text-right">{formatINR(inv.total)}</td>
                  <td className="px-3 py-2.5 text-right">{formatINR(inv.amountDue)}</td>
                  <td className="px-5 py-2.5"><Badge color={INVOICE_STATUS[inv.status].color}>{INVOICE_STATUS[inv.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Confirmation */}
      <Modal open={!!asking} title={asking ? ACTIONS[asking].label : ''} onClose={() => setAsking(null)}
        footer={<>
          <button className="btn-secondary" onClick={() => setAsking(null)}>Go back</button>
          <button className={asking === 'close' ? 'btn-danger' : 'btn-primary'} onClick={() => run(asking)}>Yes, {asking && ACTIONS[asking].label.toLowerCase()}</button>
        </>}>
        <p className="text-sm text-slate-600">{asking && ACTIONS[asking].ask}</p>
      </Modal>

      {/* Add product / add-on */}
      <Modal open={addOpen} title={canEditLines ? 'Add a product' : 'Add an add-on'} onClose={() => setAddOpen(false)}>
        <div className="space-y-2">
          {addons.filter((p) => !existing.has(p.id)).length === 0 && <p className="text-sm text-slate-400">Nothing more to add.</p>}
          {addons.filter((p) => !existing.has(p.id)).map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{p.name} {p.isAddon && <Badge color="violet">Add-on</Badge>}</div>
                <div className="text-xs text-slate-500">{formatINR(Number(p.salesPrice) + Number(p.variants?.[0]?.extraPrice || 0))}{p.variants?.length ? ` (${p.variants[0].attribute}: ${p.variants[0].value})` : ''} / {per} + {p.taxName || 'no tax'}</div>
              </div>
              <button className="btn-primary px-3 py-1.5" onClick={() => addLine(p)}>Add</button>
            </div>
          ))}
          <p className="pt-2 text-xs text-slate-500">Changes are billed from the next invoice.</p>
        </div>
      </Modal>
    </div>
  );
}

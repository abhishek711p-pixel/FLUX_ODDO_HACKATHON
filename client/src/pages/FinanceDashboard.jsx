import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Badge } from '../components/ui.jsx';
import { METHOD_LABELS } from '../components/RecordPayment.jsx';
import { formatDate, formatINR, SUB_STATUS, todayISO } from '../utils/format.js';
import Select from '../components/Select.jsx';
import Icon from '../components/Icon.jsx';
import FitText, { FitGroup } from '../components/FitText.jsx';
import { AreaLine, Donut, PairBars, ShareBars } from '../components/Charts.jsx';

// Date presets for the filter
function rangeFor(preset) {
  const today = todayISO();
  const [y, m] = today.split('-').map(Number);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  switch (preset) {
    case 'last30': { const d = new Date(); d.setDate(d.getDate() - 29); return { from: iso(d), to: today }; }
    case 'quarter': { const q = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${String(q).padStart(2, '0')}-01`, to: today }; }
    case 'fy': { const start = m >= 4 ? y : y - 1; return { from: `${start}-04-01`, to: today }; } // Indian financial year
    case 'year': return { from: `${y}-01-01`, to: today };
    default: return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

const PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'fy', label: 'This financial year' },
  { key: 'year', label: 'This calendar year' },
  { key: 'custom', label: 'Custom dates' },
];

const compactINR = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
};
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

function Kpi({ label, value, hint, tone, to }) {
  const tones = { green: 'text-emerald-700', red: 'text-red-600', brand: 'text-brand-700' };
  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <FitText className={`mt-1 text-2xl font-semibold ${tones[tone] || ''}`}>{value}</FitText>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </>
  );
  return to ? <Link to={to} className="card-link block p-4">{body}</Link> : <div className="card p-4">{body}</div>;
}


export default function FinanceDashboard() {
  const { user } = useAuth();
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(rangeFor('month'));
  const [planId, setPlanId] = useState('');
  const [plans, setPlans] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ms, setMs] = useState(null);
  const [reload, setReload] = useState(0);
  const [reminding, setReminding] = useState(null); // invoice id or 'all'
  const [remindNote, setRemindNote] = useState('');

  const range = useMemo(() => (preset === 'custom' ? custom : rangeFor(preset)), [preset, custom]);

  useEffect(() => {
    api.get('/plans').then((res) => setPlans(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    const started = performance.now();
    api.get('/reports/summary', { params: { ...range, ...(planId ? { planId } : {}) } })
      .then((res) => { setData(res.data); setMs(Math.round(performance.now() - started)); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [range, planId, reload]);

  async function remind(id) {
    setReminding(id);
    setRemindNote('');
    setError('');
    try {
      if (id === 'all') {
        const r = (await api.post('/invoices/remind-overdue')).data;
        setRemindNote(r.reminded === 0 ? 'Everyone overdue was already reminded in the last 7 days.'
          : `Payment reminders sent for ${r.reminded.toLocaleString('en-IN')} overdue invoice${r.reminded === 1 ? '' : 's'}${r.demoMode ? ' (email demo mode: see the server log)' : ''}.`);
      } else {
        const r = (await api.post(`/invoices/${id}/remind`)).data;
        setRemindNote(`Reminder sent to ${r.customer.email}${r.emailSent ? '' : ' (email demo mode: see the server log)'}.`);
      }
      setReload((n) => n + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReminding(null);
    }
  }

  const statusTotal = data ? Object.values(data.subscriptionsByStatus).reduce((a, b) => a + b, 0) : 0;
  const agingTotal = data ? data.overdueAging.upTo30 + data.overdueAging.upTo60 + data.overdueAging.over60 : 0;
  const collectionRate = data && data.invoiced > 0 ? Math.round((data.revenue / data.invoiced) * 100) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Finance overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hello {user.name.split(' ')[0]}. Money in and owed for {formatDate(range.from)} to {formatDate(range.to)}.
            {ms !== null && <span className="ml-1 text-slate-400">Loaded in {ms} ms.</span>}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select className="input w-full sm:w-auto" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Period">
            {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </Select>
          {preset === 'custom' && (
            <>
              <input type="date" className="input w-full sm:w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
              <input type="date" className="input w-full sm:w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
            </>
          )}
          <Select className="input w-full sm:w-auto" value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan">
            <option value="">All plans</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>

      <div className="mb-4"><Alert>{error}</Alert></div>
      {!data ? <p className="py-16 text-center text-sm text-slate-400">{loading ? 'Loading…' : ''}</p> : (
        <div className={loading ? 'opacity-60 transition' : 'transition'}>
          {/* Right now */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Right now</div>
          <FitGroup><div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Active subscriptions" value={data.activeSubscriptions.toLocaleString('en-IN')} tone="brand" to="/subscriptions"
              hint={`${data.pausedSubscriptions} paused · ${data.subscriptionsByStatus.quotation} quotations open`} />
            <Kpi label="Monthly recurring revenue" value={formatINR(data.mrr)} hint={`${compactINR(data.arr)} a year, before GST`} />
            <Kpi label="Still owed" value={formatINR(data.outstanding)} to="/invoices"
              hint={`${data.unpaidCount} unpaid invoice${data.unpaidCount === 1 ? '' : 's'}${data.draftInvoices ? ` · ${data.draftInvoices} drafts to confirm` : ''}`} />
            <Kpi label="Overdue" value={formatINR(data.overdueAmount)} tone="red" to="/invoices"
              hint={`${data.overdueCount} invoice${data.overdueCount === 1 ? '' : 's'} past due`} />
          </div></FitGroup>

          {/* In the selected period */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">In this period</div>
          <FitGroup><div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Revenue collected" value={formatINR(data.revenue)} tone="green" to="/payments"
              hint={`${data.paymentCount} payment${data.paymentCount === 1 ? '' : 's'}${collectionRate !== null ? ` · ${collectionRate}% of invoiced` : ''}`} />
            <Kpi label="Invoiced" value={formatINR(data.invoiced)} hint={`incl. ${formatINR(data.taxCollected)} GST`} />
            <Kpi label="Discounts given" value={formatINR(data.discountsGiven)} hint="Applied automatically by rules" />
            <Kpi label="New subscriptions" value={data.newSubscriptions.toLocaleString('en-IN')} hint="Created in this period" />
          </div></FitGroup>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="card p-5 xl:col-span-2">
              <h2 className="mb-4 font-semibold">Invoiced vs collected <span className="text-sm font-normal text-slate-500">(last 6 months)</span></h2>
              <PairBars aLabel="Invoiced" bLabel="Collected" height={192} rateLabel="collected"
                groups={data.revenueByMonth.map((r) => ({ label: monthLabel(r.month), a: r.invoiced, b: r.collected }))} />
            </div>

            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Subscriptions by status</h2>
                <Link to="/subscriptions" className="text-sm font-medium text-brand-700 hover:underline">View</Link>
              </div>
              <Donut centerValue={statusTotal.toLocaleString('en-IN')} centerLabel="Total"
                segments={['active', 'paused', 'quotation', 'confirmed', 'draft', 'closed'].map((st, i) => ({
                  label: SUB_STATUS[st].label, value: data.subscriptionsByStatus[st] || 0,
                  color: ['#2F6B3F', '#C9A227', '#7FA672', '#4F7FA8', '#B7CDA9', '#94A3B8'][i],
                }))} />
            </div>

            <div className="card p-5">
              <h2 className="mb-1 font-semibold">New subscriptions</h2>
              <p className="mb-3 text-xs text-slate-500">Created per month, last 6 months</p>
              <AreaLine points={data.revenueByMonth.map((r) => ({ label: monthLabel(r.month), value: r.newSubscriptions }))} />
            </div>

            <div className="card p-5">
              <h2 className="mb-1 font-semibold">Payments by method</h2>
              <p className="mb-3 text-xs text-slate-500">Money collected in this period</p>
              {data.paymentsByMethod.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No payments in this period.</p> : (
                <Donut money centerValue={compactINR(data.revenue)} centerLabel="Collected" size={150}
                  segments={data.paymentsByMethod.map((m) => ({ label: `${METHOD_LABELS[m.method]} (${m.count})`, value: m.amount }))} />
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-1 font-semibold">Revenue by plan</h2>
              <p className="mb-4 text-xs text-slate-500">Monthly recurring revenue of active subscriptions</p>
              <ShareBars suffix=" /mo" rows={data.topPlans.map((p) => ({ label: p.name, sub: `${p.active.toLocaleString('en-IN')} active`, value: p.mrr }))} />
            </div>

            <div className="card overflow-hidden xl:col-span-2">
              <div className="flex items-center justify-between px-5 pt-5">
                <h2 className="font-semibold">Overdue invoices to chase</h2>
                <div className="flex items-center gap-3">
                  {data.toRemindCount > 0 && (
                    <button type="button" className="btn-secondary px-3 py-1.5" disabled={!!reminding} onClick={() => remind('all')}>
                      <Icon name="bell" className="h-4 w-4" />
                      {reminding === 'all' ? 'Sending…' : `Remind all (${data.toRemindCount.toLocaleString('en-IN')})`}
                    </button>
                  )}
                  <Link to="/invoices" className="text-sm font-medium text-brand-700 hover:underline">All invoices</Link>
                </div>
              </div>
              {remindNote && <div className="mx-5 mt-3"><Alert type="success">{remindNote}</Alert></div>}
              {agingTotal > 0 && (
                <div className="mx-5 mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {[['1 to 30 days', data.overdueAging.upTo30], ['31 to 60 days', data.overdueAging.upTo60], ['Over 60 days', data.overdueAging.over60]].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-red-50 p-2"><div className="text-slate-500">{k}</div><FitText className="font-semibold text-red-700" min={11}>{formatINR(v)}</FitText></div>
                  ))}
                </div>
              )}
              {data.overdueInvoices.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing overdue. Every confirmed invoice is within its due date.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {data.overdueInvoices.map((i) => (
                        <tr key={i.id} className="hover:bg-slate-50">
                          <td className="px-5 py-2.5">
                            <Link to={`/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">{i.number}</Link>
                            <div className="text-xs text-slate-500">{i.customerName}{i.customerCompany ? ` · ${i.customerCompany}` : ''}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="text-red-600">{i.daysOverdue} day{i.daysOverdue === 1 ? '' : 's'} late</div>
                            <div className="mt-1 flex items-center gap-2">
                              {i.reminderSentAt
                                ? <Badge color="amber">Reminded {formatDate(i.reminderSentAt.slice(0, 10))}</Badge>
                                : <Badge>Not reminded</Badge>}
                              <button type="button" className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                                disabled={!!reminding} onClick={() => remind(i.id)}>
                                {reminding === i.id ? 'Sending…' : i.reminderSentAt ? 'Remind again' : 'Send reminder'}
                              </button>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium tabular-nums">{formatINR(i.amountDue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-3 font-semibold">Latest payments</h2>
              {data.recentPayments.length === 0 ? <p className="text-sm text-slate-400">No payments in this period.</p> : (
                <div className="space-y-2.5">
                  {data.recentPayments.map((p) => (
                    <Link key={p.id} to={`/invoices/${p.invoiceId}`} className="flex items-center justify-between text-sm hover:text-brand-700">
                      <div><div>{p.customerName}</div><div className="text-xs text-slate-500">{formatDate(p.paymentDate)} · {METHOD_LABELS[p.method]} · {p.invoiceNumber}</div></div>
                      <div className="font-medium text-emerald-700">{formatINR(p.amount)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Monthly recurring revenue = active subscriptions converted to a monthly amount (plan seats + product lines), before GST and discounts.
            Revenue collected = payments received in the period.
          </p>
        </div>
      )}
    </div>
  );
}

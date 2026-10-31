import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Badge } from '../components/ui.jsx';
import { formatDate, formatINR, INVOICE_STATUS, PER_PERIOD, SUB_STATUS } from '../utils/format.js';
import FitText, { FitGroup } from '../components/FitText.jsx';
import { compactINR, Donut, PairBars } from '../components/Charts.jsx';

const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

// Customer portal home: their plans, what they owe, and what is coming next
export default function CustomerDashboard() {
  const { user } = useAuth();
  const [subs, setSubs] = useState(null);
  const [inv, setInv] = useState(null);
  const [mine, setMine] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/subscriptions', { params: { pageSize: 100 } }), api.get('/invoices', { params: { pageSize: 5 } })])
      .then(([s, i]) => { setSubs(s.data); setInv(i.data); })
      .catch((err) => setError(errorMessage(err)));
    api.get('/reports/mine').then((r) => setMine(r.data)).catch(() => {});
  }, []);

  if (!subs || !inv) return <p className="py-16 text-center text-sm text-slate-400">{error || 'Loading…'}</p>;

  const running = subs.data.filter((s) => ['active', 'paused'].includes(s.status));
  const quotes = subs.data.filter((s) => s.status === 'quotation');
  const nextBill = running.filter((s) => s.status === 'active' && s.nextInvoiceDate).sort((a, b) => (a.nextInvoiceDate < b.nextInvoiceDate ? -1 : 1))[0];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">Hello, {user.name.split(' ')[0]}</h1>
      <p className="mt-1 text-sm text-slate-500">Your plans and bills with Brightloop Software, in one place.</p>

      <div className="my-5 space-y-2">
        <Alert>{error}</Alert>
        {inv.summary.overdueAmount > 0 && (
          <Alert>You have {formatINR(inv.summary.overdueAmount)} overdue. Please pay it soon to keep your plans running.</Alert>
        )}
        {quotes.length > 0 && (
          <Alert type="info">
            You have {quotes.length} quotation{quotes.length === 1 ? '' : 's'} waiting for you.{' '}
            <Link to={`/subscriptions/${quotes[0].id}`} className="font-medium underline">Review and accept</Link>
          </Alert>
        )}
      </div>

      <FitGroup><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Active plans</div><FitText className="mt-1 text-2xl font-semibold text-brand-700">{subs.counts.active}</FitText><div className="text-xs text-slate-500">{subs.counts.paused} paused</div></div>
        <div className="card p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">To pay</div><FitText className="mt-1 text-2xl font-semibold">{formatINR(inv.summary.outstanding)}</FitText><div className="text-xs text-slate-500">on confirmed invoices</div></div>
        <div className="card p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Overdue</div><FitText className="mt-1 text-2xl font-semibold text-red-600">{formatINR(inv.summary.overdueAmount)}</FitText><div className="text-xs text-slate-500">past the due date</div></div>
        <div className="card p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Next bill</div><FitText className="mt-1 text-2xl font-semibold">{nextBill ? formatDate(nextBill.nextInvoiceDate) : '-'}</FitText><div className="text-xs text-slate-500">{nextBill ? `${nextBill.number} · about ${formatINR(nextBill.total)}` : 'No active plan'}</div></div>
      </div></FitGroup>

      {mine && (
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <h2 className="mb-1 font-semibold">My billing</h2>
            <p className="mb-4 text-xs text-slate-500">Billed vs paid, last 6 months</p>
            <PairBars aLabel="Billed" bLabel="Paid" height={150}
              groups={mine.byMonth.map((m) => ({ label: monthLabel(m.month), a: m.billed, b: m.paid }))} />
          </div>
          <div className="card p-5">
            <h2 className="mb-1 font-semibold">Spend by plan</h2>
            <p className="mb-4 text-xs text-slate-500">All confirmed and paid invoices</p>
            {mine.byPlan.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No bills yet.</p> : (
              <Donut money size={140} centerValue={compactINR(mine.byPlan.reduce((a, p) => a + p.amount, 0))} centerLabel="Total billed"
                segments={mine.byPlan.map((p) => ({ label: p.planName, value: p.amount }))} />
            )}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-semibold">My plans</h2><Link to="/subscriptions" className="text-sm font-medium text-brand-700 hover:underline">See all</Link></div>
          {running.length === 0 ? <p className="px-5 py-8 text-sm text-slate-400">No running plans.</p> : (
            <div className="mt-3 divide-y divide-slate-100">
              {running.map((s) => (
                <Link key={s.id} to={`/subscriptions/${s.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <div><div className="font-medium">{s.planName}</div><div className="text-xs text-slate-500">{s.number} · {s.quantity} seat{s.quantity > 1 ? 's' : ''}</div></div>
                  <div className="text-right"><div className="font-medium">{formatINR(s.total)}<span className="text-xs text-slate-500"> / {PER_PERIOD[s.billingPeriod]}</span></div><Badge color={SUB_STATUS[s.status].color}>{SUB_STATUS[s.status].label}</Badge></div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-semibold">Latest invoices</h2><Link to="/invoices" className="text-sm font-medium text-brand-700 hover:underline">See all</Link></div>
          {inv.data.length === 0 ? <p className="px-5 py-8 text-sm text-slate-400">No invoices yet.</p> : (
            <div className="mt-3 divide-y divide-slate-100">
              {inv.data.map((i) => (
                <Link key={i.id} to={`/invoices/${i.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <div><div className="font-medium">{i.number}</div><div className="text-xs text-slate-500">Due {formatDate(i.dueDate)}</div></div>
                  <div className="text-right">
                    <div className="font-medium">{formatINR(i.status === 'paid' ? i.total : i.amountDue)}</div>
                    <div className="flex justify-end gap-1">
                      <Badge color={INVOICE_STATUS[i.status].color}>{i.status === 'confirmed' ? 'Unpaid' : INVOICE_STATUS[i.status].label}</Badge>
                      {i.isOverdue && <Badge color="red">Overdue</Badge>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

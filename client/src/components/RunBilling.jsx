import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { formatDate, formatINR, todayISO } from '../utils/format.js';
import { Alert, Field, Modal } from './ui.jsx';
import Icon from './Icon.jsx';

// "Billing day" button: creates invoices for every active subscription that is due
export default function RunBilling({ onDone }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function run() {
    setRunning(true);
    setError('');
    try {
      const res = await api.post('/invoices/run-billing', { date });
      setResult(res.data);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  function close() {
    setOpen(false);
    setResult(null);
    setError('');
  }

  return (
    <>
      <button className="btn-primary" onClick={() => { setDate(todayISO()); setOpen(true); }}>
        <Icon name="play" className="h-4 w-4" /> Run billing
      </button>
      <Modal open={open} title="Run billing" onClose={close}
        footer={result ? <button className="btn-primary" onClick={close}>Done</button> : <>
          <button className="btn-secondary" onClick={close}>Cancel</button>
          <button className="btn-primary" onClick={run} disabled={running}>{running ? 'Billing…' : 'Create invoices'}</button>
        </>}>
        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Creates a draft invoice for every active subscription whose billing date is on or before this date. Missed periods are
              caught up one by one, and a period that already has an invoice is never billed again.
            </p>
            <Field id="bill-date" type="date" label="Billing date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
            <p className="text-xs text-slate-500">This also runs automatically every hour.</p>
            <Alert>{error}</Alert>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-emerald-50 p-3"><div className="text-2xl font-semibold text-emerald-700">{result.created}</div><div className="text-xs text-slate-600">invoices created</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-semibold">{result.closed}</div><div className="text-xs text-slate-600">subscriptions closed</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-2xl font-semibold">{result.skipped.length}</div><div className="text-xs text-slate-600">skipped</div></div>
            </div>
            {result.created === 0 && <Alert type="info">Nothing was due on {formatDate(result.date)}. Every subscription is already billed up to date.</Alert>}
            {result.invoices.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                {result.invoices.map((i) => (
                  <Link key={i.id} to={`/invoices/${i.id}`} onClick={close}
                    className="flex justify-between border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50">
                    <span>{i.subscriptionNumber} · {formatDate(i.periodStart)} to {formatDate(i.periodEnd)}</span>
                    <span className="font-medium">{formatINR(i.total)}</span>
                  </Link>
                ))}
              </div>
            )}
            {result.skipped.map((s) => <div key={s.subscriptionId} className="text-xs text-slate-500">Subscription #{s.subscriptionId}: {s.reason}</div>)}
            {result.errors.length > 0 && <Alert>{result.errors.map((e) => `#${e.subscriptionId}: ${e.error}`).join(' · ')}</Alert>}
            {result.created > 0 && <Alert type="info">New invoices are drafts. Review and confirm them in the Draft tab.</Alert>}
          </div>
        )}
      </Modal>
    </>
  );
}

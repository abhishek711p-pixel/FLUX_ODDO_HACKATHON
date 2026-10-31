import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCrumb } from '../context/CrumbContext.jsx';
import api, { errorMessage } from '../api/client.js';
import InvoiceDocument from '../components/InvoiceDocument.jsx';
import Icon from '../components/Icon.jsx';
import { Alert, Badge, Modal } from '../components/ui.jsx';
import RecordPayment, { METHOD_LABELS } from '../components/RecordPayment.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate, formatINR, INVOICE_STATUS } from '../utils/format.js';


export default function InvoiceDetail() {
  const { id } = useParams();
  const [inv, setInv] = useState(null);
  useCrumb(inv?.number);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [askCancel, setAskCancel] = useState(false);
  const [paying, setPaying] = useState(false);
  const [reversing, setReversing] = useState(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      setInv((await api.get(`/invoices/${id}`)).data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(action) {
    setAskCancel(false);
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/invoices/${id}/${action}`);
      setInv(res.data);
      const messages = {
        confirm: 'Invoice confirmed.',
        cancel: 'Invoice cancelled. If it was the latest one, its period will be billed again.',
        send: res.data.emailSent ? `Invoice emailed to ${res.data.customer.email}.` : `Invoice marked as sent to ${res.data.customer.email} (email demo mode: see the server log).`,
        remind: res.data.emailSent ? `Payment reminder emailed to ${res.data.customer.email}.` : `Payment reminder sent to ${res.data.customer.email} (email demo mode: see the server log).`,
      };
      setNotice(messages[action]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function reversePayment(p) {
    setReversing(null);
    setError('');
    try {
      const res = await api.delete(`/payments/${p.id}`);
      setInv(res.data);
      setNotice(`Payment of ${formatINR(p.amount)} reversed.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!inv) return <p className="py-10 text-center text-sm text-slate-400">{error || 'Loading…'}</p>;
  const st = INVOICE_STATUS[inv.status];
  const can = (a) => inv.allowedActions.includes(a);

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <Icon name="arrow" className="h-4 w-4" /> All invoices
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{inv.number}</h1>
          <Badge color={st.color}>{st.label}</Badge>
          {inv.isOverdue && <Badge color="red">Overdue by {inv.daysOverdue} day{inv.daysOverdue === 1 ? '' : 's'}</Badge>}
          {inv.reminderSentAt && <Badge color="amber">Reminded {formatDate(inv.reminderSentAt.slice(0, 10))}</Badge>}
          {inv.sentAt && <Badge color="brand">Sent {formatDate(inv.sentAt.slice(0, 10))}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {can('record_payment') && <button className="btn-primary" onClick={() => setPaying(true)}>Record payment</button>}
          {can('remind') && (
            <button className="btn-secondary" disabled={!!busy} onClick={() => act('remind')}>
              <Icon name="bell" className="h-4 w-4" /> {busy === 'remind' ? 'Sending…' : 'Send reminder'}
            </button>
          )}
          {can('confirm') && <button className="btn-primary" disabled={!!busy} onClick={() => act('confirm')}>{busy === 'confirm' ? 'Working…' : 'Confirm'}</button>}
          {can('send') && (
            <button className="btn-secondary" disabled={!!busy} onClick={() => act('send')}>
              <Icon name="send" className="h-4 w-4" /> {busy === 'send' ? 'Sending…' : inv.sentAt ? 'Send again' : 'Send'}
            </button>
          )}
          {can('print') && (
            <a className="btn-secondary" href={`/invoices/${inv.id}/print`} target="_blank" rel="noreferrer">
              <Icon name="print" className="h-4 w-4" /> Print
            </a>
          )}
          {can('cancel') && <button className="btn-secondary text-red-600" disabled={!!busy} onClick={() => setAskCancel(true)}>Cancel invoice</button>}
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <Alert type="success">{notice}</Alert>
        <Alert>{error}</Alert>
        {inv.status === 'draft' && <Alert type="info">This invoice is a draft. Check it and confirm it before it is sent or paid.</Alert>}
      </div>

      <div className="card p-6 sm:p-8"><InvoiceDocument inv={inv} /></div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-semibold">Payments</h2>
          <span className="text-sm text-slate-500">{formatINR(inv.totals.paid)} paid · {formatINR(inv.totals.due)} due</span>
        </div>
        {inv.payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No payments recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto"><table className="min-w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr><th className="px-5 py-2">Date</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Note</th><th className="px-5 py-2 text-right">Amount</th>{user.role === 'admin' && <th className="w-24" />}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2.5">{formatDate(p.paymentDate)}</td>
                  <td className="px-3 py-2.5">{METHOD_LABELS[p.method]}</td>
                  <td className="px-3 py-2.5 text-slate-600">{p.note || '-'}</td>
                  <td className="px-5 py-2.5 text-right font-medium">{formatINR(p.amount)}</td>
                  {user.role === 'admin' && (
                    <td className="pr-5 text-right"><button className="text-xs font-medium text-slate-500 hover:text-red-600" onClick={() => setReversing(p)}>Reverse</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <RecordPayment invoice={inv} open={paying} onClose={() => setPaying(false)}
        onSaved={(updated) => {
          setPaying(false);
          setInv(updated);
          setNotice(updated.status === 'paid' ? 'Payment recorded. The invoice is now fully paid.' : `Payment recorded. ${formatINR(updated.totals.due)} is still due.`);
        }} />

      <Modal open={!!reversing} title="Reverse payment" onClose={() => setReversing(null)}
        footer={<>
          <button className="btn-secondary" onClick={() => setReversing(null)}>Go back</button>
          <button className="btn-danger" onClick={() => reversePayment(reversing)}>Yes, reverse it</button>
        </>}>
        <p className="text-sm text-slate-600">
          Reverse the {reversing && METHOD_LABELS[reversing.method]} payment of {reversing && formatINR(reversing.amount)}? Use this only for a payment recorded by mistake. The amount becomes due again.
        </p>
      </Modal>

      <Modal open={askCancel} title="Cancel invoice" onClose={() => setAskCancel(false)}
        footer={<>
          <button className="btn-secondary" onClick={() => setAskCancel(false)}>Go back</button>
          <button className="btn-danger" onClick={() => act('cancel')}>Yes, cancel invoice</button>
        </>}>
        <p className="text-sm text-slate-600">
          Cancel {inv.number}? It cannot be undone. If this is the subscription's latest invoice, its period goes back into
          the billing queue so it is billed again correctly, never skipped.
        </p>
      </Modal>
    </div>
  );
}

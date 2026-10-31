import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { formatINR, todayISO } from '../utils/format.js';
import { Alert, Field, Modal, SelectField, TextArea } from './ui.jsx';

export const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer (NEFT / RTGS / IMPS)' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
];
export const METHOD_LABELS = { upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', cheque: 'Cheque' };

// Record a payment (full or part) against an invoice
export default function RecordPayment({ invoice, open, onClose, onSaved }) {
  const [form, setForm] = useState({ method: 'upi', amount: '', paymentDate: todayISO(), note: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ method: 'upi', amount: String(invoice.totals.due), paymentDate: todayISO(), note: '' });
      setErrors({});
      setError('');
    }
  }, [open, invoice.totals.due]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const isPart = Number(form.amount) > 0 && Number(form.amount) < invoice.totals.due;

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/payments', { invoiceId: invoice.id, ...form });
      onSaved(res.data);
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={`Record payment for ${invoice.number}`} onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</button>
      </>}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-center text-sm">
          <div><div className="text-xs text-slate-500">Total</div><div className="font-semibold">{formatINR(invoice.totals.total)}</div></div>
          <div><div className="text-xs text-slate-500">Paid so far</div><div className="font-semibold">{formatINR(invoice.totals.paid)}</div></div>
          <div><div className="text-xs text-slate-500">Due now</div><div className="font-semibold text-red-600">{formatINR(invoice.totals.due)}</div></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="pay-method" label="Method" value={form.method} onChange={set('method')} error={errors.method}>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </SelectField>
          <Field id="pay-date" type="date" label="Payment date" max={todayISO()} value={form.paymentDate} onChange={set('paymentDate')} error={errors.paymentDate} />
        </div>
        <Field id="pay-amount" type="number" min="0.01" step="0.01" label="Amount (₹)" value={form.amount} onChange={set('amount')} error={errors.amount}
          hint={isPart ? `Part payment: ${formatINR(invoice.totals.due - Number(form.amount))} will still be due.` : 'The invoice becomes Paid when nothing is left due.'} />
        <TextArea id="pay-note" label="Note (optional)" placeholder="UTR / cheque number / who paid" value={form.note} onChange={set('note')} error={errors.note} />
        <Alert>{error}</Alert>
      </form>
    </Modal>
  );
}

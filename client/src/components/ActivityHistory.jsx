import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { formatDateTime } from '../utils/format.js';
import Icon from './Icon.jsx';

export const ENTITY_LABELS = {
  subscription: 'Subscription', invoice: 'Invoice', payment: 'Payment', plan: 'Plan', discount: 'Discount',
  product: 'Product', tax: 'Tax', user: 'User', billing: 'Billing run',
};
export const ENTITY_COLORS = {
  subscription: 'blue', invoice: 'brand', payment: 'green', plan: 'violet', discount: 'amber',
  product: 'violet', tax: 'gray', user: 'gray', billing: 'brand',
};
const DOT = {
  subscription: 'bg-sky-500', invoice: 'bg-brand-600', payment: 'bg-emerald-600', plan: 'bg-violet-500',
  discount: 'bg-amber-500', product: 'bg-violet-500', tax: 'bg-slate-400', user: 'bg-slate-400', billing: 'bg-brand-600',
};

export const actorName = (r) => r.userName ? `${r.userName}${r.userRole ? ` (${r.userRole})` : ''}` : 'System (automatic)';

// Timeline of everything that happened to one subscription or invoice (audit trail).
// Usage: <ActivityHistory filter={{ subscriptionId: 12 }} version={sub.updatedAt} />  (version changes → reload)
export default function ActivityHistory({ filter, title = 'History', version = '' }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(8);
  const [error, setError] = useState('');
  const key = JSON.stringify(filter);

  useEffect(() => {
    let alive = true;
    api.get('/activity', { params: { ...JSON.parse(key), pageSize: limit } })
      .then((r) => { if (alive) { setRows(r.data.data); setTotal(r.data.total); } })
      .catch((err) => alive && setError(errorMessage(err)));
    return () => { alive = false; };
  }, [key, limit, version]);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Icon name="history" className="h-4 w-4 text-brand-600" /> {title}
        </h2>
        <span className="text-xs text-slate-500">{total} event{total === 1 ? '' : 's'}</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !rows.length && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
      <ol className="relative space-y-4 border-l border-slate-200 pl-5">
        {rows.map((r) => (
          <li key={r.id} className="relative">
            <span className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${DOT[r.entity] || 'bg-slate-400'}`} />
            <p className="text-sm text-ink">{r.summary}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatDateTime(r.createdAt)} · {actorName(r)}
              {r.invoiceId && !filter.invoiceId && r.entity !== 'subscription' && (
                <> · <Link className="font-medium text-brand-700 hover:underline" to={`/invoices/${r.invoiceId}`}>{r.entityLabel}</Link></>
              )}
            </p>
          </li>
        ))}
      </ol>
      {total > rows.length && (
        <button className="mt-4 text-sm font-medium text-brand-700 hover:underline" onClick={() => setLimit((n) => Math.min(100, n + 20))}>
          Show more ({total - rows.length} older)
        </button>
      )}
    </div>
  );
}

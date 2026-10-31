import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePagedList } from '../hooks/usePagedList.js';
import RunBilling from '../components/RunBilling.jsx';
import { Alert, Badge, DataTable, PageHeader, Pagination, SearchInput } from '../components/ui.jsx';
import { formatDate, formatINR, INVOICE_STATUS } from '../utils/format.js';
import FitText, { FitGroup } from '../components/FitText.jsx';

const TABS = [
  { key: '', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'confirmed', label: 'Unpaid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function Invoices() {
  const { user } = useAuth();
  const internal = user.role !== 'customer';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => params.get('tab') || '');
  const filters = tab === 'overdue' ? { overdue: 'true' } : tab ? { status: tab } : {};
  const list = usePagedList('/invoices', filters);
  const [selected, setSelected] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const counts = list.counts || {};
  const summary = list.summary || {};

  const drafts = list.rows.filter((r) => r.status === 'draft');
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function confirmSelected() {
    setError('');
    try {
      const res = await api.post('/invoices/confirm-drafts', { ids: selected });
      setNotice(`${res.data.confirmed} invoice${res.data.confirmed === 1 ? '' : 's'} confirmed.`);
      setSelected([]);
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const columns = [
    ...(internal && tab === 'draft' ? [{
      key: 'select', header: (
        <input type="checkbox" className="h-4 w-4 accent-brand-600" aria-label="Select all drafts"
          checked={drafts.length > 0 && drafts.every((d) => selected.includes(d.id))}
          onChange={(e) => setSelected(e.target.checked ? drafts.map((d) => d.id) : [])} />
      ),
      render: (r) => (
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={selected.includes(r.id)}
          onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.id)} aria-label={`Select ${r.number}`} />
      ),
    }] : []),
    { key: 'number', header: 'Invoice', render: (r) => <span className="font-medium text-brand-700">{r.number}</span> },
    ...(internal ? [{ key: 'customerName', header: 'Customer', render: (r) => (
      <div><div className="font-medium">{r.customerName}</div><div className="text-xs text-slate-500">{r.subscriptionNumber}</div></div>
    ) }] : [{ key: 'subscriptionNumber', header: 'Subscription' }]),
    { key: 'period', header: 'Period', render: (r) => `${formatDate(r.periodStart)} to ${formatDate(r.periodEnd)}` },
    { key: 'dueDate', header: 'Due', render: (r) => (
      <div className={r.isOverdue ? 'font-medium text-red-600' : ''}>
        {formatDate(r.dueDate)}{r.isOverdue && <div className="text-xs">{r.daysOverdue} day{r.daysOverdue === 1 ? '' : 's'} late</div>}
      </div>
    ) },
    { key: 'total', header: 'Total', className: 'text-right', render: (r) => formatINR(r.total) },
    { key: 'amountDue', header: 'Due amount', className: 'text-right', render: (r) => r.status === 'cancelled' ? '-' : formatINR(r.amountDue) },
    { key: 'status', header: 'Status', render: (r) => (
      <div className="flex gap-1">
        <Badge color={INVOICE_STATUS[r.status].color}>{INVOICE_STATUS[r.status].label}</Badge>
        {r.isOverdue && <Badge color="red">Overdue</Badge>}
      </div>
    ) },
  ];

  const overdueHint = `${counts.overdue ?? 0} invoice${counts.overdue === 1 ? '' : 's'} past due`;
  const cards = internal ? [
    { label: 'Invoiced', value: summary.invoiced, hint: 'Confirmed and paid invoices' },
    { label: 'Collected', value: summary.collected, hint: 'Payments received', color: 'text-emerald-700' },
    { label: 'Outstanding', value: summary.outstanding, hint: 'Confirmed, not yet paid' },
    { label: 'Overdue', value: summary.overdueAmount, hint: overdueHint, color: 'text-red-600' },
  ] : [
    { label: 'Total billed', value: summary.invoiced, hint: 'All your invoices' },
    { label: 'Paid', value: summary.collected, hint: 'Payments you have made', color: 'text-emerald-700' },
    { label: 'To pay', value: summary.outstanding, hint: 'Still due on your invoices' },
    { label: 'Overdue', value: summary.overdueAmount, hint: overdueHint, color: 'text-red-600' },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={internal ? 'Invoices' : 'My invoices'}
        subtitle={internal ? 'Created automatically from subscriptions on their billing day.' : 'Your invoices and what is still due.'}
        actions={internal && <RunBilling onDone={list.reload} />} />

      <FitGroup><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</div>
            <FitText className={`mt-1 text-xl font-semibold ${c.color || ''}`}>{formatINR(c.value)}</FitText>
            <div className="text-xs text-slate-500">{c.hint}</div>
          </div>
        ))}
      </div></FitGroup>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const n = t.key === '' ? Object.entries(counts).filter(([k]) => k !== 'overdue').reduce((a, [, v]) => a + v, 0) : counts[t.key] ?? 0;
          return (
            <button key={t.key || 'all'} onClick={() => { setTab(t.key); setSelected([]); }}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-ink'}`}>
              {t.label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${t.key === 'overdue' && n > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{n.toLocaleString('en-IN')}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={internal ? 'Search invoice, customer or subscription' : 'Search invoice number'} />
        {internal && tab === 'draft' && (
          <button className="btn-primary" disabled={!selected.length} onClick={confirmSelected}>
            Confirm {selected.length || ''} selected
          </button>
        )}
      </div>
      <div className="mb-4 space-y-2">
        <Alert type="success">{notice}</Alert>
        <Alert>{error || list.error}</Alert>
      </div>

      <DataTable columns={columns} rows={list.rows} loading={list.loading} empty="No invoices found" onRowClick={(r) => navigate(`/invoices/${r.id}`)} />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
    </div>
  );
}

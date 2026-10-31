import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePagedList } from '../hooks/usePagedList.js';
import { Alert, Badge, DataTable, PageHeader, Pagination, SearchInput } from '../components/ui.jsx';
import { formatDate, formatINR, PER_PERIOD, SUB_STATUS } from '../utils/format.js';

const TABS = ['', 'draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'];

// Subscriptions list. Internal team sees all; customers see only their own (enforced by the server).
export default function Subscriptions() {
  const { user } = useAuth();
  const internal = user.role !== 'customer';
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const list = usePagedList('/subscriptions', status ? { status } : {});
  const counts = list.counts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  const columns = [
    { key: 'number', header: 'Number', render: (r) => <span className="font-medium text-brand-700">{r.number}</span> },
    ...(internal ? [{ key: 'customerName', header: 'Customer', render: (r) => (
      <div><div className="font-medium">{r.customerName}</div><div className="text-xs text-slate-500">{r.customerCompany || 'Individual'}</div></div>
    ) }] : []),
    { key: 'planName', header: 'Plan', render: (r) => <div><div>{r.planName}</div><div className="text-xs text-slate-500">{r.quantity} seat{r.quantity > 1 ? 's' : ''}</div></div> },
    { key: 'startDate', header: 'Start', render: (r) => formatDate(r.startDate) },
    { key: 'expiryDate', header: 'Expiry', render: (r) => formatDate(r.expiryDate) },
    { key: 'nextInvoiceDate', header: 'Next invoice', render: (r) => ['active'].includes(r.status) ? formatDate(r.nextInvoiceDate) : '-' },
    { key: 'total', header: 'Recurring total', className: 'text-right', render: (r) => <span>{formatINR(r.total)}<span className="text-xs text-slate-500"> / {PER_PERIOD[r.billingPeriod]}</span></span> },
    { key: 'status', header: 'Status', render: (r) => <Badge color={SUB_STATUS[r.status].color}>{SUB_STATUS[r.status].label}</Badge> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={internal ? 'Subscriptions' : 'My subscriptions'}
        subtitle={internal ? 'Every subscription and where it stands.' : 'Your plans, their status and what they cost.'}
        actions={internal && <Link to="/subscriptions/new" className="btn-primary">New subscription</Link>} />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const n = t ? counts[t] ?? 0 : all;
          return (
            <button key={t || 'all'} onClick={() => setStatus(t)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                status === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-ink'}`}>
              {t ? SUB_STATUS[t].label : 'All'} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{n.toLocaleString('en-IN')}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={internal ? 'Search number, customer or plan' : 'Search number or plan'} />
      </div>
      <div className="mb-4"><Alert>{list.error}</Alert></div>

      <DataTable columns={columns} rows={list.rows} loading={list.loading}
        empty={internal ? 'No subscriptions found' : 'You have no subscriptions yet'} onRowClick={(r) => navigate(`/subscriptions/${r.id}`)} />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
    </div>
  );
}

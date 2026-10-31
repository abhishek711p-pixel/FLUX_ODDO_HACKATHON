import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePagedList } from '../hooks/usePagedList.js';
import { METHOD_LABELS, PAYMENT_METHODS } from '../components/RecordPayment.jsx';
import { Alert, Badge, DataTable, PageHeader, Pagination, SearchInput } from '../components/ui.jsx';
import { formatDate, formatINR } from '../utils/format.js';
import Select from '../components/Select.jsx';
import FitText, { FitGroup } from '../components/FitText.jsx';

// All payments received, with method, date and note. Filter by method and date range.
export default function Payments() {
  const { user } = useAuth();
  const internal = user.role !== 'customer';
  const navigate = useNavigate();
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = usePagedList('/payments', { ...(method ? { method } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const summary = list.summary || { amount: 0, byMethod: {} };

  const columns = [
    { key: 'paymentDate', header: 'Date', render: (r) => formatDate(r.paymentDate) },
    { key: 'invoiceNumber', header: 'Invoice', render: (r) => <span className="font-medium text-brand-700">{r.invoiceNumber}</span> },
    ...(internal ? [{ key: 'customerName', header: 'Customer', render: (r) => (
      <div><div className="font-medium">{r.customerName}</div><div className="text-xs text-slate-500">{r.customerCompany || 'Individual'}</div></div>
    ) }] : []),
    { key: 'method', header: 'Method', render: (r) => <Badge color="brand">{METHOD_LABELS[r.method]}</Badge> },
    { key: 'note', header: 'Note', render: (r) => <span className="text-slate-600">{r.note || '-'}</span> },
    ...(internal ? [{ key: 'recordedBy', header: 'Recorded by', render: (r) => r.recordedBy || '-' }] : []),
    { key: 'amount', header: 'Amount', className: 'text-right', render: (r) => <span className="font-medium">{formatINR(r.amount)}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={internal ? 'Payments' : 'My payments'}
        subtitle={internal ? 'Every payment received, against the invoice it settles.' : 'Every payment you have made, against the invoice it paid.'} />

      <div className={`mb-5 grid gap-3 ${internal ? 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-6' : 'sm:grid-cols-3'}`}>
        <div className={`card p-4 ${internal ? 'col-span-2 md:col-span-1' : ''}`}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{internal ? 'Received' : 'Total paid'}</div>
          <FitText className="mt-1 text-xl font-semibold text-emerald-700">{formatINR(summary.amount)}</FitText>
          <div className="text-xs text-slate-500">{list.total.toLocaleString('en-IN')} payment{list.total === 1 ? '' : 's'}</div>
        </div>
        {internal && <FitGroup>{PAYMENT_METHODS.map((m) => (
          <div key={m.value} className="card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{METHOD_LABELS[m.value]}</div>
            <FitText className="mt-1 text-lg font-semibold">{formatINR(summary.byMethod?.[m.value] || 0)}</FitText>
          </div>
        ))}</FitGroup>}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={internal ? 'Search invoice, customer or note' : 'Search invoice number or note'} />
        <Select className="input w-auto" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{METHOD_LABELS[m.value]}</option>)}
        </Select>
        <label className="text-sm text-slate-600">From <input type="date" className="input ml-1 inline-block w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm text-slate-600">To <input type="date" className="input ml-1 inline-block w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(method || from || to) && <button className="text-sm font-medium text-brand-700" onClick={() => { setMethod(''); setFrom(''); setTo(''); }}>Clear filters</button>}
      </div>
      <div className="mb-4"><Alert>{list.error}</Alert></div>

      <DataTable columns={columns} rows={list.rows} loading={list.loading} empty="No payments found" onRowClick={(r) => navigate(`/invoices/${r.invoiceId}`)} />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
    </div>
  );
}

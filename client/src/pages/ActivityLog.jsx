import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePagedList } from '../hooks/usePagedList.js';
import { Alert, Badge, DataTable, PageHeader, Pagination, SearchInput } from '../components/ui.jsx';
import { formatDateTime } from '../utils/format.js';
import Select from '../components/Select.jsx';
import { ENTITY_COLORS, ENTITY_LABELS, actorName } from '../components/ActivityHistory.jsx';

// Audit trail: every important change, who made it and when. Rows are never edited or deleted.
export default function ActivityLog() {
  const navigate = useNavigate();
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = usePagedList('/activity', { ...(entity ? { entity } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }, 25);

  const open = (r) => {
    if (r.invoiceId) return navigate(`/invoices/${r.invoiceId}`);
    if (r.subscriptionId) return navigate(`/subscriptions/${r.subscriptionId}`);
    const pages = { plan: '/plans', discount: '/discounts', product: '/products', tax: '/taxes', user: '/team' };
    if (pages[r.entity]) navigate(pages[r.entity]);
  };

  const columns = [
    { key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</span> },
    { key: 'entity', header: 'Area', render: (r) => <Badge color={ENTITY_COLORS[r.entity]}>{ENTITY_LABELS[r.entity] || r.entity}</Badge> },
    { key: 'summary', header: 'What happened', render: (r) => <span className="text-ink">{r.summary}</span> },
    { key: 'user', header: 'Done by', render: (r) => <span className="whitespace-nowrap">{actorName(r)}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Activity log"
        subtitle="Audit trail: who changed what and when. Entries are only added, never edited or deleted." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search number, name or action" />
        <Select className="input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Area">
          <option value="">All areas</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <label className="text-sm text-slate-600">From <input type="date" className="input ml-1 inline-block w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm text-slate-600">To <input type="date" className="input ml-1 inline-block w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {(entity || from || to) && <button className="text-sm font-medium text-brand-700" onClick={() => { setEntity(''); setFrom(''); setTo(''); }}>Clear filters</button>}
      </div>
      <div className="mb-4"><Alert>{list.error}</Alert></div>

      <DataTable columns={columns} rows={list.rows} loading={list.loading} empty="No activity found" onRowClick={open} />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
    </div>
  );
}

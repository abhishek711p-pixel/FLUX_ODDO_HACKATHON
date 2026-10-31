// Shared UI building blocks used by every page
import { useEffect } from 'react';
import Icon from './Icon.jsx';
import Select from './Select.jsx';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  const styles = {
    error: 'bg-red-50 text-red-700 border-red-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles[type]}`}>{children}</div>;
}

// Text input with label and field error
export function Field({ label, error, hint, id, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <input id={id} className={`input ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`} {...props} />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ label, error, id, children, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <Select id={id} className={`input ${error ? 'border-red-400' : ''}`} {...props}>{children}</Select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TextArea({ label, error, id, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="label" htmlFor={id}>{label}</label>}
      <textarea id={id} rows={3} className={`input ${error ? 'border-red-400' : ''}`} {...props} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Checkbox with a title and a one-line explanation
export function CheckboxCard({ id, label, description, checked, onChange, disabled }) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 rounded-lg border p-3 transition ${
      checked ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'} ${disabled ? 'opacity-70' : 'cursor-pointer hover:border-brand-200'}`}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <input type="search" className="input max-w-xs" placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)} />
  );
}

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const BADGE_COLORS = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

export function Badge({ color = 'gray', children }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_COLORS[color]}`}>
      {children}
    </span>
  );
}

// Generic table. columns: [{ key, header, render?(row), className? }]
export function DataTable({ columns, rows, loading, empty = 'Nothing here yet', onRowClick }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.className || ''}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">{empty}</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''} ${loading ? 'opacity-60' : ''}`}>
                  {columns.map((c) => (
                    <td key={c.key} className={`whitespace-nowrap px-4 py-3 ${c.className || ''}`}>
                      {c.render ? c.render(row) : row[c.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
      <span>
        {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn-secondary px-3 py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

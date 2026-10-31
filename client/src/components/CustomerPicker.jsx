import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';

// Search-as-you-type customer selector (works with thousands of customers)
export default function CustomerPicker({ value, onChange, error }) {
  const [text, setText] = useState(value ? `${value.name}${value.company ? ` · ${value.company}` : ''}` : '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (value) setText(`${value.name}${value.company ? ` · ${value.company}` : ''}`);
  }, [value?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api.get('/customers', { params: { search: text.split(' · ')[0], pageSize: 8 } })
        .then((res) => setResults(res.data.data.filter((c) => c.active)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [text, open]);

  useEffect(() => {
    const close = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <label className="label" htmlFor="customer-search">Customer</label>
      <input id="customer-search" className={`input ${error ? 'border-red-400' : ''}`} placeholder="Search by name, email or company"
        value={text} autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (value) onChange(null); }} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No matching customers</div>
          ) : results.map((c) => (
            <button type="button" key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => { onChange(c); setOpen(false); }}>
              <div className="font-medium">{c.name}{c.company ? <span className="font-normal text-slate-500"> · {c.company}</span> : null}</div>
              <div className="text-xs text-slate-500">{c.email}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

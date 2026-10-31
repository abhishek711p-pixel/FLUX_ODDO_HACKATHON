import { useState } from 'react';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePagedList } from '../hooks/usePagedList.js';
import { useTaxes } from '../hooks/useTaxes.js';
import Icon from '../components/Icon.jsx';
import {
  Alert, Badge, CheckboxCard, DataTable, Field, Modal, PageHeader, Pagination, SearchInput, SelectField, TextArea,
} from '../components/ui.jsx';
import { formatINR } from '../utils/format.js';
import Select from '../components/Select.jsx';

const EMPTY = { name: '', type: 'service', salesPrice: '', costPrice: '', notes: '', isAddon: false, taxId: '', active: true, variants: [] };

// Products with variants. Admin creates and edits; staff can view.
export default function Products() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('true');
  const filters = { ...(kind ? { isAddon: kind } : {}), ...(status ? { active: status } : {}) };
  const list = usePagedList('/products', filters);
  const taxes = useTaxes();

  const [editing, setEditing] = useState(null); // null closed, {} new, product = edit/view
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function open(row) {
    setErrors({});
    setError('');
    if (!row) {
      const defaultTax = taxes.find((t) => t.active && Number(t.rate) === 18);
      setForm({ ...EMPTY, taxId: defaultTax ? String(defaultTax.id) : '' });
      setEditing({});
      return;
    }
    try {
      const p = (await api.get(`/products/${row.id}`)).data;
      setForm({
        name: p.name, type: p.type, salesPrice: String(p.salesPrice), costPrice: String(p.costPrice ?? ''),
        notes: p.notes || '', isAddon: p.isAddon, taxId: p.taxId ? String(p.taxId) : '', active: p.active,
        variants: p.variants.map((v) => ({ ...v, extraPrice: String(v.extraPrice) })),
      });
      setEditing(p);
    } catch (err) {
      setNotice('');
      setError(errorMessage(err));
    }
  }

  const setVariant = (i, key, value) =>
    setForm({ ...form, variants: form.variants.map((v, idx) => (idx === i ? { ...v, [key]: value } : v)) });
  const addVariant = () =>
    setForm({ ...form, variants: [...form.variants, { attribute: form.variants.at(-1)?.attribute || 'Brand', value: '', extraPrice: '0' }] });
  const removeVariant = (i) => setForm({ ...form, variants: form.variants.filter((_, idx) => idx !== i) });

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, taxId: form.taxId || null };
      const res = editing.id ? await api.put(`/products/${editing.id}`, body) : await api.post('/products', body);
      setEditing(null);
      setNotice(`${res.data.name} was saved.`);
      list.reload();
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !isAdmin;
  const margin = Number(form.salesPrice) - Number(form.costPrice);

  const columns = [
    { key: 'name', header: 'Product', render: (r) => (
      <div>
        <div className="font-medium">{r.name}</div>
        <div className="text-xs text-slate-500 capitalize">{r.type}{r.variantCount > 0 ? ` · ${r.variantCount} variants` : ''}</div>
      </div>
    ) },
    { key: 'isAddon', header: 'Kind', render: (r) => r.isAddon ? <Badge color="violet">Add-on</Badge> : <Badge color="blue">Main product</Badge> },
    { key: 'salesPrice', header: 'Sales price', className: 'text-right', render: (r) => formatINR(r.salesPrice) },
    { key: 'costPrice', header: 'Cost price', className: 'text-right', render: (r) => formatINR(r.costPrice) },
    { key: 'taxName', header: 'Tax', render: (r) => r.taxName || 'No tax' },
    { key: 'active', header: 'Status', render: (r) => <Badge color={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Archived'}</Badge> },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Products" subtitle="Software, services and add-ons that customers subscribe to."
        actions={isAdmin && <button className="btn-primary" onClick={() => open(null)}>Add product</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search products" />
        <Select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          <option value="false">Main products</option>
          <option value="true">Add-ons</option>
        </Select>
        <Select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="true">Active</option>
          <option value="false">Archived</option>
          <option value="">All</option>
        </Select>
      </div>
      <div className="mb-4 space-y-2">
        <Alert type="success">{notice}</Alert>
        {editing === null && <Alert>{error || list.error}</Alert>}
      </div>

      <DataTable columns={columns} rows={list.rows} loading={list.loading} empty="No products found" onRowClick={open} />
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />

      <Modal wide open={editing !== null} onClose={() => setEditing(null)}
        title={!editing?.id ? 'Add product' : readOnly ? editing.name : 'Edit product'}
        footer={readOnly ? <button className="btn-secondary" onClick={() => setEditing(null)}>Close</button> : <>
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save product'}</button>
        </>}>
        <form onSubmit={save} className="space-y-5" noValidate>
          <fieldset disabled={readOnly} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="p-name" className="sm:col-span-2" label="Product name" value={form.name} onChange={set('name')} error={errors.name} />
              <SelectField id="p-type" label="Type" value={form.type} onChange={set('type')} error={errors.type}>
                <option value="service">Service</option>
                <option value="goods">Goods</option>
              </SelectField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="p-sales" type="number" min="0" step="0.01" label="Sales price (₹)" value={form.salesPrice}
                onChange={set('salesPrice')} error={errors.salesPrice} />
              <Field id="p-cost" type="number" min="0" step="0.01" label="Cost price (₹)" value={form.costPrice}
                onChange={set('costPrice')} error={errors.costPrice}
                hint={form.salesPrice && form.costPrice ? `Margin ${formatINR(margin)}` : ''} />
              <SelectField id="p-tax" label="Tax rule" value={form.taxId} onChange={set('taxId')} error={errors.taxId}>
                <option value="">No tax</option>
                {taxes.filter((t) => t.active || String(t.id) === form.taxId).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </SelectField>
            </div>
            <TextArea id="p-notes" label="Notes" value={form.notes} onChange={set('notes')} error={errors.notes} />
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckboxCard id="p-addon" label="Add-on" description="Customers can switch it on or off on their subscription."
                checked={form.isAddon} onChange={(v) => setForm({ ...form, isAddon: v })} disabled={readOnly} />
              {editing?.id && (
                <CheckboxCard id="p-active" label="Active" description="Archived products cannot be added to new subscriptions."
                  checked={form.active} onChange={(v) => setForm({ ...form, active: v })} disabled={readOnly} />
              )}
            </div>
          </fieldset>

          {/* Variants editor */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Variants</h3>
                <p className="text-xs text-slate-500">Each variant adds an extra price, for example Brand: Odoo adds ₹560.</p>
              </div>
              {!readOnly && (
                <button type="button" className="btn-secondary px-3 py-1.5" onClick={addVariant}>
                  <Icon name="plus" className="h-4 w-4" /> Add variant
                </button>
              )}
            </div>
            {form.variants.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-4 text-center text-sm text-slate-400">No variants. The product is sold at its sales price.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Attribute</th><th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">Extra price (₹)</th><th className="px-3 py-2 text-right">Final price</th><th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {form.variants.map((v, i) => (
                      <tr key={v.id || `new-${i}`}>
                        <td className="px-3 py-2"><input className="input" disabled={readOnly} value={v.attribute} placeholder="Brand"
                          onChange={(e) => setVariant(i, 'attribute', e.target.value)} /></td>
                        <td className="px-3 py-2"><input className="input" disabled={readOnly} value={v.value} placeholder="Odoo"
                          onChange={(e) => setVariant(i, 'value', e.target.value)} /></td>
                        <td className="px-3 py-2"><input className="input" disabled={readOnly} type="number" min="0" step="0.01" value={v.extraPrice}
                          onChange={(e) => setVariant(i, 'extraPrice', e.target.value)} /></td>
                        <td className="px-3 py-2 text-right font-medium">{formatINR(Number(form.salesPrice) + Number(v.extraPrice))}</td>
                        <td className="px-3 py-2 text-right">
                          {!readOnly && (
                            <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => removeVariant(i)} aria-label="Remove variant">
                              <Icon name="trash" className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {errors.variants && <p className="mt-1 text-xs text-red-600">{errors.variants}</p>}
          </div>

          {readOnly && <Alert type="info">Only the admin can add or change products.</Alert>}
          <Alert>{error}</Alert>
        </form>
      </Modal>
    </div>
  );
}

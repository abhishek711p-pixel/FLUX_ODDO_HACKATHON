import { unitPriceOf } from '../hooks/useCatalog.js';
import { formatINR } from '../utils/format.js';
import Icon from './Icon.jsx';
import Select from './Select.jsx';

const round2 = (n) => Math.round(Number((Number(n) * 100).toPrecision(15))) / 100;

// Same maths as the server: subtotal, tax rounded to paise, total
export function lineAmounts(quantity, unitPrice, taxRate) {
  const subtotal = round2(Number(quantity) * Number(unitPrice));
  const tax = round2((subtotal * (Number(taxRate) || 0)) / 100);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

// Editable product lines. lines: [{ productId, variantId, quantity, unitPrice }]
// showPrice=false hides price/tax columns (used by quotation templates).
export default function LinesEditor({ lines, onChange, products, showPrice = true, errors = {} }) {
  const update = (i, patch) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i) => onChange(lines.filter((_, idx) => idx !== i));
  const add = () => onChange([...lines, { productId: '', variantId: '', quantity: '1', unitPrice: '' }]);

  function pickProduct(i, productId) {
    const p = products.find((x) => String(x.id) === productId);
    const variantId = p?.variants?.length ? String(p.variants[0].id) : '';
    update(i, { productId, variantId, unitPrice: p ? String(unitPriceOf(p, variantId)) : '' });
  }
  function pickVariant(i, variantId) {
    const p = products.find((x) => String(x.id) === String(lines[i].productId));
    update(i, { variantId, unitPrice: String(unitPriceOf(p, variantId)) });
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Variant</th>
              <th className="w-24 px-3 py-2">Qty</th>
              {showPrice && <>
                <th className="w-32 px-3 py-2">Unit price (₹)</th>
                <th className="px-3 py-2">Tax</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 && (
              <tr><td colSpan={showPrice ? 7 : 4} className="px-3 py-4 text-center text-slate-400">No product lines. Only the plan will be billed.</td></tr>
            )}
            {lines.map((l, i) => {
              const p = products.find((x) => String(x.id) === String(l.productId));
              const amounts = lineAmounts(l.quantity || 0, l.unitPrice || 0, p?.taxRate);
              return (
                <tr key={i}>
                  <td className="min-w-48 px-3 py-2">
                    <Select className="input" value={l.productId} onChange={(e) => pickProduct(i, e.target.value)}>
                      <option value="">Choose product…</option>
                      {products.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}{x.isAddon ? ' (add-on)' : ''}</option>
                      ))}
                    </Select>
                    {errors[`lines.${i}.productId`] && <p className="mt-1 text-xs text-red-600">{errors[`lines.${i}.productId`]}</p>}
                  </td>
                  <td className="min-w-36 px-3 py-2">
                    {p?.variants?.length ? (
                      <Select className="input" value={l.variantId || ''} onChange={(e) => pickVariant(i, e.target.value)}>
                        {p.variants.map((v) => (
                          <option key={v.id} value={v.id}>{v.attribute}: {v.value}{v.extraPrice > 0 ? ` (+${formatINR(v.extraPrice)})` : ''}</option>
                        ))}
                      </Select>
                    ) : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    <input className="input" type="number" min="1" step="1" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                  </td>
                  {showPrice && <>
                    <td className="px-3 py-2">
                      <input className="input" type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{p ? (p.taxName || 'No tax') : '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{formatINR(amounts.total)}</td>
                  </>}
                  <td className="px-2 py-2 text-right">
                    <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => remove(i)} aria-label="Remove line">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-secondary mt-2 px-3 py-1.5" onClick={add}>
        <Icon name="plus" className="h-4 w-4" /> Add line
      </button>
    </div>
  );
}

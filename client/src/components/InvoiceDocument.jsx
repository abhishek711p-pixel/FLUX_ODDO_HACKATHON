import { formatDate, formatINR } from '../utils/format.js';
import { useCompany } from '../hooks/useCompany.js';

// The invoice itself: used on the detail page and on the print page
export default function InvoiceDocument({ inv }) {
  const hasDiscount = inv.totals.discount > 0;
  const company = useCompany();
  return (
    <div className="bg-white">
      <div className="flex flex-col justify-between gap-6 sm:flex-row">
        <div>
          <div className="text-xl font-semibold text-brand-700">{company.companyName}</div>
          <div className="mt-1 text-sm text-slate-500">Subscription billing{company.companyEmail ? ` · ${company.companyEmail}` : ''}</div>
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tax invoice</div>
          <div className="text-xl font-semibold">{inv.number}</div>
          <div className="mt-1 text-sm text-slate-500">Invoice date {formatDate(inv.invoiceDate)}</div>
          <div className="text-sm text-slate-500">Due date {formatDate(inv.dueDate)}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 border-t border-slate-200 pt-5 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</div>
          <div className="mt-1 font-medium">{inv.customer.company || inv.customer.name}</div>
          {inv.customer.company && <div>{inv.customer.name}</div>}
          <div className="text-slate-500">{inv.customer.email}</div>
          {inv.customer.phone && <div className="text-slate-500">{inv.customer.phone}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscription</div>
          <div className="mt-1 font-medium">{inv.subscription.number} · {inv.subscription.planName}</div>
          <div className="text-slate-500">Service period {formatDate(inv.periodStart)} to {formatDate(inv.periodEnd)}</div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-y border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit price</th>
              {hasDiscount && <th className="px-3 py-2 text-right">Discount</th>}
              <th className="px-3 py-2 text-right">Taxable</th>
              <th className="px-3 py-2">GST</th>
              <th className="py-2 pl-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inv.lines.map((l) => (
              <tr key={l.id}>
                <td className="py-2.5 pr-3">{l.description}</td>
                <td className="px-3 py-2.5 text-right">{l.quantity}</td>
                <td className="px-3 py-2.5 text-right">{formatINR(l.unitPrice)}</td>
                {hasDiscount && <td className="px-3 py-2.5 text-right">{l.discountAmount > 0 ? `− ${formatINR(l.discountAmount)}` : '-'}</td>}
                <td className="px-3 py-2.5 text-right">{formatINR(l.subtotal)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{l.taxName ? `${l.taxRate}% · ${formatINR(l.taxAmount)}` : 'No tax'}</td>
                <td className="py-2.5 pl-3 text-right font-medium">{formatINR(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Untaxed amount</dt><dd>{formatINR(inv.totals.untaxed)}</dd></div>
          {hasDiscount && inv.discountsApplied.map((d) => (
            <div key={d.discountId} className="flex justify-between text-emerald-700"><dt>Discount: {d.name}</dt><dd>− {formatINR(d.amount)}</dd></div>
          ))}
          <div className="flex justify-between"><dt className="text-slate-500">GST</dt><dd>{formatINR(inv.totals.tax)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold"><dt>Total</dt><dd>{formatINR(inv.totals.total)}</dd></div>
          {inv.totals.paid > 0 && <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd>− {formatINR(inv.totals.paid)}</dd></div>}
          <div className="flex justify-between font-semibold"><dt>Amount due</dt><dd>{formatINR(inv.totals.due)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

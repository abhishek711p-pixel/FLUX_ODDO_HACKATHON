// Subscription business rules in one place: totals, status flow and who may do what.
import { HttpError, toCamel } from '../utils/http.js';
import { round2, todayISO } from '../utils/periods.js';
import { previewDiscount } from './billing.js';

// One amount line: subtotal = qty × price, tax rounded to paise, total = subtotal + tax
export function lineAmounts(quantity, unitPrice, taxRate) {
  const subtotal = round2(quantity * unitPrice);
  const tax = round2((subtotal * (Number(taxRate) || 0)) / 100);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

// Status flow from the problem statement: Draft → Quotation → Confirmed → Active → Closed (+ Paused when the plan allows)
export const STATUS_FLOW = ['draft', 'quotation', 'confirmed', 'active', 'closed'];

// Which actions the current user may perform on this subscription right now.
// The UI shows only these buttons, and every transition is checked again on the server.
export function allowedActions(sub, user, today = todayISO()) {
  const internal = user.role === 'admin' || user.role === 'staff';
  const owner = user.role === 'customer' && sub.customerId === user.id;
  if (!internal && !owner) return [];

  const plan = sub.plan;
  const expired = sub.expiryDate && sub.expiryDate < today;
  const quoteExpired = sub.quotationValidUntil && sub.quotationValidUntil < today;
  // "Closed early" means before the expiry date (or any time when there is no expiry date)
  const canCloseRunning = plan.closable || (sub.expiryDate && sub.expiryDate <= today);
  const a = [];

  switch (sub.status) {
    case 'draft':
      if (internal) a.push('edit', 'send_quotation', 'cancel');
      break;
    case 'quotation':
      if (internal) a.push('edit');
      if (!quoteExpired) a.push('confirm');
      if (internal) a.push('cancel');
      break;
    case 'confirmed':
      if (internal) a.push('activate', 'cancel');
      break;
    case 'active':
      if (plan.pausable && !expired) a.push('pause');
      if (canCloseRunning) a.push('close');
      if (plan.renewable && sub.expiryDate) a.push('renew');
      a.push('manage_addons');
      if (internal) a.push('manage_lines');
      break;
    case 'paused':
      a.push('resume');
      if (canCloseRunning) a.push('close');
      a.push('manage_addons');
      if (internal) a.push('manage_lines');
      break;
    case 'closed':
      // Only a subscription that actually ran can be reopened, and only by the team (a cancelled quote or a
      // subscription closed by staff, e.g. for non-payment, cannot be revived by the customer)
      if (internal && plan.renewable && sub.expiryDate && sub.nextInvoiceDate) a.push('renew');
      break;
    default:
  }
  return a;
}

export function assertAllowed(sub, user, action) {
  if (!allowedActions(sub, user).includes(action)) {
    const labels = {
      pause: 'This plan does not allow pausing',
      close: 'This plan cannot be closed before its expiry date',
      renew: 'This plan cannot be renewed',
      confirm: 'This quotation can no longer be confirmed',
    };
    const reason = sub.status !== 'active' && sub.status !== 'paused' && ['pause', 'close', 'renew'].includes(action)
      ? `Not possible while the subscription is ${sub.status}`
      : labels[action] || `Not possible while the subscription is ${sub.status}`;
    throw new HttpError(400, reason);
  }
}

const SUB_DETAIL_SQL = `
  SELECT s.*, c.name AS customer_name, c.email AS customer_email, c.company AS customer_company, c.phone AS customer_phone,
         p.name AS plan_name, p.price AS plan_price, p.billing_period, p.min_quantity, p.auto_close, p.closable, p.pausable,
         p.renewable, p.start_date AS plan_start_date, p.end_date AS plan_end_date, p.active AS plan_active,
         pt.name AS plan_tax_name, pt.rate AS plan_tax_rate, t.name AS template_name, t.validity_days
  FROM subscriptions s
  JOIN users c ON c.id = s.customer_id
  JOIN plans p ON p.id = s.plan_id
  LEFT JOIN taxes pt ON pt.id = p.tax_id
  LEFT JOIN quotation_templates t ON t.id = s.template_id
  WHERE s.id = $1`;

// Full subscription with plan line, product lines, totals and invoices
export async function getSubscription(db, id, user) {
  const r = (await db.query(SUB_DETAIL_SQL, [id])).rows[0];
  if (!r) throw new HttpError(404, 'Subscription not found');
  // Customers may only open their own subscriptions (404, so other ids are not revealed)
  if (user && user.role === 'customer' && (r.customer_id !== user.id || r.status === 'draft')) throw new HttpError(404, 'Subscription not found');

  const linesRes = await db.query(
    `SELECT l.id, l.product_id, pr.name AS product_name, pr.is_addon, l.variant_id,
            CASE WHEN v.id IS NULL THEN NULL ELSE v.attribute || ': ' || v.value END AS variant_label,
            l.quantity, l.unit_price, l.tax_id, tx.name AS tax_name, COALESCE(tx.rate, 0) AS tax_rate
     FROM subscription_lines l
     JOIN products pr ON pr.id = l.product_id
     LEFT JOIN product_variants v ON v.id = l.variant_id
     LEFT JOIN taxes tx ON tx.id = l.tax_id
     WHERE l.subscription_id = $1 ORDER BY pr.is_addon, l.id`,
    [id]
  );

  const planAmounts = lineAmounts(r.quantity, r.plan_price, r.plan_tax_rate);
  const planLine = {
    description: `${r.plan_name} (${r.billing_period} plan)`,
    quantity: r.quantity,
    unitPrice: r.plan_price,
    taxName: r.plan_tax_name,
    taxRate: Number(r.plan_tax_rate) || 0,
    ...planAmounts,
  };
  const lines = linesRes.rows.map((row) => {
    const l = toCamel(row);
    return { ...l, ...lineAmounts(l.quantity, l.unitPrice, l.taxRate) };
  });
  const all = [planAmounts, ...lines];
  const totals = {
    untaxed: round2(all.reduce((s, l) => s + l.subtotal, 0)),
    tax: round2(all.reduce((s, l) => s + l.tax, 0)),
    total: round2(all.reduce((s, l) => s + l.total, 0)),
  };

  const invoices = await db.query(
    `SELECT id, number, status, invoice_date, due_date, period_start, period_end, total, amount_paid,
            total - amount_paid AS amount_due
     FROM invoices WHERE subscription_id = $1 ORDER BY period_start DESC, id DESC`,
    [id]
  );

  const sub = {
    id: r.id,
    number: r.number,
    status: r.status,
    customerId: r.customer_id,
    customer: { id: r.customer_id, name: r.customer_name, email: r.customer_email, company: r.customer_company, phone: r.customer_phone },
    planId: r.plan_id,
    plan: {
      id: r.plan_id, name: r.plan_name, price: r.plan_price, billingPeriod: r.billing_period, minQuantity: r.min_quantity,
      autoClose: r.auto_close, closable: r.closable, pausable: r.pausable, renewable: r.renewable,
      startDate: r.plan_start_date, endDate: r.plan_end_date, active: r.plan_active, taxName: r.plan_tax_name,
    },
    quantity: r.quantity,
    startDate: r.start_date,
    expiryDate: r.expiry_date,
    nextInvoiceDate: r.next_invoice_date,
    paymentTermsDays: r.payment_terms_days,
    quotationValidUntil: r.quotation_valid_until,
    templateId: r.template_id,
    templateName: r.template_name,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    planLine,
    lines,
    totals,
    invoices: invoices.rows.map(toCamel),
  };
  const today = todayISO();
  sub.isExpired = Boolean(sub.expiryDate && sub.expiryDate < today);
  sub.isQuotationExpired = Boolean(sub.status === 'quotation' && sub.quotationValidUntil && sub.quotationValidUntil < today);
  sub.allowedActions = user ? allowedActions(sub, user, today) : [];
  // Discount the next invoice would get automatically (if billed today)
  sub.nextDiscount = ['active', 'paused', 'confirmed', 'quotation', 'draft'].includes(sub.status)
    ? await previewDiscount(db, sub, sub.status === 'active' && sub.nextInvoiceDate > today ? sub.nextInvoiceDate : today)
    : null;
  return sub;
}

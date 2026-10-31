// Billing engine: turns one billing period of a subscription into an invoice.
// Used by "Create invoice now", by "Run billing" and by the automatic hourly run.
//
// Guarantees (from the problem statement: "Nothing should be billed twice or skipped"):
//  - The subscription row is locked while its invoice is created, so two runs cannot race.
//  - A unique index allows only one live invoice per subscription per period (database-level).
//  - Each invoice moves next_invoice_date forward by exactly one period, and the billing run
//    loops until the subscription is up to date, so missed periods are caught up one by one.
import { pool, withTransaction } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { HttpError } from '../utils/http.js';
import { addDays, addPeriod, dayOf, round2, todayISO } from '../utils/periods.js';

const MAX_CATCH_UP = 400; // safety cap per subscription per run (e.g. a daily plan a year behind)

// ---------- Discounts ----------
// A discount rule applies automatically when: active, the invoice date is inside its dates,
// it has uses left, and the order meets its minimum purchase / minimum quantity.
// 'all' discounts the whole invoice; 'products' discounts only lines of the listed products.
// If several rules qualify, the customer gets the single best one (largest saving).

function discountAmountFor(rule, lines) {
  const applicable = rule.appliesTo === 'all' ? lines : lines.filter((l) => l.productId && rule.productIds.includes(l.productId));
  const base = round2(applicable.reduce((s, l) => s + l.subtotal, 0));
  const qty = applicable.reduce((s, l) => s + l.quantity, 0);
  if (!applicable.length || base <= 0) return null;
  if (base < rule.minPurchase || qty < rule.minQuantity) return null;
  const amount = rule.type === 'percent' ? round2((base * rule.value) / 100) : Math.min(round2(rule.value), base);
  return amount > 0 ? { amount, applicable } : null;
}

async function bestDiscount(db, lines, invoiceDate) {
  const { rows } = await db.query(
    `SELECT d.id, d.name, d.type, d.value, d.min_purchase, d.min_quantity, d.applies_to,
            COALESCE(array_agg(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids
     FROM discounts d LEFT JOIN discount_products dp ON dp.discount_id = d.id
     WHERE d.active AND d.start_date <= $1 AND d.end_date >= $1
       AND (d.usage_limit IS NULL OR d.used_count < d.usage_limit)
     GROUP BY d.id`,
    [invoiceDate]
  );
  let best = null;
  for (const r of rows) {
    const rule = {
      id: r.id, name: r.name, type: r.type, value: Number(r.value), minPurchase: Number(r.min_purchase),
      minQuantity: r.min_quantity, appliesTo: r.applies_to, productIds: r.product_ids.map(Number),
    };
    const result = discountAmountFor(rule, lines);
    if (result && (!best || result.amount > best.amount)) best = { rule, ...result };
  }
  return best;
}

// Preview: which discount the subscription's next invoice would get, if billed on `date`
export async function previewDiscount(db, sub, date = todayISO()) {
  const lines = [
    { productId: null, quantity: sub.quantity, subtotal: round2(sub.quantity * Number(sub.plan.price)) },
    ...sub.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, subtotal: round2(l.quantity * Number(l.unitPrice)) })),
  ];
  const best = await bestDiscount(db, lines, date);
  return best ? { id: best.rule.id, name: best.rule.name, amount: best.amount } : null;
}

// Spread a discount over the applicable lines in proportion to their value (last line takes the rounding remainder)
function spreadDiscount(best) {
  const base = best.applicable.reduce((s, l) => s + l.subtotal, 0);
  let left = best.amount;
  best.applicable.forEach((line, i) => {
    const share = i === best.applicable.length - 1 ? left : round2((best.amount * line.subtotal) / base);
    line.discount = Math.min(share, line.subtotal);
    left = round2(left - line.discount);
  });
}

// ---------- Invoice creation ----------

// Create the invoice for the subscription's current period (next_invoice_date).
// Returns { invoice } or { skipped: reason }. Must run inside a transaction (db = client).
export async function invoiceNextPeriod(db, subscriptionId, { invoiceDate = todayISO(), userId = null, onlyIfDue = false } = {}) {
  const s = (await db.query(
    `SELECT s.id, s.number, s.status, s.customer_id, s.quantity, s.next_invoice_date, s.expiry_date, s.payment_terms_days, s.start_date,
            p.name AS plan_name, p.price AS plan_price, p.billing_period, p.auto_close,
            pt.name AS plan_tax_name, COALESCE(pt.rate, 0) AS plan_tax_rate
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id LEFT JOIN taxes pt ON pt.id = p.tax_id
     WHERE s.id = $1 FOR UPDATE OF s`,
    [subscriptionId]
  )).rows[0];
  if (!s) throw new HttpError(404, 'Subscription not found');
  if (s.status !== 'active') return { skipped: `Subscription is ${s.status}` };
  if (!s.next_invoice_date) return { skipped: 'No billing date set' };

  const periodStart = s.next_invoice_date;
  // Manual "invoice now" only bills a period that is due (no billing far into the future by repeated clicks)
  if (onlyIfDue && periodStart > invoiceDate) return { skipped: `Not due yet. The next invoice is due on ${periodStart}` };
  // Billing stops after the expiry date
  if (s.expiry_date && periodStart > s.expiry_date) {
    if (s.auto_close) {
      await db.query(`UPDATE subscriptions SET status = 'closed', updated_at = NOW() WHERE id = $1`, [s.id]);
      return { skipped: 'Expired, closed automatically', closed: true };
    }
    return { skipped: 'Expired, waiting for renewal' };
  }
  const anchor = dayOf(s.start_date);
  let periodEnd = addDays(addPeriod(periodStart, s.billing_period, 1, anchor), -1);
  if (s.expiry_date && periodEnd > s.expiry_date) periodEnd = s.expiry_date;

  // Lines: the plan fee (seats × price) + every product / add-on line, taxed by the admin's rules
  const productLines = (await db.query(
    `SELECT l.product_id, pr.name AS product_name, v.attribute, v.value, l.quantity, l.unit_price,
            tx.name AS tax_name, COALESCE(tx.rate, 0) AS tax_rate
     FROM subscription_lines l
     JOIN products pr ON pr.id = l.product_id
     LEFT JOIN product_variants v ON v.id = l.variant_id
     LEFT JOIN taxes tx ON tx.id = l.tax_id
     WHERE l.subscription_id = $1 ORDER BY pr.is_addon, l.id`,
    [s.id]
  )).rows;

  const lines = [
    {
      productId: null,
      description: `${s.plan_name} plan, ${s.quantity} seat${s.quantity > 1 ? 's' : ''} (${periodStart} to ${periodEnd})`,
      quantity: s.quantity, unitPrice: Number(s.plan_price), taxName: s.plan_tax_name, taxRate: Number(s.plan_tax_rate),
    },
    ...productLines.map((l) => ({
      productId: l.product_id,
      description: l.attribute ? `${l.product_name} (${l.attribute}: ${l.value})` : l.product_name,
      quantity: l.quantity, unitPrice: Number(l.unit_price), taxName: l.tax_name, taxRate: Number(l.tax_rate),
    })),
  ].map((l) => ({ ...l, subtotal: round2(l.quantity * l.unitPrice), discount: 0 }));

  // Discount (before tax), applied automatically when a rule qualifies
  const best = await bestDiscount(db, lines, invoiceDate);
  if (best) {
    // Lock the rule so its usage limit holds even when many invoices are created at once
    const locked = (await db.query(
      'SELECT used_count, usage_limit FROM discounts WHERE id = $1 FOR UPDATE', [best.rule.id]
    )).rows[0];
    if (locked.usage_limit === null || locked.used_count < locked.usage_limit) {
      spreadDiscount(best);
      await db.query('UPDATE discounts SET used_count = used_count + 1 WHERE id = $1', [best.rule.id]);
    } else {
      lines.forEach((l) => { l.discount = 0; });
    }
  }

  for (const l of lines) {
    l.taxable = round2(l.subtotal - l.discount);
    l.tax = round2((l.taxable * l.taxRate) / 100);
    l.total = round2(l.taxable + l.tax);
  }
  const untaxed = round2(lines.reduce((x, l) => x + l.subtotal, 0));
  const discount = round2(lines.reduce((x, l) => x + l.discount, 0));
  const tax = round2(lines.reduce((x, l) => x + l.tax, 0));
  const total = round2(lines.reduce((x, l) => x + l.total, 0));
  const dueDate = addDays(invoiceDate, s.payment_terms_days);

  let invoiceId;
  let invoiceNumber;
  try {
    await db.query('SAVEPOINT create_invoice');
    invoiceId = (await db.query(
      `INSERT INTO invoices (number, subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
                             untaxed_amount, discount_amount, tax_amount, total)
       VALUES ('INV/' || EXTRACT(YEAR FROM $1::date) || '/' || LPAD(nextval('invoice_number_seq')::text, 5, '0'),
               $2, $3, 'draft', $1, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, number`,
      [invoiceDate, s.id, s.customer_id, dueDate, periodStart, periodEnd, untaxed, discount, tax, total]
    )).rows[0];
    invoiceNumber = invoiceId.number;
    invoiceId = invoiceId.id;
    await db.query('RELEASE SAVEPOINT create_invoice');
  } catch (err) {
    if (err.code === '23505') {
      // Already billed: the database refused a second invoice for this period
      await db.query('ROLLBACK TO SAVEPOINT create_invoice');
      throw new HttpError(409, `${s.number} is already invoiced for the period starting ${periodStart}`);
    }
    throw err;
  }

  for (const l of lines) {
    await db.query(
      `INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, discount_amount, tax_name, tax_rate, tax_amount, subtotal, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [invoiceId, l.productId, l.description, l.quantity, l.unitPrice, l.discount, l.taxName, l.taxRate, l.tax, l.taxable, l.total]
    );
  }
  if (best && discount > 0) {
    await db.query('INSERT INTO invoice_discounts (invoice_id, discount_id, name, amount) VALUES ($1, $2, $3, $4)',
      [invoiceId, best.rule.id, best.rule.name, discount]);
  }

  await logActivity(db, userId, {
    entity: 'invoice', entityId: invoiceId, label: invoiceNumber, action: 'created', subscriptionId: s.id, invoiceId,
    summary: `Created invoice ${invoiceNumber} for ${s.number}, period ${periodStart} to ${periodEnd}${userId ? '' : ' (automatic billing)'}`,
    details: { total, discount, tax },
  });

  // Move to the next period
  await db.query(
    'UPDATE subscriptions SET next_invoice_date = $1, updated_at = NOW() WHERE id = $2',
    [addPeriod(periodStart, s.billing_period, 1, anchor), s.id]
  );
  return { invoice: { id: invoiceId, subscriptionNumber: s.number, periodStart, periodEnd, total } };
}

// ---------- Billing run ----------

// Bill every active subscription that is due on or before `date`, catching up missed periods.
// Each subscription is billed in its own transaction, so one problem never blocks the others.
export async function runBilling({ date = todayISO(), userId = null } = {}) {
  const result = { date, created: 0, closed: 0, skipped: [], errors: [], invoices: [] };

  // 1) Plans that "close on their own": close expired subscriptions
  const closed = await pool.query(
    `UPDATE subscriptions s SET status = 'closed', updated_at = NOW()
     FROM plans p
     WHERE p.id = s.plan_id AND p.auto_close AND s.status IN ('active', 'paused')
       AND s.expiry_date IS NOT NULL AND s.expiry_date < $1
       AND (s.next_invoice_date IS NULL OR s.next_invoice_date > s.expiry_date)
     RETURNING s.id`,
    [date]
  );
  result.closed += closed.rowCount;
  if (closed.rowCount) {
    await pool.query(
      `INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id)
       SELECT $1, 'subscription', id, number, 'close', 'Closed ' || number || ' automatically: expired and the plan closes on its own',
              '{"from":"active","to":"closed"}'::jsonb, id
       FROM subscriptions WHERE id = ANY($2::int[])`, [userId, closed.rows.map((x) => x.id)]);
  }

  // 2) Everything due
  const due = await pool.query(
    `SELECT id FROM subscriptions WHERE status = 'active' AND next_invoice_date <= $1 ORDER BY next_invoice_date, id`,
    [date]
  );
  for (const { id } of due.rows) {
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      try {
        const r = await withTransaction(async (db) => {
          const next = (await db.query('SELECT next_invoice_date, status FROM subscriptions WHERE id = $1', [id])).rows[0];
          if (!next || next.status !== 'active' || !next.next_invoice_date || next.next_invoice_date > date) return { done: true };
          return invoiceNextPeriod(db, id, { invoiceDate: date, userId });
        });
        if (r.done) break;
        if (r.invoice) {
          result.created += 1;
          if (result.invoices.length < 200) result.invoices.push(r.invoice);
        } else {
          if (r.closed) result.closed += 1;
          result.skipped.push({ subscriptionId: id, reason: r.skipped });
          break;
        }
      } catch (err) {
        result.errors.push({ subscriptionId: id, error: err.message });
        break;
      }
    }
  }
  return result;
}

// ---------- Automatic billing ----------
// Runs once at start-up and then every hour. Safe to run any number of times: it only bills what is due.
export function startAutoBilling() {
  if (process.env.AUTO_BILLING === 'false') return;
  const tick = async () => {
    try {
      const r = await runBilling();
      if (r.created || r.closed) {
        await logActivity(null, null, {
          entity: 'billing', action: 'billing_run',
          summary: `Automatic billing for ${r.date}: ${r.created} invoices created, ${r.closed} subscriptions closed`,
          details: { created: r.created, closed: r.closed, errors: r.errors.length },
        }).catch(() => {});
      }
      if (r.created || r.closed || r.errors.length) {
        console.log(`[auto billing ${r.date}] ${r.created} invoices created, ${r.closed} subscriptions closed, ${r.errors.length} errors`);
      }
    } catch (err) {
      console.error('[auto billing] failed:', err.message);
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, 60 * 60 * 1000);
}

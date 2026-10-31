// Loads a realistic year of business on top of `npm run db:setup`:
// ~600 customers, ~5,000 subscriptions, ~25,000 invoices and ~20,000 payments.
// Purpose: prove every page stays under 2 seconds with thousands of records, and give the demo real history.
// Run: npm run db:setup && npm run db:demo
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';
import { addDays, addPeriod, dayOf, round2, todayISO } from '../src/utils/periods.js';

const SUBSCRIPTIONS = Number(process.env.DEMO_SUBSCRIPTIONS) || 5000;
const CUSTOMERS = Math.max(50, Math.round(SUBSCRIPTIONS / 8));
const TODAY = todayISO();

// Seeded random numbers, so every run produces the same data
let seed = 20261031;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const weighted = (pairs) => { let r = rand() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Pari', 'Myra', 'Kavya', 'Priya', 'Neha', 'Pooja', 'Rahul', 'Amit', 'Suresh', 'Ramesh', 'Meera', 'Lakshmi', 'Karthik', 'Venkat', 'Imran', 'Farhan', 'Zoya', 'Harpreet', 'Gurpreet', 'Anil', 'Sunita', 'Deepak', 'Nikhil', 'Sneha', 'Tanvi', 'Manish'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Agarwal', 'Mehta', 'Shah', 'Patel', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Menon', 'Joshi', 'Kulkarni', 'Deshpande', 'Banerjee', 'Chatterjee', 'Das', 'Singh', 'Khan', 'Qureshi', 'Gill', 'Malhotra', 'Kapoor', 'Chopra', 'Bhat', 'Pillai', 'Saxena', 'Mishra', 'Tiwari'];
const BIZ = ['Traders', 'Enterprises', 'Retail', 'Foods', 'Textiles', 'Pharma', 'Logistics', 'Solutions', 'Industries', 'Stores', 'Distributors', 'Exports', 'Technologies', 'Motors', 'Agencies', 'Hospitality', 'Builders', 'Electronics'];
const CITIES = ['Lucknow', 'Bengaluru', 'Pune', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Jaipur', 'Indore', 'Kochi', 'Ahmedabad', 'Kolkata', 'Nagpur', 'Patna', 'Surat'];
const minDate = (a, b) => (a < b ? a : b);
const METHODS = [['upi', 45], ['bank_transfer', 30], ['card', 10], ['cheque', 10], ['cash', 5]];

// Multi-row INSERT in chunks (fast), returns ids in order
async function bulkInsert(client, table, columns, rows, returning = 'id') {
  const ids = [];
  const chunk = Math.max(1, Math.floor(30000 / columns.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`);
    const res = await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}${returning ? ` RETURNING ${returning}` : ''}`,
      params
    );
    if (returning) ids.push(...res.rows.map((r) => r.id));
  }
  return ids;
}

async function run() {
  const started = Date.now();
  const client = await pool.connect();
  try {
    const existing = (await client.query("SELECT COUNT(*) AS n FROM subscriptions")).rows[0].n;
    if (existing > 50) throw new Error('Demo data already loaded. Run `npm run db:setup` first to start clean.');

    const plans = (await client.query(
      `SELECT p.id, p.name, p.price, p.billing_period, p.min_quantity, p.start_date, p.end_date, COALESCE(t.rate, 0) AS tax_rate, t.name AS tax_name
       FROM plans p LEFT JOIN taxes t ON t.id = p.tax_id WHERE p.active`
    )).rows;
    const products = (await client.query(
      `SELECT pr.id, pr.name, pr.sales_price, pr.tax_id, COALESCE(t.rate, 0) AS tax_rate, t.name AS tax_name, pr.is_addon,
              COALESCE(json_agg(json_build_object('id', v.id, 'label', v.attribute || ': ' || v.value, 'extra', v.extra_price)) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
       FROM products pr LEFT JOIN taxes t ON t.id = pr.tax_id LEFT JOIN product_variants v ON v.product_id = pr.id
       WHERE pr.active GROUP BY pr.id, t.rate, t.name`
    )).rows;
    const staffId = (await client.query("SELECT id FROM users WHERE role = 'staff' LIMIT 1")).rows[0].id;
    const planByName = Object.fromEntries(plans.map((p) => [p.name, p]));

    await client.query('BEGIN');

    // ---------- Customers ----------
    console.log(`Creating ${CUSTOMERS} customers...`);
    const hash = await bcrypt.hash('Demo@12345', 10); // every demo customer: Demo@12345
    const customerRows = [];
    for (let i = 0; i < CUSTOMERS; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      const company = rand() < 0.85 ? `${last} ${pick(BIZ)}, ${pick(CITIES)}` : null;
      const joined = addDays(TODAY, -between(5, 400));
      customerRows.push([`${first} ${last}`, `${first}.${last}.${i}@example.in`.toLowerCase(), hash, 'customer', company,
        `9${between(100000000, 999999999)}`, `${joined}T10:00:00+05:30`]);
    }
    const customerIds = await bulkInsert(client, 'users', ['name', 'email', 'password_hash', 'role', 'company', 'phone', 'created_at'], customerRows);
    const rohanId = (await client.query("SELECT id FROM users WHERE email = 'customer@subflow.app'")).rows[0].id;

    // ---------- Subscriptions ----------
    console.log(`Creating ${SUBSCRIPTIONS} subscriptions with history...`);
    const planMix = [['Starter Monthly', 45], ['Business Monthly', 28], ['Business Quarterly', 8], ['Business Yearly', 13], ['Weekly Pilot', 4], ['Daily Event Pass', 2]];
    const subs = [];
    for (let i = 0; i < SUBSCRIPTIONS; i++) {
      const plan = planByName[weighted(planMix)] || pick(plans);
      // Start dates: spread over the last year, kept inside each plan's available dates
      const earliest = plan.start_date > addDays(TODAY, -365) ? plan.start_date : addDays(TODAY, -365);
      const span = Math.max(0, Math.round((Date.parse(TODAY) - Date.parse(earliest)) / 86400000));
      const maxBack = plan.billing_period === 'daily' ? Math.min(span, 12) : plan.billing_period === 'weekly' ? Math.min(span, 30) : span;
      const start = addDays(TODAY, -between(0, maxBack));
      const status = weighted([['active', 72], ['paused', 6], ['closed', 12], ['quotation', 4], ['draft', 3], ['confirmed', 3]]);
      const seats = plan.min_quantity + (rand() < 0.5 ? 0 : between(0, plan.billing_period === 'yearly' ? 20 : 6));
      const customerId = i < 3 ? rohanId : pick(customerIds);
      const expiry = plan.end_date || (rand() < 0.35 ? addPeriod(start, 'yearly') : null);

      // Product lines: main product (with variant) + some add-ons
      const lines = [];
      const shortPlan = ['daily', 'weekly'].includes(plan.billing_period); // event passes and pilots: plan fee only
      if (!shortPlan && rand() < 0.7) {
        const main = pick(products.filter((p) => !p.is_addon));
        const v = main.variants.length ? pick(main.variants) : null;
        lines.push({ product: main, variantId: v?.id || null, label: v?.label, qty: 1, price: round2(Number(main.sales_price) + Number(v?.extra || 0)) });
      }
      for (const addon of products.filter((p) => p.is_addon)) {
        if (!shortPlan && rand() < 0.25) lines.push({ product: addon, variantId: null, qty: between(1, 3), price: Number(addon.sales_price) });
      }
      subs.push({ plan, start, status, seats, customerId, expiry, lines, terms: pick([0, 7, 15, 15, 30]) });
    }

    const subIds = await bulkInsert(client, 'subscriptions',
      ['number', 'customer_id', 'plan_id', 'quantity', 'status', 'start_date', 'expiry_date', 'payment_terms_days', 'created_by', 'created_at', 'quotation_valid_until'],
      subs.map((s, i) => [`SUB/${String(i + 1).padStart(5, '0')}`, s.customerId, s.plan.id, s.seats, s.status, s.start, s.expiry, s.terms, staffId,
        `${addDays(s.start, -between(1, 10))}T11:00:00+05:30`, s.status === 'quotation' ? addDays(TODAY, between(2, 25)) : null]));
    subs.forEach((s, i) => { s.id = subIds[i]; });

    const lineRows = [];
    for (const s of subs) for (const l of s.lines) lineRows.push([s.id, l.product.id, l.variantId, l.qty, l.price, l.product.tax_id]);
    await bulkInsert(client, 'subscription_lines', ['subscription_id', 'product_id', 'variant_id', 'quantity', 'unit_price', 'tax_id'], lineRows, null);

    // ---------- Invoices: every billing period from start to today (closed ones stop at their closing date) ----------
    console.log('Creating invoices for every billed period...');
    const invoices = [];
    for (const s of subs) {
      if (!['active', 'paused', 'closed'].includes(s.status)) continue;
      const stopAt = s.status === 'closed' ? addDays(s.start, between(20, 200)) : s.status === 'paused' ? addDays(TODAY, -between(5, 60)) : TODAY;
      let periodStart = s.start;
      while (periodStart <= TODAY && periodStart <= stopAt && (!s.expiry || periodStart <= s.expiry)) {
        let periodEnd = addDays(addPeriod(periodStart, s.plan.billing_period, 1, dayOf(s.start)), -1);
        if (s.expiry && periodEnd > s.expiry) periodEnd = s.expiry;
        // Now and then an invoice was cancelled (a mistake) and re-issued for the same period, so nothing is skipped
        if (rand() < 0.004) invoices.push({ s, periodStart, periodEnd, cancelled: true });
        invoices.push({ s, periodStart, periodEnd });
        periodStart = addPeriod(periodStart, s.plan.billing_period, 1, dayOf(s.start));
      }
      s.nextInvoiceDate = periodStart;
    }
    invoices.sort((a, b) => (a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : a.s.id - b.s.id));

    // The seeded "Festive Season 10% off" rule (from 15 Oct, orders of Rs 5,000+, 100 uses) applies to qualifying invoices
    const festive = (await client.query(
      `SELECT id, name, value, min_purchase, start_date, end_date, usage_limit FROM discounts WHERE name = 'Festive Season 10% off'`
    )).rows[0];
    let festiveUsed = 0;
    const invoiceDiscounts = [];

    const invoiceRows = [];
    const invoiceLines = [];
    for (const [n, inv] of invoices.entries()) {
      const { s } = inv;
      const lines = [
        { productId: null, description: `${s.plan.name} plan, ${s.seats} seat${s.seats > 1 ? 's' : ''} (${inv.periodStart} to ${inv.periodEnd})`, qty: s.seats, price: Number(s.plan.price), taxName: s.plan.tax_name, rate: Number(s.plan.tax_rate) },
        ...s.lines.map((l) => ({ productId: l.product.id, description: l.label ? `${l.product.name} (${l.label})` : l.product.name, qty: l.qty, price: l.price, taxName: l.product.tax_name, rate: Number(l.product.tax_rate) })),
      ].map((l) => ({ ...l, subtotal: round2(l.qty * l.price), discount: 0 }));
      const untaxed = round2(lines.reduce((x, l) => x + l.subtotal, 0));
      let discount = 0;
      if (festive && !inv.cancelled && inv.periodStart >= festive.start_date && inv.periodStart <= festive.end_date
          && untaxed >= Number(festive.min_purchase) && festiveUsed < festive.usage_limit) {
        discount = round2((untaxed * Number(festive.value)) / 100);
        let left = discount;
        lines.forEach((l, k) => { l.discount = k === lines.length - 1 ? left : round2((discount * l.subtotal) / untaxed); left = round2(left - l.discount); });
        festiveUsed += 1;
        inv.discount = discount;
      }
      for (const l of lines) { l.taxable = round2(l.subtotal - l.discount); l.tax = round2((l.taxable * l.rate) / 100); l.total = round2(l.taxable + l.tax); }
      const tax = round2(lines.reduce((x, l) => x + l.tax, 0));
      const total = round2(lines.reduce((x, l) => x + l.total, 0));
      const invoiceDate = inv.periodStart;
      const dueDate = addDays(invoiceDate, s.terms);
      const age = Math.round((Date.parse(TODAY) - Date.parse(invoiceDate)) / 86400000);

      // Realistic outcomes: most old invoices paid, some overdue, recent ones open, a few drafts and cancellations
      let status; let paid = 0;
      if (inv.cancelled) status = 'cancelled';
      else if (age <= 1 && rand() < 0.4) status = 'draft';
      else if (dueDate < TODAY) status = rand() < (age > 120 ? 0.998 : age > 60 ? 0.97 : age > 30 ? 0.9 : 0.75) ? 'paid' : 'confirmed';
      else status = rand() < 0.35 ? 'paid' : 'confirmed';
      if (status === 'paid') paid = total;
      else if (status === 'confirmed' && dueDate < TODAY && rand() < 0.2) paid = round2(total * pick([0.25, 0.5]));

      inv.total = total; inv.paid = paid; inv.status = status; inv.invoiceDate = invoiceDate; inv.dueDate = dueDate;
      invoiceRows.push([`INV/${invoiceDate.slice(0, 4)}/${String(n + 1).padStart(5, '0')}`, s.id, s.customerId, status, invoiceDate, dueDate,
        inv.periodStart, inv.periodEnd, untaxed, discount, tax, total, paid, status === 'draft' ? null : `${invoiceDate}T09:00:00+05:30`,
        `${invoiceDate}T08:00:00+05:30`,
        status === 'confirmed' && dueDate < TODAY && rand() < 0.6 ? `${minDate(addDays(dueDate, between(1, 7)), TODAY)}T10:00:00+05:30` : null]);
      inv.lines = lines;
    }
    const invoiceIds = await bulkInsert(client, 'invoices',
      ['number', 'subscription_id', 'customer_id', 'status', 'invoice_date', 'due_date', 'period_start', 'period_end',
        'untaxed_amount', 'discount_amount', 'tax_amount', 'total', 'amount_paid', 'sent_at', 'created_at', 'reminder_sent_at'], invoiceRows);

    const paymentRows = [];
    invoices.forEach((inv, i) => {
      const id = invoiceIds[i];
      for (const l of inv.lines) invoiceLines.push([id, l.productId, l.description, l.qty, l.price, l.discount, l.taxName, l.rate, l.tax, l.taxable, l.total]);
      if (inv.discount) invoiceDiscounts.push([id, festive.id, festive.name, inv.discount]);
      if (inv.paid > 0) {
        const latest = inv.status === 'paid' ? addDays(inv.dueDate, 5) : addDays(inv.dueDate, -1);
        const date = (d) => (d > TODAY ? TODAY : d < inv.invoiceDate ? inv.invoiceDate : d);
        const span = Math.max(0, Math.round((Date.parse(latest) - Date.parse(inv.invoiceDate)) / 86400000));
        if (inv.status === 'paid' && rand() < 0.06 && inv.paid > 2) {
          const first = round2(inv.paid / 2);
          paymentRows.push([id, weighted(METHODS), first, date(addDays(inv.invoiceDate, between(0, span))), 'Part payment', staffId]);
          paymentRows.push([id, weighted(METHODS), round2(inv.paid - first), date(addDays(inv.invoiceDate, span)), 'Balance', staffId]);
        } else {
          const method = weighted(METHODS);
          const note = method === 'upi' ? `UTR ${between(100000000, 999999999)}` : method === 'cheque' ? `Cheque ${between(100000, 999999)}` : method === 'bank_transfer' ? `NEFT ${between(10000000, 99999999)}` : null;
          paymentRows.push([id, method, inv.paid, date(addDays(inv.invoiceDate, between(0, span))), inv.status === 'paid' ? note : 'Part payment', staffId]);
        }
      }
    });
    console.log(`Writing ${invoiceIds.length} invoices, ${invoiceLines.length} invoice lines, ${paymentRows.length} payments...`);
    await bulkInsert(client, 'invoice_lines',
      ['invoice_id', 'product_id', 'description', 'quantity', 'unit_price', 'discount_amount', 'tax_name', 'tax_rate', 'tax_amount', 'subtotal', 'total'], invoiceLines, null);
    await bulkInsert(client, 'payments', ['invoice_id', 'method', 'amount', 'payment_date', 'note', 'created_by'], paymentRows, null);
    if (invoiceDiscounts.length) {
      await bulkInsert(client, 'invoice_discounts', ['invoice_id', 'discount_id', 'name', 'amount'], invoiceDiscounts, null);
      await client.query('UPDATE discounts SET used_count = $1 WHERE id = $2', [invoiceDiscounts.length, festive.id]);
    }

    // Billing is up to date: each running subscription's next invoice date is the period after today
    const nextRows = subs.filter((s) => s.nextInvoiceDate && ['active', 'paused'].includes(s.status)).map((s) => [s.id, s.nextInvoiceDate]);
    for (let i = 0; i < nextRows.length; i += 5000) {
      const part = nextRows.slice(i, i + 5000);
      await client.query(
        `UPDATE subscriptions s SET next_invoice_date = v.d FROM (SELECT unnest($1::int[]) AS id, unnest($2::date[]) AS d) v WHERE s.id = v.id`,
        [part.map((r) => r[0]), part.map((r) => r[1])]
      );
    }
    // Activity log (audit trail) for the history above, so every subscription and invoice shows its timeline
    console.log('Writing activity log...');
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, subscription_id, created_at)
      SELECT s.created_by, 'subscription', s.id, s.number, 'created', 'Created subscription ' || s.number || ' (draft) for ' || c.name, s.id, LEAST(s.created_at, NOW() - INTERVAL '8 hours')
      FROM subscriptions s JOIN users c ON c.id = s.customer_id`);
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id, created_at)
      SELECT s.created_by, 'subscription', s.id, s.number, 'activate', 'Activated ' || s.number || ': confirmed → active',
             '{"from":"confirmed","to":"active"}'::jsonb, s.id, LEAST(GREATEST(s.start_date + TIME '10:00', s.created_at + INTERVAL '1 minute'), NOW() - INTERVAL '7 hours',
                   COALESCE((SELECT MIN(created_at) FROM invoices WHERE subscription_id = s.id) - INTERVAL '1 minute', 'infinity'))
      FROM subscriptions s WHERE s.status IN ('active', 'paused', 'closed')`);
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id, created_at)
      SELECT s.created_by, 'subscription', s.id, s.number, CASE s.status WHEN 'paused' THEN 'pause' ELSE 'close' END,
             CASE s.status WHEN 'paused' THEN 'Paused ' ELSE 'Closed ' END || s.number || ': active → ' || s.status,
             jsonb_build_object('from', 'active', 'to', s.status), s.id, LEAST(GREATEST(s.updated_at, s.start_date + TIME '11:00'), NOW() - INTERVAL '2 hours' - (s.id % 240) * INTERVAL '1 minute')
      FROM subscriptions s WHERE s.status IN ('paused', 'closed')`);
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id, invoice_id, created_at)
      SELECT NULL, 'invoice', i.id, i.number, 'created',
             'Created invoice ' || i.number || ' for ' || s.number || ', period ' || i.period_start || ' to ' || i.period_end || ' (automatic billing)',
             jsonb_build_object('total', i.total), i.subscription_id, i.id, LEAST(i.created_at, NOW() - INTERVAL '6 hours')
      FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id`);
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, subscription_id, invoice_id, created_at)
      SELECT $1, 'invoice', id, number, 'sent', 'Sent invoice ' || number || ' to the customer by email', subscription_id, id, LEAST(sent_at, NOW() - INTERVAL '5 hours')
      FROM invoices WHERE sent_at IS NOT NULL`, [staffId]);
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, subscription_id, invoice_id, created_at)
      SELECT $1, 'invoice', id, number, 'reminded', 'Payment reminder sent for ' || number, subscription_id, id, LEAST(reminder_sent_at, NOW() - INTERVAL '3 hours')
      FROM invoices WHERE reminder_sent_at IS NOT NULL`, [staffId]);
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id, invoice_id, created_at)
      SELECT $1, 'invoice', id, number, 'cancelled', 'Cancelled invoice ' || number || '. Its period goes back into the billing queue',
             '{"to":"cancelled"}'::jsonb, subscription_id, id, LEAST(created_at + INTERVAL '1 day', NOW() - INTERVAL '2 hours')
      FROM invoices WHERE status = 'cancelled'`, [staffId]);
    await client.query(`
      INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id, invoice_id, created_at)
      SELECT p.created_by, 'payment', p.id, i.number, 'recorded',
             'Recorded ₹' || to_char(p.amount, 'FM99,99,99,990.00') || ' by ' ||
               CASE p.method WHEN 'upi' THEN 'UPI' WHEN 'bank_transfer' THEN 'bank transfer' ELSE p.method END || ' on ' || i.number,
             jsonb_build_object('amount', p.amount, 'method', p.method), i.subscription_id, i.id, LEAST(p.payment_date + TIME '12:00', NOW() - INTERVAL '4 hours')
      FROM payments p JOIN invoices i ON i.id = p.invoice_id`);

    // Number sequences continue after the demo data
    await client.query(`SELECT setval('subscription_number_seq', $1)`, [SUBSCRIPTIONS]);
    await client.query(`SELECT setval('invoice_number_seq', $1)`, [Math.max(1, invoiceIds.length)]);
    await client.query('COMMIT');
    await client.query('ANALYZE');

    const c = (await client.query(
      `SELECT (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers, (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
              (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COUNT(*) FROM payments) AS payments`
    )).rows[0];
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${c.customers} customers, ${c.subscriptions} subscriptions, ${c.invoices} invoices, ${c.payments} payments.`);
    console.log('Demo customers log in with their email and password Demo@12345. Rohan (customer@subflow.app) has 3 subscriptions with history.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Demo data failed:', err.message);
  process.exit(1);
});

import { Router } from 'express';
import { config } from '../config.js';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, asyncHandler, getPagination, isId, toCamel, validate } from '../utils/http.js';
import { dateSchema } from '../utils/validation.js';
import { addPeriod, dayOf, todayISO } from '../utils/periods.js';
import { invoiceNextPeriod, runBilling } from '../services/billing.js';
import { mailEnabled, sendMail } from '../utils/mailer.js';

const router = Router();
router.use(requireAuth);
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Invoice not found'))));

const STATUSES = ['draft', 'confirmed', 'paid', 'cancelled'];
const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

// ---------- Invoice detail ----------

export async function getInvoice(db, id, user) {
  const r = (await db.query(
    `SELECT i.*, i.total - i.amount_paid AS amount_due,
            (i.status = 'confirmed' AND i.due_date < $2 AND i.total > i.amount_paid) AS is_overdue,
            CASE WHEN i.status = 'confirmed' AND i.due_date < $2 AND i.total > i.amount_paid THEN $2::date - i.due_date ELSE 0 END AS days_overdue,
            c.name AS customer_name, c.email AS customer_email, c.company AS customer_company, c.phone AS customer_phone,
            s.number AS subscription_number, p.name AS plan_name, p.billing_period
     FROM invoices i
     JOIN users c ON c.id = i.customer_id
     JOIN subscriptions s ON s.id = i.subscription_id
     JOIN plans p ON p.id = s.plan_id
     WHERE i.id = $1`,
    [id, todayISO()]
  )).rows[0];
  if (!r || (user && user.role === 'customer' && r.customer_id !== user.id)) throw new HttpError(404, 'Invoice not found');

  const lines = (await db.query(
    `SELECT id, product_id, description, quantity, unit_price, discount_amount, tax_name, tax_rate, tax_amount, subtotal, total
     FROM invoice_lines WHERE invoice_id = $1 ORDER BY id`, [id]
  )).rows.map(toCamel);
  const discounts = (await db.query('SELECT discount_id, name, amount FROM invoice_discounts WHERE invoice_id = $1', [id])).rows.map(toCamel);
  const payments = (await db.query(
    'SELECT id, method, amount, payment_date, note, created_at FROM payments WHERE invoice_id = $1 ORDER BY payment_date, id', [id]
  )).rows.map(toCamel);

  const inv = {
    id: r.id,
    number: r.number,
    status: r.status,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    sentAt: r.sent_at,
    isOverdue: r.is_overdue,
    daysOverdue: r.days_overdue,
    reminderSentAt: r.reminder_sent_at,
    customer: { id: r.customer_id, name: r.customer_name, email: r.customer_email, company: r.customer_company, phone: r.customer_phone },
    subscription: { id: r.subscription_id, number: r.subscription_number, planName: r.plan_name, billingPeriod: r.billing_period },
    lines,
    discountsApplied: discounts,
    payments,
    totals: {
      untaxed: r.untaxed_amount, discount: r.discount_amount, tax: r.tax_amount, total: r.total,
      paid: r.amount_paid, due: r.amount_due,
    },
  };
  const internal = user && user.role !== 'customer';
  inv.allowedActions = !internal ? ['print'] : [
    ...(inv.status === 'draft' ? ['confirm'] : []),
    ...(['draft', 'confirmed'].includes(inv.status) ? ['send'] : []),
    ...(['draft', 'confirmed'].includes(inv.status) && inv.totals.paid === 0 ? ['cancel'] : []),
    ...(inv.status === 'confirmed' && inv.totals.due > 0 ? ['record_payment'] : []),
    ...(inv.isOverdue ? ['remind'] : []),
    'print',
  ];
  return inv;
}

// ---------- List ----------

// GET /api/invoices?status=&overdue=true&search=&customerId=&subscriptionId=&from=&to=&page=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = getPagination(req.query);
    const today = todayISO();
    const params = [today];
    // $1 (today) is always referenced so every query below uses the same parameter list
    const where = ['$1::date IS NOT NULL'];
    if (req.user.role === 'customer') {
      params.push(req.user.id);
      where.push(`i.customer_id = $${params.length}`);
    } else if (isId(req.query.customerId)) {
      params.push(Number(req.query.customerId));
      where.push(`i.customer_id = $${params.length}`);
    }
    if (isId(req.query.subscriptionId)) {
      params.push(Number(req.query.subscriptionId));
      where.push(`i.subscription_id = $${params.length}`);
    }
    if (req.query.search?.trim()) {
      params.push(`%${req.query.search.trim()}%`);
      where.push(`(i.number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.company ILIKE $${params.length} OR s.number ILIKE $${params.length})`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) {
      params.push(req.query.from);
      where.push(`i.invoice_date >= $${params.length}`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) {
      params.push(req.query.to);
      where.push(`i.invoice_date <= $${params.length}`);
    }
    const base = `FROM invoices i JOIN users c ON c.id = i.customer_id JOIN subscriptions s ON s.id = i.subscription_id`;
    const scopeSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const overdueSql = `(i.status = 'confirmed' AND i.due_date < $1::date AND i.total > i.amount_paid)`;

    // Tab counts + money summary for the current search scope
    const sum = (await query(
      `SELECT COUNT(*) FILTER (WHERE i.status = 'draft') AS draft,
              COUNT(*) FILTER (WHERE i.status = 'confirmed') AS confirmed,
              COUNT(*) FILTER (WHERE i.status = 'paid') AS paid,
              COUNT(*) FILTER (WHERE i.status = 'cancelled') AS cancelled,
              COUNT(*) FILTER (WHERE ${overdueSql}) AS overdue,
              COALESCE(SUM(i.total) FILTER (WHERE i.status IN ('confirmed', 'paid')), 0) AS invoiced,
              COALESCE(SUM(i.amount_paid) FILTER (WHERE i.status IN ('confirmed', 'paid')), 0) AS collected,
              COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE i.status = 'confirmed'), 0) AS outstanding,
              COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE ${overdueSql}), 0) AS overdue_amount
       ${base} ${scopeSql}`,
      params
    )).rows[0];

    const filtered = [...where];
    if (req.query.overdue === 'true') filtered.push(overdueSql);
    else if (STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      filtered.push(`i.status = $${params.length}`);
    }
    const filterSql = filtered.length ? `WHERE ${filtered.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) AS n ${base} ${filterSql}`, params)).rows[0].n;
    params.push(pageSize, offset);
    const { rows } = await query(
      `SELECT i.id, i.number, i.customer_id, c.name AS customer_name, c.company AS customer_company,
              i.subscription_id, s.number AS subscription_number, i.invoice_date, i.due_date, i.period_start, i.period_end,
              i.status, i.total, i.amount_paid, i.total - i.amount_paid AS amount_due, ${overdueSql} AS is_overdue, i.sent_at,
              CASE WHEN ${overdueSql} THEN $1::date - i.due_date ELSE 0 END AS days_overdue, i.reminder_sent_at
       ${base} ${filterSql}
       ORDER BY i.invoice_date DESC, i.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      data: rows.map(toCamel), page, pageSize, total,
      counts: { draft: sum.draft, confirmed: sum.confirmed, paid: sum.paid, cancelled: sum.cancelled, overdue: sum.overdue },
      summary: { invoiced: sum.invoiced, collected: sum.collected, outstanding: sum.outstanding, overdueAmount: sum.overdue_amount },
    });
  })
);

router.get('/:id', asyncHandler(async (req, res) => res.json(await getInvoice({ query }, Number(req.params.id), req.user))));

// ---------- Actions (internal team) ----------

async function lockInvoice(db, id) {
  const inv = (await db.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!inv) throw new HttpError(404, 'Invoice not found');
  return inv;
}

// POST /api/invoices/:id/confirm   Draft → Confirmed
router.post(
  '/:id/confirm',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const inv = await withTransaction(async (db) => {
      const i = await lockInvoice(db, id);
      if (i.status !== 'draft') throw new HttpError(400, `Only draft invoices can be confirmed (this one is ${i.status})`);
      // Nothing to pay (e.g. a 100% discount) means it is paid as soon as it is confirmed
      await db.query(`UPDATE invoices SET status = CASE WHEN total <= amount_paid THEN 'paid' ELSE 'confirmed' END WHERE id = $1`, [id]);
      await logActivity(db, req.user, {
        entity: 'invoice', entityId: id, label: i.number, action: 'confirmed', subscriptionId: i.subscription_id, invoiceId: id,
        summary: `Confirmed invoice ${i.number}: draft → confirmed`, details: { from: 'draft', to: 'confirmed' },
      });
      return getInvoice(db, id, req.user);
    });
    res.json(inv);
  })
);

// POST /api/invoices/confirm-drafts { ids: [..] }   Confirm many drafts at once (billing day)
router.post(
  '/confirm-drafts',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { ids } = validate(z.object({ ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one invoice').max(1000) }), req.body);
    const r = await query(
      `UPDATE invoices SET status = CASE WHEN total <= amount_paid THEN 'paid' ELSE 'confirmed' END
       WHERE id = ANY($1::int[]) AND status = 'draft' RETURNING id`, [ids]);
    if (r.rowCount) {
      await query(
        `INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id, invoice_id)
         SELECT $1, 'invoice', id, number, 'confirmed', 'Confirmed invoice ' || number || ' (bulk confirm)', '{"from":"draft","to":"confirmed"}'::jsonb, subscription_id, id
         FROM invoices WHERE id = ANY($2::int[])`, [req.user.id, r.rows.map((x) => x.id)]);
    }
    res.json({ confirmed: r.rowCount });
  })
);

// POST /api/invoices/remind-overdue   Chase all overdue money in one click.
// Reminds every overdue invoice that was not reminded in the last 7 days (so nobody gets spammed).
router.post(
  '/remind-overdue',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const today = todayISO();
    const { rows } = await query(
      `UPDATE invoices i SET reminder_sent_at = NOW()
       FROM users c
       WHERE c.id = i.customer_id AND i.status = 'confirmed' AND i.due_date < $1::date AND i.total > i.amount_paid
         AND (i.reminder_sent_at IS NULL OR i.reminder_sent_at < NOW() - INTERVAL '7 days')
       RETURNING i.id, i.number, i.due_date, i.total - i.amount_paid AS due, c.name, c.email`,
      [today]
    );
    if (rows.length) {
      await query(
        `INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, subscription_id, invoice_id)
         SELECT $1, 'invoice', id, number, 'reminded', 'Payment reminder sent for ' || number || ' (remind all overdue)', subscription_id, id
         FROM invoices WHERE id = ANY($2::int[])`, [req.user.id, rows.map((x) => x.id)]);
    }
    const base = process.env.CLIENT_URL || 'http://localhost:5173';
    let emailed = 0;
    if (mailEnabled) {
      for (const r of rows.filter((x) => !/@example\.(com|in|org|net)$/i.test(x.email))) {
        const mail = await sendMail({
          to: r.email,
          subject: `Payment reminder: ${r.number} is overdue`,
          text: `Hi ${r.name},\n\nThis is a reminder that invoice ${r.number} was due on ${r.due_date}.\n` +
            `Amount still due: ${inr(r.due)}\n\nView it here: ${base}/#/invoices/${r.id}\n\nIf you have already paid, please ignore this message.\n${config.company.name}`,
        });
        if (mail.sent) emailed += 1;
      }
    } else if (rows.length) {
      // Demo mode: one summary line instead of hundreds of emails in the log
      console.log(`\n[email demo mode] ${rows.length} payment reminders, e.g. To: ${rows[0].email} Subject: Payment reminder: ${rows[0].number} is overdue\n`);
    }
    res.json({ reminded: rows.length, emailed, demoMode: !mailEnabled });
  })
);

// POST /api/invoices/:id/cancel   Draft/Confirmed → Cancelled (only if nothing was paid)
router.post(
  '/:id/cancel',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const inv = await withTransaction(async (db) => {
      const i = await lockInvoice(db, id);
      if (!['draft', 'confirmed'].includes(i.status)) throw new HttpError(400, `A ${i.status} invoice cannot be cancelled`);
      if (Number(i.amount_paid) > 0) throw new HttpError(400, 'This invoice has payments recorded and cannot be cancelled');
      // Only the latest live invoice of a subscription can be cancelled: its period then goes back into the
      // billing queue and is billed again. Cancelling an older one would leave a gap (a skipped period).
      const later = await db.query(
        `SELECT 1 FROM invoices WHERE subscription_id = $1 AND period_start > $2 AND status <> 'cancelled' LIMIT 1`,
        [i.subscription_id, i.period_start]
      );
      if (later.rowCount) {
        throw new HttpError(400, 'Only the latest invoice of a subscription can be cancelled, so no billing period is ever skipped. Cancel the newer invoices first.');
      }
      await db.query(`UPDATE invoices SET status = 'cancelled' WHERE id = $1`, [id]);
      await logActivity(db, req.user, {
        entity: 'invoice', entityId: id, label: i.number, action: 'cancelled', subscriptionId: i.subscription_id, invoiceId: id,
        summary: `Cancelled invoice ${i.number} (${i.status} → cancelled). Its period goes back into the billing queue`, details: { from: i.status, to: 'cancelled' },
      });

      // Give back the discount use
      await db.query(
        `UPDATE discounts SET used_count = GREATEST(used_count - 1, 0)
         WHERE id IN (SELECT discount_id FROM invoice_discounts WHERE invoice_id = $1)`, [id]
      );
      // If this was the latest period, put it back in the billing queue so it is never skipped
      const sub = (await db.query(
        `SELECT s.id, s.next_invoice_date, s.start_date, p.billing_period FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id = $1 FOR UPDATE OF s`,
        [i.subscription_id]
      )).rows[0];
      if (sub && sub.next_invoice_date === addPeriod(i.period_start, sub.billing_period, 1, dayOf(sub.start_date))) {
        await db.query('UPDATE subscriptions SET next_invoice_date = $1, updated_at = NOW() WHERE id = $2', [i.period_start, sub.id]);
      }
      return getInvoice(db, id, req.user);
    });
    res.json(inv);
  })
);

// POST /api/invoices/:id/send   Emails the invoice to the customer (confirms a draft first)
router.post(
  '/:id/send',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const inv = await withTransaction(async (db) => {
      const i = await lockInvoice(db, id);
      if (!['draft', 'confirmed'].includes(i.status)) throw new HttpError(400, `A ${i.status} invoice cannot be sent`);
      await db.query(`UPDATE invoices SET status = CASE WHEN status = 'draft' AND total <= amount_paid THEN 'paid' WHEN status = 'draft' THEN 'confirmed' ELSE status END, sent_at = NOW() WHERE id = $1`, [id]);
      await logActivity(db, req.user, {
        entity: 'invoice', entityId: id, label: i.number, action: 'sent', subscriptionId: i.subscription_id, invoiceId: id,
        summary: `Sent invoice ${i.number} to the customer by email`,
      });
      return getInvoice(db, id, req.user);
    });
    const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/#/invoices/${inv.id}`;
    const mail = await sendMail({
      to: inv.customer.email,
      subject: `Invoice ${inv.number} from ${config.company.name}: ${inr(inv.totals.due)} due by ${inv.dueDate}`,
      text: `Hi ${inv.customer.name},\n\nYour invoice ${inv.number} for ${inv.subscription.planName} (${inv.periodStart} to ${inv.periodEnd}) is ready.\n` +
        `Total: ${inr(inv.totals.total)}\nDue date: ${inv.dueDate}\n\nView or print it here: ${link}\n\nThank you,\n${config.company.name}`,
    });
    res.json({ ...inv, emailSent: mail.sent });
  })
);

// POST /api/invoices/:id/remind   Payment reminder for an overdue invoice (chasing overdue money)
router.post(
  '/:id/remind',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const before = await getInvoice({ query }, id, req.user);
    if (!before.isOverdue) throw new HttpError(400, 'Reminders are only for overdue invoices');
    await query('UPDATE invoices SET reminder_sent_at = NOW() WHERE id = $1', [id]);
    await logActivity(null, req.user, {
      entity: 'invoice', entityId: id, label: before.number, action: 'reminded', subscriptionId: before.subscription?.id ?? null, invoiceId: id,
      summary: `Payment reminder sent for ${before.number} (${before.daysOverdue} days overdue)`,
    });
    const inv = await getInvoice({ query }, id, req.user);
    const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/#/invoices/${inv.id}`;
    const mail = await sendMail({
      to: inv.customer.email,
      subject: `Payment reminder: ${inv.number} is ${inv.daysOverdue} day${inv.daysOverdue === 1 ? '' : 's'} overdue`,
      text: `Hi ${inv.customer.name},\n\nThis is a reminder that invoice ${inv.number} was due on ${inv.dueDate}.\n` +
        `Amount still due: ${inr(inv.totals.due)}\n\nView it here: ${link}\n\nIf you have already paid, please ignore this message.\n${config.company.name}`,
    });
    res.json({ ...inv, emailSent: mail.sent });
  })
);

// ---------- Billing ----------

// POST /api/invoices/run-billing { date? }   Bill every active subscription that is due (up to today)
router.post(
  '/run-billing',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { date } = validate(z.object({ date: dateSchema('Billing date').optional() }), req.body || {});
    const today = todayISO();
    if (date && date > today) throw new HttpError(400, 'Billing cannot be run for a future date');
    const r = await runBilling({ date: date || today, userId: req.user.id });
    await logActivity(null, req.user, {
      entity: 'billing', action: 'billing_run',
      summary: `Ran billing for ${r.date}: ${r.created} invoice${r.created === 1 ? '' : 's'} created, ${r.closed} subscription${r.closed === 1 ? '' : 's'} closed`,
      details: { created: r.created, closed: r.closed, errors: r.errors.length },
    });
    res.json(r);
  })
);

// POST /api/invoices/for-subscription/:subId   Create the next invoice of one subscription now
router.post(
  '/for-subscription/:subId',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.subId)) throw new HttpError(404, 'Subscription not found');
    if (Number(req.params.subId) > 2147483647) throw new HttpError(404, 'Subscription not found');
    const r = await withTransaction((db) => invoiceNextPeriod(db, Number(req.params.subId), { userId: req.user.id, onlyIfDue: true }));
    if (r.skipped) throw new HttpError(400, `No invoice created: ${r.skipped}`);
    res.status(201).json(await getInvoice({ query }, r.invoice.id, req.user));
  })
);

export default router;

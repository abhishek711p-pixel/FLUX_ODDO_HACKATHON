import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, getPagination, toCamel, validate } from '../utils/http.js';
import { dateSchema, moneySchema, optionalText } from '../utils/validation.js';
import { round2, todayISO } from '../utils/periods.js';
import { getInvoice } from './invoices.js';
import { logActivity } from '../utils/activity.js';

// Payments: recorded by the team against the right invoice, with method, amount, date and a note.
// Partial payments are allowed; the invoice becomes Paid automatically once nothing is due.
const router = Router();
router.use(requireAuth);
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Payment not found'))));

export const METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'cheque'];
const METHOD_LABELS = { cash: 'cash', upi: 'UPI', bank_transfer: 'bank transfer', card: 'card', cheque: 'cheque' };
const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);

// GET /api/payments?method=&search=&from=&to=&page=   (customers see only their own)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = getPagination(req.query);
    const params = [];
    const where = [];
    if (req.user.role === 'customer') {
      params.push(req.user.id);
      where.push(`i.customer_id = $${params.length}`);
    }
    if (METHODS.includes(req.query.method)) {
      params.push(req.query.method);
      where.push(`pay.method = $${params.length}`);
    }
    if (req.query.search?.trim()) {
      params.push(`%${req.query.search.trim()}%`);
      where.push(`(i.number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.company ILIKE $${params.length} OR pay.note ILIKE $${params.length})`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) {
      params.push(req.query.from);
      where.push(`pay.payment_date >= $${params.length}`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) {
      params.push(req.query.to);
      where.push(`pay.payment_date <= $${params.length}`);
    }
    const base = `FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN users c ON c.id = i.customer_id`;
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const byMethod = (await query(
      `SELECT pay.method, COUNT(*) AS n, SUM(pay.amount) AS amount ${base} ${whereSql} GROUP BY pay.method`, params
    )).rows;
    const sum = {
      n: byMethod.reduce((s, r) => s + r.n, 0),
      amount: round2(byMethod.reduce((s, r) => s + Number(r.amount), 0)),
      by_method: Object.fromEntries(byMethod.map((r) => [r.method, r.amount])),
    };

    params.push(pageSize, offset);
    const { rows } = await query(
      `SELECT pay.id, pay.invoice_id, i.number AS invoice_number, i.customer_id, c.name AS customer_name, c.company AS customer_company,
              pay.method, pay.amount, pay.payment_date, pay.note, pay.created_at, u.name AS recorded_by
       ${base} LEFT JOIN users u ON u.id = pay.created_by
       ${whereSql}
       ORDER BY pay.payment_date DESC, pay.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      data: rows.map(toCamel), page, pageSize, total: sum.n,
      summary: { amount: Number(sum.amount), byMethod: Object.fromEntries(Object.entries(sum.by_method || {}).map(([k, v]) => [k, Number(v)])) },
    });
  })
);

const paymentSchema = z.object({
  invoiceId: z.coerce.number({ error: 'Choose an invoice' }).int().positive('Choose an invoice'),
  method: z.enum(METHODS, { error: 'Choose a payment method' }),
  amount: moneySchema('Amount').refine((v) => v > 0, 'Amount must be more than zero'),
  paymentDate: dateSchema('Payment date'),
  note: optionalText(500),
});

// POST /api/payments  (internal team) records a payment against an invoice
router.post(
  '/',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const d = validate(paymentSchema, req.body);
    if (d.paymentDate > todayISO()) throw new HttpError(400, 'Payment date cannot be in the future', { paymentDate: 'Cannot be in the future' });

    const invoice = await withTransaction(async (db) => {
      // Lock the invoice so two people recording at once cannot overpay it
      const inv = (await db.query('SELECT id, number, subscription_id, status, total, amount_paid FROM invoices WHERE id = $1 FOR UPDATE', [d.invoiceId])).rows[0];
      if (!inv) throw new HttpError(404, 'Invoice not found');
      if (inv.status === 'draft') throw new HttpError(400, `${inv.number} is still a draft. Confirm it before recording a payment.`);
      if (inv.status === 'paid') throw new HttpError(400, `${inv.number} is already fully paid`);
      if (inv.status === 'cancelled') throw new HttpError(400, `${inv.number} is cancelled`);
      const due = round2(inv.total - inv.amount_paid);
      if (d.amount > due) {
        throw new HttpError(400, `Amount is more than what is due on ${inv.number} (${inr(due)})`, { amount: `At most ${inr(due)}` });
      }

      await db.query(
        'INSERT INTO payments (invoice_id, method, amount, payment_date, note, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
        [inv.id, d.method, d.amount, d.paymentDate, d.note, req.user.id]
      );
      const paid = round2(Number(inv.amount_paid) + d.amount);
      await db.query(
        `UPDATE invoices SET amount_paid = $1, status = CASE WHEN $1 >= total THEN 'paid' ELSE status END WHERE id = $2`,
        [paid, inv.id]
      );
      const payId = (await db.query('SELECT MAX(id) AS id FROM payments WHERE invoice_id = $1', [inv.id])).rows[0].id;
      await logActivity(db, req.user, {
        entity: 'payment', entityId: payId, label: inv.number, action: 'recorded', subscriptionId: inv.subscription_id, invoiceId: inv.id,
        summary: `Recorded ${inr(d.amount)} by ${METHOD_LABELS[d.method]} on ${inv.number}${paid >= inv.total ? ' (now fully paid)' : `, ${inr(round2(inv.total - paid))} still due`}`,
        details: { amount: d.amount, method: d.method, paymentDate: d.paymentDate, note: d.note || null },
      });
      return getInvoice(db, inv.id, req.user);
    });
    res.status(201).json(invoice);
  })
);

// DELETE /api/payments/:id  (admin only) reverses a payment recorded by mistake
router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const invoice = await withTransaction(async (db) => {
      const pay = (await db.query('SELECT id, invoice_id, amount, method FROM payments WHERE id = $1', [req.params.id])).rows[0];
      if (!pay) throw new HttpError(404, 'Payment not found');
      const inv = (await db.query('SELECT number, subscription_id FROM invoices WHERE id = $1 FOR UPDATE', [pay.invoice_id])).rows[0];
      await db.query('DELETE FROM payments WHERE id = $1', [pay.id]);
      await logActivity(db, req.user, {
        entity: 'payment', entityId: pay.id, label: inv.number, action: 'reversed', subscriptionId: inv.subscription_id, invoiceId: pay.invoice_id,
        summary: `Reversed a payment of ${inr(pay.amount)} (${METHOD_LABELS[pay.method] || pay.method}) on ${inv.number}`,
        details: { amount: pay.amount, method: pay.method },
      });
      await db.query(
        `UPDATE invoices SET amount_paid = GREATEST(amount_paid - $1, 0),
                status = CASE WHEN status = 'paid' THEN 'confirmed' ELSE status END
         WHERE id = $2`,
        [pay.amount, pay.invoice_id]
      );
      return getInvoice(db, pay.invoice_id, req.user);
    });
    res.json(invoice);
  })
);

export default router;

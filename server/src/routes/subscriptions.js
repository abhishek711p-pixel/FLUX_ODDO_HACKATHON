import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, getPagination, toCamel, validate } from '../utils/http.js';
import { dateSchema, intSchema, moneySchema, optionalDateSchema, optionalIdSchema, optionalText } from '../utils/validation.js';
import { addDays, addPeriod, todayISO } from '../utils/periods.js';
import { assertAllowed, getSubscription } from '../services/subscriptions.js';
import { checkPlanAndLines } from './templates.js';

const router = Router();
router.use(requireAuth);

// Ids in the URL must be whole numbers; anything else is simply "not found"
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Subscription not found'))));
router.param('lineId', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Line not found'))));

const STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'];

// ---------- List ----------

// GET /api/subscriptions?status=&search=&customerId=&page=
// Customers automatically see only their own subscriptions.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = getPagination(req.query);
    const params = [];
    const scope = [];
    if (req.user.role === 'customer') {
      params.push(req.user.id);
      scope.push(`s.customer_id = $${params.length}`);
      scope.push(`s.status <> 'draft'`); // drafts are internal until sent as a quotation
    } else if (isId(req.query.customerId)) {
      params.push(Number(req.query.customerId));
      scope.push(`s.customer_id = $${params.length}`);
    }
    if (req.query.search?.trim()) {
      params.push(`%${req.query.search.trim()}%`);
      scope.push(`(s.number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.company ILIKE $${params.length} OR p.name ILIKE $${params.length})`);
    }
    const base = `FROM subscriptions s JOIN users c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id`;
    const scopeSql = scope.length ? `WHERE ${scope.join(' AND ')}` : '';

    // Counts per status (for the tabs), before applying the status filter
    const countsRes = await query(`SELECT s.status, COUNT(*) AS n ${base} ${scopeSql} GROUP BY s.status`, params);
    const counts = Object.fromEntries(STATUSES.map((st) => [st, 0]));
    for (const row of countsRes.rows) counts[row.status] = row.n;

    const where = [...scope];
    if (STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      where.push(`s.status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) AS n ${base} ${whereSql}`, params)).rows[0].n;

    params.push(pageSize, offset);
    const { rows } = await query(
      `SELECT s.id, s.number, s.customer_id, c.name AS customer_name, c.company AS customer_company, s.plan_id, p.name AS plan_name,
              p.billing_period, s.quantity, s.start_date, s.expiry_date, s.next_invoice_date, s.status,
              ROUND(p.price * s.quantity * (1 + COALESCE(pt.rate, 0) / 100) + COALESCE(l.total, 0), 2) AS total
       ${base}
       LEFT JOIN taxes pt ON pt.id = p.tax_id
       LEFT JOIN LATERAL (
         SELECT SUM(ROUND(sl.quantity * sl.unit_price * (1 + COALESCE(t.rate, 0) / 100), 2)) AS total
         FROM subscription_lines sl LEFT JOIN taxes t ON t.id = sl.tax_id WHERE sl.subscription_id = s.id
       ) l ON TRUE
       ${whereSql}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows.map(toCamel), page, pageSize, total, counts });
  })
);

// ---------- Detail ----------

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getSubscription({ query }, Number(req.params.id), req.user));
  })
);

// ---------- Create / edit (internal team only) ----------

const lineSchema = z.object({
  productId: z.coerce.number({ error: 'Choose a product' }).int().positive('Choose a product'),
  variantId: optionalIdSchema,
  quantity: intSchema('Quantity', 1),
  unitPrice: moneySchema('Unit price').optional().nullable(),
});

const subscriptionSchema = z
  .object({
    customerId: z.coerce.number({ error: 'Choose a customer' }).int().positive('Choose a customer'),
    planId: z.coerce.number({ error: 'Choose a plan' }).int().positive('Choose a plan'),
    quantity: intSchema('Seats', 1),
    startDate: dateSchema('Start date'),
    expiryDate: optionalDateSchema('Expiry date'),
    paymentTermsDays: intSchema('Payment terms', 0).refine((v) => v <= 365, 'Payment terms can be at most 365 days'),
    templateId: optionalIdSchema,
    notes: optionalText(2000),
    lines: z.array(lineSchema).max(50, 'Too many lines').optional(),
  })
  .refine((s) => !s.expiryDate || s.expiryDate >= s.startDate, { message: 'Expiry date must be on or after the start date', path: ['expiryDate'] });

async function prepare(db, body) {
  const d = validate(subscriptionSchema, body);

  const customer = (await db.query(`SELECT id, active FROM users WHERE id = $1 AND role = 'customer'`, [d.customerId])).rows[0];
  if (!customer || !customer.active) throw new HttpError(400, 'Choose an active customer', { customerId: 'Choose an active customer' });

  // Start from a quotation template: copy its lines when none were sent
  let template = null;
  if (d.templateId) {
    template = (await db.query('SELECT id, validity_days FROM quotation_templates WHERE id = $1', [d.templateId])).rows[0];
    if (!template) throw new HttpError(400, 'Template not found', { templateId: 'Template not found' });
    if (d.lines === undefined) {
      const tl = await db.query('SELECT product_id, variant_id, quantity FROM quotation_template_lines WHERE template_id = $1 ORDER BY id', [d.templateId]);
      d.lines = tl.rows.map((l) => ({ productId: l.product_id, variantId: l.variant_id, quantity: l.quantity }));
    }
  }
  d.lines = d.lines || [];

  await checkPlanAndLines(db, { planId: d.planId, planQuantity: d.quantity, lines: d.lines });
  const plan = (await db.query('SELECT start_date, end_date, name FROM plans WHERE id = $1', [d.planId])).rows[0];
  if (d.startDate < plan.start_date || (plan.end_date && d.startDate > plan.end_date)) {
    throw new HttpError(400, `${plan.name} is only available from ${plan.start_date}${plan.end_date ? ` to ${plan.end_date}` : ''}`, {
      startDate: 'Start date is outside the plan dates',
    });
  }
  if (!d.expiryDate && plan.end_date) d.expiryDate = plan.end_date; // default: the plan's end date
  if (plan.end_date && d.expiryDate > plan.end_date) {
    throw new HttpError(400, `Expiry date cannot be after the plan ends (${plan.end_date})`, { expiryDate: 'After the plan end date' });
  }

  // Price and tax for each line come from the product (unit price can be negotiated)
  for (const l of d.lines) {
    const p = (await db.query(
      `SELECT pr.sales_price + COALESCE(v.extra_price, 0) AS price, pr.tax_id
       FROM products pr LEFT JOIN product_variants v ON v.id = $2 AND v.product_id = pr.id WHERE pr.id = $1`,
      [l.productId, l.variantId]
    )).rows[0];
    l.unitPrice = l.unitPrice ?? p.price;
    l.taxId = p.tax_id;
  }
  return d;
}

async function writeLines(db, subscriptionId, lines) {
  await db.query('DELETE FROM subscription_lines WHERE subscription_id = $1', [subscriptionId]);
  for (const l of lines) {
    await db.query(
      'INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [subscriptionId, l.productId, l.variantId, l.quantity, l.unitPrice, l.taxId]
    );
  }
}

// POST /api/subscriptions  -> new subscription in Draft
router.post(
  '/',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const sub = await withTransaction(async (db) => {
      const d = await prepare(db, req.body);
      const { rows } = await db.query(
        `INSERT INTO subscriptions (number, customer_id, plan_id, quantity, start_date, expiry_date, payment_terms_days, template_id, notes, created_by)
         VALUES ('SUB/' || LPAD(nextval('subscription_number_seq')::text, 5, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [d.customerId, d.planId, d.quantity, d.startDate, d.expiryDate, d.paymentTermsDays, d.templateId, d.notes, req.user.id]
      );
      await writeLines(db, rows[0].id, d.lines);
      return getSubscription(db, rows[0].id, req.user);
    });
    res.status(201).json(sub);
  })
);

// PUT /api/subscriptions/:id  (only while Draft or Quotation)
router.put(
  '/:id',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const sub = await withTransaction(async (db) => {
      const cur = (await db.query('SELECT status FROM subscriptions WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw new HttpError(404, 'Subscription not found');
      if (!['draft', 'quotation'].includes(cur.status)) {
        throw new HttpError(400, 'Only draft or quotation subscriptions can be edited. Use add-ons to change an active one.');
      }
      const d = await prepare(db, req.body);
      await db.query(
        `UPDATE subscriptions SET customer_id = $1, plan_id = $2, quantity = $3, start_date = $4, expiry_date = $5,
                payment_terms_days = $6, template_id = $7, notes = $8, updated_at = NOW()
         WHERE id = $9`,
        [d.customerId, d.planId, d.quantity, d.startDate, d.expiryDate, d.paymentTermsDays, d.templateId, d.notes, id]
      );
      await writeLines(db, id, d.lines);
      return getSubscription(db, id, req.user);
    });
    res.json(sub);
  })
);

// ---------- Status changes ----------

const ACTIONS = ['send_quotation', 'confirm', 'activate', 'pause', 'resume', 'close', 'renew', 'cancel'];

// POST /api/subscriptions/:id/transition  { action }
router.post(
  '/:id/transition',
  asyncHandler(async (req, res) => {
    const { action } = validate(z.object({ action: z.enum(ACTIONS, { error: 'Unknown action' }) }), req.body);
    const id = Number(req.params.id);

    const sub = await withTransaction(async (db) => {
      await db.query('SELECT 1 FROM subscriptions WHERE id = $1 FOR UPDATE', [id]); // lock: no double clicks racing
      const s = await getSubscription(db, id, req.user);
      assertAllowed(s, req.user, action);
      const today = todayISO();
      const set = (sql, params = []) => db.query(`UPDATE subscriptions SET ${sql}, updated_at = NOW() WHERE id = $${params.length + 1}`, [...params, id]);

      switch (action) {
        case 'send_quotation': {
          const validDays = s.templateId ? (await db.query('SELECT validity_days FROM quotation_templates WHERE id = $1', [s.templateId])).rows[0]?.validity_days || 30 : 30;
          await set(`status = 'quotation', quotation_valid_until = $1`, [addDays(today, validDays)]);
          break;
        }
        case 'confirm': {
          if (!s.plan.active) throw new HttpError(400, 'The plan is no longer active. Choose another plan.');
          if (s.quantity < s.plan.minQuantity) throw new HttpError(400, `This plan needs at least ${s.plan.minQuantity} seats`);
          await set(`status = 'confirmed'`);
          break;
        }
        case 'activate':
          // First invoice is due on the start date; billing then moves forward one period at a time
          await set(`status = 'active', next_invoice_date = start_date`);
          break;
        case 'pause':
          await set(`status = 'paused'`);
          break;
        case 'resume':
          // Paused time is not billed: billing restarts from today at the earliest
          await set(`status = 'active', next_invoice_date = GREATEST(COALESCE(next_invoice_date, $1::date), $1::date)`, [today]);
          break;
        case 'close':
        case 'cancel':
          await set(`status = 'closed'`);
          break;
        case 'renew': {
          // Renewing extends the expiry date by one billing period
          const base = s.expiryDate > today ? s.expiryDate : today;
          const newExpiry = addPeriod(base, s.plan.billingPeriod);
          if (s.plan.endDate && newExpiry > s.plan.endDate) {
            throw new HttpError(400, `Cannot renew past the plan end date (${s.plan.endDate})`);
          }
          // Billing restarts from today at the earliest, so the expired gap is never back-billed
          if (s.status === 'closed') {
            await set(`status = 'active', expiry_date = $1, next_invoice_date = GREATEST(COALESCE(next_invoice_date, $2::date), $2::date)`, [newExpiry, today]);
          } else if (s.isExpired) {
            await set(`expiry_date = $1, next_invoice_date = GREATEST(COALESCE(next_invoice_date, $2::date), $2::date)`, [newExpiry, today]);
          } else {
            await set(`expiry_date = $1`, [newExpiry]);
          }
          break;
        }
        default:
      }
      return getSubscription(db, id, req.user);
    });
    res.json(sub);
  })
);

// ---------- Add-ons and lines on running subscriptions ----------
// Customers can switch add-ons on/off on their own subscription; staff can add any product.
// Changes show up on the next invoice automatically.

router.post(
  '/:id/lines',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const d = validate(z.object({
      productId: z.coerce.number({ error: 'Choose a product' }).int().positive('Choose a product'),
      variantId: optionalIdSchema,
      quantity: intSchema('Quantity', 1),
    }), req.body);

    const sub = await withTransaction(async (db) => {
      await db.query('SELECT 1 FROM subscriptions WHERE id = $1 FOR UPDATE', [id]);
      const s = await getSubscription(db, id, req.user);
      const product = (await db.query('SELECT id, name, is_addon, active, sales_price, tax_id FROM products WHERE id = $1', [d.productId])).rows[0];
      if (!product || !product.active) throw new HttpError(400, 'Product is not available');

      const internal = s.allowedActions.includes('manage_lines');
      if (!internal) {
        if (!s.allowedActions.includes('manage_addons')) throw new HttpError(400, `Add-ons cannot be changed while the subscription is ${s.status}`);
        if (!product.is_addon) throw new HttpError(403, 'Only add-ons can be switched on from the portal');
      }
      if (s.lines.some((l) => l.productId === d.productId && (l.variantId || null) === (d.variantId || null))) {
        throw new HttpError(409, `${product.name} is already on this subscription`);
      }
      let price = product.sales_price;
      if (d.variantId) {
        const v = (await db.query('SELECT extra_price FROM product_variants WHERE id = $1 AND product_id = $2', [d.variantId, d.productId])).rows[0];
        if (!v) throw new HttpError(400, 'Variant does not belong to this product');
        price += v.extra_price;
      }
      await db.query(
        'INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, d.productId, d.variantId, d.quantity, price, product.tax_id]
      );
      await db.query('UPDATE subscriptions SET updated_at = NOW() WHERE id = $1', [id]);
      return getSubscription(db, id, req.user);
    });
    res.status(201).json(sub);
  })
);

router.delete(
  '/:id/lines/:lineId',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const lineId = Number(req.params.lineId);
    const sub = await withTransaction(async (db) => {
      await db.query('SELECT 1 FROM subscriptions WHERE id = $1 FOR UPDATE', [id]);
      const s = await getSubscription(db, id, req.user);
      const line = s.lines.find((l) => l.id === lineId);
      if (!line) throw new HttpError(404, 'Line not found');
      const internal = s.allowedActions.includes('manage_lines');
      if (!internal) {
        if (!s.allowedActions.includes('manage_addons')) throw new HttpError(400, `Add-ons cannot be changed while the subscription is ${s.status}`);
        if (!line.isAddon) throw new HttpError(403, 'Only add-ons can be switched off from the portal');
      }
      await db.query('DELETE FROM subscription_lines WHERE id = $1 AND subscription_id = $2', [lineId, id]);
      await db.query('UPDATE subscriptions SET updated_at = NOW() WHERE id = $1', [id]);
      return getSubscription(db, id, req.user);
    });
    res.json(sub);
  })
);

export default router;

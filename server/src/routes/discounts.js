import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { logActivity, diff } from '../utils/activity.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, toCamel, validate } from '../utils/http.js';
import { dateSchema, moneySchema } from '../utils/validation.js';
import { todayISO } from '../utils/periods.js';

// Discount rules. Only the admin creates or changes them; staff can view.
// They are applied automatically by the billing engine (services/billing.js) on the next invoice.
const router = Router();
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Discount not found'))));
router.use(requireAuth, requireRole('admin', 'staff'));

const discountSchema = z
  .object({
    name: z.string({ error: 'Name is required' }).trim().min(2, 'Name is required').max(120, 'Name is too long'),
    type: z.enum(['percent', 'fixed'], { error: 'Choose percentage or fixed amount' }),
    value: moneySchema('Value').refine((v) => v > 0, 'Value must be more than zero'),
    minPurchase: moneySchema('Minimum purchase').default(0),
    minQuantity: z.coerce.number({ error: 'Minimum quantity must be a number' }).int('Whole number only').min(0, 'Cannot be negative').default(0),
    startDate: dateSchema('Start date'),
    endDate: dateSchema('End date'),
    usageLimit: z.union([z.coerce.number().int('Whole number only').min(1, 'Usage limit must be at least 1'), z.literal(''), z.null()])
      .optional().transform((v) => (v === '' || v === undefined ? null : v)),
    appliesTo: z.enum(['all', 'products'], { error: 'Choose what the discount applies to' }),
    productIds: z.array(z.coerce.number().int().positive()).max(100).default([]),
    active: z.boolean().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] })
  .refine((d) => d.type !== 'percent' || d.value <= 100, { message: 'A percentage cannot be more than 100', path: ['value'] })
  .refine((d) => d.appliesTo !== 'products' || d.productIds.length > 0, { message: 'Choose at least one product', path: ['productIds'] });

const LIST_SQL = `
  SELECT d.*, COALESCE(array_agg(dp.product_id ORDER BY p.name) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids,
         COALESCE(array_agg(p.name ORDER BY p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS product_names,
         (SELECT COALESCE(SUM(x.amount), 0) FROM invoice_discounts x JOIN invoices i ON i.id = x.invoice_id
          WHERE x.discount_id = d.id AND i.status <> 'cancelled') AS total_given
  FROM discounts d
  LEFT JOIN discount_products dp ON dp.discount_id = d.id
  LEFT JOIN products p ON p.id = dp.product_id`;

// Status in plain words: why a rule is or is not applying today
function withStatus(row, today) {
  const d = toCamel(row);
  d.productIds = d.productIds.map(Number);
  d.status = !d.active ? 'inactive'
    : d.usageLimit !== null && d.usedCount >= d.usageLimit ? 'used_up'
      : today < d.startDate ? 'scheduled'
        : today > d.endDate ? 'expired'
          : 'live';
  d.isValidToday = d.status === 'live';
  d.usesLeft = d.usageLimit === null ? null : Math.max(d.usageLimit - d.usedCount, 0);
  return d;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const today = todayISO();
    const { rows } = await query(`${LIST_SQL} GROUP BY d.id ORDER BY d.active DESC, d.end_date DESC, d.id DESC`);
    res.json(rows.map((r) => withStatus(r, today)));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${LIST_SQL} WHERE d.id = $1 GROUP BY d.id`, [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Discount not found');
    res.json(withStatus(rows[0], todayISO()));
  })
);

async function save(req, id) {
  const d = validate(discountSchema, req.body);
  if (d.appliesTo === 'all') d.productIds = [];
  return withTransaction(async (db) => {
    if (d.productIds.length) {
      const found = await db.query('SELECT COUNT(*) AS n FROM products WHERE id = ANY($1::int[])', [d.productIds]);
      if (found.rows[0].n !== new Set(d.productIds).size) throw new HttpError(400, 'One of the products does not exist', { productIds: 'Choose valid products' });
    }
    let discountId = id;
    if (id) {
      const cur = (await db.query('SELECT used_count FROM discounts WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw new HttpError(404, 'Discount not found');
      if (d.usageLimit !== null && d.usageLimit < cur.used_count) {
        throw new HttpError(400, `It has already been used ${cur.used_count} times, so the limit cannot be lower than that`, { usageLimit: `At least ${cur.used_count}` });
      }
      await db.query(
        `UPDATE discounts SET name = $1, type = $2, value = $3, min_purchase = $4, min_quantity = $5, start_date = $6, end_date = $7,
                usage_limit = $8, applies_to = $9, active = COALESCE($10, active) WHERE id = $11`,
        [d.name, d.type, d.value, d.minPurchase, d.minQuantity, d.startDate, d.endDate, d.usageLimit, d.appliesTo, d.active ?? null, id]
      );
      await db.query('DELETE FROM discount_products WHERE discount_id = $1', [id]);
    } else {
      discountId = (await db.query(
        `INSERT INTO discounts (name, type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, applies_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [d.name, d.type, d.value, d.minPurchase, d.minQuantity, d.startDate, d.endDate, d.usageLimit, d.appliesTo]
      )).rows[0].id;
    }
    for (const pid of new Set(d.productIds)) {
      await db.query('INSERT INTO discount_products (discount_id, product_id) VALUES ($1, $2)', [discountId, pid]);
    }
    await logActivity(db, req.user, {
      entity: 'discount', entityId: discountId, label: d.name, action: id ? 'updated' : 'created',
      summary: `${id ? 'Changed' : 'Created'} discount ${d.name}: ${d.type === 'percent' ? `${d.value}%` : `₹${d.value}`} off${d.usageLimit ? `, limit ${d.usageLimit} uses` : ''}${d.active === false ? ' (switched off)' : ''}`,
      details: { type: d.type, value: d.value, minPurchase: d.minPurchase, minQuantity: d.minQuantity, startDate: d.startDate, endDate: d.endDate, usageLimit: d.usageLimit, active: d.active ?? null },
    });
    const { rows } = await db.query(`${LIST_SQL} WHERE d.id = $1 GROUP BY d.id`, [discountId]);
    return withStatus(rows[0], todayISO());
  });
}

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => res.status(201).json(await save(req))));
router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => res.json(await save(req, Number(req.params.id)))));

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, toCamel, validate } from '../utils/http.js';
import { dateSchema, intSchema, moneySchema, optionalDateSchema, optionalIdSchema, optionalText } from '../utils/validation.js';

// Recurring plans. The admin decides price, billing period, minimum seats,
// availability dates and the per-plan rules (auto close, closable, pausable, renewable).
const router = Router();
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Not found'))));
router.use(requireAuth);

const planSchema = z
  .object({
    name: z.string({ error: 'Name is required' }).trim().min(2, 'Name is required').max(120, 'Name is too long'),
    description: optionalText(1000),
    price: moneySchema('Price'),
    billingPeriod: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], { error: 'Choose a billing period' }),
    minQuantity: intSchema('Minimum quantity', 1),
    taxId: optionalIdSchema,
    startDate: dateSchema('Start date'),
    endDate: optionalDateSchema('End date'),
    autoClose: z.boolean().default(false),
    closable: z.boolean().default(true),
    pausable: z.boolean().default(false),
    renewable: z.boolean().default(true),
    active: z.boolean().optional(),
  })
  .refine((p) => !p.endDate || p.endDate >= p.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] })
  .refine((p) => !p.autoClose || p.endDate, { message: 'Auto close needs an end date', path: ['endDate'] });

const PLAN_SELECT = `
  SELECT p.id, p.name, p.description, p.price, p.billing_period, p.min_quantity, p.tax_id, t.name AS tax_name, t.rate AS tax_rate,
         p.start_date, p.end_date, p.auto_close, p.closable, p.pausable, p.renewable, p.active,
         (p.active AND p.start_date <= CURRENT_DATE AND (p.end_date IS NULL OR p.end_date >= CURRENT_DATE)) AS available_now,
         (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id AND s.status IN ('active', 'paused')) AS active_subscriptions
  FROM plans p LEFT JOIN taxes t ON t.id = p.tax_id`;

async function assertTaxExists(taxId) {
  if (!taxId) return;
  const { rowCount } = await query('SELECT 1 FROM taxes WHERE id = $1 AND active', [taxId]);
  if (!rowCount) throw new HttpError(400, 'Selected tax does not exist or is inactive', { taxId: 'Choose a valid tax' });
}

// GET /api/plans?active=true&search=   (small list, not paginated)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    if (req.user.role === 'customer' || req.query.active === 'true') where.push('p.active');
    if (req.query.search?.trim()) {
      params.push(`%${req.query.search.trim()}%`);
      where.push(`p.name ILIKE $${params.length}`);
    }
    const { rows } = await query(
      `${PLAN_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.active DESC, p.price, p.name`,
      params
    );
    res.json(rows.map(toCamel));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${PLAN_SELECT} WHERE p.id = $1`, [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Plan not found');
    res.json(toCamel(rows[0]));
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const d = validate(planSchema, req.body);
    await assertTaxExists(d.taxId);
    const { rows } = await query(
      `INSERT INTO plans (name, description, price, billing_period, min_quantity, tax_id, start_date, end_date,
                          auto_close, closable, pausable, renewable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [d.name, d.description, d.price, d.billingPeriod, d.minQuantity, d.taxId, d.startDate, d.endDate,
        d.autoClose, d.closable, d.pausable, d.renewable]
    );
    const plan = await query(`${PLAN_SELECT} WHERE p.id = $1`, [rows[0].id]);
    res.status(201).json(toCamel(plan.rows[0]));
  })
);

router.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const d = validate(planSchema, req.body);
    await assertTaxExists(d.taxId);
    const { rowCount } = await query(
      `UPDATE plans SET name = $1, description = $2, price = $3, billing_period = $4, min_quantity = $5, tax_id = $6,
              start_date = $7, end_date = $8, auto_close = $9, closable = $10, pausable = $11, renewable = $12,
              active = COALESCE($13, active)
       WHERE id = $14`,
      [d.name, d.description, d.price, d.billingPeriod, d.minQuantity, d.taxId, d.startDate, d.endDate,
        d.autoClose, d.closable, d.pausable, d.renewable, d.active ?? null, req.params.id]
    );
    if (!rowCount) throw new HttpError(404, 'Plan not found');
    const plan = await query(`${PLAN_SELECT} WHERE p.id = $1`, [req.params.id]);
    res.json(toCamel(plan.rows[0]));
  })
);

export default router;

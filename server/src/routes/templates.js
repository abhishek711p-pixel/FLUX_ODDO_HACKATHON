import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, toCamel, validate } from '../utils/http.js';
import { intSchema, optionalIdSchema, optionalText } from '../utils/validation.js';

// Quotation templates: a ready-made offer (plan + seats + product lines) that stays valid
// for a set number of days. Sales reps start quotations from these instead of from scratch.
const router = Router();
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Not found'))));
router.use(requireAuth, requireRole('admin', 'staff'));

const lineSchema = z.object({
  productId: z.coerce.number({ error: 'Choose a product' }).int().positive('Choose a product'),
  variantId: optionalIdSchema,
  quantity: intSchema('Quantity', 1),
});

const templateSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name is required').max(120, 'Name is too long'),
  validityDays: intSchema('Validity days', 1).refine((v) => v <= 365, 'Validity can be at most 365 days'),
  planId: z.coerce.number({ error: 'Choose a plan' }).int().positive('Choose a plan'),
  planQuantity: intSchema('Seats', 1),
  notes: optionalText(2000),
  lines: z.array(lineSchema).max(50, 'Too many lines').default([]),
});

// Shared check: plan exists and is active, seats meet the plan minimum, products active, variants belong to products
export async function checkPlanAndLines(db, { planId, planQuantity, lines }) {
  const plan = (await db.query('SELECT id, name, min_quantity, active FROM plans WHERE id = $1', [planId])).rows[0];
  if (!plan || !plan.active) throw new HttpError(400, 'Choose an active plan', { planId: 'Choose an active plan' });
  if (planQuantity !== undefined && planQuantity < plan.min_quantity) {
    throw new HttpError(400, `${plan.name} needs at least ${plan.min_quantity} seats`, {
      planQuantity: `Minimum ${plan.min_quantity} seats for this plan`,
    });
  }
  for (const [i, line] of lines.entries()) {
    const p = (await db.query('SELECT id, name, active FROM products WHERE id = $1', [line.productId])).rows[0];
    if (!p || !p.active) throw new HttpError(400, `Line ${i + 1}: product is not available`, { [`lines.${i}.productId`]: 'Product is not available' });
    if (line.variantId) {
      const v = await db.query('SELECT 1 FROM product_variants WHERE id = $1 AND product_id = $2', [line.variantId, line.productId]);
      if (!v.rowCount) throw new HttpError(400, `Line ${i + 1}: variant does not belong to ${p.name}`);
    }
  }
  return plan;
}

const LIST_SQL = `
  SELECT t.id, t.name, t.validity_days, t.plan_id, t.plan_quantity, t.notes, p.name AS plan_name, p.billing_period, p.price AS plan_price,
         (SELECT COUNT(*) FROM quotation_template_lines l WHERE l.template_id = t.id) AS line_count
  FROM quotation_templates t JOIN plans p ON p.id = t.plan_id`;

async function getTemplate(db, id) {
  const t = (await db.query(`${LIST_SQL} WHERE t.id = $1`, [id])).rows[0];
  if (!t) return null;
  const lines = await db.query(
    `SELECT l.id, l.product_id, pr.name AS product_name, l.variant_id,
            CASE WHEN v.id IS NULL THEN NULL ELSE v.attribute || ': ' || v.value END AS variant_label,
            l.quantity, pr.sales_price + COALESCE(v.extra_price, 0) AS unit_price, pr.is_addon
     FROM quotation_template_lines l
     JOIN products pr ON pr.id = l.product_id
     LEFT JOIN product_variants v ON v.id = l.variant_id
     WHERE l.template_id = $1 ORDER BY l.id`,
    [id]
  );
  return { ...toCamel(t), lines: lines.rows.map(toCamel) };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${LIST_SQL} ORDER BY t.name`);
    res.json(rows.map(toCamel));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const t = await getTemplate({ query }, req.params.id);
    if (!t) throw new HttpError(404, 'Template not found');
    res.json(t);
  })
);

async function saveTemplate(req, id) {
  const d = validate(templateSchema, req.body);
  return withTransaction(async (db) => {
    await checkPlanAndLines(db, d);
    let templateId = id;
    if (id) {
      const r = await db.query(
        'UPDATE quotation_templates SET name = $1, validity_days = $2, plan_id = $3, plan_quantity = $4, notes = $5 WHERE id = $6',
        [d.name, d.validityDays, d.planId, d.planQuantity, d.notes, id]
      );
      if (!r.rowCount) throw new HttpError(404, 'Template not found');
      await db.query('DELETE FROM quotation_template_lines WHERE template_id = $1', [id]);
    } else {
      templateId = (await db.query(
        'INSERT INTO quotation_templates (name, validity_days, plan_id, plan_quantity, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [d.name, d.validityDays, d.planId, d.planQuantity, d.notes]
      )).rows[0].id;
    }
    for (const l of d.lines) {
      await db.query(
        'INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4)',
        [templateId, l.productId, l.variantId, l.quantity]
      );
    }
    return getTemplate(db, templateId);
  });
}

router.post('/', asyncHandler(async (req, res) => res.status(201).json(await saveTemplate(req))));
router.put('/:id', asyncHandler(async (req, res) => res.json(await saveTemplate(req, Number(req.params.id)))));

export default router;

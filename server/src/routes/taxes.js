import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { logActivity, diff } from '../utils/activity.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, toCamel, validate } from '../utils/http.js';

// Tax rules (GST). Only the admin can create or change them; staff can view.
const router = Router();
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Not found'))));
router.use(requireAuth);

const taxSchema = z.object({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name is required').max(60, 'Name is too long'),
  rate: z.coerce
    .number({ error: 'Rate must be a number' })
    .min(0, 'Rate cannot be negative')
    .max(100, 'Rate cannot be more than 100%')
    .transform((v) => Math.round(v * 100) / 100),
  active: z.boolean().optional(),
});

const FIELDS = 'id, name, rate, active';

// GET /api/taxes  (small list, not paginated)
router.get(
  '/',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT ${FIELDS} FROM taxes ORDER BY active DESC, rate, name`);
    res.json(rows.map(toCamel));
  })
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = validate(taxSchema, req.body);
    const { rows } = await query(`INSERT INTO taxes (name, rate) VALUES ($1, $2) RETURNING ${FIELDS}`, [data.name, data.rate]);
    await logActivity(null, req.user, { entity: 'tax', entityId: rows[0].id, label: data.name, action: 'created', summary: `Created tax ${data.name} at ${data.rate}%` });
    res.status(201).json(toCamel(rows[0]));
  })
);

router.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = validate(taxSchema, req.body);
    const before = (await query('SELECT name, rate, active FROM taxes WHERE id = $1', [req.params.id])).rows[0];
    const { rows } = await query(
      `UPDATE taxes SET name = $1, rate = $2, active = COALESCE($3, active) WHERE id = $4 RETURNING ${FIELDS}`,
      [data.name, data.rate, data.active ?? null, req.params.id]
    );
    if (!rows[0]) throw new HttpError(404, 'Tax not found');
    const changes = diff(before, rows[0], ['name', 'rate', 'active']);
    if (Object.keys(changes).length) {
      await logActivity(null, req.user, {
        entity: 'tax', entityId: rows[0].id, label: rows[0].name, action: 'updated', details: changes,
        summary: `Changed tax ${rows[0].name}: ` + Object.entries(changes).map(([k, v]) => `${k} ${v.from} → ${v.to}`).join(', '),
      });
    }
    res.json(toCamel(rows[0]));
  })
);

export default router;

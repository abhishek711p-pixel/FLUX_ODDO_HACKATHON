import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, getPagination, toCamel, validate } from '../utils/http.js';
import { moneySchema, optionalIdSchema, optionalText } from '../utils/validation.js';

// Products and their variants. Only the admin adds or edits them.
const router = Router();
router.param('id', (req, res, next, value) => (isId(value) ? next() : next(new HttpError(404, 'Not found'))));
router.use(requireAuth);

const variantSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  attribute: z.string({ error: 'Variant attribute is required' }).trim().min(1, 'Variant attribute is required').max(60),
  value: z.string({ error: 'Variant value is required' }).trim().min(1, 'Variant value is required').max(60),
  extraPrice: moneySchema('Extra price'),
});

const productSchema = z
  .object({
    name: z.string({ error: 'Name is required' }).trim().min(2, 'Name is required').max(160, 'Name is too long'),
    type: z.enum(['service', 'goods'], { error: 'Type must be service or goods' }),
    salesPrice: moneySchema('Sales price'),
    costPrice: moneySchema('Cost price'),
    notes: optionalText(2000),
    isAddon: z.boolean().default(false),
    taxId: optionalIdSchema,
    active: z.boolean().optional(),
    variants: z.array(variantSchema).max(50, 'Too many variants').default([]),
  })
  .refine(
    (p) => new Set(p.variants.map((v) => `${v.attribute.toLowerCase()}|${v.value.toLowerCase()}`)).size === p.variants.length,
    { message: 'Each variant must be different', path: ['variants'] }
  );

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.type, p.sales_price, p.cost_price, p.notes, p.is_addon, p.tax_id, p.active, p.created_at,
         t.name AS tax_name, t.rate AS tax_rate,
         (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count
  FROM products p LEFT JOIN taxes t ON t.id = p.tax_id`;

async function getProduct(db, id) {
  const { rows } = await db.query(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  if (!rows[0]) return null;
  const variants = await db.query(
    'SELECT id, attribute, value, extra_price FROM product_variants WHERE product_id = $1 ORDER BY attribute, extra_price, value',
    [id]
  );
  return { ...toCamel(rows[0]), variants: variants.rows.map(toCamel) };
}

// Cost price is internal margin data: never send it to customers
const forViewer = (product, user) => {
  if (user.role !== 'customer' || !product) return product;
  const { costPrice, ...rest } = product;
  return rest;
};

async function assertTaxExists(db, taxId) {
  if (!taxId) return;
  const { rowCount } = await db.query('SELECT 1 FROM taxes WHERE id = $1 AND active', [taxId]);
  if (!rowCount) throw new HttpError(400, 'Selected tax does not exist or is inactive', { taxId: 'Choose a valid tax' });
}

// GET /api/products?search=&isAddon=true&active=true
// Customers only see active products (they need add-ons for their portal).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = getPagination(req.query);
    const params = [];
    const where = [];
    if (req.user.role === 'customer' || req.query.active === 'true') where.push('p.active');
    if (req.query.active === 'false' && req.user.role !== 'customer') where.push('NOT p.active');
    if (req.query.isAddon === 'true') where.push('p.is_addon');
    if (req.query.isAddon === 'false') where.push('NOT p.is_addon');
    if (req.query.search?.trim()) {
      params.push(`%${req.query.search.trim()}%`);
      where.push(`p.name ILIKE $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (await query(`SELECT COUNT(*) AS n FROM products p ${whereSql}`, params)).rows[0].n;
    params.push(pageSize, offset);
    const { rows } = await query(
      `${PRODUCT_SELECT} ${whereSql} ORDER BY p.active DESC, p.name LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const data = rows.map((r) => forViewer(toCamel(r), req.user));

    // ?include=variants adds each product's variants (used by the subscription line picker)
    if (req.query.include === 'variants' && data.length) {
      const v = await query(
        `SELECT id, product_id, attribute, value, extra_price FROM product_variants
         WHERE product_id = ANY($1::int[]) ORDER BY attribute, extra_price, value`,
        [data.map((p) => p.id)]
      );
      for (const p of data) p.variants = v.rows.filter((x) => x.product_id === p.id).map(({ product_id, ...x }) => toCamel(x));
    }
    res.json({ data, page, pageSize, total });
  })
);

// GET /api/products/:id  (with variants)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await getProduct({ query }, req.params.id);
    if (!product || (req.user.role === 'customer' && !product.active)) throw new HttpError(404, 'Product not found');
    res.json(forViewer(product, req.user));
  })
);

// POST /api/products
router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = validate(productSchema, req.body);
    const product = await withTransaction(async (db) => {
      await assertTaxExists(db, data.taxId);
      const { rows } = await db.query(
        `INSERT INTO products (name, type, sales_price, cost_price, notes, is_addon, tax_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [data.name, data.type, data.salesPrice, data.costPrice, data.notes, data.isAddon, data.taxId]
      );
      for (const v of data.variants) {
        await db.query(
          'INSERT INTO product_variants (product_id, attribute, value, extra_price) VALUES ($1, $2, $3, $4)',
          [rows[0].id, v.attribute, v.value, v.extraPrice]
        );
      }
      return getProduct(db, rows[0].id);
    });
    res.status(201).json(product);
  })
);

// PUT /api/products/:id   The variants list replaces the old one; send a variant's id to keep it.
router.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = validate(productSchema, req.body);
    const product = await withTransaction(async (db) => {
      await assertTaxExists(db, data.taxId);
      const { rowCount } = await db.query(
        `UPDATE products SET name = $1, type = $2, sales_price = $3, cost_price = $4, notes = $5, is_addon = $6,
                tax_id = $7, active = COALESCE($8, active)
         WHERE id = $9`,
        [data.name, data.type, data.salesPrice, data.costPrice, data.notes, data.isAddon, data.taxId, data.active ?? null, id]
      );
      if (!rowCount) throw new HttpError(404, 'Product not found');

      const keepIds = data.variants.filter((v) => v.id).map((v) => v.id);
      // Variants already used on subscriptions cannot be removed (they are part of billing history)
      const inUse = await db.query(
        `SELECT v.attribute, v.value FROM product_variants v
         WHERE v.product_id = $1 AND NOT (v.id = ANY($2::int[]))
           AND (EXISTS (SELECT 1 FROM subscription_lines l WHERE l.variant_id = v.id)
             OR EXISTS (SELECT 1 FROM quotation_template_lines t WHERE t.variant_id = v.id))
         LIMIT 1`,
        [id, keepIds]
      );
      if (inUse.rows[0]) {
        const v = inUse.rows[0];
        throw new HttpError(400, `Variant "${v.attribute}: ${v.value}" is used on subscriptions and cannot be removed`);
      }
      await db.query('DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::int[]))', [id, keepIds]);

      for (const v of data.variants) {
        if (v.id) {
          const r = await db.query(
            'UPDATE product_variants SET attribute = $1, value = $2, extra_price = $3 WHERE id = $4 AND product_id = $5',
            [v.attribute, v.value, v.extraPrice, v.id, id]
          );
          if (!r.rowCount) throw new HttpError(400, 'A variant does not belong to this product');
        } else {
          await db.query(
            'INSERT INTO product_variants (product_id, attribute, value, extra_price) VALUES ($1, $2, $3, $4)',
            [id, v.attribute, v.value, v.extraPrice]
          );
        }
      }
      return getProduct(db, id);
    });
    res.json(product);
  })
);

export default router;

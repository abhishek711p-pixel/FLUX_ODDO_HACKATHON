import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, getPagination, isId, toCamel } from '../utils/http.js';

// Activity log (audit trail): who changed what and when. Internal team only.
const router = Router();
router.use(requireAuth, requireRole('admin', 'staff'));

const ENTITIES = ['subscription', 'invoice', 'payment', 'plan', 'discount', 'product', 'tax', 'user', 'billing'];

// GET /api/activity?entity=&search=&subscriptionId=&invoiceId=&from=&to=&page=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = getPagination(req.query);
    const where = [];
    const params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };

    if (ENTITIES.includes(req.query.entity)) add('a.entity = ?', req.query.entity);
    if (isId(req.query.subscriptionId)) add('a.subscription_id = ?', Number(req.query.subscriptionId));
    if (isId(req.query.invoiceId)) add('a.invoice_id = ?', Number(req.query.invoiceId));
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) add('a.created_at >= ?::date', req.query.from);
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) add(`a.created_at < ?::date + 1`, req.query.to);
    const search = req.query.search?.trim();
    if (search) add(`(a.summary ILIKE ? OR a.entity_label ILIKE $${params.length + 1} OR u.name ILIKE $${params.length + 1})`, `%${search}%`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const base = 'FROM activity_log a LEFT JOIN users u ON u.id = a.user_id';
    const [count, rows] = await Promise.all([
      query(`SELECT COUNT(*) AS n ${base} ${whereSql}`, params),
      query(
        `SELECT a.id, a.entity, a.entity_id, a.entity_label, a.action, a.summary, a.details, a.subscription_id, a.invoice_id,
                a.created_at, u.name AS user_name, u.role AS user_role
         ${base} ${whereSql}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset]
      ),
    ]);
    res.json({ data: rows.rows.map(toCamel), page, pageSize, total: count.rows[0].n });
  })
);

export default router;

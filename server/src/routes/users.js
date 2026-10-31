import { Router } from 'express';
import { config } from '../config.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db.js';
import { logActivity, diff } from '../utils/activity.js';
import { requireAuth, requireRole, USER_FIELDS } from '../middleware/auth.js';
import { HttpError, isId, asyncHandler, getPagination, toCamel, validate } from '../utils/http.js';
import { emailSchema, nameSchema, optionalText, passwordSchema, phoneSchema } from '../utils/validation.js';
import { issueResetLink } from '../utils/resetToken.js';

const router = Router();

// Shared paginated user search, used by /users and /customers
async function listUsers({ roles, search, page, pageSize, offset }) {
  const params = [roles];
  let where = 'role = ANY($1)';
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length} OR company ILIKE $${params.length})`;
  }
  const total = (await query(`SELECT COUNT(*) AS n FROM users WHERE ${where}`, params)).rows[0].n;
  params.push(pageSize, offset);
  const { rows } = await query(
    `SELECT ${USER_FIELDS}, created_at FROM users WHERE ${where}
     ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { data: rows.map(toCamel), page, pageSize, total };
}

async function assertEmailFree(email) {
  const exists = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (exists.rowCount) throw new HttpError(409, 'An account with this email already exists', { email: 'Email is already registered' });
}

// ---------- Internal users (admin only) ----------

// GET /api/users?role=staff&search=
router.get(
  '/users',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const roles = ['staff', 'admin'].includes(req.query.role) ? [req.query.role] : ['staff', 'admin'];
    res.json(await listUsers({ roles, search: req.query.search?.trim(), ...getPagination(req.query) }));
  })
);

// POST /api/users  (only the admin can create internal staff)
router.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = validate(
      z.object({
        name: nameSchema,
        email: emailSchema,
        password: passwordSchema,
        role: z.enum(['staff', 'admin'], { error: 'Role must be staff or admin' }).default('staff'),
        phone: phoneSchema,
      }),
      req.body
    );
    await assertEmailFree(data.email);

    const hash = await bcrypt.hash(data.password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, company, phone)
       VALUES ($1, $2, $3, $4, $6, $5) RETURNING ${USER_FIELDS}`,
      [data.name, data.email, hash, data.role, data.phone, config.company.name]
    );
    await logActivity(null, req.user, { entity: 'user', entityId: rows[0].id, label: data.name, action: 'created', summary: `Added team member ${data.name} as ${data.role}` });
    res.status(201).json(toCamel(rows[0]));
  })
);

// PATCH /api/users/:id/active  { active: true|false }
router.patch(
  '/users/:id/active',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!isId(req.params.id)) throw new HttpError(404, 'User not found');
    const id = Number(req.params.id);
    const { active } = validate(z.object({ active: z.boolean({ error: 'active must be true or false' }) }), req.body);
    if (id === req.user.id && !active) throw new HttpError(400, 'You cannot disable your own account');

    const { rows } = await query(`UPDATE users SET active = $1 WHERE id = $2 RETURNING ${USER_FIELDS}`, [active, id]);
    if (!rows[0]) throw new HttpError(404, 'User not found');
    await logActivity(null, req.user, {
      entity: 'user', entityId: id, label: rows[0].name, action: active ? 'enabled' : 'disabled',
      summary: `${active ? 'Enabled' : 'Disabled'} the account of ${rows[0].name} (${rows[0].role})`,
    });
    res.json(toCamel(rows[0]));
  })
);

// ---------- Customers (admin and staff) ----------

// GET /api/customers?search=
router.get(
  '/customers',
  requireAuth,
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    res.json(await listUsers({ roles: ['customer'], search: req.query.search?.trim(), ...getPagination(req.query) }));
  })
);

// POST /api/customers  Staff add a customer; the customer gets an email link to set their own password.
router.post(
  '/customers',
  requireAuth,
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const data = validate(
      z.object({ name: nameSchema, email: emailSchema, company: optionalText(160), phone: phoneSchema }),
      req.body
    );
    await assertEmailFree(data.email);

    // Random unusable password until the customer sets their own via the link
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, company, phone)
       VALUES ($1, $2, $3, 'customer', $4, $5) RETURNING ${USER_FIELDS}`,
      [data.name, data.email, hash, data.company, data.phone]
    );
    const user = toCamel(rows[0]);
    await logActivity(null, req.user, { entity: 'user', entityId: user.id, label: user.name, action: 'created', summary: `Added customer ${user.name}${data.company ? ` (${data.company})` : ''} and sent an invite` });
    const devResetLink = await issueResetLink({ query }, user, { purpose: 'invite' });
    res.status(201).json({ user, ...(devResetLink ? { devResetLink } : {}) });
  })
);

export default router;

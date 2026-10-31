import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, signToken, USER_FIELDS } from '../middleware/auth.js';
import { HttpError, asyncHandler, toCamel, validate } from '../utils/http.js';
import { emailSchema, nameSchema, optionalText, passwordSchema, phoneSchema } from '../utils/validation.js';
import { hashToken, issueResetLink } from '../utils/resetToken.js';
import { mailEnabled } from '../utils/mailer.js';

const router = Router();

const loginSchema = z.object({
  email: z.string({ error: 'Email is required' }).trim().email('Enter a valid email'),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  company: optionalText(160),
  phone: phoneSchema,
});

// POST /api/auth/signup  (public signup always creates a CUSTOMER account)
router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const data = validate(signupSchema, req.body);

    const exists = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [data.email]);
    if (exists.rowCount) {
      throw new HttpError(409, 'An account with this email already exists', { email: 'Email is already registered' });
    }

    const hash = await bcrypt.hash(data.password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, company, phone)
       VALUES ($1, $2, $3, 'customer', $4, $5) RETURNING ${USER_FIELDS}`,
      [data.name, data.email, hash, data.company, data.phone]
    );
    const user = toCamel(rows[0]);
    res.status(201).json({ token: signToken(user), user });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = validate(loginSchema, req.body);

    const { rows } = await query(
      `SELECT ${USER_FIELDS}, password_hash FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    const row = rows[0];
    // Same message for wrong email and wrong password, so we do not reveal which emails exist
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    if (!row.active) throw new HttpError(403, 'This account has been disabled');

    delete row.password_hash;
    const user = toCamel(row);
    res.json({ token: signToken(user), user });
  })
);

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/forgot-password
// Always gives the same answer, so nobody can find out which emails are registered.
router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = validate(z.object({ email: emailSchema }), req.body);
    const { rows } = await query('SELECT id, name, email, role, active FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    let devResetLink = null;
    if (rows[0]?.active) {
      const link = await issueResetLink({ query }, rows[0]);
      // Demo mode shortcut (no email server) is for customer accounts only. Admin and staff links are only
      // ever emailed, so nobody can take over an internal account from the login page.
      if (rows[0].role === 'customer') devResetLink = link;
    }

    res.json({
      message: 'If this email is registered, a password reset link has been sent to it.',
      // Demo mode only (no SMTP configured): show the link so the flow can be tested
      ...(!mailEnabled && devResetLink ? { devResetLink } : {}),
    });
  })
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = validate(
      z.object({ token: z.string({ error: 'Reset link is invalid' }).min(10, 'Reset link is invalid'), password: passwordSchema }),
      req.body
    );

    const { rows } = await query(
      `SELECT id FROM users WHERE reset_token_hash = $1 AND reset_token_expires > NOW() AND active`,
      [hashToken(token)]
    );
    if (!rows[0]) throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');

    const hash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = $2`,
      [hash, rows[0].id]
    );
    res.json({ message: 'Password updated. You can now log in.' });
  })
);

export default router;

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, asyncHandler, toCamel } from '../utils/http.js';

export const USER_FIELDS = 'id, name, email, role, company, phone, active';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Checks the Bearer token and loads the user fresh from the DB (so deactivated users are blocked at once)
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please log in');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }

  const { rows } = await query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [payload.sub]);
  const user = rows[0];
  if (!user || !user.active) throw new HttpError(401, 'Account not found or disabled');

  req.user = toCamel(user);
  next();
});

// Usage: router.post('/', requireRole('admin'), handler)
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new HttpError(403, 'You do not have permission to do this'));
  }
  next();
};

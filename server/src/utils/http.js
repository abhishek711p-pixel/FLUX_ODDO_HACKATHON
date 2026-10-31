// Small helpers shared by all routes

// Error with an HTTP status, thrown from routes and turned into JSON by the error handler
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Wrap async route handlers so thrown errors reach the error handler
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// snake_case DB row -> camelCase JSON
export function toCamel(row) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
}

// A database id: whole number within the integer range
export const isId = (v) => /^\d{1,10}$/.test(String(v ?? '')) && Number(v) > 0 && Number(v) <= 2147483647;

// Read ?page & ?pageSize safely
export function getPagination(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Validate req.body with a zod schema, throw 400 with field errors if invalid
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!details[key]) details[key] = issue.message; // keep the first problem per field
    }
    throw new HttpError(400, Object.values(details)[0] || 'Invalid input', details);
  }
  return result.data;
}

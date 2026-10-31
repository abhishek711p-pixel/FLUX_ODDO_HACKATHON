import { HttpError } from '../utils/http.js';

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Single place that turns every error into a clean JSON response
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  // Postgres constraint errors
  if (err.code === '23505') return res.status(409).json({ error: 'This record already exists' });
  if (err.code === '23503') return res.status(400).json({ error: 'A linked record does not exist or is still in use' });
  if (err.code === '23514') return res.status(400).json({ error: 'A value is out of the allowed range' });

  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

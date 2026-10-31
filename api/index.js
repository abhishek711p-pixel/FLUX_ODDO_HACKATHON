// Vercel serverless entry: every /api/* request is handled by the same Express app used locally.
import app from '../server/src/app.js';

export default app;

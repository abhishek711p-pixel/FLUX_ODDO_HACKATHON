import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler, notFound } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import taxRoutes from './routes/taxes.js';
import productRoutes from './routes/products.js';
import planRoutes from './routes/plans.js';
import templateRoutes from './routes/templates.js';
import subscriptionRoutes from './routes/subscriptions.js';
import invoiceRoutes from './routes/invoices.js';
import paymentRoutes from './routes/payments.js';
import discountRoutes from './routes/discounts.js';
import reportRoutes from './routes/reports.js';
import activityRoutes from './routes/activity.js';
import { ensureActivityTable } from './utils/activity.js';
import { startAutoBilling } from './services/billing.js';

const app = express();

app.use(cors({ origin: config.clientUrl }));
app.use(express.json({ limit: '1mb' }));

// Request log with response time (helps prove the under 2 second rule)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
  next();
});

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

// Public: which business this installation belongs to (shown in the header, login page and invoices)
app.get('/api/meta', (req, res) => res.json({ companyName: config.company.isSet ? config.company.name : '', companyEmail: config.company.email }));
app.use('/api/auth', authRoutes);
app.use('/api/taxes', taxRoutes);
app.use('/api/products', productRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api', userRoutes); // /api/users and /api/customers (keep last: it is mounted on /api)

app.use('/api', notFound);
app.use(errorHandler);

ensureActivityTable()
  .catch((err) => console.error('[activity log] could not create table:', err.message))
  .finally(() => {
    app.listen(config.port, () => {
      console.log(`SubFlow API running on http://localhost:${config.port}`);
      startAutoBilling();
    });
  });

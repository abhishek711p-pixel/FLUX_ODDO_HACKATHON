import 'dotenv/config';

// On Render the public address is known only at run time: use it for links in emails
if (!process.env.CLIENT_URL && process.env.RENDER_EXTERNAL_URL) process.env.CLIENT_URL = process.env.RENDER_EXTERNAL_URL;
if (!process.env.CLIENT_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) process.env.CLIENT_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key} in server/.env (copy .env.example to .env)`);
    process.exit(1);
  }
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Optional: the business using SubFlow. Set COMPANY_NAME / COMPANY_EMAIL in .env to print them on invoices and emails.
  // Left empty, the app stays fully generic and uses the SubFlow name.
  company: {
    name: process.env.COMPANY_NAME || 'SubFlow',
    email: process.env.COMPANY_EMAIL || '',
    isSet: Boolean(process.env.COMPANY_NAME),
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || `${process.env.COMPANY_NAME || 'SubFlow'} Billing <${process.env.COMPANY_EMAIL || process.env.SMTP_USER || 'billing@example.com'}>`,
  },
};

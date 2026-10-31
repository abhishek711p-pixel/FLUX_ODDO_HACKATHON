import 'dotenv/config';

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
  // The business using SubFlow. Set COMPANY_NAME / COMPANY_EMAIL in .env (shown on invoices, emails, header)
  company: {
    name: process.env.COMPANY_NAME || 'Your Company Pvt. Ltd.',
    email: process.env.COMPANY_EMAIL || 'billing@yourcompany.com',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || `${process.env.COMPANY_NAME || 'SubFlow'} Billing <${process.env.COMPANY_EMAIL || 'billing@yourcompany.com'}>`,
  },
};

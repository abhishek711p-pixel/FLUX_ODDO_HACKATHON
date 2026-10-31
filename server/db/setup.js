// Creates all tables fresh and inserts demo data.
// Run: npm run db:setup   (WARNING: wipes existing data)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

async function insert(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function run() {
  console.log('Creating schema...');
  await pool.query(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));

  console.log('Seeding demo users...');
  const users = [
    { name: 'Aarav Admin', email: 'admin@subflow.app', password: 'Admin@1234', role: 'admin', company: process.env.COMPANY_NAME || 'SubFlow' },
    { name: 'Sneha Staff', email: 'staff@subflow.app', password: 'Staff@1234', role: 'staff', company: process.env.COMPANY_NAME || 'SubFlow' },
    { name: 'Rohan Mehta', email: 'customer@subflow.app', password: 'Customer@1234', role: 'customer', company: 'Mehta Traders', phone: '9876543210' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, company, phone) VALUES ($1, $2, $3, $4, $5, $6)`,
      [u.name, u.email, hash, u.role, u.company, u.phone || null]
    );
  }

  console.log('Seeding GST rules...');
  const tax = {};
  for (const [name, rate] of [['GST 0%', 0], ['GST 5%', 5], ['GST 12%', 12], ['GST 18%', 18], ['GST 28%', 28]]) {
    tax[rate] = (await insert('INSERT INTO taxes (name, rate) VALUES ($1, $2) RETURNING id', [name, rate])).id;
  }

  console.log('Seeding products and variants...');
  const products = [
    {
      name: 'Cloud ERP Suite', type: 'service', sales: 1499, cost: 400, addon: false, tax: 18,
      notes: 'Core business software: accounting, inventory and sales.',
      variants: [['Brand', 'Standard', 0], ['Brand', 'Odoo', 560]],
    },
    {
      name: 'Smart CRM', type: 'service', sales: 799, cost: 200, addon: false, tax: 18,
      notes: 'Leads, pipeline and customer follow ups.',
      variants: [['Edition', 'Basic', 0], ['Edition', 'Professional', 300]],
    },
    { name: 'Extra Storage 50 GB', type: 'service', sales: 199, cost: 40, addon: true, tax: 18, notes: 'Add-on: more cloud storage.', variants: [] },
    { name: 'Priority Support', type: 'service', sales: 499, cost: 150, addon: true, tax: 18, notes: 'Add-on: 4 hour response time.', variants: [] },
    { name: 'WhatsApp Alerts', type: 'service', sales: 149, cost: 30, addon: true, tax: 18, notes: 'Add-on: invoice and payment alerts on WhatsApp.', variants: [] },
    {
      name: 'Barcode Scanner', type: 'goods', sales: 2500, cost: 1600, addon: false, tax: 12,
      notes: 'Hardware rented with the POS plan.', variants: [['Model', 'Wired', 0], ['Model', 'Wireless', 900]],
    },
  ];
  for (const p of products) {
    const { id } = await insert(
      `INSERT INTO products (name, type, sales_price, cost_price, notes, is_addon, tax_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [p.name, p.type, p.sales, p.cost, p.notes, p.addon, tax[p.tax]]
    );
    for (const [attribute, value, extra] of p.variants) {
      await pool.query('INSERT INTO product_variants (product_id, attribute, value, extra_price) VALUES ($1, $2, $3, $4)', [id, attribute, value, extra]);
    }
  }

  console.log('Seeding recurring plans...');
  const plans = [
    // name, price per seat, period, min seats, start, end, autoClose, closable, pausable, renewable, description
    ['Starter Monthly', 499, 'monthly', 1, '2026-01-01', null, false, true, true, true, 'For small shops. Pause any time.'],
    ['Business Monthly', 999, 'monthly', 3, '2026-01-01', null, false, true, true, true, 'For growing teams, minimum 3 seats.'],
    ['Business Quarterly', 2799, 'quarterly', 3, '2026-01-01', null, false, true, true, true, 'Billed every 3 months. About 7% cheaper than paying monthly.'],
    ['Business Yearly', 9999, 'yearly', 5, '2026-01-01', null, false, false, false, true, 'Annual contract, 2 months free. Cannot be closed early.'],
    ['Weekly Pilot', 149, 'weekly', 1, '2026-10-01', '2026-12-31', true, true, false, false, 'Limited pilot. Closes on its own at the end date.'],
    ['Daily Event Pass', 99, 'daily', 1, '2026-10-01', '2027-03-31', true, true, false, false, 'Pay per day for events and fairs.'],
  ];
  for (const p of plans) {
    await pool.query(
      `INSERT INTO plans (name, price, billing_period, min_quantity, start_date, end_date, auto_close, closable, pausable, renewable, description, tax_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [...p, tax[18]]
    );
  }

  console.log('Seeding quotation templates...');
  const id = async (sql, params) => (await insert(sql, params)).id;
  const productId = (name) => id('SELECT id FROM products WHERE name = $1', [name]);
  const variantId = (product, value) =>
    id('SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.name = $1 AND v.value = $2', [product, value]);
  const planId = (name) => id('SELECT id FROM plans WHERE name = $1', [name]);
  const templates = [
    {
      name: 'Growing Team Pack', days: 15, plan: 'Business Monthly', seats: 5, notes: 'Standard offer for teams of 5 to 20 people.',
      lines: [['Cloud ERP Suite', 'Odoo', 1], ['Smart CRM', 'Professional', 1], ['Priority Support', null, 1]],
    },
    {
      name: 'Enterprise Yearly Contract', days: 30, plan: 'Business Yearly', seats: 25, notes: 'For large companies on yearly contracts.',
      lines: [['Cloud ERP Suite', 'Odoo', 1], ['Smart CRM', 'Professional', 1], ['Extra Storage 50 GB', null, 4], ['Priority Support', null, 1]],
    },
    { name: 'Small Shop Starter', days: 7, plan: 'Starter Monthly', seats: 1, notes: 'Quick start for small shops.', lines: [['Cloud ERP Suite', 'Standard', 1]] },
  ];
  for (const t of templates) {
    const tid = await id(
      'INSERT INTO quotation_templates (name, validity_days, plan_id, plan_quantity, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [t.name, t.days, await planId(t.plan), t.seats, t.notes]
    );
    for (const [product, variant, qty] of t.lines) {
      await pool.query(
        'INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4)',
        [tid, await productId(product), variant ? await variantId(product, variant) : null, qty]
      );
    }
  }

  console.log('Seeding discount rules...');
  await pool.query(
    `INSERT INTO discounts (name, type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, applies_to)
     VALUES ('Festive Season 10% off', 'percent', 10, 5000, 0, '2026-10-15', '2026-11-30', 100, 'all')`
  );
  const bundle = await id(
    `INSERT INTO discounts (name, type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, applies_to)
     VALUES ('Add-on bundle: ₹100 off', 'fixed', 100, 0, 2, '2026-01-01', '2026-12-31', NULL, 'products') RETURNING id`
  );
  for (const name of ['Extra Storage 50 GB', 'Priority Support', 'WhatsApp Alerts']) {
    await pool.query('INSERT INTO discount_products (discount_id, product_id) VALUES ($1, $2)', [bundle, await productId(name)]);
  }
  await pool.query(
    `INSERT INTO discounts (name, type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, applies_to)
     VALUES ('Launch week (ended)', 'percent', 25, 0, 0, '2026-01-01', '2026-01-07', NULL, 'all')`
  );

  console.log('Done. Demo logins:');
  for (const u of users) console.log(`  ${u.role.padEnd(9)} ${u.email} / ${u.password}`);
  await pool.end();
}

run().catch(async (err) => {
  console.error('Setup failed:', err.message);
  await pool.end();
  process.exit(1);
});

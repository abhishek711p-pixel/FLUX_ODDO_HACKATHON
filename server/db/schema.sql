-- SubFlow database schema (PostgreSQL)
-- WARNING: running this file wipes all data. Used by `npm run db:setup`.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------- Users (admin, staff, customer) ----------
CREATE TABLE users (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(120) NOT NULL,
  email               VARCHAR(160) NOT NULL,
  password_hash       TEXT NOT NULL,
  role                VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'customer')),
  company             VARCHAR(160),
  phone               VARCHAR(30),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  reset_token_hash    TEXT,
  reset_token_expires TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- one account per email, case insensitive
CREATE UNIQUE INDEX users_email_unique ON users (LOWER(email));
CREATE INDEX users_role_idx ON users (role);

-- ---------- Taxes (GST rules set by admin) ----------
CREATE TABLE taxes (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  rate       NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Products and variants ----------
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(160) NOT NULL,
  type        VARCHAR(20) NOT NULL DEFAULT 'service' CHECK (type IN ('service', 'goods')),
  sales_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sales_price >= 0),
  cost_price  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  notes       TEXT,
  is_addon    BOOLEAN NOT NULL DEFAULT FALSE,
  tax_id      INT REFERENCES taxes(id),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX products_name_idx ON products (LOWER(name));
CREATE INDEX products_addon_idx ON products (is_addon) WHERE active;

CREATE TABLE product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute   VARCHAR(60) NOT NULL,          -- e.g. Brand
  value       VARCHAR(60) NOT NULL,          -- e.g. Odoo
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0)
);
CREATE INDEX product_variants_product_idx ON product_variants (product_id);

-- ---------- Recurring plans ----------
CREATE TABLE plans (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(120) NOT NULL,
  price          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),   -- price per unit (seat) per billing period
  billing_period VARCHAR(10) NOT NULL CHECK (billing_period IN ('daily', 'weekly', 'monthly', 'yearly')),
  min_quantity   INT NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),        -- minimum seats on a subscription
  tax_id         INT REFERENCES taxes(id),                                -- GST rule applied to the plan fee
  description    TEXT,
  start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date       DATE,
  auto_close     BOOLEAN NOT NULL DEFAULT FALSE,
  closable       BOOLEAN NOT NULL DEFAULT TRUE,
  pausable       BOOLEAN NOT NULL DEFAULT FALSE,
  renewable      BOOLEAN NOT NULL DEFAULT TRUE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ---------- Quotation templates ----------
CREATE TABLE quotation_templates (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  validity_days INT NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  plan_id       INT NOT NULL REFERENCES plans(id),
  plan_quantity INT NOT NULL DEFAULT 1 CHECK (plan_quantity >= 1),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotation_template_lines (
  id          SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id),
  variant_id  INT REFERENCES product_variants(id),
  quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

-- ---------- Discounts (admin only) ----------
CREATE TABLE discounts (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  type         VARCHAR(10) NOT NULL CHECK (type IN ('percent', 'fixed')),
  value        NUMERIC(12,2) NOT NULL CHECK (value > 0),
  min_purchase NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  min_quantity INT NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  usage_limit  INT CHECK (usage_limit IS NULL OR usage_limit > 0),   -- NULL = unlimited
  used_count   INT NOT NULL DEFAULT 0,
  applies_to   VARCHAR(10) NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'products')),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK (type <> 'percent' OR value <= 100)
);

CREATE TABLE discount_products (
  discount_id INT NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

-- ---------- Subscriptions ----------
CREATE SEQUENCE subscription_number_seq START 1;

CREATE TABLE subscriptions (
  id                    SERIAL PRIMARY KEY,
  number                VARCHAR(20) NOT NULL UNIQUE,     -- SUB/00001
  customer_id           INT NOT NULL REFERENCES users(id),
  plan_id               INT NOT NULL REFERENCES plans(id),
  quantity              INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),   -- seats of the plan
  status                VARCHAR(12) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'paused', 'closed')),
  start_date            DATE NOT NULL,
  expiry_date           DATE,
  next_invoice_date     DATE,
  payment_terms_days    INT NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
  quotation_valid_until DATE,
  template_id           INT REFERENCES quotation_templates(id),
  notes                 TEXT,
  created_by            INT REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expiry_date IS NULL OR expiry_date >= start_date)
);
CREATE INDEX subscriptions_status_idx ON subscriptions (status);
CREATE INDEX subscriptions_customer_idx ON subscriptions (customer_id);
CREATE INDEX subscriptions_due_idx ON subscriptions (next_invoice_date) WHERE status = 'active';

CREATE TABLE subscription_lines (
  id              SERIAL PRIMARY KEY,
  subscription_id INT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id      INT NOT NULL REFERENCES products(id),
  variant_id      INT REFERENCES product_variants(id),
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_id          INT REFERENCES taxes(id)
);
CREATE INDEX subscription_lines_sub_idx ON subscription_lines (subscription_id);

-- ---------- Invoices ----------
CREATE SEQUENCE invoice_number_seq START 1;

CREATE TABLE invoices (
  id              SERIAL PRIMARY KEY,
  number          VARCHAR(20) NOT NULL UNIQUE,            -- INV/2026/00001
  subscription_id INT NOT NULL REFERENCES subscriptions(id),
  customer_id     INT NOT NULL REFERENCES users(id),
  status          VARCHAR(10) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'confirmed', 'paid', 'cancelled')),
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  untaxed_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  sent_at         TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,                          -- last payment reminder for an overdue invoice
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (amount_paid <= total)
);
-- The guarantee against double billing: one live invoice per subscription per billing period.
-- Cancelled invoices do not count, so a cancelled period can be billed again (never skipped).
CREATE UNIQUE INDEX invoices_one_per_period ON invoices (subscription_id, period_start) WHERE status <> 'cancelled';
CREATE INDEX invoices_subscription_idx ON invoices (subscription_id);
CREATE INDEX invoices_status_idx ON invoices (status);
CREATE INDEX invoices_customer_idx ON invoices (customer_id);
CREATE INDEX invoices_due_idx ON invoices (due_date) WHERE status = 'confirmed';
CREATE INDEX invoices_date_idx ON invoices (invoice_date);

CREATE TABLE invoice_lines (
  id              SERIAL PRIMARY KEY,
  invoice_id      INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id      INT REFERENCES products(id),
  description     VARCHAR(255) NOT NULL,
  quantity        INT NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_name        VARCHAR(60),
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12,2) NOT NULL,   -- after discount, before tax
  total           NUMERIC(12,2) NOT NULL    -- subtotal + tax
);
CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id);

CREATE TABLE invoice_discounts (
  invoice_id  INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  discount_id INT NOT NULL REFERENCES discounts(id),
  name        VARCHAR(120) NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  PRIMARY KEY (invoice_id, discount_id)
);

-- ---------- Payments ----------
CREATE TABLE payments (
  id           SERIAL PRIMARY KEY,
  invoice_id   INT NOT NULL REFERENCES invoices(id),
  method       VARCHAR(20) NOT NULL CHECK (method IN ('cash', 'upi', 'bank_transfer', 'card', 'cheque')),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  created_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_invoice_idx ON payments (invoice_id);
CREATE INDEX payments_date_idx ON payments (payment_date);

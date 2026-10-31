# SubFlow: Subscription Management System

**Odoo × FLUX Lucknow Hackathon '26 · Problem statement: Subscription Management System**

SubFlow is one web app that runs the full subscription business of **Brightloop Software**: products, recurring plans, quotations, subscriptions, automatic invoices, payments and revenue reports. It replaces spreadsheets, hand typed invoices and missed renewals with clear rules that the system follows every time.

```
Product → Plan → Quotation → Subscription → Invoice → Payment → Reports
```

---

## The problem

Brightloop sells software and services on monthly and yearly subscriptions. Today:
- Renewals are tracked in spreadsheets and get missed
- Invoices are typed by hand, so taxes and discounts are often wrong
- Payments are matched to invoices manually
- Nobody can see recurring revenue or overdue money at a glance
- Customers have to email the team for anything about their own subscription

## Who uses it

| Role | What they do |
|---|---|
| **Admin** | Controls the whole system. Sets up products, variants, recurring plans, tax rules and discount rules. Adds internal staff. |
| **Internal staff** | Day to day work: quotations, subscriptions, invoices, payments and follow ups. Limited access: cannot change taxes, discounts or staff. |
| **Customer** | Self service portal. Sees only their own subscriptions and invoices, and can manage them when the plan allows. |

Public signup always creates a customer. Staff accounts are created only by the admin.

---

## Features

**Status:** ✅ done · 🚧 in progress · ⬜ planned

| # | Module | Status |
|---|---|---|
| 1 | Project setup, full database schema, login, role based layout | ✅ |
| 2 | Signup with password rules, unique email, admin creates staff, customers, forgot password | ✅ |
| 3 | Products with variants, GST tax rules, recurring plans | ✅ |
| 4 | Quotation templates, subscriptions with order lines and status flow | ✅ |
| 5 | Automatic invoice generation, tax calculation, no double billing, confirm / cancel / send / print | ✅ |
| 6 | Payments (part payments, all methods), paid / outstanding / overdue tracking, payment reminders | ✅ |
| 7 | Discount rules applied automatically | ⬜ |
| 8 | Finance dashboard with filters | ⬜ |
| 9 | Customer portal: accept quotation, pause, resume, close, renew, add-ons | 🚧 (subscription actions done) |

### Business rules the system enforces
- **Password:** more than 8 characters, with one uppercase, one lowercase and one special character. Email must be unique.
- **Subscription flow:** Draft → Quotation → Confirmed → Active → Closed (plus Paused when the plan allows). Steps cannot be skipped.
- **Plan rules apply to everyone:** pause only if the plan is pausable, close before expiry only if closable, renew (adds one billing period to the expiry date) only if renewable.
- **Quotations expire:** a quotation can't be accepted after its validity date (template validity, default 30 days).
- **Invoice flow:** Draft → Confirmed → Paid, with Cancel allowed before payment.
- **No double billing, no skipped billing:** each subscription tracks its next invoice date; a unique index allows only one live invoice per subscription per billing period; the billing run catches up missed periods one by one; cancelling the latest invoice puts its period back in the queue.
- **Automatic billing:** runs at start-up and every hour (safe to repeat), plus a "Run billing" button for billing day. New invoices are drafts for the team to confirm.
- **Payments:** recorded against a confirmed invoice with method, amount, date and note; part payments allowed, overpayment blocked (row lock, safe even when two people record at once); the invoice turns Paid automatically. Only the admin can reverse a payment.
- **Overdue:** a confirmed invoice past its due date with money still due; the team can send a payment reminder.
- **Taxes** come from admin defined GST rules, never typed by hand.
- **Discounts** (fixed or percentage, minimum purchase or quantity, date range, usage limit) apply automatically to the next invoice and stop on their own when expired or used up.
- **Speed:** every list is paginated and backed by database indexes, so pages load in under 2 seconds with thousands of records.
- **Plans are priced per seat:** plan price × seats (at least the plan's minimum quantity), with product and add-on lines on top.
- **Currency:** Indian Rupees (₹) with Indian number format (₹1,25,000.00).

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind CSS v4 | Fast to build, responsive, works on mobile |
| Backend | Node.js + Express 5 | Our own REST APIs with role checks on every route |
| Database | PostgreSQL (plain SQL with `pg`) | Real constraints protect the money: unique billing periods, valid amounts, valid statuses |
| Auth | JWT + bcrypt | Secure password hashing and stateless sessions |
| Validation | zod | Every input is checked on the server, not only in the browser |

No external paid APIs. Everything runs locally, even without internet.

## Architecture

```
Browser (React)  Admin · Staff · Customer screens
      │  JSON over HTTP + JWT token
      ▼
Express API      role check middleware → route → business rules
      │          (billing, tax, discount and status logic)
      ▼
PostgreSQL       users, products, variants, taxes, plans, templates,
                 subscriptions, invoices, payments, discounts
```

---

## Run it locally (Mac)

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
# one time setup
brew install postgresql@16 node
brew services start postgresql@16
createdb subflow
```

**Backend** (terminal 1)
```bash
cd server
npm install
cp .env.example .env        # then set DATABASE_URL to your local Postgres
npm run db:setup            # creates tables and demo data (wipes old data)
npm run dev                 # API on http://localhost:4000
```

**Frontend** (terminal 2)
```bash
cd client
npm install
npm run dev                 # app on http://localhost:5173
```

On Windows or Linux, install Node and PostgreSQL from their websites, create the `subflow` database, and run the same commands.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@brightloop.in | Admin@1234 |
| Internal staff | staff@brightloop.in | Staff@1234 |
| Customer | customer@brightloop.in | Customer@1234 |

The login page also has one click buttons for these accounts.

---

## Project structure

```
subflow/
├── SPEC.md                  API contract, roles, status flows (team reference)
├── server/
│   ├── db/schema.sql        all tables, constraints and indexes
│   ├── db/setup.js          creates schema and demo data
│   └── src/
│       ├── index.js         Express app
│       ├── db.js            Postgres pool and transaction helper
│       ├── middleware/      login check, role check, error handler
│       ├── routes/          one file per module
│       └── utils/           validation, pagination, errors
└── client/
    └── src/
        ├── api/             API client with login token
        ├── context/         logged in user state
        ├── config/nav.js    sidebar menu per role
        ├── components/      layout and shared UI
        ├── pages/           one file per screen
        └── utils/           ₹ and date formatting
```

## API overview

All endpoints live under `/api` and return JSON. Full list with request and response shapes is in [SPEC.md](SPEC.md).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Catalog | `/products`, `/plans`, `/taxes`, `/discounts`, `/templates` |
| Sales | `/customers`, `/subscriptions`, `/subscriptions/:id/transition` |
| Billing | `/invoices`, `/billing/run`, `/payments` |
| Reports | `/reports/summary` |

---

## Team

| Member | Module ownership |
|---|---|
| Himanshu Karmakar | |
| | |
| | |
| | |

Built for the Odoo × FLUX Lucknow Hackathon '26 hosted at PW Institute of Innovation.

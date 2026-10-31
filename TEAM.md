# Team split

Each member owns one area: they must be able to explain it in 2 minutes and answer "why" questions about it.

| Member | Area | Files to know (server) | Files to know (client) |
|---|---|---|---|
| Abhishek Jain | Billing engine, invoices, payments, finance dashboard | `services/billing.js`, `routes/invoices.js`, `routes/payments.js`, `routes/reports.js`, `db/demo.js` | `pages/Invoices.jsx`, `pages/InvoiceDetail.jsx`, `pages/FinanceDashboard.jsx`, `components/RunBilling.jsx`, `components/RecordPayment.jsx` |
| Radhika | Auth, roles, users, customers, password reset | `routes/auth.js`, `routes/users.js`, `middleware/auth.js`, `utils/validation.js`, `utils/resetToken.js` | `pages/Login.jsx`, `pages/Signup.jsx`, `pages/ForgotPassword.jsx`, `pages/ResetPassword.jsx`, `pages/Users.jsx`, `pages/Customers.jsx`, `components/ProtectedRoute.jsx` |
| Vikash Kumar | Catalog: products, variants, plans, taxes, discounts | `routes/products.js`, `routes/plans.js`, `routes/taxes.js`, `routes/discounts.js`, `db/schema.sql` | `pages/Products.jsx`, `pages/Plans.jsx`, `pages/Taxes.jsx`, `pages/Discounts.jsx` |
| Kshiteesh Pandey | Subscriptions, quotation templates, status flow, customer portal | `routes/subscriptions.js`, `services/subscriptions.js`, `routes/templates.js` | `pages/Subscriptions.jsx`, `pages/SubscriptionForm.jsx`, `pages/SubscriptionDetail.jsx`, `pages/Templates.jsx`, `pages/CustomerDashboard.jsx`, `components/LinesEditor.jsx` |

## How each member gets ready (30 minutes)

1. Run the app (README, "Run it locally") and click through your area as Admin, Staff and Customer.
2. Read your files top to bottom. Every route starts with a comment saying what it does and who may call it.
3. Be ready for these questions:

**Auth and roles**
- Where is the password rule checked? (server `utils/validation.js`, client `components/PasswordRules.jsx` shows the same rules)
- How do you stop staff creating staff? (`requireRole('admin')` on `POST /api/users`; the UI hiding is only convenience)
- How is the reset link secured? (random token, only its SHA-256 hash stored, 60 minute expiry, single use)

**Catalog**
- How is a variant price computed? (sales price + variant extra price)
- Why can't a variant be deleted sometimes? (it is used on subscriptions, part of billing history)
- What does each plan rule do? (auto close, closable early, pausable, renewable: enforced in `services/subscriptions.js`)
- How is a discount picked? (`services/billing.js`: valid today, uses left, minimums met, best saving wins, before GST)

**Subscriptions**
- What are the statuses and who can move them? (`allowedActions` in `services/subscriptions.js`)
- What does a quotation template fill in? (plan, seats, product lines, validity days)
- What can a customer do? (accept a quotation, pause, resume, close, renew when the plan allows, add-ons on/off)

**Billing**
- How is double billing prevented? (row lock + unique index `invoices_one_per_period`)
- What happens when billing did not run for 3 months? (catch-up loop, one invoice per period)
- How is an invoice cancelled safely? (only the latest, unpaid; its period is billed again)

## Commit rule
Small commits from your own GitHub account with a clear message, for example
`fix(catalog): show margin as a percentage on the product form`. Never commit `server/.env` or `node_modules`.

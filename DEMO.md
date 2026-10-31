# Demo script (about 5 minutes)

Follows the problem statement's "month at Brightloop", scene by scene. Before recording:

```bash
cd server && npm run db:fresh && npm run dev     # terminal 1
cd client && npm run dev                         # terminal 2, open http://localhost:5173
```

Use the demo buttons on the login page to switch between Admin, Staff and Customer.

---

## 0. Opening (15 s)
"Subscription businesses run on spreadsheets: missed renewals, hand-typed invoices, nobody knows recurring revenue.
SubFlow runs the whole cycle in one place, for any company: product, plan, quotation, subscription, invoice, payment, report."

## 1. A new customer signs up (40 s)
- Login page → **Create an account**. Type a weak password: the checklist shows what is missing and the form refuses it.
- Use a strong password, sign up → the customer lands in **their own portal** (only their menu items).
- Log out. Try signing up again with the same email in CAPITALS → "already exists".
- **Forgot password** → reset link → new password works.
- Say: "Signup always creates a customer. Only the admin can add staff, and the server checks roles on every request, not just the buttons."

## 2. Launching a new plan (Admin, 40 s)
- **Products → Add product**: name, type, sales and cost price (margin shows), GST rule, notes.
- **Add variant** Brand: Odoo, extra ₹560 → final price updates live.
- **Plans → Add plan**: price per seat, bills every month, minimum seats, available dates, and the four rules
  (closes on its own, closable early, pausable, renewable).
- Log in as Staff and open a product: everything is read only.

## 3. Turning a quote into a subscription (Staff then Customer, 60 s)
- **Subscriptions → New subscription** → pick the template **Growing Team Pack**: plan, seats and lines fill in.
- Search the customer by name, show the live total with GST, **Create draft**.
- **Send quotation** → valid until date shown.
- Log in as the customer → dashboard says a quotation is waiting → **Accept quotation**.
- Back as Staff → **Activate**. Point at the status bar: Draft → Quotation → Confirmed → Active.
- Optional: try to Pause a **Business Yearly** subscription → refused, that plan is not pausable.

## 4. Billing day (50 s)
- **Invoices → Run billing** → "0 invoices created": everything is already billed (it also runs every hour).
- Open a subscription → **Create invoice now** → invoice with customer, plan line, product lines, GST and total filled in.
- The button disappears: the next period is not due yet. Say: "A unique index in the database allows one invoice per
  subscription per period, so nothing is billed twice, and missed periods are caught up one by one, so nothing is skipped."
- Invoice → **Confirm**, **Send**, **Print** (clean tax invoice, save as PDF).

## 5. A customer asks for a better price (Admin, 40 s)
- Log in as Staff → **Discounts**: view only. Log in as Admin → **Add discount**: fixed or %, minimum purchase or
  quantity, dates, usage limit, whole subscription or specific products.
- Open a qualifying subscription → green banner: "will be applied automatically to the next invoice".
- Open a discounted invoice: discount per line, taken before GST. On the rule card: uses so far / limit, "Used up" when it runs out.

## 6. The money comes in (40 s)
- Confirmed invoice → **Record payment**: UPI, part amount, UTR note → "₹X still due".
- Record the rest by bank transfer → invoice turns **Paid** on its own.
- **Invoices → Overdue** tab → open one → "Overdue by N days" → **Send reminder**.
- **Payments** page: totals by method, date filters.

## 7. The finance lead, end of month (40 s)
- **Dashboard**: active subscriptions, monthly recurring revenue, still owed, overdue; revenue collected and invoiced
  in the period; invoiced vs collected chart; overdue aging; top plans.
- Switch the period to **This financial year**, then filter by one plan.
- Point at **"Loaded in … ms"**: "5,000 subscriptions and nearly 20,000 invoices, every page well under the 2 second
  limit. The README has the measurements."

## Closing (15 s)
"Every rule from the problem statement is enforced on the server: roles, status flow, taxes, discounts, no double or
skipped billing, and it stays fast at scale."

---

## Likely judge questions

| Question | Answer |
|---|---|
| How do you prevent double billing? | Row lock on the subscription while billing, plus a partial unique index on (subscription, period start) for live invoices. Running billing twice creates nothing. |
| What if billing did not run for a while? | The billing run loops each subscription until it is up to date, one invoice per missed period. |
| What if an invoice was wrong? | Cancel it (only the latest, unpaid) and its period goes back in the queue to be billed again. |
| Why is the plan priced per seat? | The PDF's discount scene talks about "taking more seats", and the plan has a minimum quantity. |
| Several discounts qualify? | The customer gets the single best one, before GST, one use per invoice. |
| Is the demo data static JSON? | No. A seed script writes into our PostgreSQL database; every screen reads live through our API. `npm run db:setup` gives a clean small dataset. |
| Why is it fast? | Server-side pagination, indexes on status, customer and dates, and the dashboard is a handful of aggregate SQL queries. |
| Can staff give discounts? | No. Staff can view rules; creating or changing them returns 403 from the server. |

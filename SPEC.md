# SubFlow: Subscription Management System (generic; company name is a setting)

Single source of truth for backend and frontend. Every member pastes this into Claude before prompting.

## Stack
- Frontend: React 18 + Vite + Tailwind CSS v4 + React Router + axios (folder `client/`, port 5173)
- Backend: Node 20+ + Express + `pg` (plain SQL, no ORM) + JWT + bcrypt + zod + nodemailer (billing runs on startup and hourly via setInterval) (folder `server/`, port 4000)
- Database: PostgreSQL (local). Schema in `server/db/schema.sql`, seed via `npm run db:setup`, 5,000 demo subscriptions via `npm run db:demo`.
- Currency: INR (₹), Indian number format via `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`. Amounts stored as `NUMERIC(12,2)`.

## Roles
| Role | Access |
|---|---|
| admin | Everything. Only admin creates staff, products, plans, taxes, discounts. |
| staff | Customers, subscriptions, quotation templates, invoices, payments, billing run, reports. Read-only on products, plans, taxes, discounts. |
| customer | Portal. Only own subscriptions and invoices. Can pause / resume / close / renew own subscription if the plan allows it, and switch add-ons on/off. Public signup always creates a customer. |

## Status flows (enforced in backend)
- Subscription: `draft → quotation → confirmed → active → closed`. Extra: `active ⇄ paused` (only if plan.pausable). `close` from active/paused only if plan.closable, or once the subscription has expired (enforced for everyone). `renew` on active/closed (if plan.renewable) extends expiry by one billing period and sets status active.
- Invoice: `draft → confirmed → paid`. `cancel` allowed from draft/confirmed when no payments, and only for the latest invoice of the subscription (its period is billed again).
- No double billing: unique `(subscription_id, period_start)` on invoices + row lock during billing.

## API conventions
- Base URL `/api`. Auth header `Authorization: Bearer <token>`.
- JSON bodies and responses use camelCase. Dates are `YYYY-MM-DD` strings. Money is a JS number (2 decimals).
- Errors: HTTP 4xx/5xx with `{ "error": "Readable message", "details": {...optional field errors} }`.
- Paginated lists: query `page` (1-based), `pageSize` (default 20, max 100), `search`. Response `{ data: [...], page, pageSize, total }`.

## Endpoints

### Auth
| Method | Path | Who | Body / Query | Response |
|---|---|---|---|---|
| POST | /auth/signup | public | {name, email, password, company?, phone?} | {token, user} (role=customer) |
| POST | /auth/login | public | {email, password} | {token, user} |
| GET | /auth/me | any | | {user} |
| POST | /auth/forgot-password | public | {email} | {message, devResetLink?} (devResetLink only when SMTP not configured) |
| POST | /auth/reset-password | public | {token, password} | {message} |

user = `{id, name, email, role, company, phone, active}`
Password rule: length > 8, at least one uppercase, one lowercase, one special character. Email unique (case-insensitive).

### Users & customers
| GET | /users | admin | ?role&search&page | paginated users |
| POST | /users | admin | {name, email, password, role: 'staff'|'admin'} | user |
| PATCH | /users/:id/active | admin | {active} | user |
| GET | /customers | admin, staff | ?search&page | paginated users (role customer) |
| POST | /customers | admin, staff | {name, email, company?, phone?} | {user, devResetLink?} (customer sets password via reset link) |

### Taxes (admin write, staff read)
| GET | /taxes | | | [{id, name, rate, active}] (not paginated) |
| POST | /taxes | admin | {name, rate} | tax |
| PUT | /taxes/:id | admin | {name, rate, active} | tax |

### Products (admin write)
| GET | /products | any logged in | ?search&page&isAddon | paginated [{id, name, type, salesPrice, costPrice, notes, isAddon, taxId, taxName, active, variantCount}] |
| GET | /products/:id | | | product + variants [{id, attribute, value, extraPrice}] |
| POST | /products | admin | {name, type:'service'|'goods', salesPrice, costPrice, notes, isAddon, taxId, variants:[{attribute, value, extraPrice}]} | product |
| PUT | /products/:id | admin | same as POST + active (variants list replaces old ones; send variant id to keep) | product |

### Recurring plans (admin write)
| GET | /plans | any | ?active | [{id, name, price, billingPeriod, minQuantity, startDate, endDate, autoClose, closable, pausable, renewable, active}] |
| GET | /plans/:id | | | plan |
| POST | /plans | admin | {name, price, billingPeriod:'daily'|'weekly'|'monthly'|'quarterly'|'yearly', minQuantity, startDate, endDate?, autoClose, closable, pausable, renewable} | plan |
| PUT | /plans/:id | admin | same + active | plan |

### Quotation templates (admin, staff)
| GET | /templates | | | [{id, name, validityDays, planId, planName, lineCount}] |
| GET | /templates/:id | | | {id, name, validityDays, planId, planName, notes, lines:[{id, productId, productName, variantId, variantLabel, quantity}]} |
| POST | /templates | admin, staff | {name, validityDays, planId, notes, lines:[{productId, variantId?, quantity}]} | template |
| PUT | /templates/:id | admin, staff | same | template |

### Discounts (admin write, staff read)
| GET | /discounts | admin, staff | | [{id, name, type:'percent'|'fixed', value, minPurchase, minQuantity, startDate, endDate, usageLimit, usedCount, appliesTo:'all'|'products', productIds:[], active, isValidToday}] |
| POST | /discounts | admin | {name, type, value, minPurchase, minQuantity, startDate, endDate, usageLimit?, appliesTo, productIds} | discount |
| PUT | /discounts/:id | admin | same + active | discount |

Discount logic (applied automatically at invoice generation): valid if active, today between start and end, usedCount < usageLimit (null = unlimited), subscription subtotal ≥ minPurchase and total qty ≥ minQuantity. `appliesTo:'all'` discounts the whole invoice; `'products'` discounts only matching lines. Each invoice that uses a discount increments usedCount by 1. Discount is applied before tax.

### Subscriptions
| GET | /subscriptions | any (customer sees own) | ?status&search&customerId&page | paginated [{id, number, customerId, customerName, planId, planName, billingPeriod, startDate, expiryDate, nextInvoiceDate, status, total}] |
| GET | /subscriptions/:id | | | {id, number, status, customer:{id,name,email,company}, plan:{...full plan}, startDate, expiryDate, nextInvoiceDate, paymentTermsDays, quotationValidUntil, notes, lines:[{id, productId, productName, isAddon, variantId, variantLabel, quantity, unitPrice, taxId, taxName, taxRate, amount}], totals:{untaxed, tax, total}, invoices:[{id, number, status, invoiceDate, dueDate, total, amountDue}], allowedActions:[...]} |
| POST | /subscriptions | admin, staff | {customerId, planId, startDate, expiryDate?, paymentTermsDays, templateId?, notes, lines:[{productId, variantId?, quantity, unitPrice?, taxId?}]} | subscription (status draft). If templateId given and lines empty, lines are copied from template. unitPrice defaults to product.salesPrice + variant.extraPrice. expiryDate defaults to plan.endDate. |
| PUT | /subscriptions/:id | admin, staff | same as POST (only in draft/quotation) | subscription |
| POST | /subscriptions/:id/transition | see roles | {action: 'send_quotation'|'confirm'|'activate'|'pause'|'resume'|'close'|'renew'} | subscription |
| POST | /subscriptions/:id/lines | admin, staff, owner customer (add-ons only) | {productId, variantId?, quantity} | subscription |
| DELETE | /subscriptions/:id/lines/:lineId | admin, staff, owner customer (add-ons only) | | subscription |
| POST | /invoices/for-subscription/:id | admin, staff | | invoice (creates the invoice for this subscription's period that is due) |

`allowedActions` = list of action strings the current user may perform now (frontend shows only these buttons).

### Invoices
| GET | /invoices | any (customer sees own) | ?status&search&customerId&overdue=true&page | paginated [{id, number, customerId, customerName, subscriptionId, subscriptionNumber, invoiceDate, dueDate, status, total, amountPaid, amountDue, isOverdue}] |
| GET | /invoices/:id | | | {id, number, status, invoiceDate, dueDate, periodStart, periodEnd, sentAt, customer:{id,name,email,company,phone}, subscription:{id,number}, lines:[{id, description, quantity, unitPrice, discountAmount, taxName, taxRate, taxAmount, subtotal, total}], totals:{untaxed, discount, tax, total, paid, due}, discountsApplied:[{name, amount}], payments:[...], isOverdue, allowedActions} |
| POST | /invoices/:id/confirm | admin, staff | | invoice |
| POST | /invoices/:id/cancel | admin, staff | | invoice |
| POST | /invoices/:id/send | admin, staff | | invoice (emails customer, sets sentAt; confirms draft first) |
| POST | /invoices/run-billing | admin, staff | {date?} | {created, skipped, invoices:[{id, number, total}]} — generates invoices for every active subscription with nextInvoiceDate ≤ date |

### Payments
| GET | /payments | admin, staff (customer sees own) | ?method&search&page | paginated [{id, invoiceId, invoiceNumber, customerName, method, amount, paymentDate, note}] |
| POST | /payments | admin, staff | {invoiceId, method:'cash'|'upi'|'bank_transfer'|'card'|'cheque', amount, paymentDate, note} | payment. Invoice must be confirmed; amount ≤ amountDue; invoice becomes paid when fully paid. |

### Reports
| GET | /reports/summary | admin, staff | ?from&to | {activeSubscriptions, mrr, revenue, outstanding, overdueAmount, overdueCount, subscriptionsByStatus:{draft,quotation,confirmed,active,paused,closed}, invoicesByStatus:{draft,confirmed,paid,cancelled}, revenueByMonth:[{month:'2026-05', amount}], topPlans:[{planName, count, mrr}]} |

## Demo accounts (seed)
- admin@subflow.app / Admin@1234
- staff@subflow.app / Staff@1234
- customer@subflow.app / Customer@1234

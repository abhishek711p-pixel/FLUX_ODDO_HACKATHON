import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, asyncHandler, toCamel } from '../utils/http.js';
import { round2, todayISO } from '../utils/periods.js';

// Finance dashboard: one place for active subscriptions, revenue, payments and overdue invoices.
// Every number is a single aggregate SQL query over indexed columns, so it stays fast with thousands of rows.
const router = Router();
router.use(requireAuth);

// ['2026-05', ..., '2026-10'] ending with the month of `date`
function lastSixMonths(date) {
  const [y, m] = date.split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

// Monthly value of one subscription (plan seats + product lines, before tax and discounts)
const MONTHLY_FACTOR = `CASE p.billing_period WHEN 'daily' THEN 30.0 WHEN 'weekly' THEN 52.0 / 12 WHEN 'monthly' THEN 1.0 WHEN 'quarterly' THEN 1.0 / 3 ELSE 1.0 / 12 END`;
const SUB_VALUE = `(p.price * s.quantity + COALESCE((SELECT SUM(sl.quantity * sl.unit_price) FROM subscription_lines sl WHERE sl.subscription_id = s.id), 0))`;

// GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&planId=
// from/to filter the money that moved in the period (revenue, invoiced, new subscriptions).
// "Right now" numbers (active, MRR, outstanding, overdue) are always as of today, optionally for one plan.
router.get(
  '/summary',
  requireRole('admin', 'staff'),
  asyncHandler(async (req, res) => {
    const today = todayISO();
    const to = isDate(req.query.to) ? req.query.to : today;
    const from = isDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
    if (from > to) throw new HttpError(400, 'The start date must be before the end date');
    const planId = /^\d+$/.test(req.query.planId || '') ? Number(req.query.planId) : null;

    // $1 today, $2 from, $3 to, $4 plan (null = all plans)
    const params = [today, from, to, planId];
    const planSub = '($4::int IS NULL OR s.plan_id = $4)';

    const [subs, money, period, months, plans, overdue, aging, recent, methods, upcoming] = await Promise.all([
      // Subscriptions right now
      query(
        `SELECT s.status, COUNT(*) AS n,
                COALESCE(SUM(${SUB_VALUE} * ${MONTHLY_FACTOR}) FILTER (WHERE s.status = 'active'), 0) AS mrr,
                COUNT(*) FILTER (WHERE s.status = 'active' AND s.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS expiring
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE ${planSub} AND $1::date IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL
         GROUP BY s.status`,
        params
      ),
      // Money owed right now
      query(
        `SELECT COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE i.status = 'confirmed'), 0) AS outstanding,
                COUNT(*) FILTER (WHERE i.status = 'confirmed' AND i.total > i.amount_paid) AS unpaid_count,
                COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE i.status = 'confirmed' AND i.due_date < $1), 0) AS overdue_amount,
                COUNT(*) FILTER (WHERE i.status = 'confirmed' AND i.due_date < $1 AND i.total > i.amount_paid) AS overdue_count,
                COUNT(*) FILTER (WHERE i.status = 'confirmed' AND i.due_date < $1 AND i.total > i.amount_paid
                                 AND (i.reminder_sent_at IS NULL OR i.reminder_sent_at < NOW() - INTERVAL '7 days')) AS to_remind_count,
                COUNT(*) FILTER (WHERE i.status = 'draft') AS draft_count
         FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
         WHERE ${planSub} AND $2::date IS NOT NULL AND $3::date IS NOT NULL`,
        params
      ),
      // What happened in the selected period
      query(
        `SELECT
           (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN subscriptions s ON s.id = i.subscription_id
             WHERE pay.payment_date BETWEEN $2 AND $3 AND ${planSub}) AS revenue,
           (SELECT COUNT(*) FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN subscriptions s ON s.id = i.subscription_id
             WHERE pay.payment_date BETWEEN $2 AND $3 AND ${planSub}) AS payment_count,
           (SELECT COALESCE(SUM(i.total), 0) FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
             WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN $2 AND $3 AND ${planSub}) AS invoiced,
           (SELECT COALESCE(SUM(i.tax_amount), 0) FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
             WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN $2 AND $3 AND ${planSub}) AS tax,
           (SELECT COALESCE(SUM(i.discount_amount), 0) FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
             WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date BETWEEN $2 AND $3 AND ${planSub}) AS discounts,
           (SELECT COUNT(*) FROM subscriptions s WHERE s.created_at::date BETWEEN $2 AND $3 AND ${planSub}) AS new_subscriptions,
           ($1::date IS NOT NULL) AS ok`,
        params
      ),
      // Last 6 months up to the end date: invoiced vs collected (one grouped query each, using the date indexes)
      query(
        `WITH r AS (SELECT (date_trunc('month', $3::date) - interval '5 months')::date AS start, (date_trunc('month', $3::date) + interval '1 month')::date AS stop)
         SELECT 'invoiced' AS kind, to_char(date_trunc('month', i.invoice_date), 'YYYY-MM') AS month, SUM(i.total) AS amount
         FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id, r
         WHERE i.status IN ('confirmed', 'paid') AND i.invoice_date >= r.start AND i.invoice_date < r.stop AND ${planSub}
           AND $1::date IS NOT NULL AND $2::date IS NOT NULL
         GROUP BY 2
         UNION ALL
         SELECT 'collected', to_char(date_trunc('month', pay.payment_date), 'YYYY-MM'), SUM(pay.amount)
         FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN subscriptions s ON s.id = i.subscription_id, r
         WHERE pay.payment_date >= r.start AND pay.payment_date < r.stop AND ${planSub}
         GROUP BY 2
         UNION ALL
         SELECT 'subs', to_char(date_trunc('month', s.created_at), 'YYYY-MM'), COUNT(*)
         FROM subscriptions s, r
         WHERE s.created_at >= r.start AND s.created_at < r.stop AND ${planSub}
         GROUP BY 2`,
        params
      ),
      // Plans by active subscriptions and monthly value
      query(
        `SELECT p.id, p.name, p.billing_period, COUNT(s.id) AS active,
                COALESCE(SUM(${SUB_VALUE} * ${MONTHLY_FACTOR}), 0) AS mrr
         FROM plans p LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'active'
         WHERE ($4::int IS NULL OR p.id = $4) AND $1::date IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL
         GROUP BY p.id ORDER BY mrr DESC, active DESC LIMIT 6`,
        params
      ),
      // Overdue invoices to chase, oldest first
      query(
        `SELECT i.id, i.number, c.name AS customer_name, c.company AS customer_company, c.email AS customer_email,
                i.due_date, $1::date - i.due_date AS days_overdue, i.total - i.amount_paid AS amount_due, i.reminder_sent_at
         FROM invoices i JOIN users c ON c.id = i.customer_id JOIN subscriptions s ON s.id = i.subscription_id
         WHERE i.status = 'confirmed' AND i.due_date < $1 AND i.total > i.amount_paid AND ${planSub}
           AND $2::date IS NOT NULL AND $3::date IS NOT NULL
         ORDER BY i.due_date, i.id LIMIT 8`,
        params
      ),
      // Overdue aging buckets
      query(
        `SELECT COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE $1::date - i.due_date BETWEEN 1 AND 30), 0) AS d30,
                COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE $1::date - i.due_date BETWEEN 31 AND 60), 0) AS d60,
                COALESCE(SUM(i.total - i.amount_paid) FILTER (WHERE $1::date - i.due_date > 60), 0) AS d60plus
         FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
         WHERE i.status = 'confirmed' AND i.due_date < $1 AND i.total > i.amount_paid AND ${planSub}
           AND $2::date IS NOT NULL AND $3::date IS NOT NULL`,
        params
      ),
      // Latest payments in the period
      query(
        `SELECT pay.id, pay.amount, pay.method, pay.payment_date, i.id AS invoice_id, i.number AS invoice_number, c.name AS customer_name
         FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN users c ON c.id = i.customer_id JOIN subscriptions s ON s.id = i.subscription_id
         WHERE pay.payment_date BETWEEN $2 AND $3 AND ${planSub} AND $1::date IS NOT NULL
         ORDER BY pay.payment_date DESC, pay.id DESC LIMIT 6`,
        params
      ),
      // Money collected in the period, by payment method
      query(
        `SELECT pay.method, SUM(pay.amount) AS amount, COUNT(*) AS n
         FROM payments pay JOIN invoices i ON i.id = pay.invoice_id JOIN subscriptions s ON s.id = i.subscription_id
         WHERE pay.payment_date BETWEEN $2 AND $3 AND ${planSub} AND $1::date IS NOT NULL
         GROUP BY pay.method ORDER BY 2 DESC`,
        params
      ),
      // Upcoming billing: active subscriptions due in the next 7 days (amount before GST)
      query(
        `SELECT s.id, s.number, c.name AS customer_name, p.name AS plan_name, s.next_invoice_date,
                ROUND(${SUB_VALUE}, 2) AS amount,
                COUNT(*) OVER () AS total_count, SUM(${SUB_VALUE}) OVER () AS total_amount
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN users c ON c.id = s.customer_id
         WHERE s.status = 'active' AND s.next_invoice_date BETWEEN $1 AND $1::date + 7
           AND (s.expiry_date IS NULL OR s.next_invoice_date <= s.expiry_date) AND ${planSub}
           AND $2::date IS NOT NULL AND $3::date IS NOT NULL
         ORDER BY s.next_invoice_date, s.id LIMIT 6`,
        params
      ),
    ]);

    const byStatus = { draft: 0, quotation: 0, confirmed: 0, active: 0, paused: 0, closed: 0 };
    let mrr = 0;
    for (const r of subs.rows) {
      byStatus[r.status] = r.n;
      mrr += Number(r.mrr);
    }
    const m = money.rows[0];
    const p = period.rows[0];
    const a = aging.rows[0];
    res.json({
      filters: { from, to, planId, today },
      activeSubscriptions: byStatus.active,
      expiringSoon: subs.rows.reduce((x, r) => x + Number(r.expiring || 0), 0),
      pausedSubscriptions: byStatus.paused,
      subscriptionsByStatus: byStatus,
      mrr: round2(mrr),
      arr: round2(mrr * 12),
      revenue: Number(p.revenue),
      paymentCount: p.payment_count,
      invoiced: Number(p.invoiced),
      taxCollected: Number(p.tax),
      discountsGiven: Number(p.discounts),
      newSubscriptions: p.new_subscriptions,
      outstanding: Number(m.outstanding),
      unpaidCount: m.unpaid_count,
      overdueAmount: Number(m.overdue_amount),
      overdueCount: m.overdue_count,
      toRemindCount: m.to_remind_count,
      draftInvoices: m.draft_count,
      overdueAging: { upTo30: Number(a.d30), upTo60: Number(a.d60), over60: Number(a.d60plus) },
      revenueByMonth: lastSixMonths(to).map((month) => ({
        month,
        invoiced: Number(months.rows.find((r) => r.kind === 'invoiced' && r.month === month)?.amount || 0),
        collected: Number(months.rows.find((r) => r.kind === 'collected' && r.month === month)?.amount || 0),
        newSubscriptions: Number(months.rows.find((r) => r.kind === 'subs' && r.month === month)?.amount || 0),
      })),
      paymentsByMethod: methods.rows.map((r) => ({ method: r.method, amount: Number(r.amount), count: Number(r.n) })),
      topPlans: plans.rows.map((r) => ({ ...toCamel(r), mrr: round2(r.mrr) })),
      overdueInvoices: overdue.rows.map(toCamel),
      recentPayments: recent.rows.map(toCamel),
      upcomingBilling: {
        count: Number(upcoming.rows[0]?.total_count || 0),
        amount: round2(Number(upcoming.rows[0]?.total_amount || 0)),
        items: upcoming.rows.map((r) => ({ id: r.id, number: r.number, customerName: r.customer_name, planName: r.plan_name, nextInvoiceDate: r.next_invoice_date, amount: Number(r.amount) })),
      },
    });
  })
);

// GET /api/reports/mine   A customer's own billing picture: last 6 months billed vs paid, and spend by plan.
// Always scoped to the logged-in user, so nobody can see another customer's numbers.
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const today = todayISO();
    const me = req.user.id;
    const [months, byPlan] = await Promise.all([
      query(
        `WITH r AS (SELECT (date_trunc('month', $1::date) - interval '5 months')::date AS start, (date_trunc('month', $1::date) + interval '1 month')::date AS stop)
         SELECT 'billed' AS kind, to_char(date_trunc('month', i.invoice_date), 'YYYY-MM') AS month, SUM(i.total) AS amount
         FROM invoices i, r
         WHERE i.customer_id = $2 AND i.status IN ('confirmed', 'paid') AND i.invoice_date >= r.start AND i.invoice_date < r.stop
         GROUP BY 2
         UNION ALL
         SELECT 'paid', to_char(date_trunc('month', pay.payment_date), 'YYYY-MM'), SUM(pay.amount)
         FROM payments pay JOIN invoices i ON i.id = pay.invoice_id, r
         WHERE i.customer_id = $2 AND pay.payment_date >= r.start AND pay.payment_date < r.stop
         GROUP BY 2`,
        [today, me]
      ),
      query(
        `SELECT p.name AS plan_name, SUM(i.total) AS amount
         FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id JOIN plans p ON p.id = s.plan_id
         WHERE i.customer_id = $1 AND i.status IN ('confirmed', 'paid')
         GROUP BY p.name ORDER BY 2 DESC`,
        [me]
      ),
    ]);
    res.json({
      byMonth: lastSixMonths(today).map((month) => ({
        month,
        billed: Number(months.rows.find((r) => r.kind === 'billed' && r.month === month)?.amount || 0),
        paid: Number(months.rows.find((r) => r.kind === 'paid' && r.month === month)?.amount || 0),
      })),
      byPlan: byPlan.rows.map((r) => ({ planName: r.plan_name, amount: Number(r.amount) })),
    });
  })
);

export default router;

// Billing period helpers. Dates are plain 'YYYY-MM-DD' strings (no timezone surprises).

// Postgres interval for one billing period
export const PERIOD_INTERVAL = { daily: '1 day', weekly: '7 days', monthly: '1 month', yearly: '1 year' };

// Today in India time as 'YYYY-MM-DD' (billing days follow the Indian calendar)
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// Add whole days to a 'YYYY-MM-DD' date
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Add one (or n) billing periods to a 'YYYY-MM-DD' date.
// Month/year steps keep the day of month where possible (31 Jan + 1 month = 28/29 Feb).
// anchorDay (the subscription's start day) stops drift: 31 Jan -> 28 Feb -> 31 Mar, not 28 Mar.
export function addPeriod(date, period, n = 1, anchorDay = null) {
  const d = new Date(`${date}T00:00:00Z`);
  if (period === 'daily') return addDays(date, n);
  if (period === 'weekly') return addDays(date, 7 * n);
  const months = period === 'monthly' ? n : 12 * n;
  const day = anchorDay || d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

// Money: round to paise
// toPrecision removes floating point noise first, so 213.49999999999997 paise becomes 213.5 and rounds to 214
export const round2 = (n) => Math.round(Number((Number(n) * 100).toPrecision(15))) / 100;

// Day of month of a 'YYYY-MM-DD' date (billing anchor)
export const dayOf = (date) => Number(String(date).slice(8, 10));

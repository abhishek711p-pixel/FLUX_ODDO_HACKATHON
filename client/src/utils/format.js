const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

// 125000 -> ₹1,25,000.00
export const formatINR = (amount) => inr.format(Number(amount) || 0);

// '2026-10-31' -> 31 Oct 2026
export function formatDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Today as 'YYYY-MM-DD' in local time
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ROLE_LABELS = { admin: 'Admin', staff: 'Internal Staff', customer: 'Customer' };

export const PERIOD_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
export const PER_PERIOD = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

// Subscription status: label + badge colour
export const SUB_STATUS = {
  draft: { label: 'Draft', color: 'gray' },
  quotation: { label: 'Quotation', color: 'blue' },
  confirmed: { label: 'Confirmed', color: 'violet' },
  active: { label: 'Active', color: 'green' },
  paused: { label: 'Paused', color: 'amber' },
  closed: { label: 'Closed', color: 'red' },
};

// Invoice status: label + badge colour
export const INVOICE_STATUS = {
  draft: { label: 'Draft', color: 'gray' },
  confirmed: { label: 'Confirmed', color: 'blue' },
  paid: { label: 'Paid', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

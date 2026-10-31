// Sidebar menu. Each item lists the roles allowed to see it.
// Add new pages here as modules are built.
// `section` groups the internal menu so a judge sees the business workflow at a glance.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'grid', roles: ['admin', 'staff', 'customer'] },
  { to: '/customers', label: 'Customers', icon: 'users', roles: ['admin', 'staff'], section: 'Sales' },
  { to: '/templates', label: 'Quotation templates', icon: 'file', roles: ['admin', 'staff'], section: 'Sales' },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat', roles: ['admin', 'staff'], section: 'Sales' },
  { to: '/invoices', label: 'Invoices', icon: 'receipt', roles: ['admin', 'staff'], section: 'Billing' },
  { to: '/payments', label: 'Payments', icon: 'wallet', roles: ['admin', 'staff'], section: 'Billing' },
  { to: '/products', label: 'Products', icon: 'box', roles: ['admin', 'staff'], section: 'Catalog' },
  { to: '/plans', label: 'Plans', icon: 'calendar', roles: ['admin', 'staff'], section: 'Catalog' },
  { to: '/discounts', label: 'Discounts', icon: 'tag', roles: ['admin', 'staff'], section: 'Catalog' },
  { to: '/taxes', label: 'Taxes', icon: 'percent', roles: ['admin', 'staff'], section: 'Catalog' },
  { to: '/activity', label: 'Activity log', icon: 'history', roles: ['admin', 'staff'], section: 'Settings' },
  { to: '/team', label: 'Team and roles', icon: 'shield', roles: ['admin'], section: 'Settings' },
  { to: '/subscriptions', label: 'My subscriptions', icon: 'repeat', roles: ['customer'] },
  { to: '/invoices', label: 'My invoices', icon: 'receipt', roles: ['customer'] },
  { to: '/payments', label: 'My payments', icon: 'wallet', roles: ['customer'] },
];

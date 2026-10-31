// Sidebar menu. Each item lists the roles allowed to see it.
// Add new pages here as modules are built.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'grid', roles: ['admin', 'staff', 'customer'] },
  { to: '/subscriptions', label: 'Subscriptions', icon: 'repeat', roles: ['admin', 'staff'] },
  { to: '/subscriptions', label: 'My subscriptions', icon: 'repeat', roles: ['customer'] },
  { to: '/invoices', label: 'Invoices', icon: 'receipt', roles: ['admin', 'staff'] },
  { to: '/invoices', label: 'My invoices', icon: 'receipt', roles: ['customer'] },
  { to: '/payments', label: 'Payments', icon: 'wallet', roles: ['admin', 'staff'] },
  { to: '/payments', label: 'My payments', icon: 'wallet', roles: ['customer'] },
  { to: '/templates', label: 'Quotation templates', icon: 'file', roles: ['admin', 'staff'] },
  { to: '/customers', label: 'Customers', icon: 'users', roles: ['admin', 'staff'] },
  { to: '/products', label: 'Products', icon: 'box', roles: ['admin', 'staff'] },
  { to: '/plans', label: 'Plans', icon: 'calendar', roles: ['admin', 'staff'] },
  { to: '/discounts', label: 'Discounts', icon: 'tag', roles: ['admin', 'staff'] },
  { to: '/taxes', label: 'Taxes', icon: 'percent', roles: ['admin', 'staff'] },
  { to: '/team', label: 'Team', icon: 'shield', roles: ['admin'] },
];

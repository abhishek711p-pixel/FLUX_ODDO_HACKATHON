import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { NAV_ITEMS } from '../config/nav.js';
import { ROLE_LABELS } from '../utils/format.js';
import Icon from './Icon.jsx';
import { useCompany } from '../hooks/useCompany.js';

export function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${light ? 'bg-brand-600' : 'bg-brand-600'} text-white`}>
        <Icon name="loop" className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className={`font-display text-base font-bold ${light ? 'text-white' : 'text-brand-900'}`}>SubFlow</div>
        <div className={`text-xs ${light ? 'text-brand-200' : 'text-slate-500'}`}>Subscription billing</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const company = useCompany();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const sidebar = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition ${
              isActive ? 'bg-brand-600 font-semibold text-white shadow-sm' : 'text-brand-900/75 hover:bg-brand-50 hover:text-brand-900'
            }`
          }
        >
          <Icon name={item.icon} className="h-4.5 w-4.5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar: fixed on desktop, slide-in on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200 bg-white py-5 transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between px-5">
          <Logo />
          <button className="text-slate-500 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>
        {sidebar}
        <div className="mx-3 mt-4 rounded-[10px] border border-slate-200 bg-cloud p-3">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-slate-500">{user.email}</div>
          <button onClick={handleLogout} className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-red-600">
            <Icon name="logout" className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button className="text-slate-600 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">{company.companyName}</div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            {ROLE_LABELS[user.role]}
          </span>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

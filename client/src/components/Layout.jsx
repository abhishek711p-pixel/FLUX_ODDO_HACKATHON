import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { NAV_ITEMS } from '../config/nav.js';
import { ROLE_LABELS } from '../utils/format.js';
import Icon from './Icon.jsx';
import { CrumbProvider, useCrumbValue } from '../context/CrumbContext.jsx';

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

// Top bar breadcrumb: section from the menu, then the page or record (e.g. Invoices › INV/2026/18780)
function Breadcrumb({ items }) {
  const { pathname } = useLocation();
  const record = useCrumbValue();
  const section = items
    .filter((i) => (i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(`${i.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const parts = pathname.split('/').filter(Boolean);
  let page = '';
  if (parts[1] === 'new') page = 'New';
  else if (parts[2] === 'edit') page = record ? `Edit ${record}` : 'Edit';
  else if (parts[1]) page = record || 'Details';
  const title = section ? section.label : 'SubFlow';
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
      {page && section ? (
        <Link to={section.to} className="shrink-0 text-slate-500 transition hover:text-brand-700">{title}</Link>
      ) : (
        <span className="truncate font-semibold text-ink">{title}</span>
      )}
      {page && (
        <>
          <span className="text-slate-300">›</span>
          <span className="truncate font-semibold text-ink">{page}</span>
        </>
      )}
    </nav>
  );
}

export default function Layout() {
  return (
    <CrumbProvider>
      <LayoutFrame />
    </CrumbProvider>
  );
}

function LayoutFrame() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // mobile: slide-in menu
  // Desktop: the hamburger shows or hides the sidebar. Remembered in this browser.
  const [desktopOpen, setDesktopOpen] = useState(() => {
    try { return localStorage.getItem('subflow_sidebar') !== 'closed'; } catch { return true; }
  });
  function toggleMenu() {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setDesktopOpen((v) => {
        try { localStorage.setItem('subflow_sidebar', v ? 'closed' : 'open'); } catch { /* storage blocked: still works for this visit */ }
        return !v;
      });
    } else {
      setOpen((v) => !v);
    }
  }
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
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200 bg-white py-5 transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${desktopOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`}
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

      <div className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ${desktopOpen ? 'lg:pl-60' : 'lg:pl-0'}`}>
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={toggleMenu}
              className="rounded-[10px] p-2 text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
              aria-label={desktopOpen ? 'Hide menu' : 'Show menu'} title={desktopOpen ? 'Hide menu' : 'Show menu'}>
              <Icon name="menu" />
            </button>
            {!desktopOpen && <span className="hidden border-r border-slate-200 pr-4 lg:block"><Logo /></span>}
            <Breadcrumb items={items} />
          </div>
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

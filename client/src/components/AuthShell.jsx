import { Logo } from './Layout.jsx';
import Icon from './Icon.jsx';

// Two-column frame shared by login, signup, forgot and reset password pages
export default function AuthShell({ children }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <Logo light />
        <div>
          <h1 className="text-3xl font-semibold leading-tight">
            Plans, subscriptions and recurring billing in one place.
          </h1>
          <ul className="mt-8 space-y-3 text-brand-100">
            {['Invoices created automatically on billing day', 'Taxes and discounts applied by rule, never by memory', 'Know your recurring revenue at any moment'].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand-200" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-brand-200">SubFlow · Subscription billing for any business</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import AuthShell from '../components/AuthShell.jsx';
import { Alert } from '../components/ui.jsx';

// Quick-fill buttons for the demo (seeded accounts)
const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@subflow.app', password: 'Admin@1234' },
  { role: 'Staff', email: 'staff@subflow.app', password: 'Staff@1234' },
  { role: 'Customer', email: 'customer@subflow.app', password: 'Customer@1234' },
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.email.trim(), form.password);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold">Welcome back</h2>
      <p className="mt-1 text-sm text-slate-500">Log in to manage subscriptions and billing.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" autoComplete="email" placeholder="you@company.com"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">Password</label>
            <Link to="/forgot-password" className="text-xs font-medium text-brand-700 hover:underline">Forgot password?</Link>
          </div>
          <input id="password" type="password" className="input" autoComplete="current-password"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <Alert>{error}</Alert>
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        New customer? <Link to="/signup" className="font-medium text-brand-700 hover:underline">Create an account</Link>
      </p>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Demo accounts</p>
        <div className="grid grid-cols-3 gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button key={acc.role} type="button" className="btn-secondary px-2 text-xs"
              onClick={() => setForm({ email: acc.email, password: acc.password })}>
              {acc.role}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

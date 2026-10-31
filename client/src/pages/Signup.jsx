import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import PasswordRules, { isStrongPassword } from '../components/PasswordRules.jsx';
import { Alert, Field } from '../components/ui.jsx';

// Public signup. The server always creates a CUSTOMER account here.
export default function Signup() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', company: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function checkForm() {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email';
    if (!isStrongPassword(form.password)) next.password = 'Password does not meet all the rules';
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!checkForm()) return;
    setSubmitting(true);
    try {
      const { confirm, ...body } = form;
      const res = await api.post('/auth/signup', body);
      setSession(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setErrors(err.response?.data?.details || {});
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold">Create your account</h2>
      <p className="mt-1 text-sm text-slate-500">See and manage your subscriptions and invoices in one place.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <Field id="name" label="Full name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="name" />
        <Field id="email" type="email" label="Email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <div className="grid grid-cols-2 gap-3">
          <Field id="company" label="Company (optional)" value={form.company} onChange={set('company')} error={errors.company} />
          <Field id="phone" label="Phone (optional)" value={form.phone} onChange={set('phone')} error={errors.phone} />
        </div>
        <div>
          <Field id="password" type="password" label="Password" value={form.password} onChange={set('password')}
            error={errors.password} autoComplete="new-password" />
          <PasswordRules password={form.password} />
        </div>
        <Field id="confirm" type="password" label="Confirm password" value={form.confirm} onChange={set('confirm')}
          error={errors.confirm} autoComplete="new-password" />
        <Alert>{error}</Alert>
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account? <Link to="/login" className="font-medium text-brand-700 hover:underline">Log in</Link>
      </p>
    </AuthShell>
  );
}

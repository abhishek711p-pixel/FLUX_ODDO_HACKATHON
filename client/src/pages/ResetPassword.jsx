import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import AuthShell from '../components/AuthShell.jsx';
import PasswordRules, { isStrongPassword } from '../components/PasswordRules.jsx';
import { Alert, Field } from '../components/ui.jsx';

// Opened from the email link: /reset-password?token=...
// Also used by new customers (added by staff) to set their first password.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!isStrongPassword(password)) return setError('Password does not meet all the rules');
    if (password !== confirm) return setError('Passwords do not match');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', { token, password });
      setDone(res.data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold">Set a new password</h2>
      <p className="mt-1 text-sm text-slate-500">Choose a strong password for your account.</p>

      {!token ? (
        <div className="mt-6"><Alert>This link is missing its token. Please request a new reset link.</Alert></div>
      ) : done ? (
        <div className="mt-6 space-y-4">
          <Alert type="success">{done}</Alert>
          <Link to="/login" className="btn-primary w-full">Go to log in</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <Field id="password" type="password" label="New password" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <PasswordRules password={password} />
          </div>
          <Field id="confirm" type="password" label="Confirm new password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          <Alert>{error}</Alert>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">Request a new link</Link>
      </p>
    </AuthShell>
  );
}

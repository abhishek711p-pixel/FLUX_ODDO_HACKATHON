import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api/client.js';
import AuthShell from '../components/AuthShell.jsx';
import { Alert, Field } from '../components/ui.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      setResult(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="text-2xl font-semibold">Reset your password</h2>
      <p className="mt-1 text-sm text-slate-500">Enter your account email and we will send you a reset link.</p>

      {result ? (
        <div className="mt-6 space-y-4">
          <Alert type="success">{result.message}</Alert>
          {result.devResetLink && (
            <Alert type="info">
              <span className="font-medium">Demo mode (email not configured):</span>{' '}
              <a href={result.devResetLink} className="break-all font-medium underline">open the reset link</a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <Field id="email" type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Alert>{error}</Alert>
          <button type="submit" className="btn-primary w-full" disabled={submitting || !email}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-brand-700 hover:underline">Back to log in</Link>
      </p>
    </AuthShell>
  );
}

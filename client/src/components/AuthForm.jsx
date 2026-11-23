import { useState } from 'react';
import { api, setToken } from '../api';
import { validatePassword } from '../validate';

const TITLES = {
  login: 'Log in',
  register: 'Create account',
  forgot: 'Forgot password',
  reset: 'Set a new password',
};
const BUTTONS = {
  login: 'Log in',
  register: 'Sign up',
  forgot: 'Send reset link',
  reset: 'Update password',
};

export default function AuthForm({ onAuth }) {
  // A reset link looks like  http://localhost:5173/?reset=<token>
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset'));
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const showName = mode === 'register';
  const showEmail = mode !== 'reset';
  const showPassword = mode !== 'forgot';
  const showConfirm = mode === 'register' || mode === 'reset';

  function go(next, message = '') {
    setMode(next);
    setError('');
    setSuccess(message);
    setShowPw(false);
    setForm((f) => ({ ...f, password: '', confirm: '' }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (showConfirm) {
      const pwErr = validatePassword(form.password);
      if (pwErr) return setError(pwErr);
      if (form.password !== form.confirm) return setError('Passwords do not match.');
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const data = await api.login({ email: form.email, password: form.password });
        setToken(data.token);
        onAuth(data.user);
      } else if (mode === 'register') {
        await api.register({ name: form.name, email: form.email, password: form.password });
        go('login', 'Account created. Please log in.'); // email stays filled in
      } else if (mode === 'forgot') {
        const res = await api.forgotPassword(form.email);
        setSuccess(res.message);
      } else {
        await api.resetPassword(resetToken, form.password);
        window.history.replaceState({}, '', window.location.pathname); // drop the token from the URL
        setResetToken(null);
        go('login', 'Password updated. Please log in.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth">
      <h1>🩸 Sweety</h1>
      <p className="muted">Track your blood glucose, one reading at a time.</p>
      <h2>{TITLES[mode]}</h2>

      <form onSubmit={submit}>
        {showName && (
          <label>Name
            <input value={form.name} onChange={set('name')} autoComplete="name" required />
          </label>
        )}
        {showEmail && (
          <label>Email
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </label>
        )}
        {showPassword && (
          <label>{mode === 'reset' ? 'New password' : 'Password'}
            <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </label>
        )}
        {showConfirm && (
          <label>Confirm password
            <input type={showPw ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')}
              autoComplete="new-password" required />
          </label>
        )}
        {showPassword && (
          <label className="inline">
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
            Show password
          </label>
        )}
        {showConfirm && <p className="muted">At least 8 characters, with a letter and a number.</p>}

        {success && <p className="success" role="status">{success}</p>}
        {mode === 'forgot' && success && import.meta.env.DEV && (
          <p className="muted">Demo mode: no email server is set up, so the reset link is printed in the server terminal.</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : BUTTONS[mode]}</button>
      </form>

      <p className="muted links">
        {mode === 'login' && (
          <>
            <button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button>
            <span> · New here? </span>
            <button type="button" className="link" onClick={() => go('register')}>Create an account</button>
          </>
        )}
        {mode !== 'login' && (
          <button type="button" className="link" onClick={() => {
            if (mode === 'reset') { window.history.replaceState({}, '', window.location.pathname); setResetToken(null); }
            go('login');
          }}>Back to log in</button>
        )}
      </p>
    </div>
  );
}
import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError(error.message || 'Login failed. Check your email and password.');
  };

  return (
    <div className="login-shell">
      <style>{LOGIN_CSS}</style>
      <div className="login-card">
        <div className="login-badge">RF</div>
        <h1>Royal Fabrics</h1>
        <p className="login-sub">Inventory Management — sign in to continue</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</button>
        </form>
        <p className="login-hint">Accounts are created by the Owner. Contact them if you need access.</p>
      </div>
    </div>
  );
}

const LOGIN_CSS = `
.login-shell {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0f1f3d 0%, #1e3a6e 55%, #b8860b 100%);
  font-family: 'Inter', system-ui, sans-serif; padding: 20px;
}
.login-card {
  background: #fff; border-radius: 16px; padding: 32px 28px; max-width: 380px; width: 100%;
  box-shadow: 0 20px 50px rgba(0,0,0,0.25); text-align: center;
}
.login-badge {
  width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 14px;
  background: radial-gradient(circle at 35% 30%, #ffe9a8, #b8860b 70%);
  display: flex; align-items: center; justify-content: center; font-weight: 800; color: #1e293b; font-size: 18px;
}
.login-card h1 { margin: 0 0 4px; font-size: 22px; color: #111827; font-weight: 800; }
.login-sub { color: #6b7280; font-size: 13px; margin: 0 0 22px; }
.login-form { display: flex; flex-direction: column; gap: 14px; text-align: left; }
.login-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: #374151; }
.login-form input {
  padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 15px;
}
.login-form input:focus { outline: 2px solid #2563eb; outline-offset: 1px; border-color: #2563eb; }
.login-form button {
  margin-top: 6px; padding: 11px; border-radius: 8px; border: none; background: #2563eb; color: #fff;
  font-weight: 700; font-size: 14px; cursor: pointer;
}
.login-form button:disabled { opacity: 0.6; cursor: default; }
.login-error { background: #fee2e2; color: #b91c1c; font-size: 12.5px; padding: 8px 10px; border-radius: 6px; }
.login-hint { font-size: 11.5px; color: #9ca3af; margin-top: 18px; }
`;

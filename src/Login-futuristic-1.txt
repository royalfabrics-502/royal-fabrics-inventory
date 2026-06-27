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
      <div className="login-glow login-glow-a" />
      <div className="login-glow login-glow-b" />
      <div className="login-card">
        <img src="/icon-192.png" alt="Royal Fabrics" className="login-badge" />
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
      <p className="login-credit">This app is officially designed and created by<br /><span>Nouman Khan</span> · 0304 9949993</p>
    </div>
  );
}

const LOGIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@600;700;800&family=Caveat:wght@600;700&display=swap');

.login-shell {
  min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(circle at 20% 15%, #1a2a4a 0%, #0a0e1a 45%, #050608 100%);
  font-family: 'Inter', system-ui, sans-serif; padding: 24px; position: relative; overflow: hidden;
}

.login-glow {
  position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; opacity: 0.45;
  animation: drift 14s ease-in-out infinite alternate;
}
.login-glow-a {
  width: 420px; height: 420px; top: -120px; left: -100px;
  background: radial-gradient(circle, #b8860b 0%, transparent 70%);
}
.login-glow-b {
  width: 380px; height: 380px; bottom: -140px; right: -100px;
  background: radial-gradient(circle, #2563eb 0%, transparent 70%);
  animation-delay: 2s;
}
@keyframes drift {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(30px, -20px) scale(1.08); }
}
@media (prefers-reduced-motion: reduce) {
  .login-glow { animation: none; }
}

.login-card {
  position: relative; z-index: 1;
  background: rgba(255,255,255,0.06);
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px; padding: 38px 30px; max-width: 380px; width: 100%;
  box-shadow: 0 30px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
  text-align: center;
}
.login-badge {
  width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 16px;
  object-fit: cover; display: block;
  box-shadow: 0 0 0 1px rgba(212,160,23,0.4), 0 8px 24px rgba(184,134,11,0.35);
}
.login-card h1 {
  margin: 0 0 6px; font-size: 24px; color: #f5f1e8; font-weight: 800;
  font-family: 'Manrope', 'Inter', sans-serif; letter-spacing: 0.01em;
}
.login-sub { color: rgba(255,255,255,0.55); font-size: 13px; margin: 0 0 26px; letter-spacing: 0.01em; }

.login-form { display: flex; flex-direction: column; gap: 16px; text-align: left; }
.login-form label { display: flex; flex-direction: column; gap: 7px; font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,0.65); letter-spacing: 0.02em; text-transform: uppercase; }
.login-form input {
  padding: 12px 14px; border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; font-size: 15px;
  background: rgba(255,255,255,0.05); color: #f5f1e8; transition: border-color 0.2s, background 0.2s;
}
.login-form input::placeholder { color: rgba(255,255,255,0.3); }
.login-form input:focus {
  outline: none; border-color: rgba(212,160,23,0.6); background: rgba(255,255,255,0.08);
  box-shadow: 0 0 0 3px rgba(212,160,23,0.15);
}
.login-form button {
  margin-top: 8px; padding: 13px; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%); color: #1a1206;
  font-weight: 700; font-size: 14.5px; cursor: pointer; letter-spacing: 0.01em;
  box-shadow: 0 10px 25px rgba(184,134,11,0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}
.login-form button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(184,134,11,0.45); }
.login-form button:disabled { opacity: 0.55; cursor: default; transform: none; }
.login-error {
  background: rgba(220,38,38,0.12); border: 1px solid rgba(220,38,38,0.3); color: #fca5a5;
  font-size: 12.5px; padding: 9px 11px; border-radius: 8px;
}
.login-hint { font-size: 11.5px; color: rgba(255,255,255,0.32); margin-top: 22px; line-height: 1.5; }

.login-credit {
  position: relative; z-index: 1; margin-top: 28px; font-size: 12px;
  color: rgba(255,255,255,0.3); letter-spacing: 0.02em; text-align: center; line-height: 1.7;
}
.login-credit span {
  color: rgba(212,160,23,0.85); font-weight: 700; font-size: 17px;
  font-family: 'Caveat', cursive; letter-spacing: 0.01em;
}

@media (max-width: 380px) {
  .login-card { padding: 30px 22px; }
}
`;

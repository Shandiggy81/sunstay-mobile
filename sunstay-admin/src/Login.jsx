import { useState } from 'react';
import { supabase } from './lib/supabase';

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = Boolean(supabase) && email.trim() && password.length >= 6 && !submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      onSignedIn?.(data.session);
    } catch (err) {
      setError(err?.message || 'Sign in failed. Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-sunstay-navy flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute bottom-0 -left-20 h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl shadow-lg shadow-amber-500/20">
            ☀️
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-400">Sunstay</p>
          <h1 className="mt-2 text-2xl font-bold text-white tracking-tight">Internal admin</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in with your staff account to manage venues.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-md"
        >
          <label className="block text-left">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
              placeholder="you@sunstay.com.au"
            />
          </label>

          <label className="mt-4 block text-left">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-left text-sm text-red-200" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition active:scale-[0.98] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Staff access only. Venue tools are not public.
        </p>
      </div>
    </div>
  );
}

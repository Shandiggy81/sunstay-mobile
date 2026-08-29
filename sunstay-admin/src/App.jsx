import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './Login.jsx';
import { supabase } from './lib/supabase';

function AdminHome({ email, onSignOut }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-500">Sunstay</p>
            <h1 className="text-lg font-bold text-slate-900">Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-800">You’re signed in</p>
          <p className="mt-2 text-sm text-slate-500">
            Venue management tools will land here. This screen is only a lock-check for now.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase?.auth.signOut();
    setSession(null);
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sunstay-navy">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-amber-200/30 border-t-amber-400" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            session
              ? <AdminHome email={session.user?.email} onSignOut={handleSignOut} />
              : <Login onSignedIn={setSession} />
          }
        />
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login onSignedIn={setSession} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

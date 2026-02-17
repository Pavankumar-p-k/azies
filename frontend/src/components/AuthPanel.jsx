import { useMemo, useState } from "react";
import { Eye, EyeOff, LogIn, LogOut, UserPlus } from "lucide-react";

import { isSupabaseEnabled, supabase } from "../lib/supabase";

export default function AuthPanel({ user, onUserUpdate }) {
  const [email, setEmail] = useState("pavankumarunnam99@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const messageClassName = useMemo(() => {
    if (status.toLowerCase().includes("failed")) {
      return "text-neon-red";
    }
    return "text-neon-green";
  }, [status]);

  async function handleSignIn() {
    if (!supabase) {
      return;
    }
    setBusy(true);
    setStatus("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setStatus(`Sign in failed: ${error.message}`);
      return;
    }
    setStatus("Authenticated with Supabase.");
    onUserUpdate(data.user);
  }

  async function handleSignUp() {
    if (!supabase) {
      return;
    }
    setBusy(true);
    setStatus("");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin }
    });
    setBusy(false);
    if (error) {
      setStatus(`Sign up failed: ${error.message}`);
      return;
    }
    setStatus("Account created. Confirm your email from inbox.");
    onUserUpdate(data.user ?? null);
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setStatus("Signed out.");
    onUserUpdate(null);
  }

  if (!isSupabaseEnabled) {
    return (
      <section className="panel">
        <h2 className="panel-title">Identity Control</h2>
        <p className="text-sm text-zinc-300">
          Supabase auth is disabled. Add `VITE_SUPABASE_URL` and
          `VITE_SUPABASE_ANON_KEY` to enable per-user verification ownership.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Identity Control</h2>
      {user ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-200">
            Active session: <span className="text-neon-green">{user.email}</span>
          </p>
          <button className="btn-secondary w-full" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="input pr-20"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-2 my-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-300 hover:text-neon-green"
              onClick={() => setShowPassword((previous) => !previous)}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showPassword ? "Hide" : "Show"}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <button className="btn-primary" onClick={handleSignIn} disabled={busy}>
              <LogIn className="h-4 w-4" />
              <span>Sign In</span>
            </button>
            <button className="btn-secondary" onClick={handleSignUp} disabled={busy}>
              <UserPlus className="h-4 w-4" />
              <span>Sign Up</span>
            </button>
          </div>
        </div>
      )}
      {status ? <p className={`text-xs ${messageClassName}`}>{status}</p> : null}
    </section>
  );
}

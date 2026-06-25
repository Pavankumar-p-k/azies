import { useState } from "react";

import { isSupabaseEnabled, supabase } from "../lib/supabase";

export default function AuthPanel({ user, onUserUpdate }) {
  const [email, setEmail] = useState("pavankumarunnam99@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

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
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">Auth</p>
        <p className="text-sm text-zinc-600">Supabase not configured.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {user ? (
        <>
          <p className="text-xs text-zinc-500">Signed in as <span className="text-zinc-300">{user.email}</span></p>
          <button className="w-full rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300" onClick={handleSignOut}>Sign Out</button>
        </>
      ) : (
        <>
          <p className="text-xs text-zinc-500">Sign in</p>
          <input type="email" className="w-full border-b border-zinc-800 bg-transparent px-0 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-neon-green" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <div className="relative">
            <input type={showPassword ? "text" : "password"} className="w-full border-b border-zinc-800 bg-transparent px-0 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-neon-green" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <button type="button" className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-zinc-600 hover:text-zinc-300" onClick={() => setShowPassword((p) => !p)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <div className="flex gap-2">
            <button className="rounded bg-neon-green px-3 py-1.5 text-xs font-medium text-zinc-900 hover:brightness-110" onClick={handleSignIn} disabled={busy}>
              {busy ? "..." : "Sign In"}
            </button>
            <button className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700" onClick={handleSignUp} disabled={busy}>
              Sign Up
            </button>
          </div>
        </>
      )}
      {status ? <p className={`text-xs ${status.toLowerCase().includes("fail") ? "text-neon-red" : "text-neon-green"}`}>{status}</p> : null}
    </div>
  );
}

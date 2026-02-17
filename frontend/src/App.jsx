import { useEffect, useMemo, useState } from "react";
import { Bell, LogOut, Shield, TerminalSquare, UserRound, X } from "lucide-react";

import AuthPanel from "./components/AuthPanel";
import LiveFeed from "./components/LiveFeed";
import NotificationsPanel from "./components/NotificationsPanel";
import ProfilePanel from "./components/ProfilePanel";
import ProofTable from "./components/ProofTable";
import SharedVerifyPanel from "./components/SharedVerifyPanel";
import UploadPanel from "./components/UploadPanel";
import { useProofSocket } from "./hooks/useProofSocket";
import { healthCheck, listNotifications, listProofs } from "./lib/api";
import { isSupabaseEnabled, supabase } from "./lib/supabase";

function readShareToken() {
  if (typeof window === "undefined") {
    return "";
  }
  const value = new URLSearchParams(window.location.search).get("share");
  return value ? value.trim() : "";
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [user, setUser] = useState(null);
  const [profileCache, setProfileCache] = useState(null);
  const [error, setError] = useState("");
  const [shareToken, setShareToken] = useState(readShareToken);
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { socketState, events } = useProofSocket();

  async function loadHealth() {
    try {
      const payload = await healthCheck();
      setHealth(payload);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadProofs() {
    try {
      const payload = await listProofs();
      setProofs(payload.items ?? []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function loadUnreadCount() {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const payload = await listNotifications();
      const items = payload.items ?? [];
      setUnreadCount(items.filter((item) => !item.read_at).length);
    } catch {
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    loadHealth();
    loadProofs();
  }, []);

  useEffect(() => {
    const syncShareToken = () => setShareToken(readShareToken());
    window.addEventListener("popstate", syncShareToken);
    return () => {
      window.removeEventListener("popstate", syncShareToken);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseEnabled || !supabase) {
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfileCache(null);
      }
      loadProofs();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      loadProofs();
      loadUnreadCount();
    }
  }, [events.length]);

  useEffect(() => {
    loadUnreadCount();
  }, [user]);

  useEffect(() => {
    if (!user || !profileCache) {
      return;
    }
    if (profileCache.email !== user.email) {
      setProfileCache(null);
    }
  }, [profileCache, user]);

  const heroStatus = useMemo(() => {
    if (!health) {
      return "Bootstrapping trust fabric...";
    }
    const backend = health.pqc_backend;
    const pqc = health.pqc_algorithm;
    return `Engine: ${pqc} via ${backend}`;
  }, [health]);

  function clearShareMode() {
    if (typeof window === "undefined") {
      setShareToken("");
      return;
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("share");
    const query = nextUrl.searchParams.toString();
    const relative = `${nextUrl.pathname}${query ? `?${query}` : ""}${nextUrl.hash}`;
    window.history.pushState({}, "", relative);
    setShareToken("");
  }

  function openUserPanel() {
    setShowNotificationsPanel(false);
    setShowUserPanel(true);
  }

  function closeUserPanel() {
    setShowUserPanel(false);
  }

  function openNotificationsPanel() {
    setShowUserPanel(false);
    setShowNotificationsPanel(true);
  }

  function closeNotificationsPanel() {
    setShowNotificationsPanel(false);
  }

  async function handleSignOut() {
    if (!supabase) {
      setUser(null);
      setProfileCache(null);
      closeUserPanel();
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfileCache(null);
    closeUserPanel();
    loadProofs();
  }

  function goToPostsPanel() {
    closeUserPanel();
    const target = document.getElementById("integrity-ledger");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleProfileSaved() {
    closeUserPanel();
  }

  function handleProfileLoaded(profile) {
    setProfileCache(profile);
  }

  if (shareToken) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-terminal-bg px-3 py-6 text-zinc-100 sm:px-4 sm:py-8 md:px-8">
        <div className="aurora" />
        <section className="mx-auto grid max-w-4xl gap-4 sm:gap-6">
          <header className="panel flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-neon-green">
                <Shield className="h-4 w-4" />
                Project Aegis Shared Proof
              </p>
              <h1 className="mt-2 text-2xl font-bold md:text-3xl">Verify Shared Integrity Link</h1>
              <p className="mt-1 text-sm text-zinc-300">{heroStatus}</p>
            </div>
            <button className="btn-secondary w-full sm:w-auto" onClick={clearShareMode}>
              Exit Shared View
            </button>
          </header>

          <SharedVerifyPanel shareToken={shareToken} />
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-terminal-bg px-3 py-6 text-zinc-100 sm:px-4 sm:py-8 md:px-8">
      <div className="aurora" />
      <section className="mx-auto grid max-w-7xl gap-4 sm:gap-6">
        <header className="panel flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-neon-green">
              <Shield className="h-4 w-4" />
              Project Aegis
            </p>
            <h1 className="mt-2 text-2xl font-bold md:text-4xl">
              Quantum-Resistant Integrity Command Center
            </h1>
            <p className="mt-1 text-sm text-zinc-300">{heroStatus}</p>
          </div>
          <div className="flex w-full flex-wrap items-stretch gap-2 md:w-auto md:items-center md:justify-end">
            <div className="w-full rounded-2xl border border-emerald-300/20 bg-black/30 px-4 py-3 sm:w-auto">
              <p className="inline-flex items-center gap-2 text-xs text-zinc-300">
                <TerminalSquare className="h-4 w-4 text-neon-green" />
                Live Node Status: {socketState}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary relative w-full sm:w-auto"
              onClick={openNotificationsPanel}
            >
              <Bell className="h-4 w-4" />
              <span>Notify</span>
              {user && unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-neon-red px-1 text-center text-[10px] text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>
            <button type="button" className="btn-secondary w-full sm:w-auto" onClick={openUserPanel}>
              <UserRound className="h-4 w-4" />
              <span>{user ? "Creator Panel" : "Sign In"}</span>
            </button>
          </div>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-neon-red">
            {error}
          </p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr]">
          <UploadPanel onUploaded={loadProofs} />
        </section>

        <section id="integrity-ledger" className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <ProofTable proofs={proofs} onRefresh={loadProofs} user={user} />
          <LiveFeed socketState={socketState} events={events} />
        </section>
      </section>

      {showUserPanel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 px-2 py-2 sm:px-3 sm:py-3 md:items-start md:px-4 md:py-8">
          <div className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-emerald-300/20 bg-terminal-elev/95 p-4 shadow-panel sm:p-5">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                <UserRound className="h-4 w-4 text-neon-green" />
                User Controls
              </p>
              <button type="button" className="btn-secondary" onClick={closeUserPanel}>
                <X className="h-4 w-4" />
                <span>Close</span>
              </button>
            </div>

            {user ? (
              <>
                <ProfilePanel
                  user={user}
                  proofsCount={proofs.length}
                  onPostsClick={goToPostsPanel}
                  onSaved={handleProfileSaved}
                  initialProfile={profileCache}
                  onProfileLoaded={handleProfileLoaded}
                />
                <button type="button" className="btn-secondary w-full" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <AuthPanel user={user} onUserUpdate={setUser} />
            )}
          </div>
        </div>
      ) : null}

      {showNotificationsPanel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 px-2 py-2 sm:px-3 sm:py-3 md:items-start md:px-4 md:py-8">
          <div className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-emerald-300/20 bg-terminal-elev/95 p-4 shadow-panel sm:p-5">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                <Bell className="h-4 w-4 text-neon-green" />
                Notifications
              </p>
              <button type="button" className="btn-secondary" onClick={closeNotificationsPanel}>
                <X className="h-4 w-4" />
                <span>Close</span>
              </button>
            </div>
            <NotificationsPanel
              user={user}
              embedded
              onUnreadCountChange={setUnreadCount}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

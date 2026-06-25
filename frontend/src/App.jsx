import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, LogOut, Shield, X } from "lucide-react";

import AboutPage from "./components/AboutPage";
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
  const [showAbout, setShowAbout] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const { socketState, events } = useProofSocket();
  const dashboardRef = useRef(null);

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

  function handleGetStarted() {
    setShowAbout(false);
    setTimeout(() => dashboardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

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
    <main className="min-h-screen bg-terminal-bg text-zinc-100">
      <nav className="sticky top-0 z-40 bg-terminal-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <button className="flex items-center gap-2" onClick={() => setShowAbout(!showAbout)}>
            <Shield className="h-4 w-4 text-neon-green" />
            <span className="text-sm text-zinc-300">Project Aegis</span>
          </button>
          <div className="flex items-center gap-4">
            <button type="button" className="text-xs text-zinc-600 hover:text-zinc-300" onClick={() => setShowAbout(!showAbout)}>
              {showAbout ? "Dashboard" : "About"}
            </button>
            <span className="text-xs text-zinc-700">{socketState}</span>
            <button type="button" className="relative text-zinc-600 hover:text-zinc-300" onClick={openNotificationsPanel}>
              <Bell className="h-4 w-4" />
              {user && unreadCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-neon-red text-[7px] text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
              ) : null}
            </button>
            <button type="button" className="text-xs text-zinc-600 hover:text-zinc-300" onClick={openUserPanel}>
              {user ? "Dashboard" : "Sign In"}
            </button>
          </div>
        </div>
      </nav>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        {showAbout ? (
          <AboutPage health={health} heroStatus={heroStatus} onGetStarted={handleGetStarted} />
        ) : (
          <div ref={dashboardRef} className="space-y-16">
            <div>
              <h1 className="text-lg text-zinc-400 sm:text-xl">Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">{heroStatus}</p>
            </div>

            {error ? <p className="text-sm text-neon-red">{error}</p> : null}

            <section>
              <UploadPanel onUploaded={loadProofs} />
            </section>

            <section id="integrity-ledger" className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
              <ProofTable proofs={proofs} onRefresh={loadProofs} user={user} />
              <LiveFeed socketState={socketState} events={events} />
            </section>
          </div>
        )}
      </div>

      {showUserPanel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg bg-terminal-elev p-6">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-xs text-zinc-500">Account</p>
              <button type="button" className="text-zinc-600 hover:text-zinc-300" onClick={closeUserPanel}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {user ? (
              <div className="space-y-5">
                <ProfilePanel user={user} proofsCount={proofs.length} onPostsClick={goToPostsPanel} onSaved={handleProfileSaved} initialProfile={profileCache} onProfileLoaded={handleProfileLoaded} />
                <button type="button" className="w-full rounded bg-zinc-900 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            ) : (
              <AuthPanel user={user} onUserUpdate={setUser} />
            )}
          </div>
        </div>
      ) : null}

      {showNotificationsPanel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg bg-terminal-elev p-6">
            <div className="mb-6 flex items-center justify-between">
              <p className="text-xs text-zinc-500">Notifications</p>
              <button type="button" className="text-zinc-600 hover:text-zinc-300" onClick={closeNotificationsPanel}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <NotificationsPanel user={user} embedded onUnreadCountChange={setUnreadCount} />
          </div>
        </div>
      ) : null}
    </main>
  );
}

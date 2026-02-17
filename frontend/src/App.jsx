import { useEffect, useMemo, useState } from "react";
import { Shield, TerminalSquare } from "lucide-react";

import AuthPanel from "./components/AuthPanel";
import LiveFeed from "./components/LiveFeed";
import NotificationsPanel from "./components/NotificationsPanel";
import ProfilePanel from "./components/ProfilePanel";
import ProofTable from "./components/ProofTable";
import SharedVerifyPanel from "./components/SharedVerifyPanel";
import UploadPanel from "./components/UploadPanel";
import { useProofSocket } from "./hooks/useProofSocket";
import { healthCheck, listProofs } from "./lib/api";
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
  const [error, setError] = useState("");
  const [shareToken, setShareToken] = useState(readShareToken);
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
      loadProofs();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      loadProofs();
    }
  }, [events.length]);

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

  if (shareToken) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-terminal-bg px-4 py-8 text-zinc-100 md:px-8">
        <div className="aurora" />
        <section className="mx-auto grid max-w-4xl gap-6">
          <header className="panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-neon-green">
                <Shield className="h-4 w-4" />
                Project Aegis Shared Proof
              </p>
              <h1 className="mt-2 text-2xl font-bold md:text-3xl">Verify Shared Integrity Link</h1>
              <p className="mt-1 text-sm text-zinc-300">{heroStatus}</p>
            </div>
            <button className="btn-secondary" onClick={clearShareMode}>
              Exit Shared View
            </button>
          </header>

          <SharedVerifyPanel shareToken={shareToken} />
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-terminal-bg px-4 py-8 text-zinc-100 md:px-8">
      <div className="aurora" />
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
          <div className="rounded-2xl border border-emerald-300/20 bg-black/30 px-4 py-3">
            <p className="inline-flex items-center gap-2 text-xs text-zinc-300">
              <TerminalSquare className="h-4 w-4 text-neon-green" />
              Live Node Status: {socketState}
            </p>
          </div>
        </header>

        {error ? (
          <p className="rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-neon-red">
            {error}
          </p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
          <UploadPanel onUploaded={loadProofs} />
          <AuthPanel user={user} onUserUpdate={setUser} />
          <ProfilePanel user={user} proofsCount={proofs.length} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr_1fr]">
          <ProofTable proofs={proofs} onRefresh={loadProofs} user={user} />
          <LiveFeed socketState={socketState} events={events} />
          <NotificationsPanel user={user} />
        </section>
      </section>
    </main>
  );
}

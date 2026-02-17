import { useEffect, useMemo, useState } from "react";
import { Shield, TerminalSquare } from "lucide-react";

import AuthPanel from "./components/AuthPanel";
import LiveFeed from "./components/LiveFeed";
import ProofTable from "./components/ProofTable";
import UploadPanel from "./components/UploadPanel";
import { useProofSocket } from "./hooks/useProofSocket";
import { healthCheck, listProofs } from "./lib/api";
import { isSupabaseEnabled, supabase } from "./lib/supabase";

export default function App() {
  const [health, setHealth] = useState(null);
  const [proofs, setProofs] = useState([]);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
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

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <UploadPanel onUploaded={loadProofs} />
          <AuthPanel user={user} onUserUpdate={setUser} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <ProofTable proofs={proofs} onRefresh={loadProofs} />
          <LiveFeed socketState={socketState} events={events} />
        </section>
      </section>
    </main>
  );
}

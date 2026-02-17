import { Activity, Wifi, WifiOff } from "lucide-react";

export default function LiveFeed({ socketState, events }) {
  const connected = socketState === "connected";
  return (
    <section className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="panel-title">P2P Event Feed</h2>
        <span
          className={`inline-flex items-center gap-1 text-xs ${
            connected ? "text-neon-green" : "text-neon-amber"
          }`}
        >
          {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {socketState}
        </span>
      </div>

      <div className="max-h-80 space-y-2 overflow-auto rounded-xl border border-emerald-300/10 bg-black/20 p-3">
        {events.length === 0 ? (
          <p className="text-xs text-zinc-500">Waiting for proof activity...</p>
        ) : (
          events.map((event, index) => (
            <article key={`${event.timestamp}-${index}`} className="rounded-lg border border-zinc-800 p-2">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold text-neon-green">
                <Activity className="h-3 w-3" />
                {event.event}
              </p>
              <p className="text-[11px] text-zinc-400">
                {new Date(event.timestamp).toLocaleString()}
              </p>
              <pre className="mt-1 overflow-x-auto text-[11px] text-zinc-200">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function LiveFeed({ socketState, events }) {
  const connected = socketState === "connected";
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-zinc-500">Events</p>
        <span className={`text-xs ${connected ? "text-neon-green" : "text-zinc-600"}`}>
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      <div className="space-y-1">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-600">No events yet.</p>
        ) : (
          events.map((event, index) => (
            <div key={`${event.timestamp}-${index}`} className="border-t border-zinc-800/50 py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-neon-green">{event.event}</p>
                <span className="text-xs text-zinc-600">{new Date(event.timestamp).toLocaleString()}</span>
              </div>
              <pre className="mt-1 text-xs text-zinc-600 overflow-x-auto">{JSON.stringify(event.payload)}</pre>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-zinc-600">{events.length} event{events.length !== 1 ? "s" : ""}</p>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { BellRing, Check } from "lucide-react";

import { listNotifications, markNotificationRead } from "../lib/api";

function statusColor(item) {
  if (item.is_tampered) {
    return "text-neon-red";
  }
  return "text-neon-green";
}

export default function NotificationsPanel({ user }) {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await listNotifications();
      setItems(payload.items ?? []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user]);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items]
  );

  async function handleRead(notificationId) {
    setBusyId(String(notificationId));
    setError("");
    try {
      await markNotificationRead(notificationId);
      setItems((previous) =>
        previous.map((item) =>
          item.id === notificationId
            ? { ...item, read_at: new Date().toISOString() }
            : item
        )
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="panel-title">Notifications</h2>
        <span className="inline-flex items-center gap-2 text-xs text-zinc-300">
          <BellRing className="h-4 w-4 text-neon-green" />
          {unreadCount} unread
        </span>
      </div>

      {!user ? (
        <p className="text-sm text-zinc-400">Sign in to view recheck and tamper alerts.</p>
      ) : loading ? (
        <p className="text-sm text-zinc-400">Loading notifications...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No notifications yet.</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-auto rounded-xl border border-emerald-300/10 bg-black/20 p-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-lg border border-zinc-800 p-2">
              <p className={`text-xs font-semibold ${statusColor(item)}`}>{item.event_type}</p>
              <p className="mt-1 text-xs text-zinc-200">{item.message}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {new Date(item.created_at).toLocaleString()}
              </p>
              {item.read_at ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  Read at {new Date(item.read_at).toLocaleString()}
                </p>
              ) : (
                <button
                  type="button"
                  className="btn-secondary mt-2 text-[11px]"
                  onClick={() => handleRead(item.id)}
                  disabled={busyId === String(item.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{busyId === String(item.id) ? "Updating..." : "Mark Read"}</span>
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {error ? <p className="text-xs text-neon-red">{error}</p> : null}
    </section>
  );
}

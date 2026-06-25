import { useEffect, useMemo, useState } from "react";

import { listNotifications, markNotificationRead } from "../lib/api";

function statusColor(item) {
  if (item.is_tampered) {
    return "text-neon-red";
  }
  return "text-neon-green";
}

export default function NotificationsPanel({
  user,
  onUnreadCountChange,
  embedded = false
}) {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!user) {
      setItems([]);
      onUnreadCountChange?.(0);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await listNotifications();
      const nextItems = payload.items ?? [];
      setItems(nextItems);
      onUnreadCountChange?.(nextItems.filter((item) => !item.read_at).length);
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
      setItems((previous) => {
        const next = previous.map((item) =>
          item.id === notificationId
            ? { ...item, read_at: new Date().toISOString() }
            : item
        );
        onUnreadCountChange?.(next.filter((item) => !item.read_at).length);
        return next;
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">Notifications</p>
        <span className="text-xs text-zinc-600">{unreadCount} unread</span>
      </div>

      {!user ? (
        <p className="text-sm text-zinc-600">Sign in to view alerts.</p>
      ) : loading ? (
        <p className="text-sm text-zinc-600">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-600">No notifications.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="border-t border-zinc-800/50 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-xs ${statusColor(item)}`}>{item.event_type}</p>
                {item.read_at ? (
                  <span className="text-xs text-zinc-600">Read</span>
                ) : (
                  <span className="text-xs text-neon-green">New</span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-300">{item.message}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-600">{new Date(item.created_at).toLocaleString()}</span>
                {!item.read_at ? (
                  <button className="text-xs text-zinc-600 hover:text-zinc-300" onClick={() => handleRead(item.id)} disabled={busyId === String(item.id)}>
                    {busyId === String(item.id) ? "..." : "Read"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {error ? <p className="text-xs text-neon-red">{error}</p> : null}
    </div>
  );
}

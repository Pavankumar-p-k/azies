import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

function toFeedEvent(event, row) {
  const payload = row || {};
  return {
    event,
    timestamp: new Date().toISOString(),
    payload
  };
}

export function useProofSocket() {
  const [socketState, setSocketState] = useState(supabase ? "connecting" : "offline");
  const [events, setEvents] = useState([]);
  const channelRef = useRef(null);

  useEffect(() => {
    if (!supabase) {
      setSocketState("offline");
      setEvents([]);
      return undefined;
    }

    let active = true;
    const channel = supabase
      .channel(`proof-feed-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "integrity_proofs" },
        (message) => {
          if (!active) {
            return;
          }
          setEvents((previous) =>
            [toFeedEvent("proof_created", message.new), ...previous].slice(0, 50)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "integrity_proofs" },
        (message) => {
          if (!active) {
            return;
          }
          setEvents((previous) =>
            [toFeedEvent("proof_updated", message.new), ...previous].slice(0, 50)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "integrity_proofs" },
        (message) => {
          if (!active) {
            return;
          }
          setEvents((previous) =>
            [toFeedEvent("proof_deleted", message.old), ...previous].slice(0, 50)
          );
        }
      );

    channelRef.current = channel;
    channel.subscribe((status) => {
      if (!active) {
        return;
      }
      if (status === "SUBSCRIBED") {
        setSocketState("connected");
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setSocketState("reconnecting");
      }
    });

    return () => {
      active = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return { socketState, events };
}

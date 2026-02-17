import { useEffect, useRef, useState } from "react";
import { deriveWsUrl } from "../lib/api";

export function useProofSocket() {
  const [socketState, setSocketState] = useState("connecting");
  const [events, setEvents] = useState([]);
  const retriesRef = useRef(0);
  const socketRef = useRef(null);

  useEffect(() => {
    let reconnectTimer;

    const connect = () => {
      const ws = new WebSocket(deriveWsUrl());
      socketRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        setSocketState("connected");
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setEvents((previous) => [parsed, ...previous].slice(0, 50));
        } catch (error) {
          setEvents((previous) => [
            { event: "parse_error", timestamp: new Date().toISOString(), payload: {} },
            ...previous
          ]);
        }
      };

      ws.onclose = () => {
        setSocketState("reconnecting");
        retriesRef.current += 1;
        const timeout = Math.min(1000 * retriesRef.current, 8000);
        reconnectTimer = window.setTimeout(connect, timeout);
      };

      ws.onerror = () => {
        setSocketState("error");
      };
    };

    connect();

    return () => {
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  return {
    socketState,
    events
  };
}

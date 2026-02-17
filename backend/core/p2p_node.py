from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

import websockets
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._connections:
                self._connections.remove(websocket)

    async def broadcast(self, event_type: str, payload: Dict[str, Any]) -> None:
        envelope = {
            "event": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        dead_connections: List[WebSocket] = []
        async with self._lock:
            for websocket in self._connections:
                try:
                    await websocket.send_json(envelope)
                except Exception:
                    dead_connections.append(websocket)
            for websocket in dead_connections:
                self._connections.remove(websocket)


class PeerBroadcaster:
    def __init__(self, peers: List[str]):
        self.peers = peers

    async def broadcast_integrity_proof(self, proof_payload: Dict[str, Any]) -> None:
        if not self.peers:
            return
        message = json.dumps(
            {"type": "integrity_proof", "data": proof_payload}, separators=(",", ":")
        )
        tasks = [self._send(peer, message) for peer in self.peers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send(self, peer_url: str, message: str) -> None:
        try:
            async with websockets.connect(peer_url, ping_interval=20, ping_timeout=20) as ws:
                await ws.send(message)
        except Exception as exc:
            logger.debug("Peer broadcast failed for %s: %s", peer_url, exc)

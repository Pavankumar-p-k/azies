# Project Aegis Backend

FastAPI service for post-quantum file integrity proofs.

## Features

- SHA3-512 file hashing
- ML-DSA signatures with `liboqs` when available
- AES-256 encrypted vault payloads
- Supabase-backed metadata and storage
- WebSocket live proof event stream (`/ws/proofs`)

## Quick Start

1. Create a Python 3.11+ virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Configure root `.env` (one level above `backend/`) and set your Supabase values.
4. Run:

```bash
uvicorn main:app --reload --port 8000
```

## API

- `GET /api/v1/health`
- `POST /api/v1/proofs/upload` (multipart: `file`)
- `POST /api/v1/proofs/{verification_id}/verify` (optional multipart: `file`)
- `GET /api/v1/proofs`
- `WS /ws/proofs`

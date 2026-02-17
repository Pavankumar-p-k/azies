# Project Aegis (Quantum-Resistant P2P Integrity)

Project Aegis is a local-first, decentralized integrity verification platform using:

- SHA3-512 hashing
- ML-DSA signatures (via `liboqs` when available)
- AES-256 encrypted vault payloads
- Supabase for auth, metadata, and storage
- React + Tailwind dashboard deployable to Vercel

## Repository Layout

```text
backend/   FastAPI cryptographic and verification API
frontend/  React command-center dashboard (Vite + Tailwind)
docs/      Supabase schema and deployment notes
```

## Local Run

### 1) Backend

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Supabase Setup

1. Open Supabase SQL editor.
2. Execute `docs/supabase_schema.sql`.
3. Copy project URL and anon key into:
   - `backend/.env`
   - `frontend/.env`

## Production Path

- Frontend: deploy on Vercel (`frontend` root).
- Backend: deploy FastAPI to your preferred service.
- Configure HTTPS API and WSS endpoint in Vercel env vars.

Deployment details: `docs/vercel_deployment.md`.

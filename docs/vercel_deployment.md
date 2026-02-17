# Vercel Deployment Notes

## Frontend

1. Push this repository to GitHub.
2. In Vercel, import the repository.
3. Configure:
   - Framework preset: `Vite`
   - Root directory: `frontend`
4. Add environment variables:
   - `VITE_API_BASE_URL` (your deployed API URL + `/api/v1`)
   - `VITE_WS_URL` (your deployed API websocket endpoint)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

## Supabase

1. Run SQL from `docs/supabase_schema.sql`.
2. In Authentication settings, set the site URL to your Vercel domain.
3. Add `pavankumarunnam99@gmail.com` as project owner/test account and verify email.

## Backend hosting

Deploy the FastAPI backend separately (Railway/Render/Fly.io/VM).  
After deployment, update `VITE_API_BASE_URL` and `VITE_WS_URL` in Vercel.

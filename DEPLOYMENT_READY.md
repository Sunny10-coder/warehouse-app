# Warehouse App Hosting Checklist

## Files that make the app

- `frontend/` is the installable/web app built with Expo.
- `backend/` is the FastAPI API that stores shared company data.
- `backend/server.py` contains the API, login, schedules, attendance, leave approvals, reports, and realtime notifications.
- `backend/.env.example` and `frontend/.env.example` show the production settings to add on your hosts.
- `backend/Dockerfile` and `backend/render.yaml` are ready for backend hosting.
- `frontend/vercel.json` is ready for web hosting.

## Recommended hosting path

Use MongoDB Atlas for the database because this backend is already written for MongoDB. Supabase would require a database rewrite.

1. Create a free MongoDB Atlas cluster and copy its connection string.
2. Deploy `backend/` to Render or Railway.
3. Add the backend environment variables from `backend/.env.example`.
4. Confirm `https://your-api-host/api/health` returns `{"status":"ok"}`.
5. Deploy `frontend/` to Vercel.
6. Add `EXPO_PUBLIC_BACKEND_URL=https://your-api-host` to the frontend host.
7. Point your Lovable domain DNS:
   - `app` CNAME to the Vercel frontend host.
   - `api` CNAME to the Render/Railway backend host.
8. After DNS is connected, set `EXPO_PUBLIC_BACKEND_URL=https://api.your-domain.com` and redeploy frontend.

## Sharing with colleagues

- Web: send `https://app.your-domain.com`.
- Android/iPhone installable app: build from `frontend/` with Expo EAS, using the same `EXPO_PUBLIC_BACKEND_URL`.
- Everyone logs into the same backend, so data is shared.
- Active screens refresh when another logged-in user changes users, schedules, attendance, or leaves.

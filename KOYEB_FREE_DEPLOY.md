# Free Backend Option: Koyeb

Use this if Railway asks for a paid upgrade.

## Recommended Free Setup

- Backend/API: Koyeb Free Instance
- Frontend/installable web app: Vercel Hobby
- Database: MongoDB Atlas free cluster
- Domain:
  - `api.yourdomain.com` -> Koyeb backend
  - `app.yourdomain.com` -> Vercel frontend

## Koyeb Backend Steps

1. Open Koyeb and create a new Web Service from GitHub.
2. Select repo: `anniyan333-commits/warehouse-app`.
3. Select branch: `main`.
4. Set root directory to `backend`.
5. Use Dockerfile deployment.
6. Select the Free instance type.
7. Add environment variables from `backend/.env.production.local`.
8. Replace `MONGO_URL` with your MongoDB Atlas connection string.
9. Deploy.
10. Open `/api/health` on the Koyeb URL to confirm the backend is live.

## Vercel Frontend Steps

1. Create a new Vercel project from the same GitHub repo.
2. Set root directory to `frontend`.
3. Build command: `npx expo export --platform web`.
4. Output directory: `dist`.
5. Add `EXPO_PUBLIC_BACKEND_URL=https://your-koyeb-backend-url`.
6. Deploy.

## Notes

Koyeb's Free Instance is limited and scales down after inactivity, so the first request after a quiet period can be slower. It is still a better free backend option than Railway if Railway requires a paid plan before deployment.

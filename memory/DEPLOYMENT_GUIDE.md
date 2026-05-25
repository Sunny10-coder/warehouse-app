# Deployment Guide for `eccentrics.live`

Your domain `eccentrics.live` was bought through **Lovable**, which is a separate platform. Since Emergent cannot modify your Lovable DNS records directly, here is the **exact step-by-step** path to get your warehouse app live on `eccentrics.live` (or `app.eccentrics.live`) at **zero cost**.

---

## 🟢 RECOMMENDED PATH — One-click via Emergent Publish

This is the simplest. Emergent will host both the backend (FastAPI + MongoDB) and the web app for you.

### Steps:
1. In Emergent (this chat window), click the **Publish** button at the top-right
2. Choose **Web App** + **Backend** to deploy
3. Emergent will give you a permanent URL like `warehouse-crew.emergent.host`
4. Go to your **Lovable DNS panel** for `eccentrics.live` and add a CNAME record:

   | Field | Value |
   |---|---|
   | Type | `CNAME` |
   | Host | `app` (or `@` if you want root domain) |
   | Answer | `warehouse-crew.emergent.host` (the URL Emergent gives you) |
   | TTL | `300` |

5. Wait 5–10 minutes for DNS propagation
6. Visit `https://app.eccentrics.live` (or `https://eccentrics.live`) — your app is live!

---

## 🟡 ALTERNATIVE PATH — Self-hosting (still free, but more setup)

If you want full ownership of hosting:

### Step 1 — Save code to GitHub
Click **"Save to GitHub"** in Emergent. It creates a repo with all your code.

### Step 2 — Deploy backend (FastAPI + MongoDB)
**Option A: Railway** (free $5 credit/month)
- Sign up at https://railway.app
- New Project → Deploy from GitHub repo → pick `backend/` folder
- Add env vars from `backend/.env` (MongoDB URL: use Atlas free tier — see below)
- Railway gives you a URL like `warehouse-api.railway.app`

**Option B: Render** (free 750 hr/month)
- Sign up at https://render.com → New Web Service → connect GitHub
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`

### Step 3 — Setup MongoDB Atlas (free 512 MB)
- Sign up at https://mongodb.com/cloud/atlas
- Create free M0 cluster
- Get connection string → use as `MONGO_URL` env var in Railway/Render

### Step 4 — Deploy frontend (Expo Web)
**Vercel** (recommended, free):
- `cd frontend && npx expo export --platform web` → produces `dist/`
- Sign up at https://vercel.com → New Project → import GitHub repo
- Root directory: `frontend`
- Build command: `npx expo export --platform web`
- Output directory: `dist`
- Add env var: `EXPO_PUBLIC_BACKEND_URL = https://warehouse-api.railway.app`
- Vercel gives you `warehouse-app.vercel.app`

### Step 5 — Point your domain
In **Lovable DNS panel**:
| Type | Host | Answer | TTL |
|---|---|---|---|
| `CNAME` | `app` | `warehouse-app.vercel.app` | 300 |
| `CNAME` | `api` | `warehouse-api.railway.app` | 300 |

Then in Vercel: Project Settings → Domains → add `app.eccentrics.live`. Same in Railway for `api.eccentrics.live`.

Finally update frontend env: `EXPO_PUBLIC_BACKEND_URL = https://api.eccentrics.live` and redeploy.

---

## 📱 Mobile App (iOS / Android)

To get installable apps:
1. Click **Publish** in Emergent → **Mobile App**
2. Choose iOS (.ipa) or Android (.apk)
3. Emergent builds via EAS — first build takes ~15 min
4. Download the build or share TestFlight/Play Store internal-testing links

The mobile app will connect to whichever backend URL you configure in env vars during build.

---

## ⚙️ Required Environment Variables for Production

### Backend
```
MONGO_URL=mongodb+srv://...@cluster.mongodb.net/warehouse_db
DB_NAME=warehouse_db
JWT_SECRET_KEY=<generate-new-32-char-random-string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
SEED_MANAGER_EMAIL=manager@warehouse.com
SEED_MANAGER_PASSWORD=<your-strong-password>
SEED_ASST_EMAIL=asst@warehouse.com
SEED_ASST_PASSWORD=<your-strong-password>
SEED_DC_EMAIL=dc@warehouse.com
SEED_DC_PASSWORD=<your-strong-password>
```

⚠️ **Important**: Change the seed passwords before production deployment!

### Frontend
```
EXPO_PUBLIC_BACKEND_URL=https://api.eccentrics.live   (or your Railway/Render URL)
```

---

## 🤖 Cost Summary

| Service | Free Tier | Sufficient? |
|---|---|---|
| MongoDB Atlas M0 | 512 MB | ✅ Plenty for 14 employees × years |
| Railway | $5 credit/mo | ✅ ~3¢/hr → free under continuous use |
| Vercel | Hobby | ✅ Unlimited static hosting |
| Lovable Domain | $25/yr (already paid) | ✅ |
| Emergent Publish | Per Emergent plan | ✅ Easiest single-platform |

**Total monthly cost: $0** if you pick free tiers, or use Emergent Publish included with your plan.

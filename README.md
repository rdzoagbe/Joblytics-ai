# FitScore — Know before you apply

ATS CV analyzer — paste a job offer + your CV, get an instant match score and actionable recommendations.

## Stack
- React + Vite (PWA — installable on mobile)
- Anthropic Claude API for ATS analysis
- Express for production serving
- Railway for deployment

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local

# 3. Add your Anthropic API key to .env.local (server-only — do NOT use a VITE_ prefix)
# ANTHROPIC_API_KEY=sk-ant-...

# 4. Run dev server
npm run dev
```

---

## Deploy to Railway

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit — FitScore"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fitscore.git
git push -u origin main
```

### Step 2 — Create Railway project
1. Go to [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `fitscore` repo
4. Railway auto-detects the config from `railway.toml`

### Step 3 — Add environment variable
1. In your Railway project → **Variables** tab
2. Add: `ANTHROPIC_API_KEY` = your Anthropic API key (server-only; never `VITE_`-prefixed)
3. Railway will automatically rebuild and redeploy

### Step 4 — Get your URL
Railway gives you a public URL like `fitscore-production.up.railway.app`

---

## Install as mobile app (PWA)

**iPhone (Safari):**
1. Open your Railway URL in Safari
2. Tap the Share button
3. Tap "Add to Home Screen"
4. FitScore appears like a native app

**Android (Chrome):**
1. Open your Railway URL in Chrome
2. Tap the menu (3 dots)
3. Tap "Add to Home screen" or "Install app"

---

## How it works
1. Paste job offer text
2. Paste your CV text
3. AI runs ATS simulation: keyword match, skills, experience, education
4. Score out of 100 — aim for 80%+
5. Missing keywords and specific recommendations to improve

---

## Current deployment and data

The production application uses **Vercel** (serverless API + Vite PWA) and **Supabase** (authentication, stored analysis history, application tracking, subscriptions and optional Smart Sync records). Anthropic powers AI explanations; Stripe is used for paid subscriptions. Sentry is integrated for error monitoring when configured.

CV files saved through the master CV selector are stored in the browser's IndexedDB, scoped by user ID; they are not automatically synced between devices. Analysis content and Smart Sync signals **may be stored server-side**, as described in the Privacy Policy. The README's earlier "no data stored" wording was outdated.

Secrets (including the Anthropic API key and Supabase service-role key) belong **only** in server-side Vercel environment variables, never in frontend `VITE_*` variables.

See [the November 2026 stabilization release runbook](docs/STABILIZATION_2026_11.md) for migration order, billing/quotas, preview checks and Sentry verification. Existing Railway instructions above are legacy and should not be used for the current production deployment.

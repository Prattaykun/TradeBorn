# Deploy

The Fastify API lives in `apps/api` inside a **pnpm** workspace. Host it on [Render](https://render.com) as a **Web Service**. Keep Neon as the database — do not create a Render Postgres for this prototype.

The API binds `0.0.0.0` and, on Render, listens on **`PORT`** (Render injects this). Locally it still uses `API_PORT` (default `4000`).

---

## Backend on Render

### 0. Before you click Deploy

- Repo is on GitHub (`main`).
- Neon is awake. `pgvector` is enabled:

  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

- You already ran migrate + seed at least once against that Neon DB (see [localrun.md](../localrun.md)). If this is a fresh database, you will run migrate/seed from the Render shell after the first deploy.

### 1. New Web Service

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
2. Connect **GitHub** → `Prattaykun/TradeBorn` (or your fork).
3. Settings:

| Field | Value |
| ----- | ----- |
| **Name** | `tradeborn-api` (anything unique) |
| **Language / runtime** | Node |
| **Branch** | `main` |
| **Root directory** | leave **empty** (repo root — pnpm workspace) |
| **Build command** | see below |
| **Start command** | see below |
| **Instance** | Free is enough for the demo |

**Build command** (repo root):

```bash
corepack enable && pnpm install && pnpm --filter @TradeBorn/api exec prisma generate
```

**Start command** (repo root):

```bash
pnpm start:api
```

That runs `tsx src/server.ts` in `apps/api` so the workspace package `@TradeBorn/shared` (TypeScript source) loads.

**Health check path:** `/health`  
You should get `{ "ok": true }`.

### 2. Environment variables

Dashboard → the service → **Environment**. Add:

| Key | Required | What to put |
| --- | -------- | ----------- |
| `NODE_VERSION` | Yes | `20` |
| `DATABASE_URL` | Yes | Neon **pooled** URL (`-pooler` host, `sslmode=require`). Same as local `.env`. |
| `DIRECT_URL` | Yes | Neon **direct** URL (host **without** `-pooler`). Used by Prisma migrate. |
| `API_HOST` | Yes | `0.0.0.0` |
| `CORS_ORIGIN` | Yes | Your frontend origin, e.g. `https://your-app.vercel.app` (comma-separated if you also want localhost: `https://your-app.vercel.app,http://localhost:3000`) |
| `LLM_PROVIDER` | No | `google` / `groq` / `openai` — heuristics work if omitted |
| `LLM_API_KEY` | No | Provider key |
| `LLM_MODEL` | No | e.g. `gemini-2.0-flash` |
| `EMBEDDING_PROVIDER` | No | `google` or `none` |
| `EMBEDDING_API_KEY` | No | If unset, RAG falls back to keyword/FTS |
| `EMBEDDING_MODEL` | No | e.g. `gemini-embedding-001` |
| `EMBEDDING_DIMENSIONS` | No | `768` for that Gemini embedding model |
| `BRAVE_SEARCH_API_KEY` | No | Paid only |
| `TAVILY_API_KEY` | No | Optional |

Do **not** set `API_PORT` on Render. Render assigns `PORT`; the API copies `PORT` → listen port automatically.

Save → wait for the first deploy to go **Live**.

### 3. First-time database (if Neon is empty)

Open the service → **Shell**:

```bash
pnpm db:migrate
pnpm db:seed
```

Seed reads `data/nifty50_daily.csv` and `data/knowledge/*.md` from the repo. It is safe to skip if you already seeded this Neon from your laptop.

Optional **pre-deploy** command (Dashboard → Settings) so schema stays current on every push:

```bash
pnpm db:migrate
```

Do **not** put `db:seed` on every deploy — it is slow and you only need the CSV once.

### 4. Point the web app at Render

On Vercel (or whatever hosts `apps/web`):

```bash
NEXT_PUBLIC_API_URL=https://tradeborn-api.onrender.com
```

No trailing slash. Redeploy the frontend after changing it.

Check:

```bash
curl https://tradeborn-api.onrender.com/health
```

Then open the site and run Ask → Learn once. If the browser blocks requests, `CORS_ORIGIN` does not match the exact frontend URL (scheme + host, no path).

### 5. Free-tier notes

- The API **spins down** after idle. The first request after that can take 30–60s. Health check and the first “Start research” click may look hung; wait.
- Keep Neon on the same region you picked on Render if you can; it is only latency, not a hard requirement.
- Logs: Render → service → **Logs**. Fastify request logs show there.

### 6. Typical failures

| Symptom | Likely cause |
| ------- | ------------ |
| Deploy crash loop, `listen` / EADDRINUSE or “Application exited” | Process not bound to `PORT` / `0.0.0.0` — confirm `API_HOST=0.0.0.0` and a recent `main` that reads `PORT`. |
| Build fails on `pnpm` | Add `NODE_VERSION=20`. `package.json` already has `"packageManager": "pnpm@9.15.0"`. |
| `Prisma` / `DATABASE_URL` errors | Pooled URL missing `sslmode=require`, or you put the direct URL in `DATABASE_URL`. |
| CORS errors in the browser | `CORS_ORIGIN` must be the Vercel origin exactly (`https://….vercel.app`). |
| Empty backtest / no bars | Seed never ran against this Neon. Shell: `pnpm db:seed`. |
| `/health` 404 | Start command ran from the wrong folder. Root directory must be empty; start must be `pnpm start:api`. |

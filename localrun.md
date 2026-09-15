# Running TradeBorn locally

No Docker database is required. Use your **Neon** Postgres connection strings.

## Prerequisites

- Node.js **20+**
- **pnpm** 9+ (`npm install -g pnpm`)
- A Neon project with connection strings
- Optional: `LLM_API_KEY` (OpenAI / Groq), embedding key, Brave/Tavily keys
- Optional: [Ollama](https://ollama.com) for fully offline LLM

## 1. Install

```bash
cd TradeBorn
pnpm install
```

## 2. Environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes** | Neon **pooled** connection (`sslmode=require`) |
| `DIRECT_URL` | **Yes** for migrate | Neon **unpooled / direct** connection |
| `LLM_API_KEY` | No | Without it, clarification/explain use heuristics |
| `LLM_PROVIDER` | No | `openai`, `groq`, `google`/`gemini`, `ollama` |
| `EMBEDDING_API_KEY` | No | Without it, RAG uses Postgres FTS + MiniSearch |
| `EMBEDDING_MODEL` | No | For Google use `gemini-embedding-001` (dims 768/1536/3072) |
| `BRAVE_SEARCH_API_KEY` | No | **Paid** Brave Search API (prepaid credits). Skip if you don’t want to pay — free fallbacks still work |
| `TAVILY_API_KEY` | No | Optional paid search; same idea |
| `SEARXNG_URL` | No | Optional self-hosted SearXNG |
| `NEXT_PUBLIC_API_URL` | No | Default `http://localhost:4000` |

Enable **pgvector** on Neon (SQL editor or first migrate):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## 3. Database migrate + seed

From the repo root (with `.env` loaded):

```bash
pnpm db:generate
pnpm --filter @TradeBorn/api exec prisma migrate deploy
pnpm db:seed
```

If `migrate deploy` complains about history **or Neon already has other project tables**, do **not** use `db push --accept-data-loss` (it can drop unrelated tables). Instead:

```bash
# copy root .env into apps/api so Prisma CLI sees it
cp .env apps/api/.env
pnpm --filter @TradeBorn/api exec prisma db execute --file prisma/migrations/20260328000000_init/migration.sql --schema prisma/schema.prisma
pnpm db:seed
```

Seed will:

- Import `data/nifty50_daily.csv` into `datasets` / `market_bars` with checksum
- Ingest `data/knowledge/*.md` into `knowledge_documents` / `knowledge_chunks`
- Embed chunks when `EMBEDDING_API_KEY` (or Ollama embeddings) is configured

## 4. Start API and web

Terminal A:

```bash
pnpm dev:api
```

Terminal B:

```bash
pnpm dev:web
```

Or both:

```bash
pnpm dev
```

- Web: http://localhost:3000  
- API health: http://localhost:4000/health  

## 5. Demo click-path

1. Open http://localhost:3000  
2. Click **Use example question** → **Start research**  
3. On **Clarify**, change threshold or holding period (or accept defaults)  
4. **Define** → review JSON and dataset checksum  
5. **Test** → **Run experiment** (engine metrics only)  
6. **Learn** → charts, trades, warnings, OpenUI / AI interpretation  

## Search without API keys

`POST /api/search` tries providers in order and stops at the first non-empty result:

1. Brave (only if `BRAVE_SEARCH_API_KEY` set — **paid** API, no free tier)  
2. Tavily (only if key set)  
3. DuckDuckGo (no key)  
4. SearXNG (if `SEARXNG_URL`)  
5. Wikipedia (no key)  
6. Local MiniSearch over `data/knowledge` (always on)  

## RAG without embeddings

If embeddings are unset or fail, `retrieve_knowledge` falls back to:

1. Postgres full-text search on `knowledge_chunks`  
2. MiniSearch over local markdown  

## Offline LLM (Ollama)

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
OLLAMA_BASE_URL=http://127.0.0.1:11434
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
```

Pull models in Ollama first. Adjust `EMBEDDING_DIMENSIONS` / re-ingest if the vector size differs from 1536.

## Tests

```bash
pnpm test
```

Backtest engine unit tests cover no-signals, sharp-fall entry timing, incomplete trades, overlap on/off, invalid threshold, and determinism.

## Common failures

| Symptom | Fix |
|---|---|
| Prisma / SSL / Neon auth errors | Check pooled vs direct URLs; `DIRECT_URL` must **omit** `-pooler` |
| `db push` wants to drop other tables | Shared Neon DB — use `prisma db execute` on the migration SQL instead |
| Gemini 404 model not found | Use `LLM_MODEL=gemini-3.6-flash` (or current Google model id) |
| `type "vector" does not exist` | Run `CREATE EXTENSION vector;` on Neon |
| Embedding dimension mismatch | Re-seed after changing `EMBEDDING_MODEL` / dimensions |
| API CORS errors | Set `CORS_ORIGIN=http://localhost:3000` |
| Clarify/explain weak without key | Expected — heuristics still drive the workflow |
| OpenUI looks empty | Fallback parser / static panels still show; invalid Lang is rejected |
| Empty search | Local MiniSearch should still return methodology hits for “look-ahead”, “costs”, etc. |

## Project scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | API + web |
| `pnpm dev:api` / `pnpm dev:web` | Separate processes |
| `pnpm db:generate` | Prisma client |
| `pnpm db:migrate` | `prisma migrate deploy` |
| `pnpm db:push` | Schema push (dev) |
| `pnpm db:seed` | CSV + knowledge ingest |
| `pnpm test` | API Vitest |

## Disclaimer

Historical research only. Not investment advice. No live trading. Sample OHLC is for reproducible demos.

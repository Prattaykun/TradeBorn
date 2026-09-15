# Product Requirements Document  
## AI-Native Trading Research Explorer

This PRD defines a focused prototype for turning an ambiguous trading question into a transparent, testable research experiment. The recommended implementation uses **Next.js for the product UI, a Node.js backend for orchestration and backtesting, PostgreSQL with pgvector for research knowledge, and OpenUI Lang only for controlled generative UI—not for unvalidated financial conclusions**.

## 1. Product Overview

### Product name

**TradeBorn** — a question-to-evidence trading research workspace.

### Core problem

A user asks:

> “Does buying NIFTY after a sharp fall work?”

The question contains an intuitive hypothesis but not enough precision to test it. The product must help the user move through:

\[
\text{Question} \rightarrow \text{Clarification} \rightarrow \text{Experiment} \rightarrow \text{Evidence} \rightarrow \text{Learning}
\]

The system should not silently invent important parameters. It should expose assumptions, request confirmation where necessary, and clearly distinguish:

- What the user said.
- What the system assumed.
- What the dataset shows.
- What the system believes the evidence suggests.
- What remains unknown.

### Prototype goal

Build a working end-to-end demonstration that allows a reviewer to:

1. Enter the example question.
2. See missing definitions and assumptions.
3. Confirm or edit experiment parameters.
4. Run a lightweight backtest using sample or public historical data.
5. Inspect results, methodology, limitations, and next research questions.

### Non-goals

The prototype will not:

- Provide investment advice.
- Execute trades.
- Predict future prices.
- Claim statistical validity from a single experiment.
- Replace a professional-grade backtesting platform.
- Automatically generate arbitrary executable trading logic from untrusted LLM output.
- Depend on live market data for the core demo.

***

## 2. Product Principles

### Transparency over automation

Every generated parameter must be visible and editable.

### Reproducibility

A test should be represented as a versioned experiment specification. The same specification and dataset version should produce the same result.

### Evidence before interpretation

The product should show raw metrics before displaying an AI-generated explanation.

### Conservative assumptions

If a parameter materially affects the result, the system should ask the user or label it explicitly as a default.

### Separation of concerns

The LLM interprets language and explains results. The deterministic backtest engine calculates results.

### No false precision

The interface should communicate sample size, data coverage, costs, and limitations rather than presenting a single “buy” or “sell” answer.

***

## 3. Target Users

### Primary user

A retail investor, student, analyst, or researcher who wants to investigate a trading idea without writing a complete backtesting system.

### Secondary user

A hiring reviewer evaluating the candidate’s:

- Product thinking.
- Ability to manage ambiguity.
- Understanding of quantitative research risks.
- AI-assisted development workflow.
- Technical implementation quality.

### User need

The user wants to ask a natural-language market question and quickly understand:

- What the question actually means.
- Which parameters affect the result.
- Whether the historical evidence supports the hypothesis.
- What should be tested next.

***

## 4. Core User Journey

## ASK

The user enters a natural-language question.

Example:

> Does buying NIFTY after a sharp fall work?

The product detects:

- Market or instrument: probably NIFTY.
- Direction: buy.
- Trigger: sharp fall.
- Missing details: fall threshold, measurement window, entry timing, exit rule, holding period, date range, costs, and data source.

The system should present this interpretation as provisional, not factual.

## CLARIFY

The product shows a clarification panel:

| Parameter | Current status | Example default |
|---|---|---|
| Market | Partially identified | NIFTY 50 index |
| Sharp fall | Undefined | Daily close falls at least 5% over 5 sessions |
| Entry | Undefined | Next session open |
| Exit | Undefined | After 10 trading sessions |
| Holding period | Undefined | 10 sessions |
| Test period | Undefined | 2015–2025 |
| Costs | Undefined | 0.10% round trip |
| Data source | Undefined | Imported OHLC dataset |

The user can accept defaults, edit them, or answer individual questions.

## DEFINE

The system converts the clarified question into a structured experiment.

Example:

```json
{
  "market": {
    "symbol": "NIFTY50",
    "asset_type": "index"
  },
  "condition": {
    "type": "rolling_return",
    "window_sessions": 5,
    "threshold": -0.05
  },
  "entry": {
    "timing": "next_session_open",
    "price_field": "open"
  },
  "exit": {
    "type": "fixed_holding_period",
    "holding_sessions": 10,
    "price_field": "close"
  },
  "test_period": {
    "start": "2015-01-01",
    "end": "2025-12-31"
  },
  "costs": {
    "round_trip_bps": 10,
    "slippage_bps": 5
  },
  "hypothesis": "After a sharp five-session fall, NIFTY has a positive average return over the next ten trading sessions."
}
```

## TEST

The user clicks **Run experiment**.

The backend:

1. Validates the experiment specification.
2. Loads a versioned dataset.
3. Detects qualifying signals.
4. Applies the next-session entry rule.
5. Applies the exit rule.
6. Deducts transaction costs and slippage.
7. Calculates metrics.
8. Stores the experiment and result snapshot.

## LEARN

The results page displays:

- Number of qualifying events.
- Win rate.
- Average return.
- Median return.
- Total compounded return, if appropriate.
- Maximum drawdown.
- Best and worst trade.
- Benchmark comparison.
- Distribution of outcomes.
- Signal dates and trade table.
- Data and methodology warnings.
- AI interpretation grounded in computed metrics.
- Suggested follow-up experiments.

***

# 5. Functional Requirements

## 5.1 Ask screen

### Required features

- Large natural-language question input.
- Example question shortcut.
- “Start research” action.
- Recent experiment list, optional for MVP.
- Product disclaimer that results are historical research, not financial advice.

### Acceptance criteria

- The example question can be submitted with one click.
- The submitted question is persisted as part of a research session.
- The interface does not immediately show a result before clarification.

***

## 5.2 Clarification screen

### Required features

- Parsed interpretation of the question.
- Separate sections for:
  - User-stated information.
  - System interpretation.
  - Missing information.
  - Proposed defaults.
- Editable fields.
- Importance indicator:
  - Required.
  - Recommended.
  - Optional.
- Explanation for why each parameter matters.
- “Accept defaults” and “Customize” actions.

### Minimum questions

The product should ask or expose at least:

1. What instrument should be tested?
2. What qualifies as a sharp fall?
3. Over what time window should the fall be measured?
4. When should the position be entered?
5. How long should the position be held?
6. When should it be exited?
7. What historical period should be tested?
8. Should transaction costs and slippage be included?
9. Should overlapping signals be allowed?

### Acceptance criteria

- No important parameter is hidden.
- A user can change the fall threshold from 5% to another value.
- A user can change the holding period.
- The system prevents testing until required fields are valid.

***

## 5.3 Experiment definition screen

### Required features

- Structured experiment summary.
- Human-readable hypothesis.
- Machine-readable configuration preview.
- Editable experiment fields.
- Assumption badges.
- Dataset information.
- Research warnings.

### Example display

```text
MARKET
NIFTY 50 daily OHLC

CONDITION
Five-session close-to-close return <= -5%

ENTRY
Next trading session open

EXIT
Close after 10 trading sessions

COSTS
5 bps entry slippage + 5 bps exit slippage

HYPOTHESIS
Following a sharp fall, NIFTY produces positive average returns
over the next 10 trading sessions.
```

### Acceptance criteria

- Every experiment has a unique ID.
- The definition can be saved before execution.
- The exact configuration used for testing is retained.

***

## 5.4 Test screen

### Required features

- Run status.
- Dataset name and version.
- Progress indicator.
- Validation messages.
- Results generated by deterministic backend logic.
- Error state for missing or invalid data.

### MVP execution model

For a 3–4 hour prototype, a synchronous API request is acceptable if the sample dataset is small. The architecture should still define a path toward asynchronous jobs.

### Future execution model

```text
Create experiment
      ↓
Create backtest job
      ↓
Worker executes job
      ↓
Persist metrics and trades
      ↓
Stream status to client
```

***

## 5.5 Learn screen

### Required sections

#### Result headline

Example:

> The historical sample showed positive average returns after the selected five-session fall, but the sample contained only 18 signals and does not establish a reliable trading edge.

#### What the data shows

This section must be generated from deterministic values:

- 18 signals.
- 11 profitable trades.
- 61.1% win rate.
- 0.74% average net return.
- 0.32% median net return.
- 6.8% maximum drawdown.
- 10-session holding period.
- 10 bps round-trip cost assumption.

#### What the system concludes

The AI may state:

> Under this specific definition, the historical sample is directionally consistent with the hypothesis. However, the low number of observations, possible regime changes, and sensitivity to the threshold mean that this should be treated as an exploratory result rather than evidence of a robust strategy.

#### What remains uncertain

- Whether the effect survives different thresholds.
- Whether results are concentrated in one market regime.
- Whether the signal remains profitable after realistic execution assumptions.
- Whether overlapping trades distort the sample.
- Whether the effect persists out of sample.

#### Next questions

Suggested follow-up experiments:

- Test thresholds from -3% to -8%.
- Compare 5-, 10-, and 20-session holding periods.
- Compare NIFTY 50 with NIFTY Next 50 or Bank NIFTY.
- Use walk-forward validation.
- Separate bull, bear, and sideways regimes.
- Compare close-entry versus next-open entry.
- Include higher slippage assumptions.

***

# 6. Experiment and Backtest Design

## 6.1 Recommended MVP strategy definition

### Market

NIFTY 50 daily OHLC data.

For the prototype, a CSV dataset is preferable to a live API because it provides:

- Reproducibility.
- No API key dependency.
- No rate-limit failure during the demo.
- Stable outputs for video recording.
- Clear data provenance.

### Sharp fall condition

Define a sharp fall as:

\[
R_t = \frac{Close_t}{Close_{t-5}} - 1 \leq -5\%
\]

This means the closing price has fallen by at least 5% over the previous five trading sessions.

### Entry

Enter at the next trading session’s open.

This avoids using information that would not have been available before the signal was complete.

### Exit

Exit at the close after 10 trading sessions.

If the dataset ends before the exit date, the signal is excluded from the completed-trade statistics and reported separately.

### Signal overlap

For the first version, disallow overlapping trades.

Reason: it makes the result easier to explain and avoids unintentionally counting the same market event multiple times.

### Test period

Use a fixed historical period available in the imported dataset, such as 2015–2025. The displayed period must come from the actual data rather than being hardcoded as a claim.

### Cost assumptions

Apply a simple configurable round-trip cost:

\[
NetReturn = GrossReturn - EntrySlippage - ExitSlippage - Fees
\]

For example:

- Entry slippage: 5 basis points.
- Exit slippage: 5 basis points.
- Total simplified execution cost: 10 basis points.

The UI must label this as a simplified assumption rather than a complete representation of brokerage, taxes, market impact, or index tracking error.

***

## 6.2 Metrics

### Primary metrics

- Number of signals.
- Number of completed trades.
- Win rate.
- Average net return.
- Median net return.
- Cumulative compounded return.
- Maximum drawdown.
- Profit factor.
- Average holding-period return.
- Benchmark return over the same period.

### Secondary metrics

- Standard deviation of returns.
- Best trade.
- Worst trade.
- Longest winning streak.
- Longest losing streak.
- Return by calendar year.
- Return distribution.
- Signal density.

### Statistical caution

The product should not display a “confidence score” unless it has a defensible statistical basis. For the MVP, use plain-language warnings such as:

- Very small sample.
- Results sensitive to parameter choice.
- No out-of-sample validation.
- Simplified cost model.
- Historical relationship may not persist.

***

## 6.3 Data model

### `research_sessions`

```sql
id uuid primary key
user_id uuid null
question text not null
status text not null
created_at timestamptz not null
updated_at timestamptz not null
```

### `experiment_definitions`

```sql
id uuid primary key
session_id uuid references research_sessions(id)
version integer not null
definition jsonb not null
hypothesis text not null
assumptions jsonb not null
created_at timestamptz not null
```

### `datasets`

```sql
id uuid primary key
name text not null
symbol text not null
source text not null
version text not null
start_date date not null
end_date date not null
row_count integer not null
checksum text not null
metadata jsonb not null
created_at timestamptz not null
```

### `market_bars`

```sql
dataset_id uuid references datasets(id)
trade_date date not null
open numeric not null
high numeric not null
low numeric not null
close numeric not null
volume numeric null
primary key (dataset_id, trade_date)
```

### `backtest_runs`

```sql
id uuid primary key
experiment_id uuid references experiment_definitions(id)
dataset_id uuid references datasets(id)
status text not null
started_at timestamptz null
completed_at timestamptz null
metrics jsonb null
warnings jsonb null
error_message text null
```

### `backtest_trades`

```sql
id uuid primary key
backtest_run_id uuid references backtest_runs(id)
signal_date date not null
entry_date date not null
exit_date date not null
entry_price numeric not null
exit_price numeric not null
gross_return numeric not null
cost_return numeric not null
net_return numeric not null
metadata jsonb not null
```

### `knowledge_documents`

```sql
id uuid primary key
title text not null
source_url text null
document_type text not null
content text not null
metadata jsonb not null
created_at timestamptz not null
```

### `knowledge_chunks`

```sql
id uuid primary key
document_id uuid references knowledge_documents(id)
chunk_index integer not null
content text not null
embedding vector(1536) null
metadata jsonb not null
created_at timestamptz not null
```

The embedding dimension should match the selected embedding model. If a different embedding model is used, the vector dimension and index migration must be updated.

***

# 7. Technical Architecture

## 7.1 Recommended topology

```text
┌───────────────────────────────────────┐
│ Next.js Web Application                │
│ App Router, React, Tailwind, charts   │
└───────────────┬───────────────────────┘
                │ HTTPS / SSE
┌───────────────▼───────────────────────┐
│ Node.js Application Backend            │
│ Fastify or NestJS                      │
│ Auth, validation, AI orchestration,   │
│ experiment APIs, research services     │
└───────┬──────────────┬────────────────┘
        │              │
        │              ├───────────────┐
        │              │               │
┌───────▼───────┐ ┌────▼──────────┐ ┌──▼───────────────┐
│ PostgreSQL    │ │ LLM Provider  │ │ Search Provider  │
│ + pgvector    │ │ structured AI │ │ optional sources │
└───────┬───────┘ └───────────────┘ └──────────────────┘
        │
┌───────▼────────────┐
│ Backtest Service   │
│ deterministic JS   │
│ calculations       │
└────────────────────┘
```

## 7.2 Frontend

### Recommended stack

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- shadcn/ui or another controlled component library.
- Recharts or Apache ECharts.
- React Hook Form.
- Zod.
- Vercel AI SDK for streaming, if desired.
- OpenUI Lang for selected dynamic components.

### Frontend responsibilities

- Render screens and workflow state.
- Validate basic form input.
- Display structured experiment definitions.
- Render charts and tables.
- Stream AI explanations.
- Never calculate authoritative backtest metrics in the browser.

***

## 7.3 Node.js backend

Use a separate Node.js service if the assignment explicitly expects a backend, rather than placing all logic inside Next.js route handlers.

### Suggested framework

**Fastify** is a good MVP choice because it is lightweight and TypeScript-friendly. NestJS is suitable if you want more formal module structure, but may add unnecessary setup for this challenge.

### Backend modules

```text
src/
  modules/
    research/
      research.controller.ts
      research.service.ts
      research.schemas.ts
    clarification/
      clarification.service.ts
    experiments/
      experiment.service.ts
      experiment.repository.ts
    backtests/
      backtest.service.ts
      backtest.engine.ts
      metrics.service.ts
    datasets/
      dataset.service.ts
    ai/
      llm.service.ts
      prompts/
    rag/
      retrieval.service.ts
    search/
      search.service.ts
  infrastructure/
    database/
    logging/
    config/
  app.ts
  server.ts
```

### API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/research/sessions` | Create a research session from a question |
| GET | `/api/research/sessions/:id` | Retrieve session state |
| POST | `/api/research/sessions/:id/clarify` | Generate or save clarification data |
| POST | `/api/research/sessions/:id/experiment` | Create an experiment definition |
| POST | `/api/experiments/:id/validate` | Validate parameters and dataset availability |
| POST | `/api/experiments/:id/run` | Execute a backtest |
| GET | `/api/backtests/:id` | Retrieve run status and metrics |
| GET | `/api/backtests/:id/trades` | Retrieve trade-level output |
| POST | `/api/ai/explain-results` | Generate grounded explanation |
| POST | `/api/search` | Search external research sources, optional |
| GET | `/api/datasets` | List available datasets |

### API response design

AI-generated fields should be separate from deterministic fields:

```json
{
  "data": {
    "trade_count": 18,
    "win_rate": 0.611,
    "average_net_return": 0.0074,
    "max_drawdown": 0.068
  },
  "interpretation": {
    "text": "...",
    "generated_by": "llm",
    "context_metric_ids": [
      "trade_count",
      "win_rate",
      "average_net_return"
    ]
  },
  "warnings": [
    "Small sample size",
    "No out-of-sample validation"
  ]
}
```

***

## 7.4 Backtest engine

The backtest engine must be deterministic and independent of the LLM.

### Pseudocode

```ts
for each bar index i:
  if close[i] / close[i - lookback] - 1 <= threshold:
    entryIndex = i + 1
    exitIndex = entryIndex + holdingPeriod - 1

    if exitIndex >= bars.length:
      continue

    if overlappingSignalsDisabled && activeTradeExists:
      continue

    entryPrice = bars[entryIndex].open * (1 + entrySlippage)
    exitPrice = bars[exitIndex].close * (1 - exitSlippage)

    grossReturn = exitPrice / entryPrice - 1
    netReturn = grossReturn - fees

    save trade
```

### Important implementation decisions

- Use only data available at signal time.
- Enter no earlier than the next bar.
- Do not use future bars to define the signal.
- Exclude incomplete trades or label them explicitly.
- Preserve dataset checksum and experiment configuration.
- Add unit tests for boundary conditions.

### Test cases

- No signals found.
- Signal on the final available date.
- Multiple signals on consecutive dates.
- Overlapping trades enabled.
- Overlapping trades disabled.
- Missing OHLC values.
- Zero or negative prices.
- Holding period greater than available data.
- Invalid threshold.
- Date range outside dataset coverage.

***

# 8. AI Interaction Design

## 8.1 LLM responsibilities

The LLM may:

- Extract candidate entities from the user’s question.
- Identify ambiguity.
- Generate clarification questions.
- Convert confirmed inputs into a structured experiment.
- Explain computed results.
- Suggest follow-up experiments.
- Summarize limitations.

The LLM must not:

- Calculate final performance metrics.
- Modify backtest results.
- Invent historical data.
- Present assumptions as user requirements.
- Claim that a strategy is profitable without referencing the actual metrics.
- Generate executable code that bypasses validation.

## 8.2 Structured output

Use Zod schemas and structured model output.

```ts
const ClarificationSchema = z.object({
  interpretation: z.object({
    market: z.string().nullable(),
    action: z.enum(["buy", "sell", "unknown"]),
    trigger: z.string().nullable()
  }),
  missingParameters: z.array(z.object({
    key: z.string(),
    label: z.string(),
    importance: z.enum(["required", "recommended", "optional"]),
    reason: z.string()
  })),
  proposedDefaults: z.record(z.string(), z.unknown()),
  questions: z.array(z.string())
});
```

## 8.3 Prompt policy

System prompt principles:

```text
You are a research assistant, not a financial adviser.

Separate:
1. User-provided facts.
2. System assumptions.
3. Questions requiring user confirmation.
4. Deterministic results.
5. Interpretive conclusions.

Never invent market data or numerical results.
Use only the supplied experiment definition, metrics, warnings, and retrieved sources.
If evidence is insufficient, say so explicitly.
```

## 8.4 AI-generated UI

OpenUI Lang can be used to render controlled components such as:

- Clarification cards.
- Assumption badges.
- Experiment summaries.
- Result explanation panels.
- Follow-up question cards.

The product should use an allowlisted component library rather than permitting arbitrary generated React code.

Suggested OpenUI component set:

```text
ResearchSummary
ClarificationCard
AssumptionBadge
ExperimentField
MetricCard
WarningPanel
TradeTable
ResultInterpretation
FollowUpQuestion
SourceCitation
```

OpenUI Lang provides a React runtime for defining component libraries, parsing OpenUI output, and rendering streamed component structures. The official documentation identifies `@openuidev/react-lang` as the package for this runtime and renderer. [openui](https://www.openui.com/docs/api-reference/react-lang)

### Recommended OpenUI boundary

```text
LLM output
  ↓
OpenUI parser
  ↓
Schema validation
  ↓
Allowlisted component renderer
  ↓
React UI
```

Never render arbitrary HTML, JavaScript, or unvalidated component names from model output.

***

# 9. RAG and Knowledge Architecture

## 9.1 Is RAG required for the MVP?

RAG is **not required** for the core backtest demonstration.

The first version can produce a stronger submission by prioritizing:

- Explicit assumptions.
- Deterministic calculations.
- Reproducible data.
- Clear limitations.
- Good product flow.

RAG becomes useful for:

- Explaining concepts such as look-ahead bias.
- Retrieving methodology documentation.
- Showing citations for data-source definitions.
- Answering questions about transaction costs.
- Storing internal research notes.
- Providing contextual references alongside results.

Do not add RAG merely to make the architecture look sophisticated.

## 9.2 pgvector design

PostgreSQL with pgvector is suitable because it stores structured experiments, datasets, backtest results, and semantic research chunks in one system. A reference Next.js RAG implementation uses PostgreSQL, pgvector, embeddings, metadata, and background ingestion together, which is a reasonable pattern for this product. [github](https://github.com/HamedMP/NextRag)

### RAG pipeline

```text
Research document
      ↓
Extract and clean text
      ↓
Chunk into sections
      ↓
Generate embeddings
      ↓
Store in knowledge_chunks
      ↓
Embed user query
      ↓
Vector similarity search
      ↓
Filter by metadata
      ↓
Pass selected context to LLM
```

### Retrieval query

```sql
SELECT
  id,
  content,
  metadata,
  1 - (embedding <=> $1::vector) AS similarity
FROM knowledge_chunks
WHERE metadata->>'topic' = ANY($2)
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

### Recommended metadata

```json
{
  "topic": "backtesting_bias",
  "instrument": "equities",
  "source_type": "methodology",
  "source_url": "...",
  "publication_date": "2025-01-01"
}
```

### MVP choice

Use pgvector only if you can implement it without compromising the core journey. For a time-boxed submission:

- Phase 1: store methodology notes as static Markdown or database records.
- Phase 2: add embeddings and retrieval.
- Phase 3: show retrieved sources in the result explanation.

***

# 10. Search Integration

## 10.1 Recommendation

Do not make web search a dependency for the main demo. Search APIs introduce:

- API key configuration.
- Rate limits.
- Inconsistent sources.
- Network failure.
- Reproducibility problems.
- Possible licensing and scraping issues.

Use a curated local knowledge base for the recorded demonstration. Add external search as an optional research feature.

## 10.2 Google Custom Search

Google’s Custom Search JSON API currently documents 100 free queries per day, but the official page states that the API is not available to new customers and is scheduled for discontinuation on January 1, 2027. Therefore, it should not be the foundation of a new prototype. [developers.google](https://developers.google.com/custom-search/v1/overview)

## 10.3 Search provider abstraction

Create a provider interface so the backend can swap services:

```ts
export interface SearchProvider {
  search(input: {
    query: string;
    limit: number;
    domains?: string[];
  }): Promise<SearchResult[]>;
}
```

Possible implementations:

```text
GoogleCustomSearchProvider
BraveSearchProvider
TavilyProvider
SerpApiProvider
SearXNGProvider
LocalKnowledgeProvider
```

### Suggested MVP fallback order

1. Local curated documents.
2. Brave or Tavily, if an account and free quota are available.
3. Google Custom Search only for an existing eligible account.
4. Self-hosted SearXNG for experimentation, not as a production dependency.

### Search safety rules

- Store query, provider, timestamp, and returned sources.
- Display source URLs and publication dates.
- Never treat search snippets as market data.
- Do not pass arbitrary web content into the model without sanitization.
- Label externally retrieved claims separately from computed results.
- Cache search results for reproducibility.

***

# 11. Frontend Information Architecture

## 11.1 Routes

```text
/
  Landing and question input

/research/new
  Ask and clarify

/research/[sessionId]/clarify
  Clarification workflow

/research/[sessionId]/define
  Experiment definition

/research/[sessionId]/test
  Backtest execution

/research/[sessionId]/learn
  Results and interpretation
```

## 11.2 Main components

```text
QuestionComposer
InterpretationPanel
MissingParametersPanel
AssumptionEditor
ExperimentDefinitionCard
DatasetSelector
RunExperimentButton
BacktestProgress
MetricGrid
EquityCurve
ReturnDistribution
TradeTable
MethodologyDrawer
EvidencePanel
FollowUpExperimentCards
```

## 11.3 Visual design direction

Use a research-notebook aesthetic:

- Neutral background.
- Strong typography.
- Blue for system-generated structure.
- Amber for assumptions.
- Green/red only for historical return values.
- Purple or indigo for AI interpretation.
- Clear separation between facts, assumptions, and conclusions.

Avoid a trading-terminal design that could imply live execution or investment advice.

## 11.4 Responsive behavior

Desktop is the primary demo target, but the workflow should remain usable on smaller screens:

- Stack experiment fields vertically.
- Make charts horizontally scrollable.
- Keep the run and next-step actions sticky.
- Use collapsible methodology panels.

***

# 12. Security and Reliability

## Security requirements

- Store API keys only on the server.
- Validate all LLM structured outputs with Zod.
- Sanitize web content before indexing.
- Apply request rate limits to AI and search endpoints.
- Use parameterized SQL queries.
- Do not expose database credentials to the client.
- Restrict OpenUI components to an allowlist.
- Log experiment IDs, dataset versions, and model versions.
- Avoid storing sensitive user data in prompts.

## Reliability requirements

- Every backtest result must reference a dataset version.
- Every result must reference an experiment definition.
- Failed runs must show a human-readable error.
- Partial or incomplete trades must be explicitly labelled.
- AI explanations should fail gracefully if the model is unavailable.
- The deterministic result page should remain usable without AI.

## Observability

Log:

```text
request_id
session_id
experiment_id
dataset_id
model_name
prompt_version
latency_ms
token_usage
search_provider
backtest_status
error_code
```

***

# 13. Recommended Technology Stack

| Layer | Recommendation | Reason |
|---|---|---|
| Frontend | Next.js, TypeScript, Tailwind | Fast product development and strong deployment support |
| UI components | shadcn/ui plus custom research components | Controlled, accessible, easy to style |
| Charts | Recharts or Apache ECharts | Suitable for equity curves and distributions |
| Backend | Node.js with Fastify | Lightweight API and good TypeScript support |
| Validation | Zod | Shared validation for API and AI outputs |
| Database | PostgreSQL | Structured experiments, datasets, metrics, and metadata |
| Vector search | pgvector | Keeps structured and semantic research data together |
| ORM/querying | Drizzle or Prisma plus SQL for vector queries | Type safety with explicit control |
| AI orchestration | Vercel AI SDK or direct provider SDK | Streaming and structured generation |
| Generative UI | `@openuidev/react-lang` | Controlled OpenUI Lang rendering |
| Background jobs | Inngest or BullMQ, optional | Useful when ingestion and backtests become asynchronous |
| Cache | Redis or Upstash, optional | Useful for search, embeddings, and repeated explanations |
| Deployment | Vercel for Next.js, Render/Fly.io/Railway for Node.js and Postgres | Simple deployment path for an internship prototype |
| Data input | Versioned CSV | Reproducible and reliable demo |

A Next.js App Router service with PostgreSQL, pgvector, pooled database connections, and streaming generation is a common architecture for this type of RAG application. [markaicode](https://markaicode.com/architecture/nextjs-rag-architecture/)

***

# 14. MVP Scope

## Must have

- Question input.
- Ambiguity detection.
- Visible assumptions.
- Editable experiment definition.
- Imported NIFTY-style OHLC dataset.
- Deterministic backtest.
- Metrics and trade table.
- Basic charts.
- Data versus interpretation separation.
- Warnings and limitations.
- README and thinking note support.

## Should have

- Streaming AI clarification.
- Streaming AI result explanation.
- Experiment configuration JSON.
- Dataset metadata panel.
- Downloadable result JSON or CSV.
- Follow-up experiment suggestions.
- Prompt and model version tracking.

## Could have

- pgvector RAG.
- External web search.
- Multiple instruments.
- Walk-forward testing.
- Parameter sensitivity analysis.
- User accounts.
- Background job queue.
- Experiment comparison view.

## Won’t have in MVP

- Live brokerage integration.
- Automated trading.
- Intraday data.
- Options strategy modelling.
- Portfolio optimization.
- Production-grade statistical inference.
- Arbitrary user-authored strategy code execution.

***

# 15. Implementation Plan

## Phase 1: Foundation

- Initialize monorepo.
- Create Next.js frontend.
- Create Fastify backend.
- Configure PostgreSQL.
- Add shared TypeScript types and Zod schemas.
- Add sample dataset and database seed script.

## Phase 2: Research workflow

- Build question input.
- Add clarification state.
- Add experiment definition editor.
- Implement session and experiment persistence.
- Add navigation between workflow stages.

## Phase 3: Backtest engine

- Implement signal detection.
- Implement next-open entry.
- Implement fixed-period exit.
- Implement costs and slippage.
- Implement metrics.
- Add unit tests.

## Phase 4: Results interface

- Add metric cards.
- Add equity curve.
- Add return distribution.
- Add trade table.
- Add methodology and warning panels.
- Add benchmark comparison.

## Phase 5: AI integration

- Add structured question interpretation.
- Add clarification generation.
- Add result explanation.
- Add follow-up questions.
- Add grounded prompt with deterministic metrics.

## Phase 6: OpenUI and optional RAG

- Add allowlisted OpenUI components.
- Add static methodology documents.
- Add pgvector ingestion if time permits.
- Add source citations to AI explanation.
- Add optional search provider abstraction.

## Phase 7: Submission package

- Deploy frontend and backend.
- Record demo.
- Write thinking note.
- Write README.
- Write AI usage note.
- Add architecture diagram.
- Add setup instructions.
- Test clean installation from a fresh clone.

***

# 16. Acceptance Criteria

The prototype is complete when a reviewer can:

1. Open the deployed application.
2. Enter the supplied question.
3. See that “sharp fall” is ambiguous.
4. See which fields are assumptions.
5. Modify at least one parameter.
6. Confirm the experiment definition.
7. Run the test.
8. View deterministic historical results.
9. Inspect individual trades.
10. Read limitations and warnings.
11. See a clear difference between data and AI interpretation.
12. Identify what should be tested next.
13. Re-run the same experiment and obtain the same result using the same dataset version.

***

# 17. Thinking Note Content

The separate two-page thinking note should contain:

## Interpretation

The question suggests a mean-reversion hypothesis: after a substantial decline, buying the index may produce positive subsequent returns.

## Assumptions

- “NIFTY” means NIFTY 50.
- “Sharp fall” means a five-session return of at least -5%.
- The signal is evaluated at the close.
- Entry occurs at the next session’s open.
- The position is held for 10 sessions.
- Costs are represented by a simplified 10-basis-point round-trip assumption.
- Overlapping positions are disabled for the first test.

## User questions

- Which NIFTY instrument?
- What fall threshold and lookback?
- What holding period?
- What entry price?
- What test period?
- Should costs and slippage be included?
- Should overlapping signals be allowed?

## Experiment

State the exact condition, entry, exit, test period, costs, benchmark, and metrics.

## Risks

Discuss:

- Ambiguous definitions.
- Look-ahead bias.
- Survivorship or index-construction effects.
- Data errors.
- Slippage and transaction costs.
- Small sample size.
- Overfitting.
- Regime dependence.
- Multiple testing.
- Lack of out-of-sample validation.
- Non-independent or overlapping observations.

***

# 18. README Structure

```text
# TradeBorn

## What it does

## Product walkthrough

## Architecture

## Tech stack

## Project structure

## Data and assumptions

## Backtest methodology

## AI behavior and guardrails

## Optional RAG and search design

## Environment variables

## Local setup

## Database setup

## Seed dataset

## Running frontend and backend

## Testing

## Deployment

## Known limitations

## Future improvements

## AI usage
```

### Environment variables

```env
DATABASE_URL=
LLM_API_KEY=
EMBEDDING_API_KEY=
SEARCH_PROVIDER=
SEARCH_API_KEY=
NEXT_PUBLIC_API_URL=
```

Never commit real values. Include `.env.example`.

***

# 19. AI Usage Note

The AI usage note should be candid and specific.

### Tools used

Example:

- ChatGPT or Perplexity for product framing and risk identification.
- Cursor or another coding agent for scaffolding and implementation.
- LLM API for clarification and result explanation.
- OpenUI Lang for controlled dynamic result components.

### AI-assisted work

- Generated initial API and component scaffolding.
- Suggested schema alternatives.
- Helped write validation and test cases.
- Generated first drafts of prompts.
- Assisted with documentation and edge-case review.

### Decisions made independently

- Defining “sharp fall” as a five-session decline of at least 5%.
- Using next-session open to reduce look-ahead bias.
- Separating deterministic calculations from AI interpretation.
- Using a versioned CSV for a reproducible demo.
- Disallowing overlapping trades in the first version.
- Treating RAG and web search as optional rather than core dependencies.

### Rejected suggestions

Explain that any AI-generated suggestions were rejected when they:

- Hid assumptions.
- Used same-day close entry after observing the close.
- Presented the result as financial advice.
- Added unnecessary infrastructure.
- Used arbitrary confidence language.
- Allowed the model to calculate or modify metrics.

### Proud moment

A strong example would be:

> I am most proud of making the ambiguity visible instead of pretending that the original question was already a valid strategy. The product does not jump directly from natural language to a performance chart; it shows how the question becomes an experiment and preserves the distinction between the data and the system’s interpretation.

***

# 20. Recommended Final Positioning

Present the product as:

> A transparent research copilot that helps users operationalize vague trading hypotheses into reproducible historical experiments.

Do not present it as:

> An AI that tells users which trades to make.

The strongest submission will likely be a small, polished workflow with a trustworthy backtest and excellent explanation of assumptions. OpenUI, pgvector, and external search should support that core experience rather than distract from it.
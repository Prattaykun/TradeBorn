# Graph Report - TradeBorn  (2026-09-15)

## Corpus Check
- 66 files · ~63,793 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 522 nodes · 900 edges · 25 communities (21 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2e153fa6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Research Methodology Docs
- LangGraph Agent Core
- Local Search Providers
- Next.js Research UI
- Web App Dependencies
- API AI Dependencies
- Web TypeScript Config
- API Dev Tooling
- Prisma Seed Scripts
- Monorepo Root Package
- Shared Zod Package
- API TypeScript Config
- Shared TS Config
- Backtest Engine
- Web Root Layout
- Next.js Config
- Next Env Types
- researchLibrary.tsx
- stage-flow.tsx
- css.d.ts
- ingest.ts
- Backend on Render

## God Nodes (most connected - your core abstractions)
1. `cn()` - 20 edges
2. `compilerOptions` - 16 edges
3. `registerRoutes()` - 15 edges
4. `SearchProvider` - 14 edges
5. `scripts` - 12 edges
6. `SearchResult` - 12 edges
7. `explainResults()` - 11 edges
8. `SearchInput` - 11 edges
9. `compilerOptions` - 11 edges
10. `scripts` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Ask → Clarify → Define → Test → Learn` --semantically_similar_to--> `Ask → Clarify → Define → Test → Learn`  [INFERRED] [semantically similar]
  prd.md → README.md
- `TradeBorn` --semantically_similar_to--> `TradeBorn`  [INFERRED] [semantically similar]
  prd.md → README.md
- `research_sessions` --semantically_similar_to--> `research_session`  [INFERRED] [semantically similar]
  prd.md → README.md
- `experiment_definitions` --semantically_similar_to--> `ExperimentDefinition`  [INFERRED] [semantically similar]
  prd.md → README.md
- `Deterministic backtest engine` --semantically_similar_to--> `Deterministic backtest engine`  [INFERRED] [semantically similar]
  prd.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Ask→Learn research pipeline** — readme_ask_clarify_define_test_learn, readme_research_session, readme_experiment_definition, readme_backtest_engine [EXTRACTED 1.00]
- **Monorepo runtime topology** — readme_apps_web, readme_apps_api, readme_neon_postgres, readme_packages_shared, pnpm_workspace_monorepo [INFERRED 0.85]
- **Backtest methodology safeguards** — data_knowledge_look_ahead_bias_look_ahead_bias, data_knowledge_overlapping_trades_overlapping_trades, data_knowledge_small_sample_warnings_small_sample_warnings, data_knowledge_transaction_costs_transaction_costs [INFERRED 0.85]

## Communities (25 total, 4 thin omitted)

### Community 0 - "Research Methodology Docs"
Cohesion: 0.05
Nodes (52): Look-ahead Bias, TradeBorn next-session-open mitigation, Overlapping trades disabled by default, Overlapping Trades, Plain-language warnings over confidence scores, Small Sample Warnings, TradeBorn simplified cost model, Transaction Costs and Slippage (+44 more)

### Community 1 - "LangGraph Agent Core"
Cohesion: 0.11
Nodes (43): explainNode(), interpretNode(), proposeExperimentNode(), researchAgentGraph, ResearchState, agentTools, buildClarifyOpenUi(), buildExperimentFromParams() (+35 more)

### Community 2 - "Local Search Providers"
Cohesion: 0.10
Nodes (17): Doc, LocalMiniSearchProvider, localSearch, resolveKnowledgeDir(), BraveSearchProvider, DuckDuckGoProvider, SearXNGProvider, TavilySearchProvider (+9 more)

### Community 3 - "Next.js Research UI"
Cohesion: 0.08
Nodes (46): ClarifyPage(), Session, DefinePageInner(), LearnPageInner(), Metrics, Metrics, TestPageInner(), Field() (+38 more)

### Community 4 - "Web App Dependencies"
Cohesion: 0.09
Nodes (22): devDependencies, autoprefixer, postcss, tailwindcss, @types/node, @types/react, @types/react-dom, typescript (+14 more)

### Community 5 - "API AI Dependencies"
Cohesion: 0.07
Nodes (29): dependencies, dotenv, fastify, @fastify/cors, langchain, @langchain/core, @langchain/google-genai, @langchain/langgraph (+21 more)

### Community 6 - "Web TypeScript Config"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 7 - "API Dev Tooling"
Cohesion: 0.08
Nodes (23): devDependencies, prisma, @types/node, typescript, vitest, @types/node, typescript, name (+15 more)

### Community 8 - "Prisma Seed Scripts"
Cohesion: 0.05
Nodes (37): dependencies, class-variance-authority, clsx, framer-motion, lucide-react, next, @openuidev/react-lang, @radix-ui/react-label (+29 more)

### Community 9 - "Monorepo Root Package"
Cohesion: 0.11
Nodes (18): engines, node, name, packageManager, private, scripts, build, build:api (+10 more)

### Community 10 - "Shared Zod Package"
Cohesion: 0.12
Nodes (16): dependencies, zod, devDependencies, typescript, exports, typescript, zod, main (+8 more)

### Community 11 - "API TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, resolveJsonModule, rootDir (+5 more)

### Community 12 - "Shared TS Config"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 13 - "Backtest Engine"
Cohesion: 0.24
Nodes (9): EngineInput, EngineResult, EngineTrade, median(), OhlcBar, runBacktest(), stdDev(), streaks() (+1 more)

### Community 20 - "researchLibrary.tsx"
Cohesion: 0.12
Nodes (17): react, AssumptionBadge, ClarificationCard, ExperimentField, FallbackOpenUI(), FollowUpQuestion, getResearchOpenUiPrompt(), MetricCard (+9 more)

### Community 21 - "stage-flow.tsx"
Cohesion: 0.24
Nodes (8): nodeTypes, ResearchStage, ResearchStageFlow(), STAGE_META, STAGE_ORDER, stageFromPath(), StageNode(), StageNodeData

### Community 23 - "ingest.ts"
Cohesion: 0.12
Nodes (26): ensureVectorExtension(), main(), prisma, resolveCsv(), seedDataset(), main(), retrieveNode(), ChatMessage (+18 more)

### Community 24 - "Backend on Render"
Cohesion: 0.20
Nodes (9): 0. Before you click Deploy, 1. New Web Service, 2. Environment variables, 3. First-time database (if Neon is empty), 4. Point the web app at Render, 5. Free-tier notes, 6. Typical failures, Backend on Render (+1 more)

## Knowledge Gaps
- **194 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+189 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Prisma Seed Scripts` to `Web App Dependencies`, `researchLibrary.tsx`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `OpenUIRenderer()` connect `researchLibrary.tsx` to `Next.js Research UI`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Why does `react` connect `researchLibrary.tsx` to `Prisma Seed Scripts`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _194 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Research Methodology Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.053544494720965306 - nodes in this community are weakly interconnected._
- **Should `LangGraph Agent Core` be split into smaller, more focused modules?**
  _Cohesion score 0.10588235294117647 - nodes in this community are weakly interconnected._
- **Should `Local Search Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.10465116279069768 - nodes in this community are weakly interconnected._
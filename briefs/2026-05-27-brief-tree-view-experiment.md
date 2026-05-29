# Project Brief: "TradingAgents Navigation Architecture"

**Status:** Playbook created at `playbooks/tree-view-playbook.md`. This brief captures the strategic intent and experimental scope.

---

## Objective

Implement a unified tree-based navigation and command interface to improve the interpretability and command-line (or web-native) control of the `TradingAgents` framework.

By adopting a standardized tree-view structure, the project shifts from a "collection of scripts" toward an **operable platform**. The tree is not just navigation — it is **visual debugging**.

---

## Architectural Mapping (The "Tree" as a Schema)

Instead of a flat directory, the tree-view reflects the *logic* of the trading firm. Two distinct tree types serve different navigation needs:

### Tree Type 1: Repo Explorer (static)

Navigates the repository structure. Path-first identity maps directly to filesystem paths.

```
TradingAgents/
├── tradingagents/           (Python core — agents, graph, schemas)
├── src/                     (TypeScript dashboard — routes, views, lib)
├── playbooks/
├── briefs/
├── justfile
└── pyproject.toml
```

**Characteristics:**
- Static prepared input (generated at build or startup)
- No live agent state
- Context menu: "Open", "Copy Path", "Open in Editor"
- Replaces flat tab nav with hierarchical structure

### Tree Type 2: Workflow Navigator (dynamic)

Navigates the active trading workflow. Paths map to agent/decision trees, not files.

```
TradingAgents/
├── Market Context/
│   ├── feeds/               (Live data feeds)
│   ├── sentiment/           (Sentiment cache)
│   └── regime/              (Current market regime)
├── Agent Teams/
│   ├── analysts/
│   │   ├── fundamentals/    (Fundamental analyst)
│   │   ├── sentiment/       (Sentiment analyst)
│   │   ├── news/            (News analyst)
│   │   └── technical/       (Technical analyst)
│   ├── researchers/
│   │   ├── bullish/         (Bullish researcher)
│   │   └── bearish/         (Bearish researcher)
│   └── traders/
│       └── decision-team/   (Trading decision)
├── Decision Trail/
│   ├── [session-id]/
│   │   ├── analyst-reports/
│   │   ├── debate-round-N/
│   │   └── final-signal/
│   └── [historical-sessions]/
└── Governance/
    ├── risk-management/
    └── portfolio-manager/
```

**Characteristics:**
- Dynamic prepared input (from SQLite + live agent state)
- Agent status via `renderRowDecoration` (Thinking/Debating/Idle/Error)
- Context menu triggers SSE streams for live agent rationale
- Decision paths are traversable, not just displayed

---

## Functional Requirements

### FR-1: SSR + Vanilla Hydration

Use `@pierre/trees/vanilla` (not React) with `@pierre/trees/ssr` for first-paint performance.

- Server: `preloadFileTree(...)` → SSR markup
- Client: `fileTree.hydrate({ fileTreeContainer })` → interactive tree
- Prepared input on server; client hydrates, not reconstructs

### FR-2: HTMX + SSE Integration

Context menus are the reactivity trigger, not React state.

- Click tree node → HTMX request for detail view
- Right-click → context menu with commands
- "Stream Live" command → SSE connection for live agent updates
- SSE events: `start`, `agent_report`, `debate_round`, `decision`, `complete`, `error`

### FR-3: Virtualization

Trees handles large audit logs and multi-market data hierarchies without UI lag. Prepared input moves shaping work to the server.

### FR-4: Command Metaphor

Map context menu to "Barnacle Removal" and "Quarantine" actions:

- Prune stale agent logs directly from the UI
- Mark deprecated research notes as quarantined
- Traverse decision path to fault origin on trade failure

---

## Implementation Roadmap

### Phase 1 (Interface): Repo Explorer

Integrate the tree component as the primary side-bar for repository navigation. Replace flat tab navigation with hierarchical structure.

**Deliverable:** `/repo/tree` route with SSR-rendered, vanilla-hydrated file tree.

### Phase 2 (Instrumentation): Workflow Navigator

Connect tree to SQLite store (via Drizzle). Expose agent-state endpoints in Hono so the tree reflects active trading loop state.

**Deliverable:** `/workflow/tree` route with dynamic agent state and context menu commands.

### Phase 3 (Live Observability): SSE Streams

Context menu selection triggers SSE streams for live agent rationale. Decision paths become traversable.

**Deliverable:** `/workflow/stream/:agentPath` SSE endpoint. Visual agent state (Thinking/Debating/Idle) on tree rows.

### Phase 4 (Persistence): Historical Replay

Navigate historical decision paths. Replay specific decision paths from the tree.

**Deliverable:** "Replay Path" context menu command. Decision trail with historical sessions.

---

## Experimental Proposals

These are optional enhancements to evaluate during the experiment phase. See `playbooks/tree-view-playbook.md` → "Experimental proposals" for full implementation details.

### EXP-1: Agent state as row decoration

Display live agent status (Thinking/Debating/Idle/Error) directly on tree rows via `renderRowDecoration`.

**Decision trigger:** Evaluate after Phase 2 is functional. If agent state updates cause flicker or performance issues, fall back to git-status style markers.

### EXP-2: Decision path replay

Traversable historical decision paths. Click any node in `Decision Trail/` to replay the agent debate from that point.

**Decision trigger:** Evaluate if tree depth exceeds 20 levels. If so, lazy-load replay may be needed.

### EXP-3: Multi-market tree composition

Composite tree showing multiple market contexts (US, UK, crypto) as parallel branches.

**Decision trigger:** Evaluate if concurrent markets exceed 5. If so, lazy-load market branches on expansion.

### EXP-4: Barnacle removal context menu

Right-click pruning of stale agent logs and deprecated research notes directly from the tree.

**Decision trigger:** Evaluate if quarantine flag in SQLite causes schema drift. If so, use soft-delete with `WHERE active = 1` filter.

### EXP-5: Visual debugging — fault origin traversal

On trade failure, traverse tree to specific agent and debate branch where faulty logic originated.

**Decision trigger:** Evaluate if SSE stream can include fault context without overwhelming the stream. If so, prioritize EXP-1 first.

---

## Opinion: Why this is "High Value"

The current `TradingAgents` implementation is a powerhouse of reasoning but is prone to being treated as a black-box. A tree-view isn't just "navigation" — it is **visual debugging.**

By visualizing the hierarchy of the agents, you create a "map" of the trading firm's internal conversation. If a trade goes wrong, you don't just see the final decision; you can traverse the tree to the specific agent (e.g., `Sentiment Analyst`) and the specific "branch" of the debate where the faulty logic originated.

**This turns the framework into an observable system.**

---

## Scope

**Two applications, one codebase:**

| Application | Tree type | Content | Reactivity |
|-------------|-----------|---------|------------|
| Repository navigation | Repo Explorer | File system + logical structure | Static, context menu for file ops |
| Trading workflow | Workflow Navigator | Agent teams + decision trail | Dynamic, context menu → SSE |

**This brief captures the "Common Navigation and Command Metaphor" — repo navigation and workflow navigation are separate applications sharing the same `@pierre/trees` infrastructure.**
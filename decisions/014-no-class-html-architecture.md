---
date: 2026-06-03
updated_by: pi
status: Accepted
---

# Decision: No-Class HTML Architecture — Document-First, Server-Side Rendering

**Date:** 2026-06-03
**Updated by:** pi
**Status:** Accepted

## Context

A proposal was evaluated to have agents build and operate HTML-based Kanban boards as a task management interface. This was rejected as fundamentally misaligned with agent ergonomics and the project's existing coordination primitives (GitHub issues, `td`, `kanban-orchestrator`/`kanban-worker` skills, `delegate_task`).

During that discussion, a broader architectural stance emerged: HTML should be treated as a **document navigation layer**, not as an application runtime. This decision formalizes that stance as a deliberate constraint. The extreme position ("no classes") is adopted as a starting point to aggressively shrink the problem space. The motivation is defensive: CSS, layouts, and theming are high-friction areas that consume disproportionate time for both humans and agents. By constraining the surface area, we create a shared capability set that respects the strengths and weaknesses of both parties.

## Decision

**Adopt a no-class HTML architecture.** Pages are authored as semantic HTML documents rendered server-side via Hono JSX. Styling is provided by a single no-class stylesheet using element selectors, attribute selectors, and the cascade — no utility classes, no component-scoped classes. Client-side reactivity, when genuinely required, is handled via lightweight progressive enhancement (HTMX, UnPoly, Datastar, or future equivalents). No SPA frameworks. No client-side state machines. The agent generates complete documents; the server remains the source of truth.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Class-based utility CSS (Tailwind, Tachyons, etc.) | Maximizes surface area agents must learn and apply correctly; encourages component abstraction that agents struggle to keep consistent across pages; creates diff noise on every style tweak. |
| Classless framework (sakura.css, etc.) | Already evaluated and rejected (see 012-reject-sakura-css.md). Frameworks impose assumptions about content structure, theme, and layout that conflict with the dashboard's existing views and dark theme. |
| Agent-managed HTML Kanban board | Requires the agent to read/write DOM or JSON representing the board, introducing state synchronization, parse errors, and token overhead. The agent already has better primitives (`todo`, skills, `delegate_task`, GitHub). |
| SPA + client-side routing | Breaks the "HTML as document" model; requires agent to maintain partial state across interactions; violates AGENTS.md ("HTMX + SSR only"). |

## Consequences

**What became easier:**

- Agents generate pages with minimal stylistic boilerplate — semantic structure + a handful of data attributes is sufficient
- Humans and agents share the same mental model: each route produces a document, not a widget tree
- CSS surface area is dramatically reduced — one stylesheet, predictable cascade, no class name coordination
- Offline-first remains trivial; no CDN dependencies for core styles
- Review and debugging of rendered output is straightforward (View Source is meaningful)

**What became harder:**

- Complex interactions (rich tables with client-side filtering, real-time collaborative editing, intricate drag-and-drop) become more expensive or impossible without progressive enhancement
- Achieving visual polish beyond baseline typography requires deliberate, targeted additions to the no-class stylesheet rather than per-component tweaks
- Deviation from the no-class rule requires justification and documentation in a decision record

**Constraints this imposes:**

- All CSS lives in a single authoritative no-class stylesheet (or tightly controlled co-located additions)
- No utility classes, no BEM, no CSS modules, no styled-components or equivalent
- Server renders complete documents on every meaningful navigation; client only mutates via HTMX/UnPoly/Datastar when the requirement justifies it
- Any feature that cannot be reasonably expressed in this model must be re-evaluated for necessity or implemented via a documented exception

## Related

- Decision: `012-reject-sakura-css.md` (classless framework evaluation)
- Decision: `002-htmx-ssr-over-spa.md` (SSR mandate)
- AGENTS.md: "Frontend — HTMX + SSR only. Server renders HTML via Hono JSX. No SPA frameworks, no client-side markdown."
- Playbook: `playbooks/ui-design-playbook.md` (when it exists)
- Template: `decisions/TEMPLATE.md`

# .archive/

Cold storage for completed process artefacts. Retained for archeology —
not gitignored, not deleted. Hidden from Glow (dot-directory), available
to `git log`, `grep`, and `rg`.

## Layout

```
.archive/
├── briefs/        # briefs with status done/superseded (moved from briefs/)
├── debriefs/      # debriefs with status done (moved from debriefs/)
├── decisions/     # retired decision artefacts (e.g. drydock scan logs)
├── playbooks/     # retired playbooks
├── scripts/       # retired support scripts
└── upstream/      # archived upstream-issue responses and vendored docs
```

## Convention

When a brief, debrief, or decision is marked `done` or `superseded`, move
it from its process folder to the corresponding `.archive/` subfolder:

```
briefs/foo.md  →  .archive/briefs/foo.md
debriefs/foo.md  →  .archive/debriefs/foo.md
```

The process folders (`briefs/`, `debriefs/`, `decisions/`, `playbooks/`)
must stay **flat** — no nested subdirectories. `scripts/reg-sync.ts`
enforces this with an active guardrail: a subdirectory in any of those
folders fails `just check`.

## Why not `briefs/archive/`?

Two reasons:

1. **Glow visibility** — `.archive` is a dot-directory, hidden from the
   file viewer but available to the shell. The working folders stay
   uncluttered; the archive is one `ls .archive/briefs/` away.
2. **Registry isolation** — `reg-sync` indexes the process folder only.
   Archived files leave the index automatically (no exclude rule needed)
   and can't re-enter it.

## Why not delete?

Archeology. Old briefs and debriefs are the project's memory — the
record of what was tried, what worked, what was abandoned and why.
Deleting them saves disk; keeping them saves knowledge. The cost of
keeping is near-zero (text files, ~1.5MB total); the cost of losing is
repeating forgotten lessons.

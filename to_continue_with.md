# Continue with → `HANDOVER_DOCS/`

This file was the running handover for the Kairo v1 sessions. On **2026-08-19** it had reached 1,606 lines
and mixed the task in hand with two months of project history, so it was split into
**[`HANDOVER_DOCS/`](HANDOVER_DOCS/)**. Nothing was discarded; a few claims were corrected against measured
reality, and each correction says so where the old claim used to be.

**Start at [`HANDOVER_DOCS/README.md`](HANDOVER_DOCS/README.md)**, then read
[`HANDOVER_DOCS/01-current-state.md`](HANDOVER_DOCS/01-current-state.md).

## The resume point, in one line

Stage 2 of the Greek UI rebuild is **complete — 22 of 22 screens restyled**, The Call and The Oracle
closing it out on 2026-08-20 and the whole of it committed as `ox-07`. Next is **Stage 3's five new
screens**: Gates, Sanctum, Envoy, Pantheon, Annals.

## Where everything went

| Document | Holds |
|---|---|
| [`README.md`](HANDOVER_DOCS/README.md) | The index, the standing constraints, and how to keep the folder usable |
| [`01-current-state.md`](HANDOVER_DOCS/01-current-state.md) | Stage board, measured verification, working tree, open items |
| [`02-ui-rebuild-conventions.md`](HANDOVER_DOCS/02-ui-rebuild-conventions.md) | The rules every remaining screen must follow, and the per-file checklist |
| [`03-ui-rebuild-progress.md`](HANDOVER_DOCS/03-ui-rebuild-progress.md) | What is restyled, and every deliberate departure from the designs |
| [`04-movement-restyle-brief.md`](HANDOVER_DOCS/04-movement-restyle-brief.md) | The movement module as decided end to end — now a record of it, not a to-do |
| [`05-design-handoff.md`](HANDOVER_DOCS/05-design-handoff.md) | The 30 Stitch designs, the dumper, the verified 61-glyph table |
| [`06-architecture-decisions.md`](HANDOVER_DOCS/06-architecture-decisions.md) | Project-wide decisions, the SQLite rule, the Expo Go rule, branding invariants |
| [`07-module-reference.md`](HANDOVER_DOCS/07-module-reference.md) | Tasks, macros, Home and movement: files, schemas, embedded decisions |
| [`08-verification.md`](HANDOVER_DOCS/08-verification.md) | Commands, measured results, machine gotchas, the lint gate, the test harness |
| [`09-phase-3-acceptance.md`](HANDOVER_DOCS/09-phase-3-acceptance.md) | Phase 3 status and the native acceptance sequence |
| [`10-project-history.md`](HANDOVER_DOCS/10-project-history.md) | Phases 0–2, git history, closed device findings, the superseded 2026-08-17 pass |
| [`11-module-pattern-and-hygiene.md`](HANDOVER_DOCS/11-module-pattern-and-hygiene.md) | How a module is built here; repo hygiene, including one open security item |

The planning package is separate, in [`docs/`](docs/): `docs/` is what the app is *meant* to be,
`HANDOVER_DOCS/` is what it *is*, and why.

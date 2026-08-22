# Kairo — Handover

The running handover for the Kairo v1 build sessions. This folder replaces the single
`to_continue_with.md`, which had reached 1,606 lines and mixed the task in hand with two months of
project history; the file at the repo root is now a pointer to this index.

**Read [`01-current-state.md`](01-current-state.md) first.** It is the only document here that dates
quickly. Everything else is reference and stays true until the thing it describes changes.

Last updated: **2026-08-22**.

## The resume point

**It lives in [`01-current-state.md`](01-current-state.md), and only there.** This index used to restate
it and the root `to_continue_with.md` restated it again; on 2026-08-20 all three drifted out of step
inside one session, twice. One copy is the point of the folder — do not reintroduce a second.

## Standing constraints

- **Do not create or amend commits unless the user asks.** That includes not staging, not tidying the
  index, and not committing "while you're in there". The user commits and pushes outside these
  sessions.
- **Physical device runs remain the user's to run.** Report readiness; do not claim a device gate
  passed without their evidence. Packaging checks (`expo export`, `expo-doctor`) and automated checks (`npm test`,
  `npx tsc --noEmit`, `npm run lint`) are ours to run — the user authorised that explicitly on
  2026-08-19: *"run the required tests, the dependencies have been installed"*.
- **The scope of the UI rebuild is locked in `docs/09-ui-rebuild-plan.md`**, and the Greek display
  lexicon lives only there. Do not re-litigate it from the designs.
- **Greek display copy, English identifiers.** Screens have Greek names; routes, tables, columns,
  types, stores and functions keep plain English ones.

## The documents

| File | What it holds | Read it when |
|---|---|---|
| [`01-current-state.md`](01-current-state.md) | Stage board, what is verified and when, working tree, open items | Always, first |
| [`02-ui-rebuild-conventions.md`](02-ui-rebuild-conventions.md) | The rules every remaining screen must follow, and the per-file carry-over checklist | Before touching any screen |
| [`03-ui-rebuild-progress.md`](03-ui-rebuild-progress.md) | What is already restyled, module by module, and the deliberate departures from the designs | Before "correcting" something that looks like a mistake |
| [`04-movement-restyle-brief.md`](04-movement-restyle-brief.md) | The movement module as it was decided: design analysis, the decisions taken, the domain work it needed — now a record, not a to-do | Questioning why a movement screen reads the way it does |
| [`05-design-handoff.md`](05-design-handoff.md) | The 30 Stitch designs, the dumper script, the verified 61-glyph table, the five locked decisions | Transcribing any design |
| [`06-architecture-decisions.md`](06-architecture-decisions.md) | Project-wide decisions, the shared-SQLite rule, the Expo Go capability rule, the branding invariants | Before adding a dependency, a connection, or a native call |
| [`07-module-reference.md`](07-module-reference.md) | Tasks, macros, Home, movement, and Stage 3's cross-module surface: files, schemas, and the decisions embedded in them | Changing a module's data or logic |
| [`08-verification.md`](08-verification.md) | Commands and their measured results, machine gotchas, the lint gate, and the test harness | Running or extending the checks |
| [`09-phase-3-acceptance.md`](09-phase-3-acceptance.md) | Phase 3 movement status and the native acceptance sequence | After the rebuild finishes |
| [`10-project-history.md`](10-project-history.md) | Phase 1/2 record, git history, resolved device findings, the superseded 2026-08-17 pass | Archaeology — why something is the way it is |
| [`11-module-pattern-and-hygiene.md`](11-module-pattern-and-hygiene.md) | How a new module is built here; repo hygiene, including one open security item | Adding a module, or before any git housekeeping |
| [`12-stage-3-brief.md`](12-stage-3-brief.md) | Stage 3's five new screens, the build-state table with what is and is not wired, and deliberate departures | Reviewing Stage 3 decisions |

The planning package these sit beside is [`../docs/`](../docs/) — start at
[`../docs/README.md`](../docs/README.md). The division of labour: `docs/` is what the app is *meant*
to be, this folder is what it *is*, and why.

## Keeping it usable

- **Put new material in the document that owns the subject**, not at the top of `01`. `01` is a
  status board; if it grows past a screenful it is holding something that belongs elsewhere.
- **Date every claim** that could go stale, and say whether a number was *measured* or is
  *expected*. Most of the wasted time recorded in this folder traces to a count someone wrote down
  without running.
- **When a decision is reversed, say so where the old one was written.** Several notes here exist
  only to stop a fixed thing being "fixed" again.
- **One fact, one home.** A status claim repeated in a second file is a claim that will disagree with
  itself: the resume point lived in three places on 2026-08-20 and drifted twice in one session. Link to
  the owner instead of restating it.
- **Write claims in the past tense about what happened, not the future tense about what will.** Both
  stale lines the 2026-08-20 audit caught were future-tense — *"still need transcribing"*, *"must survive
  the restyle"* — and a future-tense claim about finished work reads as current until someone opens the
  file it describes.

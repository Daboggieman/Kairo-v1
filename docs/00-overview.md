# Kairo — Product Overview

## What Kairo is
Kairo is a personal, all-in-one self-improvement app: one place for training, nutrition,
daily discipline, motivation, movement, scripture, and music — replacing five or six
separate apps with a single tool built around how you actually want to live day to day.
The name (Greek *kairos*, "the right/opportune moment") is the organizing idea: every
module exists to help you act at the right moment — log the set right after you do it,
see the streak right before you'd break it, get the reminder right when it matters.

## Who it's for
Single user (you), at least for v1. This simplifies auth, sync, and infrastructure
significantly — no multi-tenant concerns, no user management UI, no billing. The
architecture should stay *extensible* to more users later without being *built* for
them now. Don't pay the complexity tax of multi-user systems until you actually need it.

## Guiding principles
- **Local-first.** The app should be fully usable with no network connection. Anything
  that needs a server (OAuth token exchange, wallpaper generation, bible content) should
  degrade gracefully offline.
- **One app, modular features.** Each feature (workouts, nutrition, tasks, etc.) should
  be its own self-contained module — own data model, own screens, own service layer —
  so you can build, ship, and even disable them independently. This is what makes "and
  more" tractable: new modules bolt on without destabilizing existing ones.
- **Boring, provable tech where it matters.** Use well-trodden libraries for data
  storage and sync. Save your creative energy for the product decisions, not for
  debugging a niche framework.
- **Respect platform limits honestly.** A few of your asks (true alarm-clock behavior,
  Apple Music playback, background GPS) run into real iOS/Android platform constraints.
  The docs below flag these clearly rather than hand-waving them — see
  `05-integrations-and-credentials.md`.
- **The interface is the name, made visible.** Not decoration chosen after the fact — see
  the next section.

## Voice and visual identity

Kairo is a dark, Greek-themed app: obsidian surfaces, bronze accents, inscriptional display
type, and a screen lexicon drawn from a citadel — The Citadel for the day's dashboard, The
Forge for training, The Feast for food, The Scales for weight, The Rites for daily
discipline. That is *kairos* made concrete: each module is a named place you go to do one
thing at the right moment, rather than a tab called "Nutrition".

Three constraints bound it, and none of them is a preference:

- **The accent is measured, not chosen.** `colors.accent` is the mean gold of the user's own
  helmet artwork, computed by `apps/mobile/scripts/generate-icons.py`. The app and its
  launcher icon are the same colour because one derives from the other. It cannot be
  re-picked without re-deriving the icon set.
- **It is dark-only.** There is no light palette, and `userInterfaceStyle` is pinned `dark`
  in `app.json` so native alerts and the keyboard don't clash with it. A screen that assumes
  a light default renders black on near-black — that has happened, twice.
- **Only user-facing copy is Greek.** Routes, tables, types, and functions keep plain English
  names. The lexicon is display language, not an identifier scheme.

The full lexicon, the design handoff it came from, and the token changes are in
`09-ui-rebuild-plan.md`.

## Feature list, prioritized

**P0 — Core (MVP)**
- Workout logging (exercises, sets, reps, weight)
- Weight & progress charts
- Daily tasks + streaks
- Macro / nutrition tracking

**P1 — Motivation layer**
- Motivational quotes (daily rotation)
- Motivational wallpapers (auto-generated from quotes)
- Daily alarms / reminders

**P2 — Movement & mind**
- GPS fitness tracker (Strava/Runkeeper-style runs & rides)
- Bible reader (reading plans, bookmarks, search)

**P3 — Ambient layer**
- Music integration (Spotify, Apple Music, others via deep link)

**Backlog — "and more"**
Kept as an open list rather than guessed at. Suggested candidates worth considering
once P0–P3 are stable: sleep tracking, habit-stacking / routines, journaling, body
measurements beyond weight, photo progress log, social/accountability sharing,
AI-assisted workout or meal suggestions. Add to this list as ideas come up; the modular
architecture means most of these are additive, not disruptive.

## What "done" looks like for v1
You can open one app each morning, see today's tasks and a quote, log your workout and
meals through the day, get reminded to take your evening walk, and check your weight
trend on Sunday — without opening five other apps.

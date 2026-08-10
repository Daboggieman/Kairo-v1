# Kairo — Planning Package

Read in this order:

1. **00-overview.md** — vision, principles, prioritized feature list
2. **01-architecture-and-stack.md** — system diagram, full tech stack (React Native +
   Expo frontend, Python/FastAPI backend, Postgres, third-party APIs)
3. **02-data-model.md** — database schema per feature module
4. **03-api-design.md** — REST endpoints per module
5. **04-feature-specs.md** — screens, logic, and open decisions per feature
6. **05-integrations-and-credentials.md** — what accounts/keys you need, and the real
   platform constraints on GPS tracking, Apple Music, and true alarms — **read this
   before starting Phase 3+ of the roadmap**
7. **06-roadmap.md** — phased build plan, sequenced by risk/dependency rather than by
   your original feature order
8. **07-repo-structure.md** — proposed monorepo layout for mobile app + backend

## The one-paragraph summary
Build the mobile app in React Native/Expo and the backend in Python/FastAPI +
Postgres. Ship workout logging, weight tracking, tasks/streaks, and macros first —
they need no backend to be useful. Add quotes, wallpapers, and alarms next. Save GPS
tracking and Apple Music for later phases — they're the two features with real
native-engineering and platform-policy constraints, detailed in doc 05. Bible content
should use a public-domain translation (WEB or KJV) to sidestep licensing entirely.

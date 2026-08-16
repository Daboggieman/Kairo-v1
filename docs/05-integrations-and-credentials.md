# Kairo — Integrations & Credentials

This is the doc to read before starting P2/P3 — it flags where reality pushes back on
the feature list, and what accounts/keys you'll need to gather in advance.

## Spotify
- **Account needed**: Spotify Developer account (free) → register an app at
  developer.spotify.com to get a Client ID/Secret.
- **Auth flow**: OAuth 2.0 Authorization Code with PKCE (required for mobile apps).
  Token exchange happens in the Python backend; the app only ever holds a short-lived
  session, not the refresh token.
- **Scopes needed**: `user-read-playback-state`, `user-modify-playback-state`,
  `user-read-currently-playing` at minimum.
- **Playback control caveat**: controlling playback via the Web API requires an
  *active Spotify device* (i.e. Spotify app running somewhere — phone, desktop,
  speaker). Kairo won't play audio itself; it remote-controls an existing Spotify
  session. This is normal Spotify Web API behavior, not a Kairo limitation.
- **Cost**: free tier is sufficient for personal use; Spotify does require the
  connected account to have a Spotify Premium subscription for playback control
  scopes to work fully.

## Apple Music
- **Account needed**: Apple Developer Program membership ($99/year) to get a MusicKit
  identifier and generate a developer token (JWT signed with your Apple private key).
- **Real constraint**: MusicKit's full playback control is a **native module**
  (Swift/`MusicKit` framework) — it is not accessible through Expo's managed JS layer
  without a custom native module or a bare workflow. This is meaningfully more native
  iOS engineering than the rest of the app.
- **Recommendation**: treat Apple Music as a v2 stretch goal, not v1. If you want *some*
  Apple Music presence in v1, a deep link (`music://`) to open a specific track/playlist
  is achievable without native modules — full in-app control is not.

## Other music platforms (YouTube Music, etc.)
- Most don't expose a public playback-control API at all. Realistic v1 scope for
  "other platforms" is a deep link out to the platform's own app, not in-app control.
  Worth setting this expectation now rather than discovering it mid-build.

## Bible content
- **Licensing matters here.** Popular modern translations (NIV, ESV, NLT) are
  copyrighted and require a paid license/API agreement to redistribute at any scale,
  even personal. Public-domain translations avoid this entirely:
  - **KJV** (King James Version) — public domain.
  - **WEB** (World English Bible) — public domain, modern language.
  - **ASV** (American Standard Version) — public domain.
- **API options**: `bible-api.com` is free, keyless, and serves public-domain
  translations (KJV/WEB) — simplest starting point. `API.Bible` offers more
  translations but requires a free API key and per-translation licensing checks for
  anything beyond public domain.
- **Recommendation**: start with WEB or KJV via `bible-api.com`, cache chapters
  on-device for offline reading, and treat any copyrighted-translation request as a
  separate licensing conversation later.

## GPS / fitness tracking
Phase 3 deliberately builds tracking inside Kairo. There is no Strava connection, import,
upload, social graph, or competition layer. The selected approach is `expo-location` plus
`expo-task-manager` with a custom development build, SQLite-backed active state,
`react-native-maps` for live/replay routes, and local speech for time/distance cues.
Android is the first native validation target; iOS uses the same domain and persistence
design afterward. Three alternatives were considered:

1. **Build it yourself** (`expo-location` + `expo-task-manager` for background
   updates, `react-native-maps` for the route). Real constraints: iOS requires "Always"
   location permission and a background-modes entitlement for tracking to continue
   with the screen off, and Apple reviews background-location apps more strictly at
   App Store submission. This also requires ejecting from Expo Go into a custom dev
   client (config plugins handle this — it's not a full bare workflow, but it's not
   "just works in Expo Go" either).
2. **Read from Apple HealthKit / Google Fit.** The OS already tracks workouts/runs if
   the user records them in the native Fitness/Health app or another app that writes
   to HealthKit. Kairo can *read* that data instead of tracking GPS itself — far less
   engineering, no background-location entitlement fight, but it depends on you
   recording runs somewhere HealthKit-connected.
3. **Sync from Strava.** Strava has a public API (OAuth) for reading a user's
   activities. If you're already a Strava user, this is the lowest-effort path to
   "Strava-like" data in Kairo without rebuilding Strava's tracking engine.
- **Kairo decision**: use option 1. Support run, walk, and ride first; defer hike. Record
  offline, retain raw points indefinitely, upload only completed activities to Kairo, and
  accept that force-killing the app cannot guarantee continued iOS recording.

## Daily alarms — platform reality check
- Local notifications (`expo-notifications`) can absolutely handle "reminder at time
  X, repeating on these days" reliably, including with a sound.
- **True alarm-clock behavior** (loud sound that bypasses silent mode/Do Not Disturb,
  full-screen wake) is a native OS feature (Android `AlarmManager` + full-screen
  intents; iOS has no public API for third-party apps to bypass silent mode at all —
  only Apple's own Clock app can do this on iOS). Cross-platform frameworks can't
  fully replicate a native alarm clock on iOS.
- **Recommendation**: build reminders via local notifications for both platforms
  (good enough for "take your vitamins," workout reminders, etc.); if you need a true
  wake-up alarm that survives silent mode, keep using the OS Clock app for that one
  purpose, or scope a native Android-only alarm module later.

## Push notification delivery
- Expo's push service wraps APNs (iOS) and FCM (Android) — no separate Apple/Google
  developer push setup needed beyond what EAS already requires for building the app.

## Summary checklist before starting P2/P3
- [ ] Spotify Developer account + registered app (Client ID/Secret)
- [ ] Decision: Apple Music in v1 (deep link only) or deferred to v2 (full control)
- [ ] Apple Developer Program membership (needed for App Store release regardless of
      Apple Music — required to ship any iOS app)
- [ ] Bible translation decision (recommend WEB or KJV via bible-api.com)
- [ ] GPS strategy decision: build vs. HealthKit/Google Fit import vs. Strava sync
- [ ] If using Strava sync: Strava API application registered

# Kairo — Data Model

Each module below is a candidate table (Postgres backend) mirrored by a local SQLite
table on-device with the same shape. `id` fields are UUIDs everywhere so client-generated
records merge cleanly with the server without collision.

## Core / shared
**User** — even single-user, model it now so multi-device sync and future accounts are trivial
- id, email (optional), created_at, timezone, preferences (JSON: units, theme, etc.)

## Workout logging
**Exercise** (reference table, seed with common lifts, user can add custom)
- id, name, muscle_group, equipment, is_custom

**WorkoutSession**
- id, user_id, started_at, ended_at, notes

**WorkoutSet**
- id, session_id, exercise_id, set_number, reps, weight, weight_unit, rpe (optional), rest_seconds

## Weight & progress
**BodyWeightEntry**
- id, user_id, recorded_at, weight, weight_unit, note

*(Body measurements beyond weight — waist, etc. — are a natural backlog extension of this table.)*

## Daily tasks & streaks
**Task**
- id, user_id, title, recurrence_rule (e.g. daily/weekdays/custom RRULE), created_at, archived

**TaskCompletion**
- id, task_id, completed_date, completed_at

**Streak** (can be derived, but worth materializing for fast reads)
- id, task_id, current_count, longest_count, last_completed_date

## Macro / nutrition tracking
**FoodItem** (reference table — consider seeding from a public nutrition dataset or letting user build it manually to avoid licensing a paid food DB)
- id, name, calories_per_unit, protein_g, carbs_g, fat_g, default_unit

**NutritionEntry**
- id, user_id, food_item_id, logged_at, quantity, meal_type (breakfast/lunch/dinner/snack)

**MacroTarget**
- id, user_id, calories, protein_g, carbs_g, fat_g, effective_date

## Motivational quotes
**Quote**
- id, text, author, tags (JSON array, e.g. ["discipline","faith"])

**QuoteHistory**
- id, user_id, quote_id, shown_date

## Motivational wallpapers
**Wallpaper**
- id, user_id, quote_id, image_url (object storage), style_config (JSON: background, font, color), generated_at

## Daily alarms
**Alarm**
- Mobile-local id, user_id, label, local hour/minute, repeat_days, notification_id, is_active.
  The notification ID is device-specific and is deliberately not synchronized server-side.

*(True OS-level alarm behavior vs. local notification — see integrations doc; the data
model is the same either way.)*

## GPS fitness tracker
**MovementActivity**
- id, user_id, type (run/walk/ride), status, name, started_at, ended_at,
  elapsed_seconds, moving_seconds, paused_seconds, distance_meters,
  elevation_gain_meters, average_speed_mps, revision, created_at, updated_at

**MovementPoint**
- id, activity_id, sequence, recorded_at, latitude, longitude, altitude_meters,
  horizontal_accuracy_meters, provider_speed_mps, derived_speed_mps,
  distance_from_previous_meters, cumulative_distance_meters, processing_state,
  rejection_reason, is_paused, excluded_by_edit

**MovementEvent**
- id, activity_id, sequence, event_type, occurred_at, payload_json

**MovementSplit**
- id, activity_id, sequence, distance_meters, duration_seconds, started_at, ended_at

Raw points are retained indefinitely. Rejected points remain stored but do not affect
distance. Edits increment the activity revision and record trim/inclusion decisions rather
than overwriting original coordinates. Recording is local-first; only completed activities
upload to Kairo through replay-safe batches. There are no external provider identities.

## Bible
**BibleBookmark**
- id, user_id, translation, book, chapter, verse, note, created_at

**ReadingPlanProgress**
- id, user_id, plan_id, current_day, started_at

*(Bible text itself is NOT stored as user data — it's fetched/cached from a public-domain-licensed API. See integrations doc.)*

## Music integration
**MusicConnection**
- id, user_id, provider (spotify/apple_music), access_token (encrypted), refresh_token (encrypted), expires_at, scopes

*(Playback state itself is not persisted — it's live-queried from the provider.)*

## Notes on this model
- Every table has `user_id` even though there's one user today — makes the eventual
  jump to multi-device or multi-user a schema no-op.
- Tokens (`MusicConnection`) must be encrypted at rest; never stored on-device in plain
  text — that's a reason the OAuth exchange lives in the Python backend, not the app.

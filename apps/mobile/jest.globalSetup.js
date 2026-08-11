/**
 * Pins the timezone for the whole test run.
 *
 * `src/domain/weight.ts` buckets weigh-ins by *local* calendar day on purpose — a 22:00
 * weigh-in should land on the date the user sees beside it, not the UTC date. That makes its
 * tests timezone-sensitive, so the zone is fixed here instead of inheriting the machine's:
 * otherwise a fixture at `23:59:59Z` is the 11th in London and the 12th in Berlin.
 *
 * This has to be `globalSetup` rather than `setupFiles`. Setup files run inside the jest
 * environment, whose `process` is a sandboxed copy — assigning `TZ` there never reaches the
 * ICU timezone cache, so `Date` keeps using the host zone (confirmed: the assignment was
 * silently ineffective). `globalSetup` runs in the real Node process before workers are
 * forked, so they inherit the corrected environment at spawn.
 *
 * UTC specifically, so the ISO fixtures in the tests read as the day they say.
 */

module.exports = () => {
  process.env.TZ = 'UTC';
};

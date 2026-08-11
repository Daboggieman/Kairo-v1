/**
 * Constants shared across modules.
 *
 * Small on purpose: this is for the handful of values every module needs, not a dumping
 * ground. Module-specific constants belong with their module.
 */

/**
 * Single-user until Phase 2 adds auth, but `user_id` is on every row from day one
 * (`02-data-model.md`) so multi-user is a data change, not a schema change. This constant
 * is the one place that assumption lives — grep it to find everything that has to change.
 */
export const LOCAL_USER_ID = 'local-user';

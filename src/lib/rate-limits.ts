/**
 * Rate limits (spec §5, §26, §30) — DB-backed fixed-window counters.
 *
 * Semantics:
 *   - `checkRateLimit` counts one hit atomically (INSERT … ON CONFLICT DO
 *     UPDATE) and reports whether the caller is still inside the budget.
 *     The count ALWAYS increments (even for denied calls) so abusers cannot
 *     probe the limit boundary for free.
 *   - Windows are fixed and aligned to epoch multiples — cheap, predictable,
 *     and identical across instances. The same table works on PGlite (dev)
 *     and Neon (deploy) without changes.
 *   - Limits are declared here as named policies; the admin console may
 *     surface them read-only. Per-policy overrides can later be moved into a
 *     settings table without touching call sites.
 *
 * Cleanup: rows for expired windows are lazily pruned (probabilistically, at
 * most once per window per key) to keep the table small without a cron job.
 */

import { sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";

export interface RateLimitPolicy {
  /** Human-readable name surfaced in audit/metrics. */
  name: string;
  /** Max hits per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Named policies — one place to tune platform-wide budgets. */
export const RATE_LIMIT_POLICIES = {
  /** Abuse-report intake (spec §33): generous for good actors, tight enough to stop queue flooding. */
  reports: { name: "reports", limit: 10, windowMs: 60 * 60 * 1000 },
  /** Upload ticket intake: bounded per hour per user. */
  presign: { name: "presign", limit: 30, windowMs: 60 * 60 * 1000 },
  /** Job creation (all types). */
  jobs: { name: "jobs", limit: 30, windowMs: 60 * 60 * 1000 },
  /** Live-session creation. */
  sessions: { name: "sessions", limit: 10, windowMs: 60 * 60 * 1000 },
  /** Data export (spec §35 export method): heavy by nature, rarely needed. */
  export: { name: "export", limit: 3, windowMs: 60 * 60 * 1000 },
  /** Account deletion attempts: strict — wrong passwords must not be free. */
  accountDelete: { name: "accountDelete", limit: 5, windowMs: 60 * 60 * 1000 },
  /** Support contact form: pre-auth surface, keyed by IP. */
  support: { name: "support", limit: 5, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

export interface RateLimitResult {
  /** Whether the caller is inside the budget. */
  allowed: boolean;
  /** Hits counted in the current window INCLUDING this one. */
  count: number;
  /** Policy limit for comparison. */
  limit: number;
  /** Seconds until the current window ends (for Retry-After). */
  retryAfterSeconds: number;
}

function windowStartFor(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Count one hit against a policy and report the verdict.
 * db injection keeps the limiter testable against a fresh harness database.
 */
export async function checkRateLimit(
  db: PlatformDatabase,
  policyName: RateLimitPolicyName,
  /** Identity inside the policy scope — usually the user id (or IP for pre-auth surfaces). */
  identity: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[policyName];
  const key = `${policy.name}:${identity}`;
  const windowStart = windowStartFor(now, policy.windowMs);

  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limit_hits (key, window_start, count)
    VALUES (${key}, ${windowStart.toISOString()}, 1)
    ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limit_hits.count + 1
    RETURNING count
  `);
  const count = Number(rows.rows[0]?.count ?? 1);

  // Lazy pruning: with ~1/limit probability, clear expired windows for this key.
  if (Math.random() < 1 / policy.limit) {
    await db.execute(
      sql`DELETE FROM rate_limit_hits WHERE key = ${key} AND window_start < ${windowStart.toISOString()}`,
    );
  }

  const windowEndMs = windowStart.getTime() + policy.windowMs;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEndMs - now.getTime()) / 1000),
  );

  return {
    allowed: count <= policy.limit,
    count,
    limit: policy.limit,
    retryAfterSeconds,
  };
}

/** Test helper: reset all counters (harness-only). */
export async function resetRateLimits(db: PlatformDatabase): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limit_hits`);
}

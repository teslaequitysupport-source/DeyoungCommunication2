/**
 * Retention workflows (spec §35 "retention rules", §14 "deletion support",
 * §57 "media retention") — one env-configurable policy, one sweep.
 *
 * The sweep is a pure database pass (plus best-effort object deletes), so
 * the same code runs from the scheduler tick in dev, from a scheduled job
 * in deployment, or from tests with a fresh database. Every deletion is
 * counted and audited (privacy.retention_sweep) — retention is never a
 * silent activity.
 *
 * Windows are read from the environment so an operator can tighten or
 * loosen retention without a code change; 0 disables a rule ("keep
 * forever"). Defaults are deliberately conservative and documented in
 * .env.example.
 */

import { sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import type { StorageAdapter } from "@/lib/storage/types";

export interface RetentionPolicy {
  /** Days to keep uploaded/generated media (0 = keep forever). Default 365. */
  assetsDays: number;
  /** Days to keep ended live sessions (0 = keep forever). Default 90. */
  liveSessionsDays: number;
  /** Days to keep terminal jobs (0 = keep forever). Default 180. */
  jobsDays: number;
  /** Days to keep audit rows (0 = keep forever). Default 730. */
  auditDays: number;
  /** Days to keep closed reports (0 = keep forever). Default 730. */
  reportsDays: number;
}

function envDays(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Policy from env with safe defaults (documented in .env.example). */
export function retentionPolicyFromEnv(): RetentionPolicy {
  return {
    assetsDays: envDays("RETENTION_ASSETS_DAYS", 365),
    liveSessionsDays: envDays("RETENTION_LIVE_SESSIONS_DAYS", 90),
    jobsDays: envDays("RETENTION_JOBS_DAYS", 180),
    auditDays: envDays("RETENTION_AUDIT_DAYS", 730),
    reportsDays: envDays("RETENTION_REPORTS_DAYS", 730),
  };
}

export interface RetentionSweepResult {
  ranAt: string;
  policy: RetentionPolicy;
  deletedAssets: number;
  deletedObjects: number;
  deletedLiveSessions: number;
  deletedJobs: number;
  deletedReports: number;
  deletedAuditRows: number;
  deletedExpiredSessions: number;
  deletedExpiredVerifications: number;
}

/**
 * Run one retention pass. Order matters and respects FK behavior:
 *   1. old assets → delete storage objects first (metadata is the source
 *      of truth for keys), then the rows (consent_records de-link via
 *      ON DELETE SET NULL — consent evidence outlives media by design).
 *   2. old ended live sessions (jobs de-link).
 *   3. old terminal jobs (credit ledger de-links, amounts remain).
 *   4. old closed reports.
 *   5. old audit rows.
 *   6. expired auth sessions + verification tokens (hygiene).
 */
export async function retentionSweep(
  db: PlatformDatabase,
  storage: Pick<StorageAdapter, "deleteObject">,
  options?: { policy?: RetentionPolicy; now?: Date },
): Promise<RetentionSweepResult> {
  const policy = options?.policy ?? retentionPolicyFromEnv();
  const result: RetentionSweepResult = {
    ranAt: (options?.now ?? new Date()).toISOString(),
    policy,
    deletedAssets: 0,
    deletedObjects: 0,
    deletedLiveSessions: 0,
    deletedJobs: 0,
    deletedReports: 0,
    deletedAuditRows: 0,
    deletedExpiredSessions: 0,
    deletedExpiredVerifications: 0,
  };

  // 1. Old assets — objects first, rows after.
  if (policy.assetsDays > 0) {
    const old = await db.execute<{ id: string; storage_key: string }>(sql`
      SELECT id, storage_key FROM assets
      WHERE created_at < now() - (${policy.assetsDays} || ' days')::interval
    `);
    for (const row of old.rows) {
      try {
        await storage.deleteObject(row.storage_key);
        result.deletedObjects += 1;
      } catch {
        // Best-effort object delete: the metadata row is still removed, and
        // the sweep's audit row records the counts honestly. An orphaned
        // object is an ops concern, never a reason to keep the metadata.
      }
    }
    if (old.rows.length > 0) {
      const deleted = await db.execute<{ count: string }>(sql`
        WITH d AS (
          DELETE FROM assets
          WHERE created_at < now() - (${policy.assetsDays} || ' days')::interval
          RETURNING 1
        ) SELECT count(*) AS count FROM d
      `);
      result.deletedAssets = Number(deleted.rows[0]?.count ?? 0);
    }
  }

  // 2. Old ended live sessions.
  if (policy.liveSessionsDays > 0) {
    const deleted = await db.execute<{ count: string }>(sql`
      WITH d AS (
        DELETE FROM live_sessions
        WHERE ended_at IS NOT NULL
          AND ended_at < now() - (${policy.liveSessionsDays} || ' days')::interval
        RETURNING 1
      ) SELECT count(*) AS count FROM d
    `);
    result.deletedLiveSessions = Number(deleted.rows[0]?.count ?? 0);
  }

  // 3. Old terminal jobs.
  if (policy.jobsDays > 0) {
    const deleted = await db.execute<{ count: string }>(sql`
      WITH d AS (
        DELETE FROM jobs
        WHERE status IN ('SUCCEEDED','FAILED','CANCELLED','EXPIRED')
          AND completed_at < now() - (${policy.jobsDays} || ' days')::interval
        RETURNING 1
      ) SELECT count(*) AS count FROM d
    `);
    result.deletedJobs = Number(deleted.rows[0]?.count ?? 0);
  }

  // 4. Old closed reports.
  if (policy.reportsDays > 0) {
    const deleted = await db.execute<{ count: string }>(sql`
      WITH d AS (
        DELETE FROM reports
        WHERE status IN ('RESOLVED','DISMISSED')
          AND updated_at < now() - (${policy.reportsDays} || ' days')::interval
        RETURNING 1
      ) SELECT count(*) AS count FROM d
    `);
    result.deletedReports = Number(deleted.rows[0]?.count ?? 0);
  }

  // 5. Old audit rows — accountability has a window, then privacy wins.
  if (policy.auditDays > 0) {
    const deleted = await db.execute<{ count: string }>(sql`
      WITH d AS (
        DELETE FROM audit_log
        WHERE created_at < now() - (${policy.auditDays} || ' days')::interval
        RETURNING 1
      ) SELECT count(*) AS count FROM d
    `);
    result.deletedAuditRows = Number(deleted.rows[0]?.count ?? 0);
  }

  // 6. Expired auth sessions / verification tokens (pure hygiene).
  const deadSessions = await db.execute<{ count: string }>(sql`
    WITH d AS (
      DELETE FROM sessions WHERE expires_at < now() RETURNING 1
    ) SELECT count(*) AS count FROM d
  `);
  result.deletedExpiredSessions = Number(deadSessions.rows[0]?.count ?? 0);

  const deadVerifications = await db.execute<{ count: string }>(sql`
    WITH d AS (
      DELETE FROM verifications WHERE expires_at < now() RETURNING 1
    ) SELECT count(*) AS count FROM d
  `);
  result.deletedExpiredVerifications = Number(
    deadVerifications.rows[0]?.count ?? 0,
  );

  // NOTE: auditing is the caller's responsibility — the scheduler tick runs
  // the sweep on a throttled cadence (23h) and records it then, so a
  // zero-deletion sweep every tick cannot flood the append-only log.
  return result;
}

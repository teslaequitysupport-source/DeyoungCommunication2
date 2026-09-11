/**
 * Server-side platform state for the P0 verification console.
 * Reads observed database state only — no simulated values, no caching of
 * stale facts. If the database is unreachable, that is what gets reported.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export interface PlatformState {
  ok: boolean;
  error: string | null;
  tableCounts: Array<{ table: string; rows: number }>;
  migrations: Array<{ hash: string; appliedAt: string | null }>;
  enumSummary: {
    userRoles: string[];
    liveSessionStates: number;
    workerStates: number;
  };
}

const TABLES = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "audit_log",
  "workers",
  "jobs",
  "live_sessions",
  "characters",
  "assets",
  "consent_records",
] as const;

export async function getPlatformState(): Promise<PlatformState> {
  const db = getDb();

  try {
    const tableCounts: Array<{ table: string; rows: number }> = [];
    for (const table of TABLES) {
      const result = await db.execute<{ count: number }>(
        sql`select count(*)::int as count from ${sql.identifier(table)}`,
      );
      tableCounts.push({ table, rows: result.rows[0]?.count ?? 0 });
    }

    const migrations = await db.execute<{
      hash: string;
      created_at: string | null;
    }>(
      sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`,
    );

    const roles = await db.execute<{ label: string }>(
      sql`select unnest(enum_range(null::user_role))::text as label`,
    );
    const liveStates = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from (select unnest(enum_range(null::live_session_status)) as s) t`,
    );
    const workerStates = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from (select unnest(enum_range(null::worker_status)) as s) t`,
    );

    return {
      ok: true,
      error: null,
      tableCounts,
      migrations: migrations.rows.map((m) => ({
        hash: m.hash.slice(0, 16),
        appliedAt: m.created_at ? new Date(m.created_at).toISOString() : null,
      })),
      enumSummary: {
        userRoles: roles.rows.map((r) => r.label),
        liveSessionStates: liveStates.rows[0]?.n ?? 0,
        workerStates: workerStates.rows[0]?.n ?? 0,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      tableCounts: [],
      migrations: [],
      enumSummary: { userRoles: [], liveSessionStates: 0, workerStates: 0 },
    };
  }
}

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * Health endpoint (approved report Ch. 15: health endpoints for app + DB).
 * Reports observed state only — never a fabricated "ok".
 *
 * The compute-plane section is aggregate counts by worker status (spec §45
 * visibility): sleeping vs awake capacity, and pending cold starts. No
 * worker identities — those live behind admin RBAC.
 */
export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "error" = "error";
  let databaseError: string | null = null;
  let compute: {
    byStatus: Record<string, number>;
    wakePending: number;
  } | null = null;

  try {
    await getDb().execute(sql`select 1`);
    database = "ok";
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  }

  if (database === "ok") {
    try {
      const statusRows = await getDb().execute<{ status: string; count: string }>(sql`
        SELECT status, count(*)::text AS count FROM workers GROUP BY status
      `);
      const byStatus: Record<string, number> = {};
      for (const row of statusRows.rows) byStatus[row.status] = Number(row.count);
      const wakeRows = await getDb().execute<{ count: string }>(sql`
        SELECT count(*)::text AS count FROM workers
        WHERE wake_requested_at IS NOT NULL AND status = 'SLEEPING'
      `);
      compute = { byStatus, wakePending: Number(wakeRows.rows[0]?.count ?? 0) };
    } catch (error) {
      databaseError = error instanceof Error ? error.message : String(error);
      database = "error";
    }
  }

  const body = {
    status: database === "ok" ? "ok" : "degraded",
    database,
    databaseError,
    compute,
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: database === "ok" ? 200 : 503 });
}

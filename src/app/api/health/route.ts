import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * Health endpoint (approved report Ch. 15: health endpoints for app + DB).
 * Reports observed state only — never a fabricated "ok".
 */
export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "error" = "error";
  let databaseError: string | null = null;

  try {
    await getDb().execute(sql`select 1`);
    database = "ok";
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  }

  const body = {
    status: database === "ok" ? "ok" : "degraded",
    database,
    databaseError,
    latencyMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: database === "ok" ? 200 : 503 });
}

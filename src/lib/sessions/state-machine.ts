/**
 * Live sessions — server-authoritative state machine (report Ch. 9;
 * spec §12: "The UI must reflect actual backend state. Never simulate.").
 *
 * The state graph (pg enum live_session_status):
 *
 *   CREATED → VALIDATING → WAITING_FOR_WORKER → WORKER_ASSIGNED → LOADING
 *     → READY → LIVE → (DEGRADED ⇄ RECOVERING) → STOPPING → COMPLETED
 *
 * with terminal FAILED / CANCELLED / EXPIRED reachable per the guards
 * below. All transitions happen inside the queue/worker/scheduler code —
 * this module owns user-initiated edges (create, stop, cancel) and the
 * consent gate.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import {
  characters,
  consentRecords,
  jobs as jobsTable,
  liveSessions,
} from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/queue";
import { recordAudit } from "@/lib/audit";

/** Purpose a live session requires before it may start (Ch. 12 consent). */
export const LIVE_TRANSFORM_CONSENT_PURPOSE = "camera.transform.live";

/** All edges — exported for UI timeline rendering and tests. */
export const SESSION_TRANSITIONS: Record<string, readonly string[]> = {
  CREATED: ["VALIDATING", "CANCELLED", "EXPIRED", "FAILED"],
  VALIDATING: ["WAITING_FOR_WORKER", "CANCELLED", "EXPIRED", "FAILED"],
  WAITING_FOR_WORKER: ["WORKER_ASSIGNED", "CANCELLED", "EXPIRED", "FAILED"],
  WORKER_ASSIGNED: ["LOADING", "WAITING_FOR_WORKER", "DEGRADED", "CANCELLED", "FAILED"],
  LOADING: ["READY", "WAITING_FOR_WORKER", "DEGRADED", "CANCELLED", "FAILED"],
  READY: ["LIVE", "WAITING_FOR_WORKER", "DEGRADED", "STOPPING", "CANCELLED", "FAILED"],
  LIVE: ["DEGRADED", "STOPPING", "CANCELLED", "FAILED"],
  DEGRADED: ["RECOVERING", "STOPPING", "CANCELLED", "FAILED"],
  RECOVERING: ["LIVE", "STOPPING", "CANCELLED", "FAILED"],
  STOPPING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: string, to: string): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface SessionRecord {
  id: string;
  userId: string;
  characterId: string | null;
  status: string;
  workerId: string | null;
  roomRef: string | null;
  metadata: Record<string, unknown> | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export type CreateSessionResult =
  | { ok: true; session: SessionRecord }
  | {
      ok: false;
      code:
        | "character_not_found"
        | "character_not_active"
        | "consent_required";
    };

/**
 * Create a live session for a character:
 *   1. the character must belong to the user and be ACTIVE,
 *   2. the user must hold a GRANTED consent record for
 *      `camera.transform.live` (their own camera stream is transformed),
 *   3. a `transform.live.colorgrade` job is enqueued with a session-scoped
 *      idempotency key (`live:{sessionId}`) — double-clicks create one job.
 */
export async function createLiveSession(
  db: PlatformDatabase,
  input: { userId: string; characterId: string },
): Promise<CreateSessionResult> {
  const [character] = await db
    .select()
    .from(characters)
    .where(
      and(eq(characters.id, input.characterId), eq(characters.userId, input.userId)),
    )
    .limit(1);
  if (!character) return { ok: false, code: "character_not_found" };
  if (character.status !== "ACTIVE") return { ok: false, code: "character_not_active" };

  const [consent] = await db
    .select({ id: consentRecords.id, status: consentRecords.status })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.userId, input.userId),
        eq(consentRecords.purpose, LIVE_TRANSFORM_CONSENT_PURPOSE),
      ),
    )
    .orderBy(desc(consentRecords.grantedAt))
    .limit(1);
  if (consent?.status !== "GRANTED") return { ok: false, code: "consent_required" };

  const [session] = await db
    .insert(liveSessions)
    .values({
      userId: input.userId,
      characterId: character.id,
      status: "CREATED",
      metadata: { characterName: character.name },
    })
    .returning();

  // VALIDATING passed (ownership + consent) → WAITING_FOR_WORKER.
  await db
    .update(liveSessions)
    .set({ status: "WAITING_FOR_WORKER", updatedAt: new Date() })
    .where(eq(liveSessions.id, session.id));

  await enqueueJob(db, {
    userId: input.userId,
    type: "transform.live.colorgrade",
    idempotencyKey: `live:${session.id}`,
    liveSessionId: session.id,
    inputRefs: {
      characterId: character.id,
      appearance: character.appearanceConfig ?? {},
    },
  });

  await recordAudit(db, {
    actorId: input.userId,
    action: "session.create",
    targetType: "live_session",
    targetId: session.id,
    outcome: "SUCCESS",
    metadata: { characterId: character.id },
  });

  const [fresh] = await db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.id, session.id))
    .limit(1);
  return { ok: true, session: fresh as unknown as SessionRecord };
}

/**
 * User stop: STOPPING now; the worker finalizes and the job completion
 * moves the session to COMPLETED. If the worker already finalized (e.g.
 * publisher left first), the session completes immediately. If no worker
 * ever claimed it, the session (and its queued job) is cancelled directly.
 */
export async function stopLiveSession(
  db: PlatformDatabase,
  input: { sessionId: string; userId: string },
): Promise<SessionRecord | null> {
  const [session] = await db
    .select()
    .from(liveSessions)
    .where(and(eq(liveSessions.id, input.sessionId), eq(liveSessions.userId, input.userId)))
    .limit(1);
  if (!session) return null;

  const from = session.status;
  const terminal = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];
  if (terminal.includes(from)) return session as unknown as SessionRecord;

  const next =
    from === "WAITING_FOR_WORKER" || from === "CREATED" || from === "VALIDATING"
      ? "CANCELLED"
      : "STOPPING";

  const [updated] = await db
    .update(liveSessions)
    .set({
      status: next,
      endedAt: next === "CANCELLED" ? new Date() : session.endedAt,
      updatedAt: new Date(),
    })
    .where(eq(liveSessions.id, session.id))
    .returning();

  if (next === "CANCELLED") {
    // Cancel the queued live job so no worker picks it up afterwards.
    await db.execute(sql`
      UPDATE jobs SET status = 'CANCELLED', completed_at = now()
      WHERE live_session_id = ${session.id} AND status = 'QUEUED'
    `);
  } else {
    // STOPPING: if the live job is already terminal, nothing will move the
    // session anymore — complete it now instead of stranding it.
    const [job] = await db
      .select({ status: jobsTable.status })
      .from(jobsTable)
      .where(eq(jobsTable.liveSessionId, session.id))
      .orderBy(desc(jobsTable.createdAt))
      .limit(1);
    if (job && ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"].includes(job.status)) {
      const [completed] = await db
        .update(liveSessions)
        .set({ status: "COMPLETED", endedAt: new Date(), updatedAt: new Date() })
        .where(eq(liveSessions.id, session.id))
        .returning();
      await recordAudit(db, {
        actorId: input.userId,
        action: "session.stop",
        targetType: "live_session",
        targetId: session.id,
        outcome: "SUCCESS",
        metadata: { from, to: "STOPPING", completedImmediately: true },
      });
      return completed as unknown as SessionRecord;
    }
  }

  await recordAudit(db, {
    actorId: input.userId,
    action: "session.stop",
    targetType: "live_session",
    targetId: session.id,
    outcome: "SUCCESS",
    metadata: { from, to: next },
  });
  return updated as unknown as SessionRecord;
}

export async function getSession(
  db: PlatformDatabase,
  sessionId: string,
): Promise<SessionRecord | null> {
  const [row] = await db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.id, sessionId))
    .limit(1);
  return (row as unknown as SessionRecord) ?? null;
}

export async function listUserSessions(
  db: PlatformDatabase,
  userId: string,
  limit = 20,
): Promise<SessionRecord[]> {
  const rows = await db
    .select()
    .from(liveSessions)
    .where(eq(liveSessions.userId, userId))
    .orderBy(desc(liveSessions.createdAt))
    .limit(limit);
  return rows as unknown as SessionRecord[];
}

/** Worker reports READY (model loaded). LOADING/RECOVERING → READY. */
export async function workerSessionReady(
  db: PlatformDatabase,
  sessionId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE live_sessions SET status = 'READY', updated_at = now()
    WHERE id = ${sessionId} AND status IN ('LOADING','RECOVERING')
  `);
}

/** First transformed frame flows: READY/RECOVERING → LIVE. Idempotent —
 *  repeated calls from the worker's stats loop touch updated_at, which the
 *  scheduler's stale-session sweep uses as session liveness. */
export async function sessionWentLive(
  db: PlatformDatabase,
  sessionId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE live_sessions SET
      status = CASE WHEN status IN ('READY','RECOVERING') THEN 'LIVE'::live_session_status ELSE status END,
      started_at = COALESCE(started_at, CASE WHEN status IN ('READY','RECOVERING') THEN now() END),
      updated_at = now()
    WHERE id = ${sessionId} AND status IN ('READY','RECOVERING','LIVE')
  `);
}

/** Worker is actively transforming (heartbeat of the media path). */
export async function sessionMediaDegraded(
  db: PlatformDatabase,
  sessionId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE live_sessions SET status = 'DEGRADED', updated_at = now()
    WHERE id = ${sessionId} AND status IN ('LIVE','READY','RECOVERING')
  `);
}

/**
 * Schema integration tests — the initial migration must uphold the
 * structural guarantees of the approved report (state machine enums,
 * idempotency, FK behavior, audit persistence across user deletion).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestStack, type TestStack } from "./helpers";
import {
  assets,
  auditLog,
  characters,
  consentRecords,
  jobs,
  liveSessions,
  user,
  workers,
} from "@/lib/db/schema";

let stack: TestStack;

beforeAll(async () => {
  stack = await createTestStack();
});

afterAll(async () => {
  await stack.client.close();
});

const USER_ID = "schema-test-user";

async function insertTestUser(id: string, email: string) {
  const [row] = await stack.db
    .insert(user)
    .values({ id, name: `Schema ${id}`, email })
    .returning();
  return row;
}

describe("migration shape", () => {
  it("creates all fifteen tables", async () => {
    const result = await stack.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = result.rows.map((r) => r.table_name);
    expect(names).toEqual([
      "accounts",
      "assets",
      "audit_log",
      "characters",
      "consent_records",
      "credit_ledger",
      "jobs",
      "live_sessions",
      "rate_limit_hits",
      "reports",
      "sessions",
      "twofactor",
      "users",
      "verifications",
      "workers",
    ]);
  });

  it("encodes the user status ladder incl. BANNED (spec §26)", async () => {
    const result = await stack.db.execute<{ label: string }>(
      sql`select unnest(enum_range(null::user_status))::text as label`,
    );
    expect(result.rows.map((r) => r.label)).toEqual([
      "ACTIVE",
      "SUSPENDED",
      "BANNED",
    ]);
  });

  it("encodes the spec §33 report reasons and outcomes", async () => {
    const reasons = await stack.db.execute<{ label: string }>(
      sql`select unnest(enum_range(null::report_reason))::text as label`,
    );
    expect(reasons.rows.map((r) => r.label)).toEqual([
      "IMPERSONATION",
      "HARASSMENT",
      "ILLEGAL_CONTENT",
      "UNAUTHORIZED_LIKENESS",
      "UNAUTHORIZED_VOICE",
      "SEXUAL_ABUSE_DEEPFAKE",
      "SCAM",
      "FRAUD",
      "COPYRIGHT",
      "OTHER",
    ]);
    const statuses = await stack.db.execute<{ label: string }>(
      sql`select unnest(enum_range(null::report_status))::text as label`,
    );
    expect(statuses.rows.map((r) => r.label)).toEqual([
      "OPEN",
      "IN_REVIEW",
      "RESOLVED",
      "DISMISSED",
    ]);
  });

  it("encodes the five approved roles", async () => {
    const result = await stack.db.execute<{ label: string }>(
      sql`select unnest(enum_range(null::user_role))::text as label`,
    );
    expect(result.rows.map((r) => r.label)).toEqual([
      "USER",
      "MODERATOR",
      "SUPPORT",
      "ADMIN",
      "SUPER_ADMIN",
    ]);
  });

  it("encodes all 14 live-session states (report Ch. 9)", async () => {
    const result = await stack.db.execute<{ label: string }>(
      sql`select unnest(enum_range(null::live_session_status))::text as label`,
    );
    expect(result.rows.map((r) => r.label)).toEqual([
      "CREATED",
      "VALIDATING",
      "WAITING_FOR_WORKER",
      "WORKER_ASSIGNED",
      "LOADING",
      "READY",
      "LIVE",
      "DEGRADED",
      "RECOVERING",
      "STOPPING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
      "EXPIRED",
    ]);
  });

  it("rejects an invalid live-session state at the database level", async () => {
    const u = await insertTestUser(USER_ID, "enum@test.local");
    // Raw SQL on purpose: the Drizzle types reject invalid enum values at
    // compile time (that is the first guarantee); this proves the database
    // constraint rejects them at runtime (the second guarantee).
    await expect(
      stack.db.execute(
        sql`insert into live_sessions (user_id, status) values (${u.id}, 'HAPPY')`,
      ),
    ).rejects.toThrow();
  });
});

describe("jobs table guarantees", () => {
  it("enforces idempotency key uniqueness (report Ch. 8-9)", async () => {
    const u = await insertTestUser("job-user-1", "jobs1@test.local");
    const w = (
      await stack.db
        .insert(workers)
        .values({
          name: "worker-alpha",
          provider: "DEVELOPMENT_LOCAL",
          credentialHash: "x".repeat(64),
        })
        .returning()
    )[0];

    await stack.db.insert(jobs).values({
      userId: u.id,
      type: "face.transform.live",
      idempotencyKey: "idem-key-001",
      workerId: w.id,
      status: "QUEUED",
    });

    await expect(
      stack.db.insert(jobs).values({
        userId: u.id,
        type: "face.transform.live",
        idempotencyKey: "idem-key-001",
      }),
    ).rejects.toThrow();

    // The same key for a different job type is still a duplicate — global unique.
    await expect(
      stack.db.insert(jobs).values({
        userId: u.id,
        type: "video.generate.h3",
        idempotencyKey: "idem-key-001",
      }),
    ).rejects.toThrow();
  });

  it("keeps the job row but clears workerId when a worker is deleted", async () => {
    const u = await insertTestUser("job-user-2", "jobs2@test.local");
    const w = (
      await stack.db
        .insert(workers)
        .values({
          name: "worker-beta",
          provider: "DEVELOPMENT_LOCAL",
          credentialHash: "y".repeat(64),
        })
        .returning()
    )[0];

    const j = (
      await stack.db
        .insert(jobs)
        .values({
          userId: u.id,
          type: "character.render",
          idempotencyKey: "idem-key-002",
          workerId: w.id,
        })
        .returning()
    )[0];

    await stack.db.delete(workers).where(eq(workers.id, w.id));

    const survivors = await stack.db.select().from(jobs).where(eq(jobs.id, j.id));
    expect(survivors).toHaveLength(1);
    expect(survivors[0].workerId).toBeNull();
  });
});

describe("ownership cascade", () => {
  it("deletes characters, assets, and consent when the user is deleted (report Ch. 12)", async () => {
    const u = await insertTestUser("cascade-user", "cascade@test.local");
    const c = (
      await stack.db
        .insert(characters)
        .values({ userId: u.id, name: "Cascade Character" })
        .returning()
    )[0];
    const a = (
      await stack.db
        .insert(assets)
        .values({
          userId: u.id,
          characterId: c.id,
          kind: "FACE_IMAGE",
          storageKey: "r2://dev/cascade-face.png",
          mimeType: "image/png",
          sizeBytes: 1024,
        })
        .returning()
    )[0];
    await stack.db.insert(consentRecords).values({
      userId: u.id,
      assetId: a.id,
      purpose: "face.transform.live",
      policyVersion: "2026-09-11",
    });

    await stack.db.delete(user).where(eq(user.id, u.id));

    expect(await stack.db.select().from(characters).where(eq(characters.id, c.id))).toHaveLength(0);
    expect(await stack.db.select().from(assets).where(eq(assets.id, a.id))).toHaveLength(0);
    expect(await stack.db.select().from(consentRecords).where(eq(consentRecords.userId, u.id))).toHaveLength(0);
  });

  it("withdraws consent by state change, not deletion (report Ch. 12)", async () => {
    const u = await insertTestUser("consent-user", "consent@test.local");
    const a = (
      await stack.db
        .insert(assets)
        .values({
          userId: u.id,
          kind: "VOICE_SAMPLE",
          storageKey: "r2://dev/consent-voice.wav",
          mimeType: "audio/wav",
          sizeBytes: 2048,
        })
        .returning()
    )[0];
    const consentRow = (
      await stack.db
        .insert(consentRecords)
        .values({
          userId: u.id,
          assetId: a.id,
          purpose: "voice.transform.live",
          policyVersion: "2026-09-11",
        })
        .returning()
    )[0];
    expect(consentRow.status).toBe("GRANTED");
    expect(consentRow.withdrawnAt).toBeNull();

    const [withdrawn] = await stack.db
      .update(consentRecords)
      .set({ status: "WITHDRAWN", withdrawnAt: new Date() })
      .where(eq(consentRecords.id, consentRow.id))
      .returning();

    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);
  });
});

describe("audit persistence (report Ch. 12 retention rules)", () => {
  it("keeps audit rows and their denormalized actor info after the user is deleted", async () => {
    const u = await insertTestUser("audit-user", "audit-delete@test.local");
    await stack.db.insert(auditLog).values({
      actorId: u.id,
      actorEmail: u.email,
      actorRole: "USER",
      action: "test.action",
      targetType: "user",
      targetId: u.id,
      outcome: "SUCCESS",
    });

    await stack.db.delete(user).where(eq(user.id, u.id));

    const rows = await stack.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "test.action"));
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBeNull(); // FK released
    expect(rows[0].actorEmail).toBe("audit-delete@test.local"); // evidence retained
    expect(rows[0].actorRole).toBe("USER");
  });
});

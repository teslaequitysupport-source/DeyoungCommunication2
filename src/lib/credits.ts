/**
 * Credits — the platform's spend unit (spec §41 CONSUMER, §59).
 *
 * Approved billing decision (Phase 1 report Ch. 18): NO payment provider in
 * this phase. Credits arrive as an env-configurable signup bonus and as
 * manual admin grants; jobs spend them; terminally failed / cancelled /
 * expired jobs refund them automatically. When a payment provider is
 * integrated later, it plugs in behind these same functions — the ledger
 * shape does not change.
 *
 * Correctness rules:
 *   - The ledger is append-only; balance is always SUM(delta) — there is no
 *     mutable balance column to drift.
 *   - Every mutation carries a unique idempotency key, so retries are
 *     exactly-once (same key = no second row).
 *   - Balance check + insert happen under a transaction-scoped Postgres
 *     advisory lock keyed to the user, so concurrent spends cannot both
 *     read the same balance and overdraw it.
 */

import { desc, eq, sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { creditLedger } from "@/lib/db/schema";

export type CreditKind = "SIGNUP_BONUS" | "ADMIN_GRANT" | "JOB_SPEND" | "JOB_REFUND";

// ─────────────────────────────────────────────────────────────────────────────
// Costs — env-overridable, defaulting to honest dev-tier prices
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default credit costs per job type. Live dev transforms are free (the CPU
 * color grade costs the platform nothing); batch image transforms cost a
 * token amount so the free tier exercises the spend path; H3 generation is
 * the expensive provider path. Override per type via env:
 *   CREDITS_COST_VIDEO_GENERATE_H3=25
 */
const DEFAULT_JOB_COSTS: Record<string, number> = {
  "transform.image.colorgrade": 1,
  "transform.live.colorgrade": 0,
  "video.generate.h3": 50,
};

function envKeyForJobType(type: string): string {
  return `CREDITS_COST_${type.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}`;
}

/** Credit cost of one job of `type` (env override > registry default > 0). */
export function jobCreditCost(type: string): number {
  const raw = process.env[envKeyForJobType(type)];
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_JOB_COSTS[type] ?? 0;
}

/** Signup bonus (env-configurable; 0 disables). */
export function signupBonusCredits(): number {
  const parsed = Number.parseInt(process.env.SIGNUP_BONUS_CREDITS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Locking — a stable bigint from the user id (FNV-1a, 48-bit space)
// ─────────────────────────────────────────────────────────────────────────────

function userLockKey(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Mix length in so prefixes of different lengths never collide trivially.
  // 48-bit value — exact within JS safe-integer range.
  return hash * 0x10000 + (userId.length & 0xffff);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export async function creditBalance(
  db: PlatformDatabase,
  userId: string,
): Promise<number> {
  const rows = await db.execute<{ balance: string | number | null }>(sql`
    SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE user_id = ${userId}
  `);
  return Number(rows.rows[0]?.balance ?? 0);
}

export interface CreditLedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  kind: CreditKind;
  jobId: string | null;
  reason: string | null;
  createdAt: string;
}

export async function creditHistory(
  db: PlatformDatabase,
  userId: string,
  limit = 25,
): Promise<CreditLedgerEntry[]> {
  const rows = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    balanceAfter: r.balanceAfter,
    kind: r.kind as CreditKind,
    jobId: r.jobId,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations — all exactly-once, all under the per-user advisory lock
// ─────────────────────────────────────────────────────────────────────────────

export interface GrantInput {
  userId: string;
  amount: number;
  kind: CreditKind;
  reason?: string | null;
  grantedById?: string | null;
  idempotencyKey: string;
}

export interface GrantResult {
  /** False when the idempotency key already existed (no double grant). */
  applied: boolean;
  balanceAfter: number;
}

/** Grant (positive) or adjust credits — exactly-once per idempotency key. */
export async function grantCredits(
  db: PlatformDatabase,
  input: GrantInput,
): Promise<GrantResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("grantCredits: amount must be a positive integer");
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${userLockKey(input.userId)})`,
    );

    const existing = await tx
      .select({ balanceAfter: creditLedger.balanceAfter })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing.length > 0) {
      return {
        applied: false,
        balanceAfter: existing[0].balanceAfter,
      };
    }

    const rows = await tx.execute<{ balance: string | number | null }>(sql`
      SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE user_id = ${input.userId}
    `);
    const balanceAfter = Number(rows.rows[0]?.balance ?? 0) + input.amount;

    await tx.insert(creditLedger).values({
      userId: input.userId,
      delta: input.amount,
      balanceAfter,
      kind: input.kind,
      jobId: null,
      grantedById: input.grantedById ?? null,
      reason: input.reason ?? null,
      idempotencyKey: input.idempotencyKey,
    });

    return { applied: true, balanceAfter };
  });
}

export type SpendResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; reason: "insufficient"; balance: number; cost: number };

/**
 * Spend credits for a job. Exactly-once per `spend:<jobId>` key: a retry
 * (e.g. the client re-submits an idempotent job) charges nothing extra.
 * Insufficient balance returns a refusal — the caller must then fail the
 * job terminally without provider work.
 */
export async function spendCreditsForJob(
  db: PlatformDatabase,
  args: { userId: string; jobId: string; cost: number },
): Promise<SpendResult> {
  if (args.cost <= 0) {
    // Free job types never touch the ledger — nothing to spend or refund.
    return { ok: true, balanceAfter: await creditBalance(db, args.userId) };
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${userLockKey(args.userId)})`,
    );

    const existing = await tx
      .select({ balanceAfter: creditLedger.balanceAfter })
      .from(creditLedger)
      .where(eq(creditLedger.idempotencyKey, `spend:${args.jobId}`))
      .limit(1);
    if (existing.length > 0) {
      return { ok: true as const, balanceAfter: existing[0].balanceAfter };
    }

    const rows = await tx.execute<{ balance: string | number | null }>(sql`
      SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE user_id = ${args.userId}
    `);
    const balance = Number(rows.rows[0]?.balance ?? 0);
    if (balance < args.cost) {
      return {
        ok: false as const,
        reason: "insufficient" as const,
        balance,
        cost: args.cost,
      };
    }

    await tx.insert(creditLedger).values({
      userId: args.userId,
      delta: -args.cost,
      balanceAfter: balance - args.cost,
      kind: "JOB_SPEND",
      jobId: args.jobId,
      idempotencyKey: `spend:${args.jobId}`,
    });

    return { ok: true as const, balanceAfter: balance - args.cost };
  });
}

/**
 * Refund a job's spend — used when the job ends without delivering work
 * (terminal FAILED, CANCELLED, or EXPIRED). Exactly-once per
 * `refund:<jobId>`; a no-op when the job never spent anything (free type,
 * or already refunded).
 */
export async function refundJobCredits(
  db: PlatformDatabase,
  args: { jobId: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Find the spend row (also the owning user + amount) if any.
    const spends = await tx.execute<{
      user_id: string;
      delta: number;
    }>(sql`
      SELECT user_id, delta FROM credit_ledger
      WHERE job_id = ${args.jobId} AND kind = 'JOB_SPEND'
      LIMIT 1
    `);
    const spend = spends.rows[0];
    if (!spend) return false;

    const userId = spend.user_id;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${userLockKey(userId)})`,
    );

    // Already refunded?
    const refunded = await tx.execute<{ id: string }>(sql`
      SELECT id FROM credit_ledger WHERE idempotency_key = ${`refund:${args.jobId}`} LIMIT 1
    `);
    if (refunded.rows.length > 0) return false;

    const amount = -spend.delta; // spend delta is negative
    const rows = await tx.execute<{ balance: string | number | null }>(sql`
      SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE user_id = ${userId}
    `);
    const balanceAfter = Number(rows.rows[0]?.balance ?? 0) + amount;

    await tx.insert(creditLedger).values({
      userId,
      delta: amount,
      balanceAfter,
      kind: "JOB_REFUND",
      jobId: args.jobId,
      idempotencyKey: `refund:${args.jobId}`,
      reason: "Job ended without delivering work",
    });
    return true;
  });
}

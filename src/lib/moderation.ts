/**
 * Moderation service (spec §33) — report intake + moderator decisions.
 *
 * Design points:
 *   - Intake validates the polymorphic target against the entity table it
 *     names, so reports always reference something that existed (no phantom
 *     IDs to farm queue noise). `targetUserId` is resolved at intake and
 *     denormalized onto the report row for cheap enforcement later.
 *   - Decisions are the ONLY way reports leave OPEN/IN_REVIEW. A decision
 *     must document itself (spec: "document decisions"): notes are required
 *     whenever an enforcement action is attached.
 *   - Enforcement is centralized in `applyModerationAction` so report-driven
 *     decisions and direct admin user management share one audited path:
 *     WARN (no-op marker), SUSPEND/BAN (status + session revocation),
 *     CONTENT_REMOVAL (characters → ARCHIVED, assets' owning characters
 *     archived; asset rows persist because storage keys are evidence).
 *   - Every state change writes an audit row; audit failures surface loudly.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import {
  assets,
  characters,
  jobs,
  liveSessions,
  reports,
  session,
  user,
} from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import type { ApiUser } from "@/lib/api-helpers";

export const REPORT_REASONS = [
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
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_TARGET_TYPES = [
  "user",
  "character",
  "asset",
  "live_session",
  "job",
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const MODERATION_ACTIONS = [
  "NONE",
  "WARNING",
  "SUSPENSION",
  "BAN",
  "CONTENT_REMOVAL",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const MAX_DETAILS_LENGTH = 4_000;
export const MAX_DECISION_NOTES_LENGTH = 8_000;

export interface ReportInput {
  reporterId: string;
  reason: ReportReason;
  targetType: ReportTargetType;
  targetId: string;
  details?: string | null;
}

export interface ReportDecisionInput {
  reportId: string;
  decidedBy: ApiUser;
  outcome: "RESOLVED" | "DISMISSED";
  action: ModerationAction;
  notes: string;
  /** Caller context for audit rows. */
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class ModerationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ModerationError";
    this.code = code;
  }
}

/** Validate that the target exists and resolve its owning user, if any. */
async function resolveTarget(
  db: PlatformDatabase,
  targetType: ReportTargetType,
  targetId: string,
): Promise<{ exists: boolean; targetUserId: string | null }> {
  switch (targetType) {
    case "user": {
      const row = await db.query.user.findFirst({
        where: eq(user.id, targetId),
        columns: { id: true },
      });
      return { exists: Boolean(row), targetUserId: row ? targetId : null };
    }
    case "character": {
      const row = await db.query.characters.findFirst({
        where: eq(characters.id, targetId),
        columns: { userId: true },
      });
      return { exists: Boolean(row), targetUserId: row?.userId ?? null };
    }
    case "asset": {
      const row = await db.query.assets.findFirst({
        where: eq(assets.id, targetId),
        columns: { userId: true },
      });
      return { exists: Boolean(row), targetUserId: row?.userId ?? null };
    }
    case "live_session": {
      const row = await db.query.liveSessions.findFirst({
        where: eq(liveSessions.id, targetId),
        columns: { userId: true },
      });
      return { exists: Boolean(row), targetUserId: row?.userId ?? null };
    }
    case "job": {
      const row = await db.query.jobs.findFirst({
        where: eq(jobs.id, targetId),
        columns: { userId: true },
      });
      return { exists: Boolean(row), targetUserId: row?.userId ?? null };
    }
  }
}

export async function createReport(
  db: PlatformDatabase,
  input: ReportInput,
): Promise<{ id: string }> {
  if (input.reason === "OTHER" && !input.details?.trim()) {
    throw new ModerationError(
      "details_required",
      "Reports with reason OTHER must describe the issue.",
    );
  }
  const target = await resolveTarget(db, input.targetType, input.targetId);
  if (!target.exists) {
    throw new ModerationError("target_not_found", "The reported entity does not exist.");
  }
  if (target.targetUserId === input.reporterId) {
    throw new ModerationError(
      "self_report",
      "You cannot report your own content.",
    );
  }

  const [row] = await db
    .insert(reports)
    .values({
      reporterId: input.reporterId,
      reason: input.reason,
      targetType: input.targetType,
      targetId: input.targetId,
      targetUserId: target.targetUserId,
      details: input.details?.trim() || null,
    })
    .returning();

  await recordAudit(db, {
    actorId: input.reporterId,
    action: "moderation.report.create",
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: "SUCCESS",
    metadata: { reportId: row.id, reason: input.reason },
  });

  return row;
}

export interface QueueFilter {
  status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  limit?: number;
}

export async function listReports(
  db: PlatformDatabase,
  filter: QueueFilter = {},
) {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  return db.query.reports.findMany({
    where: filter.status ? eq(reports.status, filter.status) : undefined,
    orderBy: [desc(reports.createdAt)],
    limit,
  });
}

export async function getReport(db: PlatformDatabase, reportId: string) {
  return db.query.reports.findFirst({
    where: eq(reports.id, reportId),
  });
}

/**
 * Apply an enforcement action. Shared by report decisions and direct admin
 * user management so there is exactly one audited enforcement path.
 */
export async function applyModerationAction(
  db: PlatformDatabase,
  targetUserId: string,
  action: ModerationAction,
  actor: Pick<ApiUser, "id" | "email" | "role">,
  context: { reportId?: string; ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const auditBase = {
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetType: "user" as const,
    targetId: targetUserId,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    metadata: context.reportId ? { reportId: context.reportId } : {},
  };

  switch (action) {
    case "NONE":
    case "WARNING":
      // Warning is a documented marker only — no state change.
      await recordAudit(db, {
        ...auditBase,
        action: action === "WARNING" ? "moderation.warn" : "moderation.no_action",
        outcome: "SUCCESS",
      });
      return;

    case "SUSPENSION":
    case "BAN": {
      const status = action === "BAN" ? "BANNED" : "SUSPENDED";
      await db
        .update(user)
        .set({ status })
        .where(eq(user.id, targetUserId));
      // Revoke every active session immediately (ban must not wait for
      // cookie expiry; the spec treats session security as non-optional).
      const revoked = await db
        .delete(session)
        .where(eq(session.userId, targetUserId))
        .returning();
      await recordAudit(db, {
        ...auditBase,
        action: action === "BAN" ? "moderation.ban" : "moderation.suspend",
        outcome: "SUCCESS",
        metadata: { ...auditBase.metadata, revokedSessions: revoked.length },
      });
      return;
    }

    case "CONTENT_REMOVAL": {
      const archivedCharacters = await db
        .update(characters)
        .set({ status: "ARCHIVED" })
        .where(and(eq(characters.userId, targetUserId), inArray(characters.status, ["DRAFT", "ACTIVE"])))
        .returning();
      await recordAudit(db, {
        ...auditBase,
        action: "moderation.content_removal",
        outcome: "SUCCESS",
        metadata: {
          ...auditBase.metadata,
          archivedCharacters: archivedCharacters.map((c) => c.id),
        },
      });
      return;
    }
  }
}

/** Decide a report: RESOLVE (with action) or DISMISS. Audited, idempotent-ish. */
export async function decideReport(
  db: PlatformDatabase,
  input: ReportDecisionInput,
): Promise<void> {
  const report = await getReport(db, input.reportId);
  if (!report) {
    throw new ModerationError("report_not_found", "Report not found.");
  }
  if (report.status === "RESOLVED" || report.status === "DISMISSED") {
    throw new ModerationError(
      "already_decided",
      "This report has already been decided.",
    );
  }
  if (input.outcome === "RESOLVED" && input.action !== "NONE" && !input.notes.trim()) {
    throw new ModerationError(
      "notes_required",
      "Enforcement decisions must be documented.",
    );
  }

  await db
    .update(reports)
    .set({
      status: input.outcome,
      decisionAction: input.outcome === "RESOLVED" ? input.action : null,
      decisionNotes: input.notes.trim() || null,
      decidedById: input.decidedBy.id,
      decidedAt: new Date(),
    })
    .where(eq(reports.id, input.reportId));

  // Enforcement only fires on RESOLVED with an actionable decision.
  if (
    input.outcome === "RESOLVED" &&
    report.targetUserId &&
    input.action !== "NONE"
  ) {
    await applyModerationAction(db, report.targetUserId, input.action, input.decidedBy, {
      reportId: input.reportId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  await recordAudit(db, {
    actorId: input.decidedBy.id,
    actorEmail: input.decidedBy.email,
    actorRole: input.decidedBy.role,
    action: "moderation.report.decide",
    targetType: "report",
    targetId: input.reportId,
    outcome: "SUCCESS",
    metadata: {
      reportOutcome: input.outcome,
      action: input.outcome === "RESOLVED" ? input.action : null,
    },
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

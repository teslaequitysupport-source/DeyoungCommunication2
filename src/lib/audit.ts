/**
 * Audit service — append-only record of security-relevant events
 * (report Ch. 7, 11, 12).
 *
 * Design points:
 *   - The database handle is injected so integration tests can audit into a
 *     fresh PGlite instance instead of the dev database.
 *   - Writes are NOT swallowed: an audit failure surfaces loudly. The
 *     platform must never silently lose audit entries; DB-level append-only
 *     enforcement (revoking UPDATE/DELETE) is Phase 3 hardening.
 *   - Auth events are wired in Phase 0 via Better Auth databaseHooks
 *     (see src/lib/auth.ts). Brain tool executions, admin actions, and
 *     emergency controls join this table in later phases.
 */

import type { PlatformDatabase } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import type { UserRole } from "@/lib/rbac";

export const AUDIT_ACTIONS = {
  userSignedUp: "auth.sign_up",
  userSignedIn: "auth.sign_in",
  userSignedOut: "auth.sign_out",
  signUpDenied: "auth.sign_up.denied",
  signInDenied: "auth.sign_in.denied",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | (string & {});

export type AuditOutcome = "SUCCESS" | "DENIED" | "ERROR";

export interface AuditEntryInput {
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Append one audit row. Never mutates existing rows. */
export async function recordAudit(
  db: PlatformDatabase,
  entry: AuditEntryInput,
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId ?? null,
    actorEmail: entry.actorEmail ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    outcome: entry.outcome,
    metadata: entry.metadata ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  });
}

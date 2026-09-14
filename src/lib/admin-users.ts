/**
 * Admin user management (spec §26 USERS) — search, inspect, status and role
 * changes for the admin console. All state changes are audited.
 *
 * Rules:
 *   - Search/inspect requires `support:users:view` (SUPPORT can look, not
 *     touch) or `users:manage` (ADMIN+).
 *   - Status changes require `users:manage`. Suspension and ban revoke every
 *     active session immediately. Un-banning a BANNED account requires
 *     SUPER_ADMIN — reversing a ban is a higher bar than applying it.
 *   - Role changes require `roles:assign` (SUPER_ADMIN only) and can never
 *     target the acting admin's own account (no self-escalation / no
 *     self-lockout).
 *   - API responses expose safe fields only — never password hashes or
 *     session tokens (spec §26: "Never allow the admin UI to expose raw
 *     secrets").
 */

import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import {
  assets,
  characters,
  jobs,
  reports,
  session,
  user,
} from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import type { ApiUser } from "@/lib/api-helpers";
import { isUserRole, type UserRole } from "@/lib/rbac";

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "BANNED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_LIST_LIMIT_MAX = 100;

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: typeof user.$inferSelect): AdminUserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface UserListFilter {
  q?: string;
  status?: UserStatus;
  limit?: number;
  offset?: number;
}

export async function listUsers(db: PlatformDatabase, filter: UserListFilter = {}) {
  const q = filter.q?.trim();
  const where = and(
    filter.status ? eq(user.status, filter.status) : undefined,
    q
      ? or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`))
      : undefined,
  );
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), ADMIN_LIST_LIMIT_MAX);
  const offset = Math.max(filter.offset ?? 0, 0);

  const rows = await db
    .select()
    .from(user)
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await db
    .select({ total: count() })
    .from(user)
    .where(where);

  return { users: rows.map(toRecord), total: Number(total) };
}

export async function getUserById(db: PlatformDatabase, userId: string) {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });
  return row ? toRecord(row) : null;
}

/** Full account state for the admin inspector: user + sessions + usage. */
export async function inspectUser(db: PlatformDatabase, userId: string) {
  const record = await getUserById(db, userId);
  if (!record) return null;

  const sessions = await db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(eq(session.userId, userId))
    .orderBy(desc(session.createdAt));

  const [charCount] = await db
    .select({ value: count() })
    .from(characters)
    .where(eq(characters.userId, userId));
  const [assetCount] = await db
    .select({ value: count() })
    .from(assets)
    .where(eq(assets.userId, userId));
  const [jobCount] = await db
    .select({ value: count() })
    .from(jobs)
    .where(eq(jobs.userId, userId));
  const [reportsAgainst] = await db
    .select({ value: count() })
    .from(reports)
    .where(eq(reports.targetUserId, userId));

  return {
    user: record,
    sessions: sessions.map((s) => ({
      ...s,
      // Present-tense boolean derived at read time, not stored.
      expired: s.expiresAt.getTime() < Date.now(),
    })),
    usage: {
      characters: Number(charCount.value),
      assets: Number(assetCount.value),
      jobs: Number(jobCount.value),
      reportsAgainst: Number(reportsAgainst.value),
    },
  };
}

export class AdminUserError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AdminUserError";
    this.code = code;
  }
}

export interface StatusChangeInput {
  targetUserId: string;
  newStatus: UserStatus;
  actor: ApiUser;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const STATUS_TRANSITIONS: Record<UserStatus, readonly (UserStatus | "SUPER_ADMIN:unban")[]> = {
  ACTIVE: ["SUSPENDED", "BANNED"],
  // Escalation from suspension is allowed; restore to ACTIVE is allowed.
  SUSPENDED: ["ACTIVE", "BANNED"],
  // Un-banning requires SUPER_ADMIN (enforced below).
  BANNED: ["SUPER_ADMIN:unban"],
};

export async function setUserStatus(
  db: PlatformDatabase,
  input: StatusChangeInput,
): Promise<AdminUserRecord> {
  const target = await db.query.user.findFirst({
    where: eq(user.id, input.targetUserId),
  });
  if (!target) throw new AdminUserError("user_not_found", "User not found.");

  const from = target.status;
  const to = input.newStatus;
  if (from === to) {
    throw new AdminUserError("no_op", `User is already ${from}.`);
  }

  const transitions = STATUS_TRANSITIONS[from];
  if (from === "BANNED") {
    // Only SUPER_ADMIN may reverse a ban.
    if (to !== "ACTIVE" || input.actor.role !== "SUPER_ADMIN") {
      throw new AdminUserError(
        "transition_not_allowed",
        "Only SUPER_ADMIN can unban a BANNED account.",
      );
    }
  } else if (!transitions.includes(to)) {
    throw new AdminUserError(
      "transition_not_allowed",
      `Cannot change status from ${from} to ${to}.`,
    );
  }

  await db
    .update(user)
    .set({ status: to })
    .where(eq(user.id, input.targetUserId));

  let revokedSessions = 0;
  if (to === "SUSPENDED" || to === "BANNED") {
    const revoked = await db
      .delete(session)
      .where(eq(session.userId, input.targetUserId))
      .returning();
    revokedSessions = revoked.length;
  }

  await recordAudit(db, {
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: `admin.user.status.${to.toLowerCase()}`,
    targetType: "user",
    targetId: input.targetUserId,
    outcome: "SUCCESS",
    metadata: {
      from,
      to,
      reason: input.reason ?? null,
      revokedSessions,
    },
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  const updated = await getUserById(db, input.targetUserId);
  return updated!;
}

export interface RoleChangeInput {
  targetUserId: string;
  newRole: UserRole;
  actor: ApiUser;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function setUserRole(
  db: PlatformDatabase,
  input: RoleChangeInput,
): Promise<AdminUserRecord> {
  if (input.targetUserId === input.actor.id) {
    throw new AdminUserError(
      "self_role_change",
      "Admins cannot change their own role.",
    );
  }
  const target = await db.query.user.findFirst({
    where: eq(user.id, input.targetUserId),
  });
  if (!target) throw new AdminUserError("user_not_found", "User not found.");
  if (target.role === input.newRole) {
    throw new AdminUserError("no_op", `User already has role ${input.newRole}.`);
  }

  await db
    .update(user)
    .set({ role: input.newRole })
    .where(eq(user.id, input.targetUserId));

  // Role changes revoke sessions: the new role must apply to the very next
  // request the target makes, and a demoted admin must not keep an
  // elevated session until cookie expiry.
  const revoked = await db
    .delete(session)
    .where(eq(session.userId, input.targetUserId))
    .returning();

  await recordAudit(db, {
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: "admin.user.role_change",
    targetType: "user",
    targetId: input.targetUserId,
    outcome: "SUCCESS",
    metadata: {
      from: target.role,
      to: input.newRole,
      revokedSessions: revoked.length,
    },
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  const updated = await getUserById(db, input.targetUserId);
  return updated!;
}

/** Safe lookup used by routes that need a role enum value. */
export function parseUserRole(value: unknown): UserRole | null {
  return isUserRole(value) ? value : null;
}

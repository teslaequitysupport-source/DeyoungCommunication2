/**
 * Account deletion + data export (spec §35 "Implement account deletion",
 * "export method"; NDPA data-subject rights — access, portability, erasure).
 *
 * Deletion is REAL, not a soft-delete flag:
 *   1. every storage object the user owns is deleted (best-effort, counted),
 *   2. the user row is deleted — FK cascades remove profile, sessions,
 *      credentials, 2FA, characters, assets metadata, consent records,
 *      live sessions, jobs, and the credit ledger,
 *   3. rows that must OUTLIVE the account de-link via ON DELETE SET NULL:
 *      abuse reports (reporter + target), moderation decisions, audit log
 *      entries — accountability survives erasure, exactly as the retention
 *      policy promises,
 *   4. one final audit row records the deletion with the (denormalized)
 *      account email so the action remains provable.
 *
 * Export is the NDPA subject-access right: one JSON document with every
 * record the platform holds about the user, plus authenticated download
 * links for media. Security secrets (password hash, TOTP secret, session
 * tokens) are excluded and the document says so.
 */

import { eq, sql } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import {
  assets,
  characters,
  consentRecords,
  creditLedger,
  jobs,
  liveSessions,
  reports,
  user as users,
} from "@/lib/db/schema";
import type { StorageAdapter } from "@/lib/storage/types";
import { recordAudit } from "@/lib/audit";

export interface DeleteAccountResult {
  deletedObjects: number;
  failedObjects: number;
}

/**
 * Hard-delete a user account. The caller is responsible for authorization
 * (session + password + confirmation) — this function is the single
 * shared engine so the route and any future admin path behave identically.
 */
export async function deleteUserAccount(
  db: PlatformDatabase,
  storage: Pick<StorageAdapter, "deleteObject">,
  userId: string,
): Promise<DeleteAccountResult> {
  // Capture for the final audit row BEFORE the row disappears.
  const [victim] = await db
    .select({ email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!victim) {
    throw new Error("deleteUserAccount: user not found");
  }

  // 1. Delete every storage object the account owns (best-effort, counted).
  const owned = await db
    .select({ storageKey: assets.storageKey })
    .from(assets)
    .where(eq(assets.userId, userId));
  let deletedObjects = 0;
  let failedObjects = 0;
  for (const { storageKey } of owned) {
    try {
      await storage.deleteObject(storageKey);
      deletedObjects += 1;
    } catch {
      failedObjects += 1;
    }
  }

  // 2. Delete the user row — cascades do the rest.
  await db.delete(users).where(eq(users.id, userId));

  // 3. The audit entry proving it happened (actor de-linked by the FK).
  await recordAudit(db, {
    actorId: null,
    actorEmail: victim.email,
    actorRole: victim.role,
    action: "account.delete",
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
    metadata: {
      deletedObjects,
      failedObjects,
      accountExistedDays: Math.round(
        (Date.now() - new Date(victim.createdAt).getTime()) / 86_400_000,
      ),
    },
  });

  return { deletedObjects, failedObjects };
}

export interface UserDataExport {
  format: "live-character-platform.export.v1";
  generatedAt: string;
  notice: string;
  profile: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string;
    status: string;
    twoFactorEnabled: boolean;
    createdAt: string;
  };
  characters: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown> & { downloadUrl: string }>;
  consentRecords: Array<Record<string, unknown>>;
  liveSessions: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  creditLedger: Array<Record<string, unknown>>;
  reportsFiled: Array<Record<string, unknown>>;
}

/**
 * Compile the NDPA subject-access export for a user. Media is included as
 * authenticated download links (they work while you are signed in) —
 * embedding raw bytes in a JSON document is neither portable nor honest
 * about size.
 */
export async function exportUserData(
  db: PlatformDatabase,
  userId: string,
): Promise<UserDataExport> {
  const [profile] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!profile) throw new Error("exportUserData: user not found");

  const [charRows, assetRows, consentRows, sessionRows, jobRows, ledgerRows, reportRows] =
    await Promise.all([
      db.select().from(characters).where(eq(characters.userId, userId)),
      db.select().from(assets).where(eq(assets.userId, userId)),
      db.select().from(consentRecords).where(eq(consentRecords.userId, userId)),
      db
        .select()
        .from(liveSessions)
        .where(eq(liveSessions.userId, userId)),
      db.select().from(jobs).where(eq(jobs.userId, userId)),
      db.select().from(creditLedger).where(eq(creditLedger.userId, userId)),
      db.select().from(reports).where(eq(reports.reporterId, userId)),
    ]);

  await recordAudit(db, {
    actorId: userId,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: "account.export",
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
    metadata: {
      counts: {
        characters: charRows.length,
        assets: assetRows.length,
        consentRecords: consentRows.length,
        liveSessions: sessionRows.length,
        jobs: jobRows.length,
        creditEntries: ledgerRows.length,
        reportsFiled: reportRows.length,
      },
    },
  });

  return {
    format: "live-character-platform.export.v1",
    generatedAt: new Date().toISOString(),
    notice:
      "This document contains the personal data this platform holds about your account. " +
      "Security secrets (password hash, two-factor secret, session tokens) are excluded — " +
      "they cannot be exported by design. Media is linked, not embedded: the downloadUrl " +
      "links work while you are signed in to the account that owns them.",
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      emailVerified: profile.emailVerified,
      role: profile.role,
      status: profile.status,
      twoFactorEnabled: profile.twoFactorEnabled,
      createdAt: profile.createdAt.toISOString(),
    },
    characters: charRows.map((c) => ({
      id: c.id,
      name: c.name,
      appearanceConfig: c.appearanceConfig,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    assets: assetRows.map((a) => ({
      id: a.id,
      kind: a.kind,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      sha256: a.sha256,
      characterId: a.characterId,
      createdAt: a.createdAt.toISOString(),
      downloadUrl: `/api/assets/${a.id}/file`,
    })),
    consentRecords: consentRows.map((c) => ({
      id: c.id,
      purpose: c.purpose,
      scope: c.scope,
      policyVersion: c.policyVersion,
      status: c.status,
      assetId: c.assetId,
      grantedAt: c.grantedAt.toISOString(),
      withdrawnAt: c.withdrawnAt?.toISOString() ?? null,
      expiresAt: c.expiresAt?.toISOString() ?? null,
    })),
    liveSessions: sessionRows.map((s) => ({
      id: s.id,
      status: s.status,
      characterId: s.characterId,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
    jobs: jobRows.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      priority: j.priority,
      inputRefs: j.inputRefs,
      result: j.result,
      usage: j.usage,
      retryCount: j.retryCount,
      failureInfo: j.failureInfo,
      createdAt: j.createdAt.toISOString(),
      completedAt: j.completedAt?.toISOString() ?? null,
    })),
    creditLedger: ledgerRows.map((l) => ({
      id: l.id,
      delta: l.delta,
      balanceAfter: l.balanceAfter,
      kind: l.kind,
      jobId: l.jobId,
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    })),
    reportsFiled: reportRows.map((r) => ({
      id: r.id,
      reason: r.reason,
      targetType: r.targetType,
      targetId: r.targetId,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

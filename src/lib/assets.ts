/**
 * Asset service — shared logic for finalizing uploads into asset rows.
 * The row is created ONLY after the bytes passed validation, so no orphan
 * metadata exists for uploads that never completed.
 */

import { and, desc, eq } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { assets, characters } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import type { TicketPayload } from "@/lib/storage/types";

export interface FinalizeInput {
  ticket: TicketPayload;
  storageKey: string;
  sha256: string | null;
}

export async function finalizeAssetUpload(
  db: PlatformDatabase,
  input: FinalizeInput,
) {
  await db
    .insert(assets)
    .values({
      id: input.ticket.a,
      userId: input.ticket.u,
      characterId: input.ticket.c,
      kind: input.ticket.k,
      storageKey: input.storageKey,
      mimeType: input.ticket.m,
      sizeBytes: input.ticket.s,
      sha256: input.sha256,
    })
    .onConflictDoNothing({ target: assets.id });

  const [row] = await db
    .select()
    .from(assets)
    .where(eq(assets.id, input.ticket.a))
    .limit(1);
  return row;
}

export async function listUserAssets(db: PlatformDatabase, userId: string) {
  return db
    .select()
    .from(assets)
    .where(eq(assets.userId, userId))
    .orderBy(desc(assets.createdAt));
}

export async function getOwnedAsset(
  db: PlatformDatabase,
  assetId: string,
  userId: string,
) {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function auditAssetEvent(
  db: PlatformDatabase,
  args: {
    userId: string;
    email: string;
    role: string;
    action: string;
    assetId: string;
    outcome?: "SUCCESS" | "DENIED" | "ERROR";
    metadata?: Record<string, unknown>;
  },
) {
  await recordAudit(db, {
    actorId: args.userId,
    actorEmail: args.email,
    actorRole: args.role as never,
    action: args.action,
    targetType: "asset",
    targetId: args.assetId,
    outcome: args.outcome ?? "SUCCESS",
    metadata: args.metadata ?? null,
  });
}

export async function characterExistsForUser(
  db: PlatformDatabase,
  characterId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.userId, userId)))
    .limit(1);
  return Boolean(row);
}

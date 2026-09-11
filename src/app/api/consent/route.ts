/**
 * Consent API — explicit, purpose-scoped, withdrawable records (spec §16;
 * report Ch. 12). A generic Terms checkbox never substitutes for these
 * records; withdrawal is a first-class operation.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, consentRecords } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { z } from "zod";

export const CONSENT_POLICY_VERSION = "2026-09-11.1";

/** Purposes the platform currently defines (tied to real capabilities). */
export const CONSENT_PURPOSES = [
  {
    purpose: "camera.transform.live",
    label: "Transform my live camera stream",
    description:
      "During a live session your camera frames are sent to a platform worker to be transformed (e.g. color grade) and returned to you. Frames are processed in memory; nothing is stored unless you save a recording yourself.",
    scope: { processing: "live-transform", storage: "none" },
  },
  {
    purpose: "face.transform.offline",
    label: "Use my uploaded face image for character transforms",
    description:
      "A face image you upload can be used as the reference for this character's transformations. Withdraw consent and the asset can no longer be selected for processing.",
    scope: { processing: "character-face", storage: "asset" },
  },
] as const;

const grantSchema = z.object({
  purpose: z.enum(["camera.transform.live", "face.transform.offline"]),
  assetId: z.string().uuid().optional(),
  scope: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const url = new URL(request.url);
  const purpose = url.searchParams.get("purpose");

  const rows = await getDb()
    .select()
    .from(consentRecords)
    .where(
      purpose
        ? and(
            eq(consentRecords.userId, user.id),
            eq(consentRecords.purpose, purpose),
          )
        : eq(consentRecords.userId, user.id),
    )
    .orderBy(desc(consentRecords.grantedAt));

  return jsonResponse({ consents: rows, purposes: CONSENT_PURPOSES });
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const parsed = grantSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Unknown consent purpose.");
  }
  const { purpose, assetId, scope } = parsed.data;

  // Asset-scoped purposes require the asset to exist and belong to the user.
  if (assetId) {
    const [asset] = await getDb()
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, user.id)))
      .limit(1);
    if (!asset) return apiError(404, "not_found", "Asset not found.");
  }

  const purposeDefinition = CONSENT_PURPOSES.find((p) => p.purpose === purpose)!;

  const [granted] = await getDb()
    .insert(consentRecords)
    .values({
      userId: user.id,
      assetId: assetId ?? null,
      purpose,
      scope: {
        ...purposeDefinition.scope,
        ...(scope ?? {}),
      },
      policyVersion: CONSENT_POLICY_VERSION,
      status: "GRANTED",
    })
    .returning();

  await recordAudit(getDb(), {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: "consent.grant",
    targetType: assetId ? "asset" : "consent",
    targetId: granted.id,
    outcome: "SUCCESS",
    metadata: { purpose, assetId: assetId ?? null, policyVersion: CONSENT_POLICY_VERSION },
  });

  return jsonResponse({ consent: granted }, { status: 201 });
}

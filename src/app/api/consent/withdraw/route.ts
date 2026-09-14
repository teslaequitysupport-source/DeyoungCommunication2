/**
 * Consent withdrawal — spec §16: "Users must be able to withdraw
 * authorization where applicable." Revoking the active consent for a
 * purpose blocks new live sessions on that purpose immediately.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { consentRecords } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { z } from "zod";

const withdrawSchema = z.object({
  consentId: z.string().uuid().optional(),
  purpose: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const parsed = withdrawSchema.safeParse(await readJson(request));
  if (!parsed.success || (!parsed.data.consentId && !parsed.data.purpose)) {
    return apiError(400, "invalid_input", "consentId or purpose is required.");
  }

  const [target] = parsed.data.consentId
    ? await getDb()
        .select()
        .from(consentRecords)
        .where(
          and(
            eq(consentRecords.id, parsed.data.consentId),
            eq(consentRecords.userId, user.id),
          ),
        )
        .limit(1)
    : await getDb()
        .select()
        .from(consentRecords)
        .where(
          and(
            eq(consentRecords.userId, user.id),
            eq(consentRecords.purpose, parsed.data.purpose!),
            eq(consentRecords.status, "GRANTED"),
          ),
        )
        .orderBy(desc(consentRecords.grantedAt))
        .limit(1);

  if (!target || target.userId !== user.id) {
    return apiError(404, "not_found", "Consent record not found.");
  }

  const [updated] = await getDb()
    .update(consentRecords)
    .set({ status: "WITHDRAWN", withdrawnAt: new Date(), updatedAt: new Date() })
    .where(eq(consentRecords.id, target.id))
    .returning();

  await recordAudit(getDb(), {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: "consent.withdraw",
    targetType: "consent",
    targetId: target.id,
    outcome: "SUCCESS",
    metadata: { purpose: target.purpose },
  });

  return jsonResponse({ consent: updated });
}

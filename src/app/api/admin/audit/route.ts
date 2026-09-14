/**
 * Admin audit-log view (spec §26) — `audit:read`. The audit trail is
 * append-only; this surface is strictly read-only with paging.
 */

import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import {
  apiError,
  getApiUser,
  jsonResponse,
  requireUser,
  requireMfa,
} from "@/lib/api-helpers";
import { assertPermission } from "@/lib/rbac";
import { z } from "zod";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  // MFA gate: elevated roles must hold a verified TOTP enrollment
  // before touching moderation or admin surfaces (spec §26/§28).
  const mfaDenied = requireMfa(user);
  if (mfaDenied) return mfaDenied;
  try {
    assertPermission(user.role, "audit:read");
  } catch {
    return apiError(403, "forbidden", "audit:read permission required.");
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
  });
  const limit = parsed.success ? (parsed.data.limit ?? 50) : 50;

  const rows = await getDb()
    .select({
      id: auditLog.id,
      actorEmail: auditLog.actorEmail,
      actorRole: auditLog.actorRole,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      outcome: auditLog.outcome,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return jsonResponse({ entries: rows });
}

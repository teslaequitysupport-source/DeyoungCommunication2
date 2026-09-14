/**
 * Moderator queue view (spec §26/§33) — `moderation:queue:view`.
 * MODERATOR, ADMIN, SUPER_ADMIN hold this permission (rbac.ts).
 */

import { getDb } from "@/lib/db";
import { listReports } from "@/lib/moderation";
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
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]).optional(),
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
    assertPermission(user.role, "moderation:queue:view");
  } catch {
    return apiError(403, "forbidden", "moderation:queue:view permission required.");
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Invalid query parameters.");
  }

  const rows = await listReports(getDb(), parsed.data);
  return jsonResponse({ reports: rows });
}

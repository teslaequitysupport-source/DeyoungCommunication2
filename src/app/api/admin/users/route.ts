/**
 * Admin user list/search (spec §26 USERS) — SUPPORT can view (support:users:view),
 * ADMIN+ can manage. Returns safe fields only.
 */

import { getDb } from "@/lib/db";
import { listUsers, USER_STATUSES } from "@/lib/admin-users";
import {
  apiError,
  getApiUser,
  jsonResponse,
  requireUser,
  requireMfa,
} from "@/lib/api-helpers";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(USER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  // MFA gate: elevated roles must hold a verified TOTP enrollment
  // before touching moderation or admin surfaces (spec §26/§28).
  const mfaDenied = requireMfa(user);
  if (mfaDenied) return mfaDenied;
  const canView =
    hasPermission(user.role, "support:users:view") ||
    hasPermission(user.role, "users:manage");
  if (!canView) {
    return apiError(403, "forbidden", "support:users:view or users:manage permission required.");
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(400, "invalid_input", "Invalid query parameters.");
  }

  const result = await listUsers(getDb(), parsed.data);
  return jsonResponse(result);
}

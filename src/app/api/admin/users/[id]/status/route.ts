/**
 * Admin user status change (spec §26 USERS: suspend / ban / unban / restore).
 * `users:manage` required; un-banning a BANNED account requires SUPER_ADMIN.
 */

import { getDb } from "@/lib/db";
import { AdminUserError, setUserStatus, USER_STATUSES } from "@/lib/admin-users";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
  requireMfa,
} from "@/lib/api-helpers";
import { assertPermission } from "@/lib/rbac";
import { z } from "zod";

const bodySchema = z.object({
  status: z.enum(USER_STATUSES),
  reason: z.string().trim().max(4_000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  // MFA gate: elevated roles must hold a verified TOTP enrollment
  // before touching moderation or admin surfaces (spec §26/§28).
  const mfaDenied = requireMfa(user);
  if (mfaDenied) return mfaDenied;
  try {
    assertPermission(user.role, "users:manage");
  } catch {
    return apiError(403, "forbidden", "users:manage permission required.");
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "status is required.");
  }

  try {
    const updated = await setUserStatus(getDb(), {
      targetUserId: id,
      newStatus: parsed.data.status,
      actor: user,
      reason: parsed.data.reason ?? null,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return jsonResponse({ user: updated });
  } catch (error) {
    if (error instanceof AdminUserError) {
      const status =
        error.code === "user_not_found" ? 404
        : error.code === "transition_not_allowed" ? 409
        : 400;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}

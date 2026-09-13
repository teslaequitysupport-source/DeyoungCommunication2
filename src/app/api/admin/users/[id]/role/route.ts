/**
 * Admin role management (spec §26/§27) — `roles:assign` (SUPER_ADMIN only),
 * never on the acting admin's own account.
 */

import { getDb } from "@/lib/db";
import { AdminUserError, parseUserRole, setUserRole } from "@/lib/admin-users";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { assertPermission } from "@/lib/rbac";
import { z } from "zod";

const bodySchema = z.object({
  role: z.enum(["USER", "MODERATOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");
  try {
    assertPermission(user.role, "roles:assign");
  } catch {
    return apiError(403, "forbidden", "roles:assign permission required.");
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  const newRole = parseUserRole(parsed.success ? parsed.data.role : null);
  if (!newRole) {
    return apiError(400, "invalid_input", "A valid role is required.");
  }

  try {
    const updated = await setUserRole(getDb(), {
      targetUserId: id,
      newRole,
      actor: user,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return jsonResponse({ user: updated });
  } catch (error) {
    if (error instanceof AdminUserError) {
      const status =
        error.code === "user_not_found" ? 404
        : error.code === "self_role_change" ? 400
        : 400;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}

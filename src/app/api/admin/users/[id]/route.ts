/**
 * Admin user inspector (spec §26 USERS: "inspect account state",
 * "inspect sessions", "view usage") — safe fields only.
 */

import { getDb } from "@/lib/db";
import { inspectUser } from "@/lib/admin-users";
import {
  apiError,
  getApiUser,
  jsonResponse,
  requireUser,
} from "@/lib/api-helpers";
import { hasPermission } from "@/lib/rbac";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");
  const canView =
    hasPermission(user.role, "support:users:view") ||
    hasPermission(user.role, "users:manage");
  if (!canView) {
    return apiError(403, "forbidden", "support:users:view or users:manage permission required.");
  }

  const { id } = await params;
  const result = await inspectUser(getDb(), id);
  if (!result) return apiError(404, "not_found", "User not found.");
  return jsonResponse(result);
}

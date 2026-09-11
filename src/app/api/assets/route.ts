/**
 * Asset list + serving.
 *
 * GET /api/assets            — my assets (metadata).
 * GET /api/assets?full=1     — include a fresh upload ticket? No: uploads
 *                               always start at /api/assets/presign.
 * Ownership is enforced on every row; worker access to inputs happens via
 * the worker file route (see [id]/file).
 */

import { getDb } from "@/lib/db";
import { listUserAssets } from "@/lib/assets";
import { storageModeLabel } from "@/lib/storage";
import { apiError, getApiUser, jsonResponse, requireUser } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const rows = await listUserAssets(getDb(), user.id);
  return jsonResponse({ assets: rows, storage: storageModeLabel() });
}

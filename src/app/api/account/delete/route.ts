/**
 * Account deletion (spec §35 "Implement account deletion") — real, final,
 * hard deletion. The flow is deliberately explicit:
 *
 *   1. signed-in session + ACTIVE account,
 *   2. password re-verification through Better Auth's verifyPassword
 *      (session-scoped, server-only endpoint),
 *   3. typed confirmation phrase, so an accidental click cannot destroy
 *      an account,
 *   4. elevated roles (MODERATOR and up) cannot self-delete — staff
 *      accounts are governed through the audited admin user-management
 *      path instead.
 *
 * The engine is deleteUserAccount (src/lib/privacy/account.ts): storage
 * objects are deleted, the user row cascades away, accountability rows
 * (reports, audit) survive de-linked, and one final audit row proves the
 * deletion happened.
 */

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deleteUserAccount } from "@/lib/privacy/account";
import { checkRateLimit } from "@/lib/rate-limits";
import { getStorage } from "@/lib/storage";
import { recordAudit } from "@/lib/audit";
import {
  apiError,
  getApiUser,
  jsonResponse,
  rateLimited,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { z } from "zod";

const DELETE_CONFIRMATION_PHRASE = "DELETE";

const bodySchema = z.object({
  password: z.string().min(1),
  confirmation: z.string(),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const rate = await checkRateLimit(getDb(), "accountDelete", user.id);
  if (!rate.allowed) return rateLimited(rate.retryAfterSeconds, rate.limit);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "password and confirmation are required.");
  }
  if (parsed.data.confirmation !== DELETE_CONFIRMATION_PHRASE) {
    return apiError(
      400,
      "confirmation_mismatch",
      `Type ${DELETE_CONFIRMATION_PHRASE} to confirm account deletion.`,
    );
  }

  // Staff accounts are governed, not self-served.
  if (user.role !== "USER") {
    return apiError(
      403,
      "staff_account",
      "Staff accounts cannot be self-deleted. Contact platform administration.",
    );
  }

  // Password re-verification — the server-scoped Better Auth endpoint.
  try {
    const verified = await auth.api.verifyPassword({
      body: { password: parsed.data.password },
      headers: request.headers,
    });
    if (!verified?.status) {
      await recordAudit(getDb(), {
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "account.delete",
        targetType: "user",
        targetId: user.id,
        outcome: "DENIED",
        metadata: { reason: "wrong_password" },
      });
      return apiError(403, "wrong_password", "Password verification failed.");
    }
  } catch {
    return apiError(403, "wrong_password", "Password verification failed.");
  }

  const result = await deleteUserAccount(getDb(), getStorage(), user.id);

  // The session rows are gone with the cascade — the cookie is dead even
  // though the browser still holds it.
  return jsonResponse({
    deleted: true,
    deletedObjects: result.deletedObjects,
    failedObjects: result.failedObjects,
    message: "Your account and content have been deleted.",
  });
}

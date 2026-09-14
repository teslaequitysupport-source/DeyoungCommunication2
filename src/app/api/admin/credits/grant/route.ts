/**
 * Admin credit grants (spec §41 — manual credits are the approved billing
 * mechanism for this phase). ADMIN+ with verified MFA, audited, and
 * exactly-once per idempotency key. Negative adjustments are intentionally
 * NOT offered through this route: corrections flow through support with a
 * documented decision, and refunds of job spends are automatic.
 */

import { getDb } from "@/lib/db";
import { grantCredits } from "@/lib/credits";
import { checkRateLimit } from "@/lib/rate-limits";
import { recordAudit } from "@/lib/audit";
import {
  apiError,
  getApiUser,
  jsonResponse,
  rateLimited,
  readJson,
  requireMfa,
  requireUser,
} from "@/lib/api-helpers";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";

const grantSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().min(3).max(500),
  /** Client-generated (one per form submission) so a double-click cannot
   *  double-grant: the same key replays the first result. */
  idempotencyKey: z.string().min(8).max(120),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");
  if (!hasPermission(user.role, "credits:grant")) {
    return apiError(403, "forbidden", "Admin access required.");
  }
  const mfa = requireMfa(user);
  if (mfa) return mfa;

  const rate = await checkRateLimit(getDb(), "jobs", `grant:${user.id}`);
  if (!rate.allowed) return rateLimited(rate.retryAfterSeconds, rate.limit);

  const parsed = grantSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_input",
      "userId, positive amount, a reason (3-500 chars), and an idempotencyKey are required.",
    );
  }
  const { userId, amount, reason, idempotencyKey } = parsed.data;

  const grant = await grantCredits(getDb(), {
    userId,
    amount,
    kind: "ADMIN_GRANT",
    reason,
    grantedById: user.id,
    idempotencyKey: `admin-grant:${idempotencyKey}`,
  });

  await recordAudit(getDb(), {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: "credits.grant",
    targetType: "user",
    targetId: userId,
    outcome: "SUCCESS",
    metadata: {
      amount,
      reason,
      balanceAfter: grant.balanceAfter,
      replayed: !grant.applied,
    },
  });

  return jsonResponse(
    { granted: true, amount, balanceAfter: grant.balanceAfter },
    { status: 201 },
  );
}

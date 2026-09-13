/**
 * Account export (spec §35 "export method"; NDPA subject-access right).
 *
 * GET → one JSON document with every record the platform holds about the
 * signed-in account. Rate-limited (heavy query), audited, secrets excluded.
 */

import { getDb } from "@/lib/db";
import { exportUserData } from "@/lib/privacy/account";
import { checkRateLimit } from "@/lib/rate-limits";
import {
  apiError,
  getApiUser,
  rateLimited,
  requireUser,
} from "@/lib/api-helpers";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const rate = await checkRateLimit(getDb(), "export", user.id);
  if (!rate.allowed) return rateLimited(rate.retryAfterSeconds, rate.limit);

  const data = await exportUserData(getDb(), user.id);
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="my-data-export.json"',
    },
  });
}

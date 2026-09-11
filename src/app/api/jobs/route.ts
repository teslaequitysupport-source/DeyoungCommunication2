/**
 * Jobs API — the user's own job records (spec §13: "Every asynchronous
 * task must have a job record"). Read-only for users; workers use the
 * /api/worker surface.
 */

import { getDb } from "@/lib/db";
import { listJobsForUser } from "@/lib/jobs/queue";
import { apiError, getApiUser, jsonResponse, requireUser } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const jobs = await listJobsForUser(getDb(), user.id, 50);
  return jsonResponse({ jobs });
}

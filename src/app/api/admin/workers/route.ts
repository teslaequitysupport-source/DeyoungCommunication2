/**
 * Admin workers view (spec §26 WORKERS) — `workers:view`. Read-only list of
 * the registry with health/latency; control actions (drain/shutdown) already
 * exist on POST /api/worker/control with workers:manage.
 */

import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { workers } from "@/lib/db/schema";
import {
  apiError,
  getApiUser,
  jsonResponse,
  requireUser,
  requireMfa,
} from "@/lib/api-helpers";
import { assertPermission } from "@/lib/rbac";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  // MFA gate: elevated roles must hold a verified TOTP enrollment
  // before touching moderation or admin surfaces (spec §26/§28).
  const mfaDenied = requireMfa(user);
  if (mfaDenied) return mfaDenied;
  try {
    assertPermission(user.role, "workers:view");
  } catch {
    return apiError(403, "forbidden", "workers:view permission required.");
  }

  const rows = await getDb()
    .select({
      id: workers.id,
      name: workers.name,
      provider: workers.provider,
      status: workers.status,
      capabilities: workers.capabilities,
      models: workers.models,
      region: workers.region,
      gpuType: workers.gpuType,
      vramMb: workers.vramMb,
      version: workers.version,
      lastHeartbeatAt: workers.lastHeartbeatAt,
      heartbeatLatencyMs: workers.heartbeatLatencyMs,
      activeJobs: workers.activeJobs,
      errorCount: workers.errorCount,
      idleSinceAt: workers.idleSinceAt,
      wakeRequestedAt: workers.wakeRequestedAt,
      createdAt: workers.createdAt,
    })
    .from(workers)
    .orderBy(desc(workers.createdAt));

  return jsonResponse({ workers: rows });
}

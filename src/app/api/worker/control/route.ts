/**
 * Worker SHUTDOWN + DRAIN surface. Admin-only via session (P3 admin
 * console uses the same lib); workers may shut THEMSELVES down.
 */

import { getDb } from "@/lib/db";
import { authenticateWorker, drainWorker, shutdownWorker } from "@/lib/workers/registry";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
  requireMfa,
  workerAuthFrom,
} from "@/lib/api-helpers";
import { assertPermission } from "@/lib/rbac";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["drain", "shutdown"]),
  workerId: z.string().uuid().optional(), // admin path only
});

export async function POST(request: Request) {
  const { name, credential } = workerAuthFrom(request);

  // Worker self-service (drain/shutdown itself).
  if (name && credential) {
    const auth = await authenticateWorker(getDb(), name, credential);
    if (auth.ok) {
      const parsed = bodySchema.safeParse(await readJson(request));
      if (!parsed.success) {
        return apiError(400, "invalid_input", "action is required.");
      }
      if (parsed.data.action === "drain") {
        await drainWorker(getDb(), auth.worker.id);
      } else {
        await shutdownWorker(getDb(), auth.worker.id);
      }
      return jsonResponse({ ok: true });
    }
  }

  // Administrator path (workers:manage permission required).
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");
  const mfaDenied = requireMfa(user);
  if (mfaDenied) return mfaDenied;
  try {
    assertPermission(user.role, "workers:manage");
  } catch {
    return apiError(403, "forbidden", "workers:manage permission required.");
  }

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success || !parsed.data.workerId) {
    return apiError(400, "invalid_input", "workerId is required.");
  }
  if (parsed.data.action === "drain") {
    await drainWorker(getDb(), parsed.data.workerId);
  } else {
    await shutdownWorker(getDb(), parsed.data.workerId);
  }
  return jsonResponse({ ok: true });
}

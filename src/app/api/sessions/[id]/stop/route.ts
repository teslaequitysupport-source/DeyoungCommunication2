/**
 * Stop a live session (user-initiated). The state machine decides between
 * CANCELLED (no worker ever claimed) and STOPPING (worker finalizes).
 */

import { getDb } from "@/lib/db";
import { stopLiveSession } from "@/lib/sessions/state-machine";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
} from "@/lib/api-helpers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const { id } = await params;
  void readJson(request); // no body expected; drain safely

  const session = await stopLiveSession(getDb(), { sessionId: id, userId: user.id });
  if (!session) return apiError(404, "not_found", "Session not found.");
  return jsonResponse({ session });
}

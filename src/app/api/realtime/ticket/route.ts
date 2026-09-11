/**
 * Realtime ticket for the session owner's browser — authorizes one
 * publisher connection to the media relay for a live session the user
 * owns. Short-lived (5 min), single-room scope.
 */

import { getDb } from "@/lib/db";
import { getSession } from "@/lib/sessions/state-machine";
import { mintRealtimeTicket } from "@/lib/realtime/tickets";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { z } from "zod";

const ticketSchema = z.object({ sessionId: z.string().uuid() });

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const parsed = ticketSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "sessionId is required.");
  }

  const session = await getSession(getDb(), parsed.data.sessionId);
  if (!session || session.userId !== user.id) {
    return apiError(404, "not_found", "Session not found.");
  }

  const ticket = mintRealtimeTicket({
    sid: session.id,
    role: "publisher",
    uid: user.id,
    ttlSeconds: 300,
  });
  return jsonResponse({ ticket, transport: "socketio-relay" });
}

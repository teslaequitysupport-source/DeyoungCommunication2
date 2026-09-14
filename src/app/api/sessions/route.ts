/**
 * Live sessions API — create + list (spec §11-12). All state transitions
 * stay server-side; the client only ever observes.
 */

import { getDb } from "@/lib/db";
import { createLiveSession, listUserSessions } from "@/lib/sessions/state-machine";
import { latestJobForSession } from "@/lib/jobs/queue";
import { checkRateLimit } from "@/lib/rate-limits";
import {
  apiError,
  getApiUser,
  jsonResponse,
  rateLimited,
  readJson,
  requireUser,
} from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({ characterId: z.string().uuid() });

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const sessions = await listUserSessions(getDb(), user.id, 20);
  const withJobs = await Promise.all(
    sessions.map(async (s) => ({
      ...s,
      job: await latestJobForSession(getDb(), s.id),
    })),
  );
  return jsonResponse({ sessions: withJobs });
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const rate = await checkRateLimit(getDb(), "sessions", user.id);
  if (!rate.allowed) return rateLimited(rate.retryAfterSeconds, rate.limit);

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "characterId is required.");
  }

  const result = await createLiveSession(getDb(), {
    userId: user.id,
    characterId: parsed.data.characterId,
  });
  if (!result.ok) {
    const status =
      result.code === "character_not_found"
        ? 404
        : result.code === "character_not_active"
          ? 409
          : 403;
    return apiError(status, result.code, humanize(result.code));
  }
  return jsonResponse({ session: result.session }, { status: 201 });
}

function humanize(code: string): string {
  switch (code) {
    case "character_not_found":
      return "Character not found.";
    case "character_not_active":
      return "This character is not active.";
    case "consent_required":
      return "Grant camera-transform consent before starting a live session.";
    default:
      return code;
  }
}

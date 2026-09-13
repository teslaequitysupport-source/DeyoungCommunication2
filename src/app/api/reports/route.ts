/**
 * Abuse-report intake (spec §33). Any active user can report a polymorphic
 * target; validation and target resolution live in the moderation service
 * (src/lib/moderation.ts) so the same rules apply to any future intake path.
 */

import { getDb } from "@/lib/db";
import {
  createReport,
  ModerationError,
  MAX_DETAILS_LENGTH,
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
} from "@/lib/moderation";
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

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1).max(64),
  details: z.string().trim().max(MAX_DETAILS_LENGTH).optional(),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  // Rate limit FIRST: counting happens even for invalid payloads, so abusers
  // cannot probe the boundary with cheap invalid requests.
  const rate = await checkRateLimit(getDb(), "reports", user.id);
  if (!rate.allowed) return rateLimited(rate.retryAfterSeconds, rate.limit);

  const parsed = reportSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "reason, targetType and targetId are required.");
  }

  try {
    const { id } = await createReport(getDb(), {
      reporterId: user.id,
      reason: parsed.data.reason,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      details: parsed.data.details ?? null,
    });
    return jsonResponse({ report: { id } }, { status: 201 });
  } catch (error) {
    if (error instanceof ModerationError) {
      const status = error.code === "target_not_found" ? 404 : 400;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}

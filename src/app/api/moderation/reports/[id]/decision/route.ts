/**
 * Moderator decision endpoint (spec §33) — `moderation:act`.
 * RESOLVE optionally attaches an enforcement action (warn / suspend / ban /
 * content removal); enforcement shares `applyModerationAction` with admin
 * user management. DISMISS documents why no action was taken.
 */

import { getDb } from "@/lib/db";
import {
  decideReport,
  ModerationError,
  MAX_DECISION_NOTES_LENGTH,
  MODERATION_ACTIONS,
} from "@/lib/moderation";
import {
  apiError,
  getApiUser,
  jsonResponse,
  readJson,
  requireUser,
  requireMfa,
} from "@/lib/api-helpers";
import { assertPermission } from "@/lib/rbac";
import { z } from "zod";

const decisionSchema = z.object({
  outcome: z.enum(["RESOLVED", "DISMISSED"]),
  action: z.enum(MODERATION_ACTIONS).optional().default("NONE"),
  notes: z.string().trim().max(MAX_DECISION_NOTES_LENGTH),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  // MFA gate: elevated roles must hold a verified TOTP enrollment
  // before touching moderation or admin surfaces (spec §26/§28).
  const mfaDenied = requireMfa(user);
  if (mfaDenied) return mfaDenied;
  try {
    assertPermission(user.role, "moderation:act");
  } catch {
    return apiError(403, "forbidden", "moderation:act permission required.");
  }

  const { id } = await params;
  const parsed = decisionSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "outcome and notes are required.");
  }

  try {
    await decideReport(getDb(), {
      reportId: id,
      decidedBy: user,
      outcome: parsed.data.outcome,
      action: parsed.data.action,
      notes: parsed.data.notes,
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof ModerationError) {
      const status =
        error.code === "report_not_found" ? 404
        : error.code === "already_decided" ? 409
        : 400;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}

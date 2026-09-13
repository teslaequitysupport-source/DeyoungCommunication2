/**
 * Support contact intake (support page). Pre-auth by design: a user
 * having trouble signing in must still be able to reach support.
 *
 * - Validation: zod, same shape the client form runs.
 * - Rate limit: 5/hour keyed by IP (pre-auth surface), counted before
 *   validation so the boundary cannot be probed with cheap payloads.
 * - Storage: support_tickets (migration 0007); status starts OPEN.
 */

import { getDb } from "@/lib/db";
import { supportTickets } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limits";
import {
  apiError,
  jsonResponse,
  rateLimited,
  readJson,
} from "@/lib/api-helpers";
import { z } from "zod";

const SUPPORT_TOPICS = [
  "ACCOUNT",
  "BILLING_CREDITS",
  "STUDIO_RENDERS",
  "CONSENT_PRIVACY",
  "REPORT_PROBLEM",
  "OTHER",
] as const;

export const supportSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  topic: z.enum(SUPPORT_TOPICS),
  message: z.string().trim().min(20).max(4000),
  /** Honeypot — must stay empty; bots fill it, humans never see it. */
  website: z.literal("").optional(),
});

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown")
    .slice(0, 64);
}

export async function POST(request: Request) {
  const rate = await checkRateLimit(getDb(), "support", clientIp(request));
  if (!rate.allowed) {
    return rateLimited(rate.retryAfterSeconds, rate.limit);
  }

  const parsed = supportSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_input",
      "Name, a valid email, a topic and a message of at least 20 characters are required."
    );
  }

  const { name, email, topic, message } = parsed.data;

  const [ticket] = await getDb()
    .insert(supportTickets)
    .values({ name, email, topic, message })
    .returning({ id: supportTickets.id });

  // A short, human-quotable reference — not a secret.
  const reference = `DY-${ticket.id.slice(0, 8).toUpperCase()}`;
  return jsonResponse({ ok: true, reference }, { status: 201 });
}

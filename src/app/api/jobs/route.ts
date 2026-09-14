/**
 * Jobs API — the user's own job records (spec §13). GET lists; POST
 * enqueues a batch image-transform job on an owned asset (the honest
 * no-camera path through the same real worker pipeline).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, characters } from "@/lib/db/schema";
import {
  listJobsForUser,
  enqueueJob,
  getJob,
  rejectJob,
} from "@/lib/jobs/queue";
import { routeJobAfterEnqueue } from "@/lib/workers/selection";
import { checkRateLimit } from "@/lib/rate-limits";
import { jobCreditCost, spendCreditsForJob } from "@/lib/credits";
import { apiError, getApiUser, jsonResponse, rateLimited, readJson, requireUser } from "@/lib/api-helpers";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const jobs = await listJobsForUser(getDb(), user.id, 50);
  return jsonResponse({ jobs });
}

const createSchema = z.object({
  assetId: z.string().uuid(),
  characterId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const rate = await checkRateLimit(getDb(), "jobs", user.id);
  if (!rate.allowed) return rateLimited(rate.retryAfterSeconds, rate.limit);

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError(400, "invalid_input", "assetId is required.");
  }
  const { assetId, characterId } = parsed.data;

  const [asset] = await getDb()
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, user.id)))
    .limit(1);
  if (!asset) return apiError(404, "not_found", "Asset not found.");
  if (asset.kind !== "FACE_IMAGE" && asset.kind !== "OTHER") {
    return apiError(400, "invalid_input", "Only image assets can be transformed in this phase.");
  }

  let appearance: Record<string, unknown> = {};
  if (characterId) {
    const [character] = await getDb()
      .select()
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.userId, user.id)))
      .limit(1);
    if (!character) return apiError(404, "not_found", "Character not found.");
    appearance = character.appearanceConfig ?? {};
  }

  const job = await enqueueJob(getDb(), {
    userId: user.id,
    type: "transform.image.colorgrade",
    idempotencyKey: `batch:${asset.id}:${randomUUID()}`,
    inputRefs: {
      inputAsset: `asset:${asset.id}`,
      appearance,
    },
  });

  // Credits gate (spec §41): charge before any worker can claim. The spend
  // is exactly-once per job id; a refusal fails the job terminally without
  // charging anything, and failures/cancellations later refund the spend.
  const cost = jobCreditCost(job.type);
  const spend = await spendCreditsForJob(getDb(), {
    userId: user.id,
    jobId: job.id,
    cost,
  });
  if (!spend.ok) {
    await rejectJob(getDb(), {
      jobId: job.id,
      failureInfo: {
        reason: "insufficient_credits",
        cost,
        balance: spend.balance,
      },
    });
    return jsonResponse(
      {
        error: "insufficient_credits",
        message: `This job costs ${cost} credits; your balance is ${spend.balance}.`,
        cost,
        balance: spend.balance,
      },
      { status: 402 },
    );
  }

  // Worker selection (spec §8): state plainly whether this job has awake
  // capacity, triggered a cold start, or is waiting on nothing at all.
  const routing = await routeJobAfterEnqueue(getDb(), job);
  const fresh = await getJob(getDb(), job.id);
  return jsonResponse(
    { job: fresh, routing, credits: { cost, balanceAfter: spend.balanceAfter } },
    { status: 201 },
  );
}

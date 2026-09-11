/**
 * Recovery reassignment (spec §7 step 6 — "Reassign when possible").
 *
 * Every path that requeues a job (worker death, expired reservation,
 * worker-reported failure) immediately re-routes it through worker
 * selection: if no awake worker can serve it but a sleeping capable one
 * exists, the wake is requested right then, so recovery completes the §45
 * cold-start loop instead of leaving the job to a pull-claim that a
 * sleeping box can never issue.
 *
 * Safety:
 *   - A job that was already re-claimed between its requeue and this call
 *     (QUEUED with no worker is the only reroutable state) is skipped —
 *     nothing is ever double-assigned.
 *   - Wake storms are bounded by the job type's retry budget: an exhausted
 *     job fails terminally in the requeue paths and never reaches here.
 *   - Repeated wake requests are idempotent (timestamp refresh only).
 *   - The failed worker itself is never a candidate: it is UNHEALTHY (or
 *     gone) by the time rerouting runs, and selection excludes it.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { PlatformDatabase } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { routeJobAfterEnqueue, type RoutingOutcome } from "@/lib/workers/selection";

/**
 * Re-route requeued jobs. Returns the routing outcome per job that was
 * still unclaimed (skipped jobs are simply absent). Callers surface these
 * in audit metadata — the recovery decision is part of the incident record.
 */
export async function rerouteRequeuedJobs(
  db: PlatformDatabase,
  jobIds: string[],
  options?: { invokeWake?: (workerId: string) => Promise<void> },
): Promise<RoutingOutcome[]> {
  const outcomes: RoutingOutcome[] = [];
  for (const jobId of jobIds) {
    const [row] = await db
      .select({ id: jobs.id, type: jobs.type })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.status, "QUEUED"),
          isNull(jobs.workerId),
        ),
      )
      .limit(1);
    if (!row) continue; // already re-claimed or terminal — leave it alone
    outcomes.push(
      await routeJobAfterEnqueue(db, { id: row.id, type: row.type }, options),
    );
  }
  return outcomes;
}

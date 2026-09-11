/**
 * Internal scheduler tick — invoked by the control-scheduler daemon (dev)
 * or a scheduled job (deployment) with the SCHEDULER_TOKEN. One call runs:
 * heartbeat monitor → reservation sweeper → session expiry. Pure database
 * pass; all state changes land in the observable tables + audit log.
 */

import { getDb } from "@/lib/db";
import { schedulerTick } from "@/lib/scheduler/tick";
import { apiError, jsonResponse } from "@/lib/api-helpers";

export const maxDuration = 60;

export async function POST(request: Request) {
  const token = request.headers.get("x-scheduler-token");
  const expected = process.env.SCHEDULER_TOKEN;
  if (!expected || token !== expected) {
    return apiError(401, "unauthorized", "Scheduler token missing or invalid.");
  }
  const result = await schedulerTick(getDb());
  return jsonResponse(result);
}

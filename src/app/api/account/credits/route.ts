/**
 * Credits API (spec §41) — the signed-in user's balance and recent ledger.
 * Read-only: grants arrive only through the audited admin path.
 */

import { getDb } from "@/lib/db";
import { creditBalance, creditHistory, jobCreditCost } from "@/lib/credits";
import { JOB_TYPES } from "@/lib/jobs/types";
import {
  apiError,
  getApiUser,
  jsonResponse,
  requireUser,
} from "@/lib/api-helpers";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  const denied = requireUser(user);
  if (denied || !user) return denied ?? apiError(401, "unauthenticated", "Sign in required.");

  const [balance, history] = await Promise.all([
    creditBalance(getDb(), user.id),
    creditHistory(getDb(), user.id, 25),
  ]);

  // The honest price list — costs come from the same registry the gate uses.
  const costs = Object.fromEntries(
    Object.keys(JOB_TYPES).map((type) => [type, jobCreditCost(type)]),
  );

  return jsonResponse({ balance, history, costs });
}

/**
 * control-scheduler — the control plane's housekeeping daemon.
 *
 * A deliberately dumb ticker: it pokes the Next.js internal scheduler
 * endpoint every 2 seconds with the SCHEDULER_TOKEN. ALL scheduling logic
 * lives inside the app (src/lib/scheduler/tick.ts) where it is unit- and
 * integration-tested; this process only guarantees the loop runs.
 *
 * In deployment this becomes a scheduled job (Vercel Cron / Railway
 * worker) hitting the same endpoint — no code change.
 */

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3000";
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN;
const INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS ?? 2_000);

if (!SCHEDULER_TOKEN) {
  console.error("[control-scheduler] SCHEDULER_TOKEN is required — see .env.example");
  process.exit(1);
}

let failures = 0;

async function tick(): Promise<void> {
  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/api/internal/scheduler/tick`, {
      method: "POST",
      headers: { "x-scheduler-token": SCHEDULER_TOKEN },
    });
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    const result = (await res.json()) as {
      unhealthyWorkers: string[];
      requeuedReservations: string[];
      expiredSessions: string[];
    };
    if (
      result.unhealthyWorkers.length ||
      result.requeuedReservations.length ||
      result.expiredSessions.length
    ) {
      console.log(
        `[control-scheduler] ${JSON.stringify(result)}`,
      );
    }
    failures = 0;
  } catch (error) {
    failures++;
    if (failures <= 3 || failures % 25 === 0) {
      console.error(`[control-scheduler] tick failed (${failures}): ${String(error)}`);
    }
  }
}

console.log(
  `[control-scheduler] ticking ${CONTROL_PLANE_URL}/api/internal/scheduler/tick every ${INTERVAL_MS}ms`,
);

void tick();
setInterval(() => void tick(), INTERVAL_MS);

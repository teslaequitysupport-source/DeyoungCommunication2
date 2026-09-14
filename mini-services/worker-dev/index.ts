/**
 * worker-dev — the development compute plane worker.
 *
 * A REAL worker speaking the REAL worker protocol against the control
 * plane (REGISTER / HEARTBEAT / CLAIM / STATUS / RESULT / ERROR). It
 * executes honest, verifiable transforms with sharp (a deterministic color
 * grade — labeled exactly that, never "AI"), processes live frames through
 * the media relay, and uploads its outputs via the worker-authenticated
 * route. It makes no claim about GPU capabilities it does not have: its
 * REGISTERed provider is DEVELOPMENT_LOCAL with a CPU.
 *
 * Dependencies resolve from the repository root node_modules (sharp,
 * socket.io-client). Configuration comes from environment variables
 * (see the .env next to this file):
 *   CONTROL_PLANE_URL  http://127.0.0.1:3000
 *   MEDIA_RELAY_URL    http://127.0.0.1:3031
 *   WORKER_NAME        dev-worker-1
 *   WORKER_CREDENTIAL  (matches the provisioned registry row)
 */

import { WorkerRunner } from "../../src/lib/worker-core/runner";
import { ControlPlaneClient } from "../../src/lib/worker-core/client";
import { h3ConfigFromEnv } from "../../src/lib/h3/client";

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3000";
const MEDIA_RELAY_URL = process.env.MEDIA_RELAY_URL ?? "http://127.0.0.1:3031";
const WORKER_NAME = process.env.WORKER_NAME ?? "dev-worker-1";
const WORKER_CREDENTIAL = process.env.WORKER_CREDENTIAL;

if (!WORKER_CREDENTIAL) {
  console.error(
    "[worker-dev] WORKER_CREDENTIAL is required. Provision this worker first (see WORKER-PROTOCOL.md).",
  );
  process.exit(1);
}

const client = new ControlPlaneClient(
  CONTROL_PLANE_URL,
  WORKER_NAME,
  WORKER_CREDENTIAL,
);

// Spec §9 external-credential gate: the video.h3 capability is announced
// ONLY when the worker's own environment carries a complete official-API
// config. No credentials → no capability → H3 jobs wait honestly.
const h3 = h3ConfigFromEnv(process.env);
console.log(
  h3
    ? `[worker-dev] H3 official API enabled (model ${h3.model}) — video.h3 capability announced`
    : "[worker-dev] H3 not configured (H3_API_BASE_URL + H3_API_KEY unset) — video.generate.h3 jobs will wait for a capable worker",
);

const runner = new WorkerRunner({
  controlPlane: client,
  relayUrl: MEDIA_RELAY_URL,
  workerName: WORKER_NAME,
  ...(h3 ? { h3: { config: h3 } } : {}),
});

console.log(
  `[worker-dev] starting: control-plane=${CONTROL_PLANE_URL} relay=${MEDIA_RELAY_URL} name=${WORKER_NAME}`,
);

runner.start().catch((error) => {
  console.error(`[worker-dev] failed to start: ${String(error)}`);
  process.exit(1);
});

const shutdown = (signal: string) => {
  console.log(`[worker-dev] ${signal} received — finalizing live sessions`);
  void runner.shutdown(`signal:${signal}`).then(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

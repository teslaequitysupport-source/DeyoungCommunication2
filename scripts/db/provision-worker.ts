/**
 * Provision a worker identity (administrator action, spec §31).
 *
 *   WORKER_NAME=dev-worker-1 WORKER_CREDENTIAL=<secret> \
 *     bun run scripts/db/provision-worker.ts
 *
 * Creates or rotates the registry row: the credential is stored as a
 * SHA-256 hex digest, never in plaintext. The worker process must present
 * the same credential at REGISTER.
 */

import pg from "pg";
import { createHash } from "node:crypto";

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (raw && (raw.startsWith("postgres://") || raw.startsWith("postgresql://"))) {
    return raw;
  }
  return "postgresql://127.0.0.1:6543/postgres";
}

async function main() {
  const name = process.env.WORKER_NAME;
  const credential = process.env.WORKER_CREDENTIAL;
  const provider = process.env.WORKER_PROVIDER ?? "DEVELOPMENT_LOCAL";

  if (!name || !credential) {
    console.error(
      "[provision-worker] WORKER_NAME and WORKER_CREDENTIAL are required.",
    );
    process.exit(1);
  }
  if (credential.length < 16) {
    console.error("[provision-worker] credential must be at least 16 characters.");
    process.exit(1);
  }

  const hash = createHash("sha256").update(credential, "utf8").digest("hex");
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(), max: 1 });

  const result = await pool.query(
    `INSERT INTO workers (name, provider, credential_hash, status)
     VALUES ($1, $2, $3, 'IDLE')
     ON CONFLICT (name) DO UPDATE
       SET credential_hash = EXCLUDED.credential_hash,
           provider = EXCLUDED.provider,
           status = 'IDLE',
           updated_at = now()
     RETURNING id, name, provider, status`,
    [name, provider, hash],
  );
  const worker = result.rows[0];
  console.log(
    `[provision-worker] ${worker.name} (${worker.id}) provider=${worker.provider} status=${worker.status}`,
  );
  console.log(
    "[provision-worker] credential hash stored; the worker may REGISTER now.",
  );
  await pool.end();
}

main().catch((error) => {
  console.error("[provision-worker] failed:", error);
  process.exit(1);
});

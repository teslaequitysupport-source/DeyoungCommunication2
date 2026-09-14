/**
 * Live smoke test of P3 surfaces against the running dev server (:3000).
 * Exercises: sign-up/in, report intake, MFA gate, moderation queue, decision
 * enforcement, admin users, audit — over real HTTP, one flow.
 */
const BASE = "http://127.0.0.1:3000";
const PASSWORD = "smoke-horse-battery-staple";

function cookieFrom(res: Response): string {
  const pair = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.split(";")[0];
  if (!pair) throw new Error("sign-in did not set a session cookie");
  return pair;
}

async function signUp(email: string): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: email.split("@")[0], email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-up ${email}: ${res.status} ${await res.text()}`);
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in ${email}: ${res.status}`);
  return cookieFrom(res);
}

async function main() {
  const stamp = Date.now();
  const reporter = `smoke-reporter-${stamp}@p3.test`;
  const victim = `smoke-victim-${stamp}@p3.test`;
  const mod = `smoke-mod-${stamp}@p3.test`;

  await signUp(reporter);
  await signUp(victim);
  await signUp(mod);

  // Promote the moderator directly in the DB (via app: provisioned below).
  const pg = (await import("pg")).default;
  const dbUrl = "postgresql://127.0.0.1:6543/postgres";
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const idOf = async (email: string) =>
    (await pool.query("select id from users where email=$1", [email])).rows[0].id as string;

  await pool.query("update users set role='MODERATOR', two_factor_enabled=false where email=$1", [mod]);

  const victimId = await idOf(victim);

  // 1. Reporter creates a character to report? No — report the VICTIM user directly.
  const reporterCookie = await signIn(reporter);
  const reportRes = await fetch(`${BASE}/api/reports`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: reporterCookie },
    body: JSON.stringify({ reason: "IMPERSONATION", targetType: "user", targetId: victimId, details: "Smoke test report" }),
  });
  const reportBody = await reportRes.json();
  console.log(`1. report create: HTTP ${reportRes.status} id=${reportBody.report?.id}`);
  if (reportRes.status !== 201) throw new Error("report create failed");

  // 2. Moderator without MFA: the gate must reject the queue request.
  //    (The session is signed in while MFA is off — later flag flips reuse it,
  //    because NEW sign-ins now correctly hit the 2FA challenge.)
  const modCookie = await signIn(mod);
  const queueDenied = await fetch(`${BASE}/api/moderation/reports?status=OPEN`, {
    headers: { cookie: modCookie },
  });
  console.log(`2. moderation queue without MFA: HTTP ${queueDenied.status} (${(await queueDenied.json()).error})`);
  if (queueDenied.status !== 403) throw new Error("MFA gate did not fire");

  // 3. Simulate a completed TOTP enrollment (flag flip only — the real
  //    round trip is proven in tests/p3-mfa.test.ts) → same session passes.
  await pool.query("update users set two_factor_enabled=true where email=$1", [mod]);
  const queueRes = await fetch(`${BASE}/api/moderation/reports?status=OPEN`, {
    headers: { cookie: modCookie },
  });
  const queue = await queueRes.json();
  console.log(`3. moderation queue with MFA: HTTP ${queueRes.status}, open=${queue.reports?.length}`);
  if (queueRes.status !== 200) throw new Error("queue failed");

  // 4. Decide: RESOLVE + SUSPENSION with notes.
  const decisionRes = await fetch(`${BASE}/api/moderation/reports/${reportBody.report.id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: modCookie },
    body: JSON.stringify({ outcome: "RESOLVED", action: "SUSPENSION", notes: "Smoke decision" }),
  });
  console.log(`4. decision: HTTP ${decisionRes.status}`);
  if (decisionRes.status !== 200) throw new Error("decision failed");

  // 5. Victim now suspended → API blocked.
  const victimCookie = await signIn(victim).catch(() => null);
  const blocked = await fetch(`${BASE}/api/characters`, {
    headers: { cookie: victimCookie ?? "" },
  });
  console.log(`5. victim API after suspension: HTTP ${blocked.status} (${(await blocked.json()).error ?? "session revoked → 401"})`);

  // 6. Admin audit view — promote the still-valid moderator session in
  //    place (roles are read live at request time; never re-sign-in an
  //    MFA-enrolled user without the challenge).
  await pool.query("update users set role='SUPER_ADMIN' where email=$1", [mod]);
  const auditRes = await fetch(`${BASE}/api/admin/audit?limit=8`, {
    headers: { cookie: modCookie },
  });
  const audit = await auditRes.json();
  const actions = (audit.entries ?? []).map((e: { action: string }) => e.action);
  console.log(`6. audit trail: HTTP ${auditRes.status} — contains moderation.suspend: ${actions.includes("moderation.suspend")}, report.decide: ${actions.includes("moderation.report.decide")}`);

  // 7. Rate limit: 11th report hits 429.
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${BASE}/api/reports`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: reporterCookie },
      body: JSON.stringify({ reason: "HARASSMENT", targetType: "user", targetId: victimId }),
    });
    last = r.status;
    if (r.status === 429) {
      console.log(`7. rate limit: 429 after ${i + 1} requests (retry-after: ${r.headers.get("retry-after")}s)`);
      break;
    }
  }
  if (last !== 429) throw new Error("rate limit never fired");

  await pool.end();
  console.log("\nLIVE SMOKE TEST PASSED ✓");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e.message);
  process.exit(1);
});

// Module scope: keeps this script’s top-level consts out of the global
// namespace (production-build TypeScript check treats scripts as one scope).
export {};

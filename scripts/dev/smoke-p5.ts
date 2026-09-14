/**
 * Live smoke test of P5 surfaces against the running dev server (:3000).
 * Exercises over real HTTP, one flow: the nine legal pages, help docs,
 * credit grant at signup, job spend, data export, and account deletion
 * (guards + the real deletion) — the launch-gate checklist end to end.
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

const LEGAL = [
  "/terms",
  "/privacy",
  "/cookies",
  "/refunds",
  "/acceptable-use",
  "/copyright",
  "/accessibility",
  "/voice-rights",
  "/abuse",
];

async function main() {
  const stamp = Date.now();
  const user = `smoke-p5-${stamp}@p5.test`;

  // 1. Legal pages: all 200 with dates + contact block.
  for (const slug of LEGAL) {
    const res = await fetch(`${BASE}${slug}`);
    const html = await res.text();
    const ok =
      res.status === 200 &&
      html.includes("Effective date") &&
      html.includes("Last updated") &&
      html.includes("Operated by");
    if (!ok) throw new Error(`legal page ${slug}: HTTP ${res.status} or missing required block`);
  }
  console.log(`1. legal pages: ${LEGAL.length}/9 render with dates + operator block ✓`);

  // 2. Privacy page carries the real data map; refunds matches manual billing.
  const privacyHtml = await (await fetch(`${BASE}/privacy`)).text();
  if (!privacyHtml.includes("Face / voice / video media")) throw new Error("privacy page missing data-map categories");
  console.log("2. privacy page renders the real data map ✓");

  const refundsHtml = await (await fetch(`${BASE}/refunds`)).text();
  if (!refundsHtml.includes("no automated payments")) throw new Error("refund policy does not state the actual billing system");
  console.log("   refunds policy matches the manual-credits system ✓");

  // 3. Help center + staff-only admin docs redirect for anonymous users.
  const helpRes = await fetch(`${BASE}/help`);
  const helpHtml = await helpRes.text();
  if (helpRes.status !== 200 || !helpHtml.includes("phone-to-phone")) throw new Error("help page incomplete");
  const adminHelp = await fetch(`${BASE}/help/admin`, { redirect: "manual" });
  if (adminHelp.status !== 307 && adminHelp.status !== 302) throw new Error(`anonymous /help/admin should redirect, got ${adminHelp.status}`);
  console.log("3. help center renders; /help/admin is staff-only ✓");

  // 4. Signup → welcome credits.
  await signUp(user);
  const cookie = await signIn(user);
  const creditsRes = await fetch(`${BASE}/api/account/credits`, { headers: { cookie } });
  const credits = await creditsRes.json();
  console.log(`4. signup bonus: HTTP ${creditsRes.status}, balance=${credits.balance}, h3 cost=${credits.costs?.["video.generate.h3"]}`);
  if (creditsRes.status !== 200 || credits.balance !== 100) throw new Error("signup bonus missing");

  // 5. Upload a real JPEG and submit a job → charged 1 credit.
  const sharp = (await import("sharp")).default;
  const jpeg = new Uint8Array(
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#4d7c0f" } })
      .jpeg()
      .toBuffer(),
  );
  const presign = await (
    await fetch(`${BASE}/api/assets/presign`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ kind: "FACE_IMAGE", mimeType: "image/jpeg", sizeBytes: jpeg.byteLength }),
    })
  ).json();
  const uploadRes = await fetch(`${BASE}${presign.uploadUrl}`, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: jpeg as unknown as BodyInit,
  });
  if (uploadRes.status !== 200) throw new Error(`upload failed: ${uploadRes.status}`);
  const { asset } = await uploadRes.json();

  const jobRes = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ assetId: asset.id }),
  });
  const jobBody = await jobRes.json();
  console.log(`5. job submit: HTTP ${jobRes.status}, cost=${jobBody.credits?.cost}, balanceAfter=${jobBody.credits?.balanceAfter}`);
  if (jobRes.status !== 201 || jobBody.credits?.cost !== 1 || jobBody.credits?.balanceAfter !== 99) {
    throw new Error("job spend failed");
  }

  // 6. Export: full JSON document.
  const exportRes = await fetch(`${BASE}/api/account/export`, { headers: { cookie } });
  const exportData = await exportRes.json();
  console.log(`6. data export: HTTP ${exportRes.status}, format=${exportData.format}, assets=${exportData.assets?.length}, ledger=${exportData.creditLedger?.length}`);
  if (exportRes.status !== 200 || exportData.format !== "live-character-platform.export.v1") throw new Error("export failed");

  // 7. Deletion guards: wrong phrase 400, wrong password 403.
  const wrongPhrase = await fetch(`${BASE}/api/account/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ password: PASSWORD, confirmation: "delete" }),
  });
  const wrongPassword = await fetch(`${BASE}/api/account/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ password: "wrong-password", confirmation: "DELETE" }),
  });
  console.log(`7. deletion guards: phrase=${wrongPhrase.status}, password=${wrongPassword.status}`);
  if (wrongPhrase.status !== 400 || wrongPassword.status !== 403) throw new Error("deletion guards failed");

  // 8. Real deletion → session dead.
  const deleteRes = await fetch(`${BASE}/api/account/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ password: PASSWORD, confirmation: "DELETE" }),
  });
  const deleteBody = await deleteRes.json();
  console.log(`8. account deletion: HTTP ${deleteRes.status}, objects=${deleteBody.deletedObjects}`);
  if (deleteRes.status !== 200 || deleteBody.deleted !== true) throw new Error("deletion failed");

  const after = await fetch(`${BASE}/api/characters`, { headers: { cookie } });
  console.log(`   old session after deletion: HTTP ${after.status} (cascade killed it)`);
  if (after.status !== 401) throw new Error("session survived account deletion");

  console.log("\nP5 LIVE SMOKE TEST PASSED ✓");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e.message);
  process.exit(1);
});

// Module scope (see smoke-p3.ts).
export {};

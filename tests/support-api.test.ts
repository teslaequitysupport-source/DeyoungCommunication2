/**
 * Support contact API — validation, honeypot, and rate limit coverage.
 * Follows the p1-harness contract: ready() before app imports,
 * closeStack in afterAll.
 */

import { describe, expect, it, afterAll } from "vitest";
import { ready, closeStack } from "./p1-harness";

await ready();

const supportApi = await import("@/app/api/support/route");
const { resetRateLimits } = await import("@/lib/rate-limits");

const BASE = "http://localhost:3000";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/api/support`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const VALID = {
  name: "Ada Obi",
  email: "ada@example.com",
  topic: "STUDIO_RENDERS",
  message: "My live session drops after about two minutes on mobile data.",
  website: "",
};

afterAll(async () => {
  await closeStack();
});

describe("support contact API", () => {
  it("accepts a valid message and returns a quotable reference", async () => {
    const res = await supportApi.POST(post(VALID));
    expect(res.status).toBe(201);
    const data = (await res.json()) as { ok: boolean; reference: string };
    expect(data.ok).toBe(true);
    expect(data.reference).toMatch(/^DY-[A-Z0-9]{8}$/);
  });

  it("rejects a message that is too short", async () => {
    const res = await supportApi.POST(
      post({ ...VALID, message: "too short" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const res = await supportApi.POST(
      post({ ...VALID, email: "not-an-email" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a filled honeypot (bot trap)", async () => {
    await resetRateLimits(
      (await import("@/lib/db")).getDb(),
    );
    const res = await supportApi.POST(post({ ...VALID, website: "http://spam" }));
    expect(res.status).toBe(400);
  });

  it("rate limits after the 5th message per hour", async () => {
    const db = (await import("@/lib/db")).getDb();
    await resetRateLimits(db);
    for (let i = 0; i < 5; i++) {
      const res = await supportApi.POST(post({ ...VALID, topic: "OTHER" }));
      expect(res.status).toBe(201);
    }
    const sixth = await supportApi.POST(post({ ...VALID, topic: "OTHER" }));
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBeTruthy();
  });
});

/**
 * P5 Legal plane tests (spec §40/§41/§42) — structural invariants of the
 * legal surfaces: the nine required pages exist with the required metadata,
 * the operator block never invents identity, the data map is complete,
 * and the refund policy matches the actual (manual-credits) billing
 * system. Live page rendering is verified against the running server by
 * scripts/dev/smoke-p5.ts.
 */

import { describe, expect, it } from "vitest";
import {
  LEGAL_PAGES,
  operatorInfo,
} from "@/lib/legal/operator";
import { DATA_MAP, DATA_MAP_REQUIRED_FIELDS } from "@/lib/privacy/data-map";
import { jobCreditCost, signupBonusCredits } from "@/lib/credits";
import { JOB_TYPES } from "@/lib/jobs/types";
import { existsSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_PAGES = [
  "/terms",
  "/privacy",
  "/cookies",
  "/refunds",
  "/acceptable-use",
  "/copyright",
  "/accessibility",
  "/voice-rights",
  "/abuse",
] as const;

describe("P5 legal plane — structure and honesty invariants", () => {
  it("defines exactly the nine spec-required legal pages", () => {
    expect(LEGAL_PAGES.length).toBe(9);
    for (const slug of REQUIRED_PAGES) {
      expect(LEGAL_PAGES.find((p) => p.slug === slug)).toBeDefined();
      // The Next.js page module exists on disk.
      const pageFile = join(
        process.cwd(),
        "src/app",
        slug.replace(/^\//, ""),
        "page.tsx",
      );
      expect(existsSync(pageFile), `${pageFile} must exist`).toBe(true);
    }
  });

  it("the privacy data map covers every field for every category", () => {
    expect(DATA_MAP.length).toBeGreaterThanOrEqual(12);
    const ids = new Set(DATA_MAP.map((e) => e.id));
    expect(ids.size).toBe(DATA_MAP.length); // stable ids, no dupes

    for (const entry of DATA_MAP) {
      for (const field of DATA_MAP_REQUIRED_FIELDS) {
        const value = entry[field];
        expect(
          typeof value === "string" && value.trim().length > 0,
          `${entry.id}.${field} must be a non-empty string`,
        ).toBe(true);
      }
    }

    // The sensitive categories the platform fundamentally exists around.
    const categories = DATA_MAP.map((e) => e.id);
    for (const required of [
      "assets.media",
      "consent.records",
      "account.credentials",
      "audit.log",
    ]) {
      expect(categories).toContain(required);
    }
  });

  it("the operator block never invents identity", () => {
    // operatorInfo() reads process.env at call time — with no env set it
    // must show placeholders, not a fabricated company.
    const prev = { ...process.env };
    delete process.env.LEGAL_OPERATOR_NAME;
    delete process.env.LEGAL_CONTACT_EMAIL;
    delete process.env.LEGAL_JURISDICTION;
    try {
      const op = operatorInfo();
      expect(op.configured).toBe(false);
      expect(op.name).toContain("not yet configured");
      expect(op.contactEmail).toContain("not yet configured");
      expect(op.jurisdiction).toContain("not yet configured");
    } finally {
      process.env.LEGAL_OPERATOR_NAME = prev.LEGAL_OPERATOR_NAME;
      process.env.LEGAL_CONTACT_EMAIL = prev.LEGAL_CONTACT_EMAIL;
      process.env.LEGAL_JURISDICTION = prev.LEGAL_JURISDICTION;
    }
  });

  it("every job type has a defined credit cost (never an accidental free ride)", () => {
    for (const type of Object.keys(JOB_TYPES)) {
      expect(() => jobCreditCost(type)).not.toThrow();
      expect(jobCreditCost(type)).toBeGreaterThanOrEqual(0);
    }
    // The two real price points the refund policy describes.
    expect(jobCreditCost("transform.image.colorgrade")).toBeGreaterThan(0);
    expect(jobCreditCost("video.generate.h3")).toBeGreaterThan(
      jobCreditCost("transform.image.colorgrade"),
    );
    // The dev live transform is honestly free.
    expect(jobCreditCost("transform.live.colorgrade")).toBe(0);
  });

  it("the signup bonus default matches the documented free tier", () => {
    expect(signupBonusCredits()).toBe(100);
  });

  it("env overrides change costs (the operator lever, not a code change)", () => {
    process.env.CREDITS_COST_VIDEO_GENERATE_H3 = "25";
    try {
      expect(jobCreditCost("video.generate.h3")).toBe(25);
    } finally {
      delete process.env.CREDITS_COST_VIDEO_GENERATE_H3;
    }
  });
});

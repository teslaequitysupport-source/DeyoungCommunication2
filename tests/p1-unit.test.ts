/**
 * Unit tests — pure P1 logic (no database): job-type registry routing,
 * MIME magic-byte sniffing, ticket round-trips, session transition guards.
 */

import { describe, expect, it } from "vitest";

const { claimableJobTypes, jobTypeDefinition, isJobType } = await import("@/lib/jobs/types");
const { sniffMime, validateUploadDeclaration, declaredMatchesSniffed } = await import(
  "@/lib/storage/kinds"
);
const { SESSION_TRANSITIONS, canTransition } = await import("@/lib/sessions/state-machine");

describe("job type registry", () => {
  it("routes types to their required capabilities", () => {
    expect(claimableJobTypes(["transform.image"])).toEqual(["transform.image.colorgrade"]);
    expect(claimableJobTypes(["transform.live"])).toEqual(["transform.live.colorgrade"]);
    expect(claimableJobTypes(["transform.image", "transform.live"])).toHaveLength(2);
    expect(claimableJobTypes(["face.h3"])).toEqual([]);
    expect(claimableJobTypes([])).toEqual([]);
  });

  it("defines retry budgets per type", () => {
    expect(jobTypeDefinition("transform.image.colorgrade").maxRetries).toBe(3);
    expect(jobTypeDefinition("transform.live.colorgrade").live).toBe(true);
    expect(isJobType("transform.image.colorgrade")).toBe(true);
    expect(isJobType("face.swap.magic")).toBe(false);
  });
});

describe("upload validation", () => {
  it("enforces kind/mime/size rules", () => {
    expect(validateUploadDeclaration("FACE_IMAGE", "image/jpeg", 1024).ok).toBe(true);
    expect(validateUploadDeclaration("FACE_IMAGE", "application/zip", 1024).failure).toBe("mime_not_allowed");
    expect(validateUploadDeclaration("FACE_IMAGE", "image/jpeg", 11 * 1024 * 1024).failure).toBe("size_too_large");
    expect(validateUploadDeclaration("NOT_A_KIND" as never, "image/jpeg", 1).failure).toBe("kind_unknown");
  });

  it("sniffs real magic bytes", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00]))).toBe("video/webm");
    expect(sniffMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
    expect(sniffMime(new Uint8Array([0x41, 0x41, 0x41, 0x41]))).toBeNull();
    // PNG header inside RIFF-less junk must not match webp.
    const riffJunk = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffMime(riffJunk)).toBe("image/webp");
  });

  it("declared type must match sniffed type", () => {
    expect(declaredMatchesSniffed("image/jpeg", "image/jpeg")).toBe(true);
    expect(declaredMatchesSniffed("image/png", "image/jpeg")).toBe(false);
    expect(declaredMatchesSniffed("video/quicktime", "video/mp4")).toBe(true);
  });
});

describe("session state machine guards", () => {
  it("allows the canonical journey", () => {
    for (const [from, to] of [
      ["CREATED", "VALIDATING"],
      ["VALIDATING", "WAITING_FOR_WORKER"],
      ["WAITING_FOR_WORKER", "WORKER_ASSIGNED"],
      ["WORKER_ASSIGNED", "LOADING"],
      ["LOADING", "READY"],
      ["READY", "LIVE"],
      ["LIVE", "STOPPING"],
      ["STOPPING", "COMPLETED"],
    ] as const) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
    }
  });

  it("allows the degradation/recovery loop", () => {
    expect(canTransition("LIVE", "DEGRADED")).toBe(true);
    expect(canTransition("DEGRADED", "RECOVERING")).toBe(true);
    expect(canTransition("RECOVERING", "LIVE")).toBe(true);
  });

  it("forbids impossible jumps", () => {
    expect(canTransition("CREATED", "LIVE")).toBe(false);
    expect(canTransition("COMPLETED", "LIVE")).toBe(false);
    expect(canTransition("EXPIRED", "ANYTHING")).toBe(false);
    expect(SESSION_TRANSITIONS.COMPLETED).toEqual([]);
  });
});

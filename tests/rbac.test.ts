/**
 * RBAC unit tests — the role/permission contract of report Ch. 11.
 * Pure logic: no database required.
 */
import { describe, expect, it } from "vitest";
import {
  USER_ROLES,
  ROLE_PERMISSIONS,
  assertPermission,
  hasPermission,
  isPermission,
  isUserRole,
  PermissionError,
  type UserRole,
} from "@/lib/rbac";

function permissionSet(role: UserRole): Set<string> {
  return new Set(ROLE_PERMISSIONS[role]);
}

describe("role catalog", () => {
  it("defines exactly the five approved roles in order", () => {
    expect([...USER_ROLES]).toEqual([
      "USER",
      "MODERATOR",
      "SUPPORT",
      "ADMIN",
      "SUPER_ADMIN",
    ]);
  });

  it("validates role values", () => {
    expect(isUserRole("ADMIN")).toBe(true);
    expect(isUserRole("admin")).toBe(false);
    expect(isUserRole("ROOT")).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isUserRole(42)).toBe(false);
  });

  it("validates permission values", () => {
    expect(isPermission("workers:drain")).toBe(true);
    expect(isPermission("workers:fly")).toBe(false);
  });
});

describe("hierarchy invariants (approved report Ch. 11)", () => {
  it("SUPER_ADMIN is a strict superset of ADMIN", () => {
    const admin = permissionSet("ADMIN");
    for (const p of ROLE_PERMISSIONS.SUPER_ADMIN) {
      expect(admin.has(p) || ["system:emergency", "roles:assign"].includes(p)).toBe(true);
    }
    expect(hasPermission("SUPER_ADMIN", "system:emergency")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "roles:assign")).toBe(true);
  });

  it("ADMIN is a superset of MODERATOR and SUPPORT", () => {
    const admin = permissionSet("ADMIN");
    for (const p of ROLE_PERMISSIONS.MODERATOR) expect(admin.has(p)).toBe(true);
    for (const p of ROLE_PERMISSIONS.SUPPORT) expect(admin.has(p)).toBe(true);
  });

  it("MODERATOR and SUPPORT are lateral (neither contains the other)", () => {
    const mod = permissionSet("MODERATOR");
    const support = permissionSet("SUPPORT");
    expect(mod.has("moderation:act")).toBe(true);
    expect(support.has("moderation:act")).toBe(false);
    expect(support.has("support:users:view")).toBe(true);
    expect(mod.has("support:users:view")).toBe(false);
  });

  it("only SUPER_ADMIN can assign roles or trigger emergency controls", () => {
    for (const role of USER_ROLES) {
      if (role === "SUPER_ADMIN") continue;
      expect(hasPermission(role, "roles:assign")).toBe(false);
      expect(hasPermission(role, "system:emergency")).toBe(false);
    }
  });

  it("ordinary users hold no administrative permissions", () => {
    for (const p of ROLE_PERMISSIONS.USER) {
      expect(p.startsWith("self:")).toBe(true);
    }
    expect(hasPermission("USER", "users:manage")).toBe(false);
    expect(hasPermission("USER", "workers:drain")).toBe(false);
    expect(hasPermission("USER", "audit:read")).toBe(false);
  });

  it("granularity: workers:drain does not imply users:manage for any sub-admin role", () => {
    expect(hasPermission("MODERATOR", "workers:drain")).toBe(false);
    expect(hasPermission("SUPPORT", "workers:drain")).toBe(false);
  });
});

describe("assertPermission", () => {
  it("passes when the role holds the permission", () => {
    expect(() => assertPermission("ADMIN", "workers:drain")).not.toThrow();
  });

  it("throws PermissionError when it does not", () => {
    try {
      assertPermission("USER", "users:manage");
      expect.unreachable("must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionError);
      const e = error as PermissionError;
      expect(e.role).toBe("USER");
      expect(e.requiredPermission).toBe("users:manage");
      expect(e.message).toContain("users:manage");
    }
  });
});

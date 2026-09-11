/**
 * RBAC — roles, granular permissions, server-side checks (report Ch. 11).
 *
 * Rules:
 *   - Roles are read from the database session record only, never from
 *     client input. `assertPermission` exists for server-side call sites.
 *   - Permissions are granular strings so e.g. `workers:drain` can be held
 *     without `users:ban`.
 *   - MODERATOR and SUPPORT are lateral roles; ADMIN includes both sets;
 *     SUPER_ADMIN is a strict superset of ADMIN.
 *   - Phase 3 adds MFA enforcement for admin surfaces on top of this module.
 */

export const USER_ROLES = [
  "USER",
  "MODERATOR",
  "SUPPORT",
  "ADMIN",
  "SUPER_ADMIN",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Granular permission catalog. Adding a permission here without assigning it
 * to any role is a compile-time-visible configuration error, not a runtime one.
 */
export const PERMISSIONS = [
  // Every authenticated user.
  "self:read",
  "self:manage",
  // Moderation (report Ch. 11-12).
  "moderation:queue:view",
  "moderation:review",
  "moderation:act",
  // Support.
  "support:users:view",
  "support:sessions:view",
  // Administration.
  "admin:access",
  "users:manage",
  "characters:manage:all",
  "jobs:manage:all",
  "workers:view",
  "workers:manage",
  "workers:drain",
  "audit:read",
  // Super-admin only.
  "system:emergency",
  "roles:assign",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: unknown): value is Permission {
  return (
    typeof value === "string" &&
    (PERMISSIONS as readonly string[]).includes(value)
  );
}

const USER_PERMISSIONS: readonly Permission[] = ["self:read", "self:manage"];

const MODERATOR_PERMISSIONS: readonly Permission[] = [
  ...USER_PERMISSIONS,
  "moderation:queue:view",
  "moderation:review",
  "moderation:act",
];

const SUPPORT_PERMISSIONS: readonly Permission[] = [
  ...USER_PERMISSIONS,
  "support:users:view",
  "support:sessions:view",
];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...MODERATOR_PERMISSIONS,
  ...SUPPORT_PERMISSIONS,
  "admin:access",
  "users:manage",
  "characters:manage:all",
  "jobs:manage:all",
  "workers:view",
  "workers:manage",
  "workers:drain",
  "audit:read",
];

const SUPER_ADMIN_PERMISSIONS: readonly Permission[] = [
  ...ADMIN_PERMISSIONS,
  "system:emergency",
  "roles:assign",
];

/** Role → granted permission set. Single source of truth. */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  USER: USER_PERMISSIONS,
  MODERATOR: MODERATOR_PERMISSIONS,
  SUPPORT: SUPPORT_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export class PermissionError extends Error {
  readonly requiredPermission: Permission;
  readonly role: UserRole;
  constructor(role: UserRole, permission: Permission) {
    super(`Role ${role} lacks required permission "${permission}".`);
    this.name = "PermissionError";
    this.requiredPermission = permission;
    this.role = role;
  }
}

/**
 * Server-side assertion. Call sites must pass the role obtained from the
 * authenticated session record — never a value from request input.
 */
export function assertPermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionError(role, permission);
  }
}

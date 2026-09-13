/**
 * API helpers — session extraction and JSON responses shared by all
 * platform routes. Handlers accept the standard Web `Request` (which is
 * also what vitest passes when invoking route handlers directly), so the
 * same code path runs in tests and in production.
 */

import { auth } from "@/lib/auth";
import type { UserRole } from "@/lib/rbac";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
}

export async function getApiUser(request: Request): Promise<ApiUser | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  if (!session?.user) return null;
  const role = String(session.user.role ?? "USER");
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: (["USER", "MODERATOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"] as const).includes(
      role as never,
    )
      ? (role as UserRole)
      : "USER",
    status: String(session.user.status ?? "ACTIVE"),
  };
}

export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function apiError(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse({ error: code, message }, { status });
}

export function requireUser(user: ApiUser | null): Response | null {
  if (!user) return apiError(401, "unauthenticated", "Sign in required.");
  if (user.status === "BANNED") {
    return apiError(403, "account_banned", "This account is banned.");
  }
  if (user.status !== "ACTIVE") {
    return apiError(403, "account_suspended", "This account is suspended.");
  }
  return null;
}

/** Standard 429 with Retry-After (spec §30 rate limits). */
export function rateLimited(retryAfterSeconds: number, limit: number): Response {
  return jsonResponse(
    { error: "rate_limited", message: `Rate limit exceeded (${limit} per window).` },
    {
      status: 429,
      headers: { "retry-after": String(retryAfterSeconds) },
    },
  );
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Worker auth extraction from headers. */
export function workerAuthFrom(request: Request): {
  name: string | null;
  credential: string | null;
} {
  const name = request.headers.get("x-worker-name");
  const authHeader = request.headers.get("authorization");
  const credential =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return { name, credential };
}

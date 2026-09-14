/**
 * Platform API client for React Native.
 *
 * The web platform authenticates with a signed, HttpOnly session cookie
 * (Better Auth). React Native's fetch does not persist cookies, so this
 * client owns that responsibility explicitly:
 *   - sign-in captures the Set-Cookie pair and stores it in SecureStore
 *     (device keystore / keychain — never AsyncStorage),
 *   - every request attaches the cookie header,
 *   - a 401 clears the stored session so the app falls back to sign-in.
 *
 * BASE URL comes from the environment: app.config.js EXTRA_API_URL override,
 * or the default dev host. Change it for your deployment — the same API
 * the web app uses, no mobile-specific backend.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const COOKIE_KEY = "platform.session";

function baseUrl(): string {
  const override =
    (Constants.expoConfig?.extra as { API_URL?: string } | undefined)?.API_URL;
  if (override) return override.replace(/\/$/, "");
  // Android emulators reach the host machine via 10.0.2.2; iOS simulators
  // and physical devices use the developer machine's LAN IP — set
  // EXTRA_API_URL in app.config.js for real devices.
  return "http://10.0.2.2:3000";
}

export function relayUrl(): string {
  const base = baseUrl().replace(/\/$/, "");
  // The media relay in dev listens on its own port next to the app server.
  return base.replace(/:3000$/, ":3031");
}

async function storedCookie(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(COOKIE_KEY);
  } catch {
    return null;
  }
}

export async function hasSession(): Promise<boolean> {
  return (await storedCookie()) !== null;
}

async function saveCookie(res: Response): Promise<void> {
  // RN fetch exposes set-cookie via getSetCookie() (RN >= 0.73) or as a
  // joined header — handle both shapes.
  const anyRes = res as Response & {
    headers: Headers & { getSetCookie?: () => string[]; map?: Record<string, string> };
  };
  let pair: string | undefined;
  if (typeof anyRes.headers.getSetCookie === "function") {
    pair = anyRes.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_token="))
      ?.split(";")[0];
  } else {
    const joined =
      anyRes.headers.map?.["set-cookie"] ??
      anyRes.headers.get("set-cookie") ??
      "";
    pair = joined
      .split(/,(?=[^;]+?=)/)
      .find((c) => c.trim().startsWith("better-auth.session_token="))
      ?.split(";")[0];
  }
  if (pair) {
    await SecureStore.setItemAsync(COOKIE_KEY, pair);
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(COOKIE_KEY);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  raw?: boolean;
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<{ status: number; data: T | null }> {
  const cookie = await storedCookie();
  const res = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...(cookie ? { cookie } : {}),
    },
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    await clearSession();
  }

  if (options.raw) {
    return { status: res.status, data: res as unknown as T };
  }

  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${baseUrl()}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    return {
      ok: false,
      message:
        body.message ?? body.error === "invalid_email_or_password"
          ? "Wrong email or password."
          : "Sign-in failed.",
    };
  }
  await saveCookie(res);
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const cookie = await storedCookie();
  if (cookie) {
    await fetch(`${baseUrl()}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie },
    }).catch(() => undefined);
  }
  await clearSession();
}

export async function signUp(
  name: string,
  email: string,
  password: string,
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${baseUrl()}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
    };
    return { ok: false, message: body.message ?? "Sign-up failed." };
  }
  await saveCookie(res);
  return { ok: true };
}

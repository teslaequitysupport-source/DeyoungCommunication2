/**
 * Better Auth instance — email + password, sessions, platform roles
 * (approved report Ch. 5, 11).
 *
 *   - `createAuth(db)` is a factory so integration tests can bind a fresh
 *     PGlite database instead of the dev database.
 *   - Roles/status are Better Auth "additional fields" with `input: false`:
 *     clients can never set their own role at sign-up. The DB column default
 *     (USER / ACTIVE) is the single source of truth for new accounts.
 *   - databaseHooks append audit rows for sign-up, sign-in and sign-out.
 *     Audit writes are not swallowed — a failure surfaces loudly.
 *   - trustedOrigins comes from the environment (comma-separated, wildcards
 *     supported) so the sandbox preview proxy origin can be trusted in dev
 *     without weakening production configuration.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq } from "drizzle-orm";
import { getDb, type PlatformDatabase } from "@/lib/db";
import { schema } from "@/lib/db";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { isUserRole, type UserRole } from "@/lib/rbac";
import { grantCredits, signupBonusCredits } from "@/lib/credits";

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;
const ONE_DAY_SECONDS = 60 * 60 * 24;

function trustedOriginsFromEnv(): string[] {
  return (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createAuth(db: PlatformDatabase) {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.AUTH_SECRET,
    trustedOrigins: trustedOriginsFromEnv(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: SEVEN_DAYS_SECONDS,
      updateAge: ONE_DAY_SECONDS,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "USER",
          input: false,
        },
        status: {
          type: "string",
          required: false,
          defaultValue: "ACTIVE",
          input: false,
        },
        twoFactorEnabled: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    plugins: [
      // TOTP + backup codes (spec §28 "2FA"). Enforcement for elevated
      // roles lives in requireMfa (api-helpers) — the plugin owns enrollment
      // and verification, never the authorization policy.
      twoFactor({
        issuer: "Live Character Platform",
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await recordAudit(db, {
              actorId: user.id,
              actorEmail: user.email,
              actorRole: "USER",
              action: AUDIT_ACTIONS.userSignedUp,
              targetType: "user",
              targetId: user.id,
              outcome: "SUCCESS",
              metadata: {
                emailVerified: Boolean(user.emailVerified),
              },
            });
            // Free-tier signup bonus (spec §41 credits, approved manual
            // billing): exactly-once via the stable idempotency key, so a
            // retried hook can never double-grant.
            const bonus = signupBonusCredits();
            if (bonus > 0) {
              await grantCredits(db, {
                userId: user.id,
                amount: bonus,
                kind: "SIGNUP_BONUS",
                reason: "Welcome credits (free tier)",
                idempotencyKey: `signup-bonus:${user.id}`,
              });
            }
          },
        },
      },
      session: {
        create: {
          // Sign-in gate: suspended or banned accounts never receive a
          // session. The DB check happens at session-creation time, so a
          // status change takes effect even if a stale cookie is replayed.
          before: async (newSession) => {
            const accountUser = await db.query.user.findFirst({
              where: eq(schema.user.id, newSession.userId),
              columns: { status: true },
            });
            if (accountUser && accountUser.status !== "ACTIVE") {
              await recordAudit(db, {
                actorId: newSession.userId,
                action: AUDIT_ACTIONS.signInDenied,
                targetType: "user",
                targetId: newSession.userId,
                outcome: "DENIED",
                metadata: { status: accountUser.status },
              });
              return false;
            }
            return undefined;
          },
          after: async (createdSession) => {
            const accountUser = await db.query.user.findFirst({
              where: eq(schema.user.id, createdSession.userId),
            });
            const role: UserRole = isUserRole(accountUser?.role)
              ? accountUser.role
              : "USER";
            await recordAudit(db, {
              actorId: createdSession.userId,
              actorEmail: accountUser?.email ?? null,
              actorRole: role,
              action: AUDIT_ACTIONS.userSignedIn,
              targetType: "session",
              targetId: createdSession.id,
              outcome: "SUCCESS",
              metadata: {
                expiresAt: createdSession.expiresAt,
              },
            });
          },
        },
        delete: {
          after: async (deletedSession) => {
            await recordAudit(db, {
              actorId: deletedSession.userId,
              action: AUDIT_ACTIONS.userSignedOut,
              targetType: "session",
              targetId: deletedSession.id,
              outcome: "SUCCESS",
            });
          },
        },
      },
    },
  });
}

/** Application-wide singleton bound to the app database. */
export const auth = createAuth(getDb());

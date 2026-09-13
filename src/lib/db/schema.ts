/**
 * Control-plane database schema — AI Live Character Platform.
 *
 * Phase 0 foundations per the approved Phase-1 report:
 *   - Auth tables (user/session/account/verification) shaped for Better Auth.
 *   - Platform tables for jobs, workers, live sessions, consent, characters,
 *     assets, and the append-only audit log.
 *
 * Dialect: PostgreSQL.
 *   - Development (this sandbox): embedded PGlite (real Postgres, in-process).
 *   - Deployment: Neon Postgres over node-postgres. Same schema, same SQL.
 *
 * Design rules (approved report):
 *   - State machines are pg enums, so invalid states are rejected by the
 *     database itself, not just by application code.
 *   - The database stores metadata only; media objects live in R2 (Phase 1+).
 *   - audit_log is append-only by convention in Phase 0 (no update/delete
 *     code paths); DB-level enforcement is Phase 3 hardening.
 */

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  smallint,
  jsonb,
  uuid,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// Enums — approved state machines (report Ch. 8, 9, 11, 12)
// ─────────────────────────────────────────────────────────────────────────────

/** Role hierarchy is enforced in src/lib/rbac.ts, never read from the client. */
export const userRoleEnum = pgEnum("user_role", [
  "USER",
  "MODERATOR",
  "SUPPORT",
  "ADMIN",
  "SUPER_ADMIN",
]);

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "SUSPENDED",
  "BANNED",
]);

/** Worker lifecycle states (report Ch. 8). */
export const workerStatusEnum = pgEnum("worker_status", [
  "IDLE",
  "RESERVED",
  "LOADING",
  "READY",
  "BUSY",
  "DRAINING",
  "SLEEPING",
  "UNHEALTHY",
  "SHUTDOWN",
]);

/** Durable job record states (report Ch. 9). */
export const jobStatusEnum = pgEnum("job_status", [
  "QUEUED",
  "RESERVED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

/** All 14 live-session states (report Ch. 9) — server-authoritative only. */
export const liveSessionStatusEnum = pgEnum("live_session_status", [
  "CREATED",
  "VALIDATING",
  "WAITING_FOR_WORKER",
  "WORKER_ASSIGNED",
  "LOADING",
  "READY",
  "LIVE",
  "DEGRADED",
  "RECOVERING",
  "STOPPING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

/** Consent is purpose-scoped and withdrawable (report Ch. 12). */
export const consentStatusEnum = pgEnum("consent_status", [
  "GRANTED",
  "WITHDRAWN",
]);

export const characterStatusEnum = pgEnum("character_status", [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

export const assetKindEnum = pgEnum("asset_kind", [
  "FACE_IMAGE",
  "VOICE_SAMPLE",
  "VIDEO_CLIP",
  "RENDER_OUTPUT",
  "OTHER",
]);

export const auditOutcomeEnum = pgEnum("audit_outcome", [
  "SUCCESS",
  "DENIED",
  "ERROR",
]);

/** Spec §33 — the abuse categories users can report. */
export const reportReasonEnum = pgEnum("report_reason", [
  "IMPERSONATION",
  "HARASSMENT",
  "ILLEGAL_CONTENT",
  "UNAUTHORIZED_LIKENESS",
  "UNAUTHORIZED_VOICE",
  "SEXUAL_ABUSE_DEEPFAKE",
  "SCAM",
  "FRAUD",
  "COPYRIGHT",
  "OTHER",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);

/** Enforcement actions a moderator can attach to a decision (spec §33). */
export const reportActionEnum = pgEnum("report_action", [
  "NONE",
  "WARNING",
  "SUSPENSION",
  "BAN",
  "CONTENT_REMOVAL",
]);

/** Credit ledger entry kinds (spec §41 — manual credits in this phase). */
export const creditKindEnum = pgEnum("credit_kind", [
  "SIGNUP_BONUS",
  "ADMIN_GRANT",
  "JOB_SPEND",
  "JOB_REFUND",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─────────────────────────────────────────────────────────────────────────────
// Auth tables — Better Auth model shapes
// ─────────────────────────────────────────────────────────────────────────────

export const user = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Platform fields (exposed to session via Better Auth additionalFields).
    role: userRoleEnum("role").notNull().default("USER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    /** True only after a verified TOTP enrollment (twoFactor plugin). */
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_unique").on(t.token),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_provider_account_unique").on(
      t.providerId,
      t.accountId,
    ),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const verification = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Audit log — append-only (report Ch. 7, 11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every security-relevant event lands here: auth events, admin actions,
 * Brain tool executions and vetoes (Phase 1+), emergency controls.
 * actorEmail/actorRole are denormalized on purpose so rows remain meaningful
 * after the actor row is deleted (report Ch. 12 retention rules).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    actorRole: userRoleEnum("actor_role"),
    action: text("action").notNull(), // e.g. "auth.sign_up", "worker.drain"
    targetType: text("target_type"), // e.g. "user", "worker", "job"
    targetId: text("target_id"),
    outcome: auditOutcomeEnum("outcome").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt),
    index("audit_log_actor_id_idx").on(t.actorId),
    index("audit_log_action_idx").on(t.action),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Worker registry (report Ch. 8) — provider-independent identities
// ─────────────────────────────────────────────────────────────────────────────

export const workers = pgTable(
  "workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** e.g. "DEVELOPMENT_LOCAL", "RUNPOD", "KAGGLE" (dev-tier only). */
    provider: text("provider").notNull(),
    /** Hash of the rotatable worker credential (never the credential itself). */
    credentialHash: text("credential_hash").notNull(),
    gpuType: text("gpu_type"),
    vramMb: integer("vram_mb"),
    region: text("region"),
    /** Worker container/protocol version; control plane may refuse outdated workers. */
    version: text("version"),
    status: workerStatusEnum("status").notNull().default("IDLE"),
    /** Capability strings, e.g. ["face.live", "voice.live", "video.h3"]. */
    capabilities: jsonb("capabilities")
      .$type<string[]>()
      .notNull()
      .default([]),
    /** Model manifest, e.g. ["minimax-h3:api", "ffmpeg:6"]. */
    models: jsonb("models").$type<string[]>().notNull().default([]),
    lastHeartbeatAt: timestamp("last_heartbeat_at", {
      withTimezone: true,
      mode: "date",
    }),
    heartbeatLatencyMs: integer("heartbeat_latency_ms"),
    activeJobs: smallint("active_jobs").notNull().default(0),
    errorCount: smallint("error_count").notNull().default(0),
    /**
     * Sleep system (spec §45): when the worker last reported zero active
     * jobs. The scheduler's sleep sweep moves workers whose idle_since_at is
     * older than the idle timeout to SLEEPING.
     */
    idleSinceAt: timestamp("idle_since_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** Set when a job needs this sleeping worker — cold start in flight. */
    wakeRequestedAt: timestamp("wake_requested_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("workers_name_unique").on(t.name),
    index("workers_status_idx").on(t.status),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Characters & assets (minimal Phase 0 stubs; CRUD + R2 upload arrive Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Face/appearance/voice/personality config; shape finalized in Phase 1. */
    appearanceConfig: jsonb("appearance_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: characterStatusEnum("status").notNull().default("DRAFT"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("characters_user_id_idx").on(t.userId)],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    characterId: uuid("character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    kind: assetKindEnum("kind").notNull(),
    /** R2 object key (Phase 1). Metadata only — never file contents. */
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    createdAt: createdAt(),
  },
  (t) => [index("assets_user_kind_idx").on(t.userId, t.kind)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Consent records (report Ch. 12) — explicit, purpose-scoped, withdrawable
// ─────────────────────────────────────────────────────────────────────────────

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** What the consent is scoped to; null once the covered asset is deleted (retention: consent evidence outlives media, spec §35). */
    assetId: uuid("asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    /** Purpose string, e.g. "face.transform.live", "voice.transform.live". */
    purpose: text("purpose").notNull(),
    /** Bounded scopes, e.g. { "sessions": "live", "retentionDays": 30 }. */
    scope: jsonb("scope")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    policyVersion: text("policy_version").notNull(),
    status: consentStatusEnum("status").notNull().default("GRANTED"),
    grantedAt: timestamp("granted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull().defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", {
      withTimezone: true,
      mode: "date",
    }),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("consent_records_user_status_idx").on(t.userId, t.status),
    index("consent_records_asset_idx").on(t.assetId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Live sessions (report Ch. 9) — server-authoritative state machine
// ─────────────────────────────────────────────────────────────────────────────

export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    characterId: uuid("character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    status: liveSessionStatusEnum("status").notNull().default("CREATED"),
    workerId: uuid("worker_id").references(() => workers.id, {
      onDelete: "set null",
    }),
    /** LiveKit room name once the media plane is wired (Phase 1). */
    roomRef: text("room_ref"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("live_sessions_user_created_idx").on(t.userId, t.createdAt),
    index("live_sessions_status_idx").on(t.status),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Jobs (report Ch. 9) — durable records for every async task
// ─────────────────────────────────────────────────────────────────────────────

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    liveSessionId: uuid("live_session_id").references(() => liveSessions.id, {
      onDelete: "set null",
    }),
    /** Job type, e.g. "character.render", "face.transform.live", "video.generate.h3". */
    type: text("type").notNull(),
    status: jobStatusEnum("status").notNull().default("QUEUED"),
    /** 0 = lowest, 9 = highest. */
    priority: smallint("priority").notNull().default(5),
    /** Asset/storage references the job consumes. */
    inputRefs: jsonb("input_refs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    workerId: uuid("worker_id").references(() => workers.id, {
      onDelete: "set null",
    }),
    provider: text("provider"),
    /** Retries never duplicate work or billing (report Ch. 8-9). */
    idempotencyKey: text("idempotency_key").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    failureInfo: jsonb("failure_info").$type<Record<string, unknown>>(),
    retryCount: smallint("retry_count").notNull().default(0),
    result: jsonb("result").$type<Record<string, unknown>>(),
    usage: jsonb("usage").$type<Record<string, unknown>>(),
    /** Estimated or actual cost in USD where the provider reports it. */
    costUsd: text("cost_usd"),
    createdAt: createdAt(),
    /** Last state change (sweeper input for stale reservations). */
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("jobs_idempotency_key_unique").on(t.idempotencyKey),
    index("jobs_user_created_idx").on(t.userId, t.createdAt),
    index("jobs_status_idx").on(t.status),
    index("jobs_worker_idx").on(t.workerId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Abuse reports (spec §33) — user-facing intake + moderator queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Polymorphic target: `targetType` + `targetId` point at the entity being
 * reported (user / character / asset / live_session / job). Deliberately no
 * FK to the target row — reports must survive target deletion so decisions
 * remain auditable. `targetUserId` is denormalized when the target belongs to
 * a user, so ban enforcement does not need to re-resolve the polymorphic link.
 * The reporter link is nullable + ON DELETE SET NULL for the same reason:
 * abuse records outlive the reporting account (report Ch. 12 retention).
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reason: reportReasonEnum("reason").notNull(),
    /** Polymorphic target — validated against known entity tables on intake. */
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetUserId: text("target_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Reporter's free-text description (bounded, plain text). */
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("OPEN"),
    /** Moderator's documented decision (spec §33: "document decisions"). */
    decisionAction: reportActionEnum("decision_action"),
    decisionNotes: text("decision_notes"),
    decidedById: text("decided_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_target_user_idx").on(t.targetUserId),
    index("reports_reporter_idx").on(t.reporterId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Two-factor authentication — Better Auth twoFactor plugin storage (spec §28)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TOTP enrollment state. `verified` flips true when the user proves the code;
 * only then does the plugin set users.two_factor_enabled. Backup codes are
 * stored hashed by the plugin.
 */
export const twoFactor = pgTable("twofactor", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret"),
  backupCodes: text("backup_codes"),
  verified: boolean("verified").notNull().default(false),
  failedVerificationCount: integer("failed_verification_count"),
  lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limits (spec §5/§26/§30) — DB-backed fixed-window counters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per (key, window). `key` scopes the limit, e.g.
 * "reports:user:<userId>" or "presign:user:<userId>". Counting is a single
 * atomic INSERT .. ON CONFLICT DO UPDATE (see src/lib/rate-limits.ts), so the
 * limiter is correct across instances and survives restarts — the same
 * semantics carry to the Neon deployment unchanged.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ─────────────────────────────────────────────────────────────────────────────
// Credit ledger (spec §41 CONSUMER, §59) — append-only, idempotent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row per credit movement. The balance is never a mutable column — it
 * is always `SUM(delta)` over the user's entries, and `balance_after` is
 * written inside the same transaction for human-readable history. The
 * unique idempotency key makes grants/spends/refunds exactly-once even
 * when a caller retries (approved decision: manual credits, no payment
 * provider in this phase — refunds of money are therefore N/A by design
 * and the /refunds policy says so plainly).
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Signed amount: grants/refunds positive, spends negative. */
    delta: integer("delta").notNull(),
    /** Running balance after this entry (audit-friendly history column). */
    balanceAfter: integer("balance_after").notNull(),
    kind: creditKindEnum("kind").notNull(),
    /** The job a spend/refund belongs to; grants carry null. */
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    /** Admin who granted (ADMIN_GRANT only). */
    grantedById: text("granted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("credit_ledger_idempotency_key_unique").on(t.idempotencyKey),
    index("credit_ledger_user_created_idx").on(t.userId, t.createdAt),
  ],
);

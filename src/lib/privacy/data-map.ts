/**
 * Privacy data map (spec §35) — the REAL registry, not prose.
 *
 * Every data category the platform holds is described once, here, with all
 * ten fields the spec requires: what, why, how collected, legal basis,
 * where stored, who processes it, retention, who can access, deletion
 * method, export method. The /privacy page renders this structure directly
 * and tests assert every field is populated — the map can never silently
 * drift from reality the way a hand-written policy page can.
 *
 * Legal-basis wording follows the Nigeria Data Protection Act 2023 (NDPA)
 * vocabulary (consent / contract / legitimate interest / legal obligation)
 * but stays plain-language: this map documents engineering reality, it does
 * not constitute legal advice (see PRIVACY-REVIEW notes in /help).
 */

export interface DataMapEntry {
  /** Short machine-stable id, e.g. "account.profile". */
  id: string;
  category: string;
  what: string;
  why: string;
  howCollected: string;
  legalBasis: string;
  whereStored: string;
  processors: string;
  retention: string;
  whoCanAccess: string;
  deletion: string;
  exportMethod: string;
}

export const DATA_MAP: readonly DataMapEntry[] = [
  {
    id: "account.profile",
    category: "Account profile",
    what: "Display name, email address, email-verified flag, role, account status, creation/update timestamps.",
    why: "To operate your account, authenticate you, and show you your own content.",
    howCollected: "You provide name and email at sign-up; flags and timestamps are set by the platform.",
    legalBasis: "Contract — account operation (performance of a contract).",
    whereStored: "\"users\" table in the platform Postgres database.",
    processors: "Platform operator. Hosting/DB provider per deployment configuration (Neon Postgres in production; local dev database otherwise).",
    retention: "Until you delete your account. The row is hard-deleted on account deletion.",
    whoCanAccess: "You; platform staff via the audited admin console (every view is logged).",
    deletion: "\"Delete account\" in Settings (password + confirmation phrase required) removes the row and all cascaded content.",
    exportMethod: "Included in your data export (Settings → Privacy → Export my data).",
  },
  {
    id: "account.credentials",
    category: "Authentication credentials",
    what: "Scrypt password hash, session tokens (signed), session IP/user-agent.",
    why: "To authenticate you and keep accounts secure.",
    howCollected: "Password at sign-up; session metadata at each sign-in.",
    legalBasis: "Contract and security (legitimate interest).",
    whereStored: "\"accounts\" and \"sessions\" tables; hashes only, never plaintext passwords.",
    processors: "Platform operator; DB hosting provider.",
    retention: "Password hash until account deletion; sessions until you sign out, or expiry (7 days), or account deletion.",
    whoCanAccess: "You (your session rows); platform staff never see plaintext passwords (they cannot be read).",
    deletion: "Deleting your account removes all rows; signing out removes the session row immediately.",
    exportMethod: "Session metadata only (expiry timestamps) is included in the export; secrets are never exported.",
  },
  {
    id: "account.twofactor",
    category: "Two-factor secrets",
    what: "TOTP shared secret (while enrolling), hashed backup codes, verification counters.",
    why: "To offer and enforce two-factor authentication for elevated roles.",
    howCollected: "You scan/enter the TOTP secret during enrollment.",
    legalBasis: "Consent / security (legitimate interest).",
    whereStored: "\"twofactor\" table.",
    processors: "Platform operator; DB hosting provider.",
    retention: "Until enrollment is removed or the account is deleted.",
    whoCanAccess: "You during enrollment; staff cannot read your secret.",
    deletion: "Removed with your account; disabling 2FA removes the enrollment.",
    exportMethod: "Never exported — security secrets are excluded from data exports by design.",
  },
  {
    id: "characters",
    category: "Characters",
    what: "Character name, appearance/voice/personality configuration, status, timestamps.",
    why: "To store the characters you create and render them in live sessions and jobs.",
    howCollected: "You create and edit characters in the studio.",
    legalBasis: "Contract — delivering the service you signed up for.",
    whereStored: "\"characters\" table.",
    processors: "Platform operator; DB hosting provider.",
    retention: "Until you delete the character or your account.",
    whoCanAccess: "You; staff via the audited admin console when handling reports.",
    deletion: "Per-character delete, or full account deletion (cascade).",
    exportMethod: "Included in your data export.",
  },
  {
    id: "assets.media",
    category: "Face / voice / video media (sensitive)",
    what: "Uploaded face images, voice samples, video clips, and generated outputs, with kind, MIME type, size, checksum.",
    why: "As inputs and outputs of transformation jobs and live sessions.",
    howCollected: "You upload them (presigned/ticketed upload); jobs write generated outputs.",
    legalBasis: "Consent — explicit, purpose-scoped, withdrawable consent is required before any face or voice transformation.",
    whereStored: "Object storage (Cloudflare R2 in production; local dev object store in development) keyed under your user id; metadata in the \"assets\" table.",
    processors: "Platform operator; object-storage provider; GPU workers that process your job (only while it runs).",
    retention: "Until you delete the asset or your account; a retention sweep also removes assets older than the configured retention window (default 365 days, see RETENTION_ASSETS_DAYS).",
    whoCanAccess: "You (ownership-checked downloads); assigned workers for the duration of the job; staff only via audited moderation actions.",
    deletion: "Asset delete removes the object and its metadata; consent records for the asset are preserved as evidence (de-linked).",
    exportMethod: "Metadata + authenticated download links are included in your data export.",
  },
  {
    id: "consent.records",
    category: "Consent records",
    what: "Purpose, scope, policy version, grant/withdraw timestamps for each face/voice consent.",
    why: "To prove and enforce that likeness/voice transformation only happens with valid, current consent.",
    howCollected: "You grant consent per asset/purpose in the Media & Consent tab; withdrawal is one click.",
    legalBasis: "Consent (the Nigeria Data Protection Act treats face and voice data as sensitive data requiring explicit consent).",
    whereStored: "\"consent_records\" table.",
    processors: "Platform operator; DB hosting provider.",
    retention: "Kept as consent evidence after the covered asset is deleted (de-linked), and after withdrawal, for accountability; removed with your account.",
    whoCanAccess: "You; staff via the audited admin console.",
    deletion: "Removed with your account (withdrawal marks the record WITHDRAWN but keeps the audit trail while the account exists).",
    exportMethod: "Included in your data export.",
  },
  {
    id: "sessions.live",
    category: "Live session records",
    what: "Session status timeline, timestamps, assigned worker, room reference, session metadata.",
    why: "To operate the server-authoritative session state machine and show you your history.",
    howCollected: "Automatically when you start/end live sessions.",
    legalBasis: "Contract; security (legitimate interest).",
    whereStored: "\"live_sessions\" table. Live media itself flows peer/worker-side and is not recorded by default — no recordings exist unless a recording feature is explicitly enabled (it is not, in this build).",
    processors: "Platform operator; DB hosting provider.",
    retention: "Ended sessions are removed by the retention sweep after the configured window (default 90 days).",
    whoCanAccess: "You; staff via the audited admin console.",
    deletion: "Account deletion removes them immediately; the retention sweep removes old ended sessions.",
    exportMethod: "Included in your data export (metadata only — there are no recordings).",
  },
  {
    id: "jobs",
    category: "Jobs",
    what: "Job type, status, priority, input references, results, usage, retry and failure info, timestamps.",
    why: "To execute, recover, and audit every asynchronous task durably.",
    howCollected: "Automatically when you submit jobs.",
    legalBasis: "Contract; security (legitimate interest).",
    whereStored: "\"jobs\" table; result objects in object storage.",
    processors: "Platform operator; DB and object-storage providers; the provider behind external generation APIs (only for the data you submitted to that job).",
    retention: "Terminal jobs are removed by the retention sweep after the configured window (default 180 days).",
    whoCanAccess: "You (your jobs); staff via the audited admin console.",
    deletion: "Account deletion removes them immediately; the sweep removes old terminal jobs.",
    exportMethod: "Included in your data export.",
  },
  {
    id: "credits.ledger",
    category: "Credits ledger",
    what: "Every credit movement: signup bonus, admin grants, job spends, refunds, with running balance.",
    why: "To operate the credit system honestly and explain every balance change.",
    howCollected: "Automatically as you use jobs; manually by staff for grants.",
    legalBasis: "Contract; accounting (legitimate interest).",
    whereStored: "\"credit_ledger\" table (append-only).",
    processors: "Platform operator; DB hosting provider.",
    retention: "While the account exists (removed with it); a job link may be de-linked when old jobs are swept, the ledger amounts remain.",
    whoCanAccess: "You (your history); staff via the audited admin console.",
    deletion: "Removed with your account.",
    exportMethod: "Included in your data export.",
  },
  {
    id: "reports.moderation",
    category: "Abuse reports & moderation decisions",
    what: "Reports you file (reason, details, target), moderator decisions, notes, enforcement actions.",
    why: "To handle abuse, protect users, and document moderation decisions (spec §33).",
    howCollected: "You file reports; staff record decisions.",
    legalBasis: "Legitimate interest; legal obligation where applicable.",
    whereStored: "\"reports\" table; decisions also audited in the audit log.",
    processors: "Platform operator; DB hosting provider.",
    retention: "Resolved/dismissed reports are removed by the retention sweep after the configured window (default 730 days). Reports outlive the accounts involved (de-linked on deletion) so decisions remain auditable.",
    whoCanAccess: "Staff (moderators and above) via the audited console; the reporter sees their own report status.",
    deletion: "You cannot delete a filed report individually (abuse handling requires it); account deletion de-links you from it. The sweep removes old closed reports.",
    exportMethod: "Reports you filed are included in your data export; reports against you are available on request.",
  },
  {
    id: "audit.log",
    category: "Audit log",
    what: "Security-relevant events: auth events, admin actions, moderation, worker control, account deletion/export.",
    why: "Security accountability and incident investigation.",
    howCollected: "Automatically by platform code paths.",
    legalBasis: "Legitimate interest; legal obligation.",
    whereStored: "\"audit_log\" table (append-only).",
    processors: "Platform operator; DB hosting provider.",
    retention: "Pruned by the retention sweep after the configured window (default 730 days).",
    whoCanAccess: "Staff only (ADMIN and above), via the audited console. Never exposed to other users.",
    deletion: "Entries older than the retention window; otherwise kept until the window passes.",
    exportMethod: "Not part of the user export (staff accountability records); a subject-access request can be made through support.",
  },
  {
    id: "ratelimit.counters",
    category: "Rate-limit counters",
    what: "Per-user, per-policy hit counts in fixed windows.",
    why: "Abuse prevention (spec §30).",
    howCollected: "Automatically on rate-limited actions.",
    legalBasis: "Legitimate interest — platform security.",
    whereStored: "\"rate_limit_hits\" table.",
    processors: "Platform operator; DB hosting provider.",
    retention: "Lazily pruned once a window is past; never kept beyond the window length.",
    whoCanAccess: "System only; staff see policy limits, not individual counters.",
    deletion: "Automatic (window expiry).",
    exportMethod: "Not included — transient security counters, not personal content.",
  },
] as const;

/** Sanity invariants the test suite asserts — the map must stay complete. */
export const DATA_MAP_REQUIRED_FIELDS: readonly (keyof DataMapEntry)[] = [
  "id",
  "category",
  "what",
  "why",
  "howCollected",
  "legalBasis",
  "whereStored",
  "processors",
  "retention",
  "whoCanAccess",
  "deletion",
  "exportMethod",
];

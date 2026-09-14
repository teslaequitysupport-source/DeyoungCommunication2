/** Shared API types for the mobile app (mirrors the platform's responses). */

export interface Character {
  id: string;
  name: string;
  appearanceConfig: Record<string, unknown> | null;
  status: string;
  createdAt: string;
}

export interface LiveSessionView {
  id: string;
  characterId: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface CreditEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  kind: "SIGNUP_BONUS" | "ADMIN_GRANT" | "JOB_SPEND" | "JOB_REFUND";
  reason: string | null;
  createdAt: string;
}

export interface CreditsView {
  balance: number;
  history: CreditEntry[];
  costs: Record<string, number>;
}

export interface AssetView {
  id: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export const TERMINAL_SESSION_STATES = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
];

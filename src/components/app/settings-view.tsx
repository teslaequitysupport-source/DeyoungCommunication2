"use client";

/**
 * Settings view (spec §20: settings, account management, privacy controls,
 * billing/credits) — the user's control room. Every number and state here
 * is fetched from the real APIs: credit balance from the ledger, MFA state
 * from the session, deletion/export from the privacy endpoints.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BadgeCent,
  Download,
  KeyRound,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CreditEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  kind: string;
  jobId: string | null;
  reason: string | null;
  createdAt: string;
}

interface CreditsState {
  balance: number;
  history: CreditEntry[];
  costs: Record<string, number>;
}

export function SettingsView({
  mfaEnabled,
  isStaff,
}: {
  mfaEnabled: boolean;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Credits
  const [credits, setCredits] = useState<CreditsState | null>(null);

  // MFA
  const [mfaEnrolled, setMfaEnrolled] = useState(mfaEnabled);
  const [mfaPassword, setMfaPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  // Deletion
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/account/credits", { cache: "no-store" });
      if (res.ok) {
        setCredits((await res.json()) as CreditsState);
      }
    } catch {
      // surfaced by the empty state below
    }
  }, []);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  async function exportData() {
    setExporting(true);
    setError(null);
    try {
      const exportRes = await fetch("/api/account/export", {
        cache: "no-store",
      });
      if (exportRes.status === 429) {
        setError(
          "Export rate limit reached — try again within the hour (the limit is per window).",
        );
        return;
      }
      if (!exportRes.ok) {
        setError("Export failed — please try again.");
        return;
      }
      const blob = await exportRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-data-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice("Export downloaded — it includes everything we hold about your account.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: deletePassword,
          confirmation: deleteConfirm,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(body.message ?? "Account deletion failed.");
        return;
      }
      await authClient.signOut();
      window.location.href = "/";
    } finally {
      setDeleting(false);
    }
  }

  async function startMfa() {
    const { data, error: err } = await authClient.twoFactor.enable({
      password: mfaPassword,
      method: "totp",
    });
    if (err || !data || data.method !== "totp" || !data.totpURI) {
      setError(err?.message ?? "MFA enrollment failed.");
      return;
    }
    setError(null);
    setTotpUri(data.totpURI);
  }

  async function verifyMfa() {
    const { error: err } = await authClient.twoFactor.verifyTotp({
      code: totpCode,
    });
    if (err) {
      setError(err.message ?? "Code verification failed.");
      return;
    }
    setError(null);
    setMfaEnrolled(true);
    setTotpUri(null);
    setTotpCode("");
    setMfaPassword("");
    setNotice("Two-factor authentication is now enabled on your account.");
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-primary/35 bg-primary/10 px-4 py-3 text-sm text-white/90"
        >
          {notice}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgeCent className="h-5 w-5 text-primary" aria-hidden="true" />
            Credits
          </CardTitle>
          <CardDescription>
            How billing works today: credits are granted at sign-up and by
            staff; every job type has a published cost; jobs that end without
            delivering work are refunded automatically. No payment provider is
            integrated in this phase — the{" "}
            <Link href="/refunds" className="text-primary underline">
              Refund Policy
            </Link>{" "}
            describes the system as it actually is.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {credits ? (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums">
                  {credits.balance}
                </span>
                <span className="text-sm text-muted-foreground">
                  credits available
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Job costs</h3>
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {Object.entries(credits.costs).map(([type, cost]) => (
                    <li
                      key={type}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5"
                    >
                      <code className="text-xs">{type}</code>
                      <span className="tabular-nums">
                        {cost === 0 ? "free" : `${cost} credits`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Recent activity</h3>
                {credits.history.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No credit movements yet.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y rounded-md border">
                    {credits.history.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">
                            {h.kind === "SIGNUP_BONUS"
                              ? "Welcome credits"
                              : h.kind === "ADMIN_GRANT"
                                ? "Granted by staff"
                                : h.kind === "JOB_SPEND"
                                  ? "Job submitted"
                                  : "Refund — work not delivered"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString()}
                            {h.reason ? ` · ${h.reason}` : ""}
                          </div>
                        </div>
                        <span
                          className={`tabular-nums font-semibold ${
                            h.delta > 0 ? "text-primary" : "text-white/90"
                          }`}
                        >
                          {h.delta > 0 ? `+${h.delta}` : h.delta}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Loading your credit balance…
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
            Security
          </CardTitle>
          <CardDescription>
            Two-factor authentication (TOTP). Required for staff roles —
            recommended for everyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {mfaEnrolled ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="status">
                Enabled
              </Badge>
              <span className="text-muted-foreground">
                Your account requires an authenticator code at sign-in.
              </span>
            </div>
          ) : totpUri ? (
            <div className="space-y-3">
              <p className="text-sm">
                Scan this secret with your authenticator app (or paste it
                manually), then enter the 6-digit code to finish:
              </p>
              <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">
                {totpUri}
              </code>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="123456"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  aria-label="Authenticator code"
                />
                <Button onClick={verifyMfa} disabled={totpCode.length < 6}>
                  Verify &amp; enable
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Confirm your password to start"
                value={mfaPassword}
                onChange={(e) => setMfaPassword(e.target.value)}
                aria-label="Password"
              />
              <Button onClick={startMfa} disabled={!mfaPassword}>
                Start enrollment
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" aria-hidden="true" />
            Privacy
          </CardTitle>
          <CardDescription>
            Your data, your call. The{" "}
            <Link href="/privacy" className="text-primary underline">
              Privacy Policy
            </Link>{" "}
            shows the complete data inventory this platform holds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={exportData} disabled={exporting}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {exporting ? "Preparing…" : "Export my data (JSON)"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Rate-limited (3 per hour). Security secrets are never included.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            Delete account
          </CardTitle>
          <CardDescription>
            Real and final: your profile, characters, media (including stored
            objects), sessions, jobs, and credit history are deleted. Abuse
            reports and audit entries survive de-linked for accountability —
            the Privacy Policy explains exactly what outlives the account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isStaff ? (
            <div role="note" className="flex items-start gap-2 text-sm">
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>
                Staff accounts cannot be self-deleted. Contact platform
                administration to offboard.
              </span>
            </div>
          ) : (
            <>
              <Input
                type="password"
                placeholder="Password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                aria-label="Password"
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder='Type "DELETE" to confirm'
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  aria-label="Type DELETE to confirm"
                  className="max-w-xs"
                />
                <Button
                  variant="destructive"
                  onClick={deleteAccount}
                  disabled={
                    deleting ||
                    !deletePassword ||
                    deleteConfirm !== "DELETE"
                  }
                >
                  {deleting ? "Deleting…" : "Delete my account"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This cannot be undone. Export your data first if you want a
                copy.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

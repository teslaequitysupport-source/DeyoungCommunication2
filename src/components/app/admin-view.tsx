"use client";

/**
 * Admin console (spec §26) — users, moderation queue, workers, audit trail
 * and the admin's own MFA enrollment. Every action goes through the
 * permission-checked, audited server APIs; this UI is convenience only and
 * never an authorization boundary. Read-only SUPPORT sees users; everything
 * else appears only when the server accepts the call.
 */

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Ban,
  FileSearch,
  KeyRound,
  LifeBuoy,
  ScrollText,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

interface AdminUserDetail {
  user: AdminUser;
  sessions: { id: string; createdAt: string; expiresAt: string; expired: boolean; ipAddress: string | null }[];
  usage: { characters: number; assets: number; jobs: number; reportsAgainst: number };
}

interface ReportRow {
  id: string;
  reason: string;
  targetType: string;
  targetId: string;
  status: string;
  details: string | null;
  decisionAction: string | null;
  decisionNotes: string | null;
  createdAt: string;
}

interface WorkerRow {
  id: string;
  name: string;
  provider: string;
  status: string;
  capabilities: string[];
  models: string[];
  activeJobs: number;
  errorCount: number;
  lastHeartbeatAt: string | null;
}

interface AuditRow {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: string;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "ACTIVE" ? "default"
    : status === "SUSPENDED" ? "secondary"
    : "destructive";
  return <Badge variant={variant === "default" ? "secondary" : variant} className={status === "ACTIVE" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : undefined}>{status}</Badge>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <Badge variant="outline" className={outcome === "DENIED" ? "border-amber-300 bg-amber-50 text-amber-800" : undefined}>
      {outcome}
    </Badge>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(path, init);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function AdminView({ selfRole, mfaEnabled }: { selfRole: string; mfaEnabled: boolean }) {
  const [section, setSection] = useState("users");
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);

  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [workers, setWorkers] = useState<WorkerRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);

  const [mfaPassword, setMfaPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [mfaEnrolled, setMfaEnrolled] = useState(mfaEnabled);

  const loadUsers = useCallback(async (q: string) => {
    const data = await api<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`);
    if (data) setUsers(data.users);
  }, []);

  const loadReports = useCallback(async () => {
    const data = await api<{ reports: ReportRow[] }>("/api/moderation/reports?status=OPEN");
    setReports(data ? data.reports : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [u, r, w, a] = await Promise.all([
        fetch("/api/admin/users?q=").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/moderation/reports?status=OPEN").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/admin/workers").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/admin/audit?limit=50").then((res) => (res.ok ? res.json() : null)),
      ]);
      if (cancelled) return;
      setUsers(u?.users ?? []);
      setReports(r?.reports ?? []);
      setWorkers(w?.workers ?? []);
      setAudit(a?.entries ?? []);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function inspect(id: string) {
    setDetail(await api<AdminUserDetail>(`/api/admin/users/${id}`));
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/admin/users/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, reason: "Admin console action" }),
    });
    if (!res.ok) {
      setError(((await res.json()) as { message?: string }).message ?? "Status change failed.");
      return;
    }
    setError(null);
    await loadUsers(query);
    await inspect(id);
  }

  async function setRole(id: string, role: string) {
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      setError(((await res.json()) as { message?: string }).message ?? "Role change failed.");
      return;
    }
    setError(null);
    await loadUsers(query);
    await inspect(id);
  }

  async function decide(reportId: string, outcome: "RESOLVED" | "DISMISSED", action: string) {
    const notes =
      outcome === "RESOLVED" && action !== "NONE"
        ? window.prompt("Decision documentation (required for enforcement):") ?? ""
        : "Reviewed from the admin console; no action warranted.";
    if (outcome === "RESOLVED" && action !== "NONE" && !notes.trim()) return;
    const res = await fetch(`/api/moderation/reports/${reportId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome, action, notes }),
    });
    if (!res.ok) {
      setError(((await res.json()) as { message?: string }).message ?? "Decision failed.");
      return;
    }
    setError(null);
    await loadReports();
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
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: totpCode });
    if (err) {
      setError(err.message ?? "Code verification failed.");
      return;
    }
    setError(null);
    setMfaEnrolled(true);
    setTotpUri(null);
    setTotpCode("");
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
          <TabsTrigger value="users" className="gap-2 py-2"><FileSearch className="h-4 w-4" aria-hidden="true" />Users</TabsTrigger>
          <TabsTrigger value="moderation" className="gap-2 py-2"><ShieldAlert className="h-4 w-4" aria-hidden="true" />Moderation</TabsTrigger>
          <TabsTrigger value="workers" className="gap-2 py-2"><LifeBuoy className="h-4 w-4" aria-hidden="true" />Workers</TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 py-2"><ScrollText className="h-4 w-4" aria-hidden="true" />Audit</TabsTrigger>
          <TabsTrigger value="security" className="gap-2 py-2"><KeyRound className="h-4 w-4" aria-hidden="true" />Security</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                Search accounts, inspect sessions and usage, change status and
                roles. Un-banning requires SUPER_ADMIN; role changes never
                apply to your own account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by email or name…"
                  aria-label="Search users"
                />
                <Button variant="outline" onClick={() => void loadUsers(query)}>Search</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(users ?? []).map((u) => (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <button className="text-left underline-offset-2 hover:underline" onClick={() => void inspect(u.id)}>
                            {u.email}
                          </button>
                        </td>
                        <td className="py-2 pr-4">{u.role}</td>
                        <td className="py-2 pr-4"><StatusBadge status={u.status} /></td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {u.status === "ACTIVE" && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => void setStatus(u.id, "SUSPENDED")}>Suspend</Button>
                                <Button size="sm" variant="destructive" onClick={() => void setStatus(u.id, "BANNED")}>Ban</Button>
                              </>
                            )}
                            {u.status === "SUSPENDED" && (
                              <Button size="sm" variant="outline" onClick={() => void setStatus(u.id, "ACTIVE")}><Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Restore</Button>
                            )}
                            {u.status === "BANNED" && selfRole === "SUPER_ADMIN" && (
                              <Button size="sm" variant="outline" onClick={() => void setStatus(u.id, "ACTIVE")}>Unban</Button>
                            )}
                            {selfRole === "SUPER_ADMIN" && ["USER", "MODERATOR", "SUPPORT", "ADMIN"].includes(u.role) && (
                              <select
                                className="rounded-md border bg-background px-2 py-1 text-xs"
                                aria-label={`Change role for ${u.email}`}
                                value=""
                                onChange={(e) => e.target.value && void setRole(u.id, e.target.value)}
                              >
                                <option value="">Role…</option>
                                <option value="USER">USER</option>
                                <option value="MODERATOR">MODERATOR</option>
                                <option value="SUPPORT">SUPPORT</option>
                                <option value="ADMIN">ADMIN</option>
                                {selfRole === "SUPER_ADMIN" && <option value="SUPER_ADMIN">SUPER_ADMIN</option>}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users?.length === 0 && (
                      <tr><td className="py-4 text-muted-foreground" colSpan={4}>No users match.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {detail && (
                <Card className="bg-muted/40">
                  <CardHeader>
                    <CardTitle className="text-base">Inspect: {detail.user.email}</CardTitle>
                    <CardDescription>
                      {detail.user.name} · role {detail.user.role} · joined {formatDate(detail.user.createdAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
                    <div>
                      <p className="font-medium">Sessions ({detail.sessions.length})</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {detail.sessions.map((s) => (
                          <li key={s.id}>
                            {s.expired ? "(expired) " : ""}{formatDate(s.createdAt)} → {formatDate(s.expiresAt)}
                          </li>
                        ))}
                        {detail.sessions.length === 0 && <li>No active sessions.</li>}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium">Usage</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        <li>Characters: {detail.usage.characters}</li>
                        <li>Assets: {detail.usage.assets}</li>
                        <li>Jobs: {detail.usage.jobs}</li>
                        <li>Reports against: {detail.usage.reportsAgainst}</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="moderation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Moderation queue — OPEN</CardTitle>
              <CardDescription>
                Abuse reports (spec §33). Resolving with an action documents the
                decision and enforces it through the same audited path as admin
                user management.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(reports ?? []).map((r) => (
                <div key={r.id} className="rounded-md border p-4 text-sm space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{r.reason}</Badge>
                    <span className="text-muted-foreground">{r.targetType} · {r.targetId.slice(0, 8)}…</span>
                    <span className="text-muted-foreground ml-auto">{formatDate(r.createdAt)}</span>
                  </div>
                  {r.details && <p className="text-muted-foreground">{r.details}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => void decide(r.id, "RESOLVED", "BAN")}><Ban className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Resolve → Ban</Button>
                    <Button size="sm" variant="outline" onClick={() => void decide(r.id, "RESOLVED", "SUSPENSION")}>Resolve → Suspend</Button>
                    <Button size="sm" variant="outline" onClick={() => void decide(r.id, "RESOLVED", "CONTENT_REMOVAL")}>Resolve → Remove content</Button>
                    <Button size="sm" variant="outline" onClick={() => void decide(r.id, "RESOLVED", "NONE")}><BadgeCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Resolve, no action</Button>
                    <Button size="sm" variant="ghost" onClick={() => void decide(r.id, "DISMISSED", "NONE")}>Dismiss</Button>
                  </div>
                </div>
              ))}
              {reports?.length === 0 && <p className="text-muted-foreground">Queue is empty. Nothing open right now.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Worker fleet</CardTitle>
              <CardDescription>
                The registry as the control plane sees it (spec §26 WORKERS).
                Drain/shutdown live on the worker-control API.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Capabilities</th>
                    <th className="py-2 pr-4 font-medium">Active</th>
                    <th className="py-2 pr-4 font-medium">Errors</th>
                    <th className="py-2 pr-4 font-medium">Last heartbeat</th>
                  </tr>
                </thead>
                <tbody>
                  {(workers ?? []).map((w) => (
                    <tr key={w.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{w.name}</td>
                      <td className="py-2 pr-4">{w.provider}</td>
                      <td className="py-2 pr-4"><StatusBadge status={w.status} /></td>
                      <td className="py-2 pr-4">{w.capabilities.join(", ") || "—"}</td>
                      <td className="py-2 pr-4">{w.activeJobs}</td>
                      <td className="py-2 pr-4">{w.errorCount}</td>
                      <td className="py-2 pr-4">{formatDate(w.lastHeartbeatAt)}</td>
                    </tr>
                  ))}
                  {workers?.length === 0 && (
                    <tr><td className="py-4 text-muted-foreground" colSpan={7}>No workers registered.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
              <CardDescription>The latest 50 append-only entries.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Actor</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                    <th className="py-2 pr-4 font-medium">Target</th>
                    <th className="py-2 pr-4 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit ?? []).map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDate(a.createdAt)}</td>
                      <td className="py-2 pr-4">{a.actorEmail ?? "—"}{a.actorRole ? ` (${a.actorRole})` : ""}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{a.action}</td>
                      <td className="py-2 pr-4">{a.targetType ?? "—"}</td>
                      <td className="py-2 pr-4"><OutcomeBadge outcome={a.outcome} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Two-factor authentication</CardTitle>
              <CardDescription>
                MODERATOR, ADMIN and SUPER_ADMIN roles must hold a verified
                TOTP enrollment before using moderation or admin APIs (spec
                §26/§28). Read-only SUPPORT is exempt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Status:{" "}
                {mfaEnrolled ? (
                  <Badge variant="secondary" className="border-emerald-300 bg-emerald-50 text-emerald-800">Enabled</Badge>
                ) : (
                  <Badge variant="destructive">Not enrolled</Badge>
                )}
              </p>
              {!mfaEnrolled && !totpUri && (
                <div className="flex gap-2 max-w-md">
                  <Input
                    type="password"
                    value={mfaPassword}
                    onChange={(e) => setMfaPassword(e.target.value)}
                    placeholder="Confirm your password"
                    aria-label="Password to confirm MFA enrollment"
                  />
                  <Button onClick={() => void startMfa()}>Start enrollment</Button>
                </div>
              )}
              {totpUri && (
                <div className="space-y-2 max-w-md">
                  <p className="text-sm text-muted-foreground">
                    Open this enrollment URI in your authenticator app, then
                    enter the 6-digit code it shows.
                  </p>
                  <code className="block break-all rounded bg-muted p-2 text-xs">{totpUri}</code>
                  <div className="flex gap-2">
                    <Input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="123456"
                      inputMode="numeric"
                      aria-label="TOTP code"
                    />
                    <Button onClick={() => void verifyMfa()}>Verify</Button>
                  </div>
                </div>
              )}
              {mfaEnrolled && selfRole !== "USER" && (
                <p className="text-xs text-muted-foreground">
                  Disabling MFA will lock you out of admin surfaces until you
                  re-enroll.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

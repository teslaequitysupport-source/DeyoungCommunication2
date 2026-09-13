"use client";

/**
 * Overview — your studio at a glance. Every number is fetched live
 * from the platform; status is reported exactly as the system sees
 * it, in the language of the people using it.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Clapperboard, HardDrive, Images, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetRecord, CharacterRecord, JobView, SessionView } from "@/lib/types";

interface Props {
  refreshKey: number;
  onNavigate: (view: string) => void;
}

interface ComputeHealth {
  compute: {
    byStatus: Record<string, number>;
    wakePending: number;
  } | null;
}

export function OverviewView({ refreshKey, onNavigate }: Props) {
  const [characters, setCharacters] = useState<CharacterRecord[] | null>(null);
  const [assets, setAssets] = useState<AssetRecord[] | null>(null);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [compute, setCompute] = useState<ComputeHealth["compute"]>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [c, a, s, j, h] = await Promise.all([
          fetch("/api/characters").then((r) => r.json()),
          fetch("/api/assets").then((r) => r.json()),
          fetch("/api/sessions").then((r) => r.json()),
          fetch("/api/jobs").then((r) => r.json()),
          fetch("/api/health").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setCharacters(c.characters ?? []);
        setAssets(a.assets ?? []);
        setStorage(a.storage ?? null);
        setSessions(s.sessions ?? []);
        setJobs(j.jobs ?? []);
        setCompute(h.compute ?? null);
        setError(null);
      } catch {
        if (!cancelled) setError("We couldn't reach the platform just now.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const succeededJobs = jobs?.filter((j) => j.status === "SUCCEEDED").length ?? 0;

  const STATS = [
    {
      icon: Users,
      label: "Characters",
      value: characters === null ? "…" : characters.length,
      cta: "Create a character",
      view: "characters",
    },
    {
      icon: Images,
      label: "Media assets",
      value: assets === null ? "…" : assets.length,
      cta: "Manage media",
      view: "media",
    },
    {
      icon: Clapperboard,
      label: "Renders completed",
      value: jobs === null ? "…" : jobs.length === 0 ? "0" : `${succeededJobs}/${jobs.length}`,
      cta: "View renders",
      view: "jobs",
    },
    {
      icon: ShieldCheck,
      label: "Studio sessions",
      value: sessions === null ? "…" : sessions.length,
      cta: "Open live studio",
      view: "studio",
    },
  ];

  // Render capacity, translated for people — not for the runbook.
  const capacity =
    compute === null
      ? { tone: "pending" as const, text: "Checking render capacity…" }
      : Object.keys(compute.byStatus).length === 0
        ? { tone: "quiet" as const, text: "Render capacity registers when a session needs it." }
        : (compute.byStatus["UNHEALTHY"] ?? 0) > 0
          ? { tone: "attention" as const, text: "Some render capacity is recovering — live sessions may take a moment longer to start." }
          : compute.wakePending > 0
            ? { tone: "warm" as const, text: "Warming up render capacity for your next session…" }
            : { tone: "ready" as const, text: "All systems operational." };

  return (
    <div className="space-y-8">
      <section aria-label="Your studio" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map(({ icon: Icon, label, value, cta, view }) => (
          <Card key={label} interactive className="h-full gap-4 py-5">
            <CardHeader className="px-5 pb-0">
              <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/45">
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                {label}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
            </CardHeader>
            <CardContent className="px-5">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-sm text-white/55 hover:text-white"
                onClick={() => onNavigate(view)}
              >
                {cta} <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="relative flex size-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  capacity.tone === "attention"
                    ? "bg-destructive"
                    : capacity.tone === "warm"
                      ? "bg-primary"
                      : capacity.tone === "ready"
                        ? "bg-white"
                        : "bg-white/40"
                }`}
              />
              <span
                className={`relative inline-flex size-2.5 rounded-full ${
                  capacity.tone === "attention"
                    ? "bg-destructive"
                    : capacity.tone === "warm"
                      ? "bg-primary"
                      : capacity.tone === "ready"
                        ? "bg-white"
                        : "bg-white/40"
                }`}
              />
            </span>
            Platform status
          </CardTitle>
          <CardDescription>{capacity.text}</CardDescription>
        </CardHeader>
        {compute && Object.keys(compute.byStatus).length > 0 ? (
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(compute.byStatus)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([status, count]) => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70"
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        status === "UNHEALTHY"
                          ? "bg-destructive"
                          : status === "SLEEPING"
                            ? "bg-white/40"
                            : "bg-white"
                      }`}
                      aria-hidden="true"
                    />
                    {status === "SLEEPING"
                      ? "Idle"
                      : status === "UNHEALTHY"
                        ? "Recovering"
                        : status === "IDLE"
                          ? "Ready"
                          : status === "BUSY"
                            ? "Rendering"
                            : status}
                    <span className="tabular-nums text-white/40">×{count}</span>
                  </span>
                ))}
            </div>
          </CardContent>
        ) : null}
        {error ? (
          <CardContent>
            <p role="alert" className="text-sm text-primary">
              {error}
            </p>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your studio, your rules</CardTitle>
          <CardDescription>
            Every render is priced before it runs and refunded automatically
            if it can't be delivered. Your media stays yours — export or
            delete it any time from Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/55">
          <span className="inline-flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" aria-hidden="true" />
            Storage: {storage ?? "…"}
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Consent enforced on every session
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

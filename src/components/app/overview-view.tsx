"use client";

/**
 * Overview — counts from real APIs, phase status in the honest vocabulary.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Database, HardDrive, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetRecord, CharacterRecord, JobView, SessionView } from "@/lib/types";

interface Props {
  refreshKey: number;
  onNavigate: (view: string) => void;
}

export function OverviewView({ refreshKey, onNavigate }: Props) {
  const [characters, setCharacters] = useState<CharacterRecord[] | null>(null);
  const [assets, setAssets] = useState<AssetRecord[] | null>(null);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [c, a, s, j] = await Promise.all([
          fetch("/api/characters").then((r) => r.json()),
          fetch("/api/assets").then((r) => r.json()),
          fetch("/api/sessions").then((r) => r.json()),
          fetch("/api/jobs").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setCharacters(c.characters ?? []);
        setAssets(a.assets ?? []);
        setStorage(a.storage ?? null);
        setSessions(s.sessions ?? []);
        setJobs(j.jobs ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError("The backend is not reachable right now.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const activeConsentCount = sessions?.length ?? 0;
  const succeededJobs = jobs?.filter((j) => j.status === "SUCCEEDED").length ?? 0;

  return (
    <div className="space-y-6">
      <section aria-label="Your platform" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Database className="h-4 w-4" aria-hidden="true" /> Characters
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {characters === null ? "…" : characters.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-sm text-muted-foreground"
              onClick={() => onNavigate("characters")}
            >
              Create a character <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" aria-hidden="true" /> Media assets
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {assets === null ? "…" : assets.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Storage: {storage ?? "…"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Workflow className="h-4 w-4" aria-hidden="true" /> Jobs completed
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {jobs === null ? "…" : `${succeededJobs}/${jobs.length}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-sm text-muted-foreground"
              onClick={() => onNavigate("jobs")}
            >
              View job records <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Live sessions
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {sessions === null ? "…" : activeConsentCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-sm text-muted-foreground"
              onClick={() => onNavigate("studio")}
            >
              Open live studio <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What works in this phase</CardTitle>
          <CardDescription>
            The vertical slice: real accounts, characters, validated uploads,
            consent records, a durable job queue, authenticated workers, live
            sessions over the media relay, and saved outputs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 text-sm">
            <li className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">TESTED</Badge>
              auth, RBAC, job queue, worker protocol (65 automated tests)
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">TESTED</Badge>
              E2E journey: signup → upload → consent → session → save result
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">DEV TRANSPORT</Badge>
              live frames over the socket.io relay (WebRTC/LiveKit at deploy)
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">REQUIRES CREDENTIAL</Badge>
              Cloudflare R2 uploads (running on the local-dev object store)
            </li>
          </ul>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

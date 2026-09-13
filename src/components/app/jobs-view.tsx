"use client";

/**
 * Jobs — the durable record of every async task (spec §13). Read-only;
 * creation happens from the Media view (batch) or Live Studio (live).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobView } from "@/lib/types";

interface Props {
  refreshKey: number;
  onChanged: () => void;
  onNavigate: (view: string) => void;
}

const STATUS_STYLES: Record<string, string | undefined> = {
  SUCCEEDED: "border-white/15 bg-white/[0.06] text-white/90",
  FAILED: "border-destructive/50 bg-destructive/15 text-[oklch(0.75_0.16_24)]",
  RUNNING: "border-primary/45 bg-primary/12 text-primary",
  RESERVED: "border-white/10 bg-white/[0.03] text-white/60",
  EXPIRED: "border-white/10 bg-white/[0.03] text-white/45",
  CANCELLED: undefined,
};

export function JobsView({ refreshKey, onChanged, onNavigate }: Props) {
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load jobs");
      if (!mounted.current) return;
      setJobs(data.jobs);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => void reload(), 2_000);
    return () => clearInterval(interval);
  }, [autoRefresh, reload]);

  const activeCount = (jobs ?? []).filter((j) =>
    ["QUEUED", "RESERVED", "RUNNING"].includes(j.status),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Jobs</h2>
        {jobs !== null ? (
          <Badge variant="outline">
            {activeCount} active · {jobs.length} total
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4"
            />
            auto-refresh (2s)
          </label>
        </div>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Every render is tracked from the moment you start it to the moment
        it's delivered — safely resumable, never billed twice. Renders are
        started from the Live Studio (live sessions) and the Media view
        (image transformations).
      </p>

      {error ? (
        <p role="alert" className="text-sm text-[oklch(0.78_0.15_24)]">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job records</CardTitle>
          <CardDescription>
            {jobs === null
              ? "Loading…"
              : jobs.length === 0
                ? "No jobs yet — start a live session or transform an image from the Media view."
                : "Latest 50 jobs"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobs !== null && jobs.length > 0 ? (
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead scope="col">Type</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Retries</TableHead>
                    <TableHead scope="col">Created</TableHead>
                    <TableHead scope="col">Started</TableHead>
                    <TableHead scope="col">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">{job.type}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={STATUS_STYLES[job.status]}
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{job.retryCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {job.startedAt
                          ? new Date(job.startedAt).toLocaleTimeString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {job.completedAt
                          ? new Date(job.completedAt).toLocaleTimeString()
                          : job.status === "FAILED" ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-label="in progress" />
                            ) : (
                              "—"
                            )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : jobs === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
            </p>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onNavigate("media")}>
              Transform an image to create your first job
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

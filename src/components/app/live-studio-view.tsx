"use client";

/**
 * Live Studio — the real-time vertical slice.
 *
 * What is REAL here: getUserMedia capture, frame streaming over the media
 * relay (socket.io dev transport), worker-processed frames rendered to the
 * output canvas, session status strictly from backend events, worker stats
 * (fps/latency), and a browser-encoded recording saved through the same
 * validated upload pipeline. The output canvas fullscreen mode with wake
 * lock is the Phase-4 phone-to-phone adapter groundwork (spec §17).
 *
 * If the camera is unavailable, we say so — and point at the honest
 * alternative: the batch image transform (same worker pipeline).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  AlertCircle,
  Camera,
  Circle,
  Expand,
  FlipHorizontal2,
  Loader2,
  Maximize2,
  Radio,
  Square,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  CharacterRecord,
  ConsentRecord,
  SessionStateEvent,
  SessionView,
  WorkerStats,
} from "@/lib/types";
import { stateLabel } from "@/lib/types";

interface Props {
  onChanged: () => void;
  onNavigate: (view: string) => void;
}

interface StatusEntry {
  status: string;
  at: number;
}

const CAPTURE_INTERVAL_MS = 125; // ~8 fps in
const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];

export function LiveStudioView({ onChanged, onNavigate }: Props) {
  const [characters, setCharacters] = useState<CharacterRecord[] | null>(null);
  const [consentGranted, setConsentGranted] = useState<boolean | null>(null);
  const [characterId, setCharacterId] = useState<string>("");
  const [session, setSession] = useState<SessionView | null>(null);
  const [statusLog, setStatusLog] = useState<StatusEntry[]>([]);
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [relayState, setRelayState] = useState<"idle" | "connecting" | "connected" | "offline">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [savedRecording, setSavedRecording] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [mirror, setMirror] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const captureTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameInFlight = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const sessionRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Load gate data (characters + consent).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [c, cons] = await Promise.all([
        fetch("/api/characters").then((r) => r.json()),
        fetch("/api/consent?purpose=camera.transform.live").then((r) => r.json()),
      ]);
      if (cancelled) return;
      const chars: CharacterRecord[] = c.characters ?? [];
      setCharacters(chars);
      const active = chars.find((ch) => ch.status === "ACTIVE");
      if (active) setCharacterId(active.id);
      const records: ConsentRecord[] = cons.consents ?? [];
      setConsentGranted(
        records.some((r) => r.status === "GRANTED"),
      );
    }
    void load().catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const teardown = useCallback(() => {
    if (captureTimer.current) clearInterval(captureTimer.current);
    captureTimer.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    frameInFlight.current = false;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    setRelayState("idle");
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const appendStatus = useCallback((status: string) => {
    setStatusLog((log) => {
      if (log.length && log[log.length - 1].status === status) return log;
      return [...log, { status, at: Date.now() }];
    });
  }, []);

  function drawFrameToCanvases(bitmap: ImageBitmap | HTMLImageElement) {
    for (const canvas of [outputCanvasRef.current, fullscreenCanvasRef.current]) {
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const w = "width" in bitmap ? bitmap.width : 320;
      const h = "height" in bitmap ? bitmap.height : 240;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.save();
      if (canvas === fullscreenCanvasRef.current && mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(bitmap, 0, 0);
      ctx.restore();
    }
  }

  useEffect(() => {
    if (sessionRef.current === null) return;
    if (relayState === "connected") return; // relay events are authoritative
    // REST fallback: the relay is unreachable from this context (e.g. the
    // page is not being served through the gateway) — poll the backend so
    // the session state shown is still real, never stale.
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        const current = (data.sessions ?? []).find(
          (s: { id: string }) => s.id === sessionRef.current,
        );
        if (current) {
          appendStatus(current.status);
          if (TERMINAL.includes(current.status)) {
            onChanged();
          }
        }
      } catch {
        // backend unreachable — the next poll will retry
      }
    }, 2_000);
    return () => clearInterval(interval);
  }, [relayState, appendStatus, onChanged]);

  async function startSession() {
    setError(null);
    setSavedRecording(null);
    setStatusLog([]);
    setStats(null);
    if (!characterId) {
      setError("Create and select a character first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "consent_required") {
          setConsentGranted(false);
          setError("Camera-transform consent is required before starting.");
        } else {
          setError(data.message ?? "Session could not be created.");
        }
        return;
      }
      const created: SessionView = data.session;
      setSession(created);
      sessionRef.current = created.id;
      appendStatus(created.status);

      // Camera first — honest failure if unavailable.
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        streamRef.current = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          await videoRef.current.play();
        }
        setCameraError(null);
      } catch (e) {
        setCameraError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access, or use the batch image transform instead (Media view → Transform)."
            : "No camera is available in this browser context. The session will keep its real state, but frames cannot flow without a camera — use the batch image transform (Media view) to exercise the same worker pipeline.",
        );
      }

      // Media relay ticket + connection.
      setRelayState("connecting");
      const ticketRes = await fetch("/api/realtime/ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: created.id }),
      });
      const ticketData = await ticketRes.json();
      if (!ticketRes.ok) throw new Error(ticketData.message ?? "No realtime ticket");

      const socket = io("/?XTransformPort=3031", {
        transports: ["websocket", "polling"],
        auth: { ticket: ticketData.ticket },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1500,
      });
      socketRef.current = socket;

      socket.on("connect", () => setRelayState("connected"));
      socket.on("disconnect", () => setRelayState("offline"));
      socket.on("connect_error", () => setRelayState("offline"));

      socket.on("session-state", (update: SessionStateEvent) => {
        if (update.status) {
          appendStatus(update.status);
          setSession((prev) =>
            prev && prev.id === created.id
              ? { ...prev, status: update.status! }
              : prev,
          );
        }
        if (update.status && TERMINAL.includes(update.status)) {
          stopRecordingAndSave(created.id);
          teardown();
          onChanged();
        }
      });

      socket.on("stats", (s: WorkerStats) => setStats(s));

      socket.on("frame", async (frame: ArrayBuffer) => {
        try {
          const bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
          drawFrameToCanvases(bitmap);
          bitmap.close();
          frameInFlight.current = false;
        } catch {
          frameInFlight.current = false;
        }
      });

      // Capture loop — skip a frame while the previous one is still being
      // processed (real backpressure, not a fake fps).
      captureTimer.current = setInterval(() => {
        const video = videoRef.current;
        const canvas = captureCanvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;
        if (frameInFlight.current) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return;
            frameInFlight.current = true;
            socket.emit("frame", blob);
          },
          "image/jpeg",
          0.7,
        );
      }, CAPTURE_INTERVAL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      teardown();
    } finally {
      setBusy(false);
    }
  }

  async function stopSession() {
    const id = sessionRef.current;
    if (!id) return;
    setBusy(true);
    try {
      await stopRecordingAndSave(id);
      const res = await fetch(`/api/sessions/${id}/stop`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Stop failed");
      }
      const data = await res.json();
      setSession(data.session);
      appendStatus(data.session.status);
      if (TERMINAL.includes(data.session.status)) {
        teardown();
        onChanged();
      }
      // STOPPING → the worker finalizes → relay event COMPLETED → teardown.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startRecording() {
    const canvas = outputCanvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined") return;
    try {
      const stream = canvas.captureStream(10);
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recordedChunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.current.push(e.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Recording is not supported in this browser.");
    }
  }

  async function stopRecordingAndSave(sessionId: string) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    recorderRef.current = null;
    setRecording(false);
    const blob = new Blob(recordedChunks.current, { type: recorder.mimeType });
    if (blob.size === 0) return;
    try {
      const presign = await fetch("/api/assets/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "RENDER_OUTPUT",
          mimeType: "video/webm",
          sizeBytes: blob.size,
        }),
      });
      const directive = await presign.json();
      if (!presign.ok) throw new Error(directive.message ?? "Presign failed");
      const put = await fetch(directive.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "video/webm" },
        body: blob,
      });
      if (!put.ok) {
        const detail = await put.json().catch(() => ({}));
        throw new Error(detail.message ?? "Recording upload rejected");
      }
      setSavedRecording("Recording saved to your media library.");
      onChanged();
    } catch (e) {
      setError(`Recording could not be saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function enterFullscreen() {
    setFullscreen(true);
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // Wake lock is best-effort; the fullscreen output still works.
    }
  }

  function exitFullscreen() {
    setFullscreen(false);
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }

  const active = session && !TERMINAL.includes(session.status) ? session : null;
  const canStart = !active && !busy && consentGranted === true && Boolean(characterId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Live Studio</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Your camera frames stream through the media relay to an assigned
          worker, which applies the character&apos;s color grade and returns
          the transformed frames. Status below is backend truth — including
          cold-start waits while a worker claims the job.
        </p>
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {cameraError && active ? (
        <div role="status" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Camera className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{cameraError}</span>
        </div>
      ) : null}

      {consentGranted === false ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm">
              Camera-transform consent is required before a live session can
              start.
            </p>
            <Button size="sm" onClick={() => onNavigate("media")}>
              Go to consent
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Control column */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session</CardTitle>
              <CardDescription>
                Pick the character whose appearance config the worker applies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="studio-character">Character</Label>
                <Select
                  value={characterId}
                  onValueChange={setCharacterId}
                  disabled={Boolean(active) || busy}
                >
                  <SelectTrigger id="studio-character">
                    <SelectValue placeholder="Select a character" />
                  </SelectTrigger>
                  <SelectContent>
                    {(characters ?? [])
                      .filter((c) => c.status === "ACTIVE")
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2">
                {!active ? (
                  <Button onClick={startSession} disabled={!canStart}>
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Video className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Start live session
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={stopSession} disabled={busy}>
                      <Square className="mr-2 h-4 w-4" aria-hidden="true" />
                      Stop &amp; save
                    </Button>
                    {recording ? (
                      <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800 gap-1">
                        <Circle className="h-3 w-3 fill-current" aria-hidden="true" />
                        recording
                      </Badge>
                    ) : (
                      <Button variant="outline" onClick={startRecording}>
                        <Circle className="mr-2 h-4 w-4" aria-hidden="true" />
                        Record output
                      </Button>
                    )}
                    <Button variant="outline" onClick={enterFullscreen}>
                      <Maximize2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Fullscreen output
                    </Button>
                  </>
                )}
              </div>

              {savedRecording ? (
                <p className="text-sm text-emerald-700">{savedRecording}</p>
              ) : null}
            </CardContent>
          </Card>

          {/* Status timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Session status (backend truth)</CardTitle>
              <CardDescription>
                Relay:{" "}
                {relayState === "connected" ? (
                  <span className="text-emerald-700">connected</span>
                ) : relayState === "offline" ? (
                  <span className="text-amber-700">offline — reconnecting</span>
                ) : (
                  relayState
                )}
                {active ? ` · session ${active.status}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statusLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No session yet. States appear here exactly as the backend
                  reports them.
                </p>
              ) : (
                <ol className="space-y-1.5 max-h-64 overflow-y-auto text-sm">
                  {statusLog.map((entry, i) => (
                    <li key={`${entry.status}-${entry.at}`} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${
                          i === statusLog.length - 1 ? "bg-emerald-600" : "bg-muted-foreground/40"
                        }`}
                      />
                      <span className="font-medium">{stateLabel(entry.status)}</span>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {new Date(entry.at).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Worker stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Worker throughput (reported)</CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">frames in / out</dt>
                    <dd className="tabular-nums">{stats.framesIn} / {stats.framesOut}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">fps in / out</dt>
                    <dd className="tabular-nums">{stats.fpsIn} / {stats.fpsOut}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">transform time (EMA)</dt>
                    <dd className="tabular-nums">{stats.transformMs} ms</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">unparseable frames</dt>
                    <dd className="tabular-nums">{stats.framesCorrupt}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Stats arrive from the worker every 2 s while a live session runs.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Video column */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Camera in → transformed out</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <figure className="space-y-1">
                <figcaption className="text-xs text-muted-foreground flex items-center gap-1">
                  <Camera className="h-3 w-3" aria-hidden="true" /> your camera
                </figcaption>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="w-full aspect-video rounded-md bg-black object-cover"
                  aria-label="Your camera preview"
                />
              </figure>
              <figure className="space-y-1">
                <figcaption className="text-xs text-muted-foreground flex items-center gap-1">
                  <Radio className="h-3 w-3" aria-hidden="true" /> worker output
                </figcaption>
                <canvas
                  ref={outputCanvasRef}
                  className="w-full aspect-video rounded-md bg-black object-contain"
                  aria-label="Transformed output from the worker"
                />
              </figure>
            </div>
            <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              Dev transport: socket.io relay (browser → worker → browser).
              Production swaps the same interface to LiveKit WebRTC — a
              deployment configuration change, not an application rewrite.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fullscreen output (phone-to-phone groundwork, spec §17) */}
      {fullscreen ? (
        <div
          role="dialog"
          aria-label="Fullscreen transformed output"
          className="fixed inset-0 z-50 bg-black flex flex-col"
        >
          <div className="flex-1 flex items-center justify-center p-2">
            <canvas
              ref={fullscreenCanvasRef}
              className="max-h-full max-w-full object-contain"
              aria-label="Fullscreen transformed output"
            />
          </div>
          <div className="flex items-center justify-center gap-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 bg-black/60">
            <label className="flex items-center gap-2 text-sm text-white">
              <Switch
                checked={mirror}
                onCheckedChange={setMirror}
                aria-label="Mirror output"
              />
              <FlipHorizontal2 className="h-4 w-4" aria-hidden="true" />
            </label>
            <Button variant="secondary" size="sm" onClick={exitFullscreen}>
              <Expand className="mr-2 h-4 w-4" aria-hidden="true" />
              Exit fullscreen
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

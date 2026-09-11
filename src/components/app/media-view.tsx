"use client";

/**
 * Media & Consent — validated uploads (presign → PUT), the asset library,
 * and the consent records that gate processing. Withdrawal is immediate
 * and blocks new sessions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  ShieldCheck,
  Upload,
  Wand2,
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
import type {
  AssetRecord,
  CharacterRecord,
  ConsentPurposeInfo,
  ConsentRecord,
} from "@/lib/types";

interface Props {
  onChanged: () => void;
  onNavigate: (view: string) => void;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function MediaView({ onChanged, onNavigate }: Props) {
  const [assets, setAssets] = useState<AssetRecord[] | null>(null);
  const [consents, setConsents] = useState<ConsentRecord[] | null>(null);
  const [purposes, setPurposes] = useState<ConsentPurposeInfo[] | null>(null);
  const [characters, setCharacters] = useState<CharacterRecord[] | null>(null);
  const [uploadCharacter, setUploadCharacter] = useState<string>("none");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyConsent, setBusyConsent] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const [a, c, ch] = await Promise.all([
        fetch("/api/assets").then((r) => r.json()),
        fetch("/api/consent").then((r) => r.json()),
        fetch("/api/characters").then((r) => r.json()),
      ]);
      setAssets(a.assets ?? []);
      setConsents(c.consents ?? []);
      setPurposes(c.purposes ?? []);
      setCharacters(ch.characters ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image exceeds the 10 MB limit for face images.");
      return;
    }
    const mime = file.type || "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      setError("Face images must be JPEG, PNG, or WebP.");
      return;
    }
    setUploading(true);
    try {
      const presignRes = await fetch("/api/assets/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "FACE_IMAGE",
          mimeType: mime,
          sizeBytes: file.size,
          characterId: uploadCharacter === "none" ? undefined : uploadCharacter,
        }),
      });
      const directive = await presignRes.json();
      if (!presignRes.ok) throw new Error(directive.message ?? "Presign failed");

      const put = await fetch(directive.uploadUrl, {
        method: "PUT",
        headers: { "content-type": mime },
        body: file,
      });
      if (!put.ok) {
        const detail = await put.json().catch(() => ({}));
        throw new Error(detail.message ?? "Upload rejected");
      }
      if (fileInput.current) fileInput.current.value = "";
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function transformAsset(asset: AssetRecord) {
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetId: asset.id,
          characterId: asset.characterId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Job creation failed");
      onNavigate("jobs");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function grant(purpose: string) {
    setBusyConsent(purpose);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Grant failed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyConsent(null);
    }
  }

  async function withdraw(consent: ConsentRecord) {
    setBusyConsent(consent.purpose);
    try {
      const res = await fetch("/api/consent/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId: consent.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Withdraw failed");
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyConsent(null);
    }
  }

  const cameraConsent = consents?.find(
    (c) => c.purpose === "camera.transform.live",
  );
  const isImage = (a: AssetRecord) => a.mimeType.startsWith("image/");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Media & Consent</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Uploads are validated (declared type must match the file content) and
          stored in the active object store. Processing only runs with the
          matching consent granted — withdrawal takes effect immediately.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Upload */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" aria-hidden="true" /> Upload a face image
            </CardTitle>
            <CardDescription>
              JPEG / PNG / WebP, up to 10 MB. Optional: link to a character.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="upload-character">Link to character</Label>
              <Select value={uploadCharacter} onValueChange={setUploadCharacter}>
                <SelectTrigger id="upload-character">
                  <SelectValue placeholder="No character" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No character</SelectItem>
                  {(characters ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <input
                ref={fileInput}
                id="face-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button
                className="w-full"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                    Choose image
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Consent */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Consent records
            </CardTitle>
            <CardDescription>
              Purpose-scoped and withdrawable — not a generic terms checkbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(purposes ?? []).map((p) => {
              const active = consents?.find(
                (c) => c.purpose === p.purpose && c.status === "GRANTED",
              );
              return (
                <div key={p.purpose} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{p.label}</p>
                    {active ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                        granted {new Date(active.grantedAt).toLocaleDateString()}
                      </Badge>
                    ) : (
                      <Badge variant="outline">not granted</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                  <div className="flex items-center gap-2 pt-1">
                    {!active ? (
                      <Button
                        size="sm"
                        onClick={() => grant(p.purpose)}
                        disabled={busyConsent === p.purpose}
                      >
                        {busyConsent === p.purpose ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : null}
                        Grant
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => withdraw(active)}
                        disabled={busyConsent === p.purpose}
                      >
                        {busyConsent === p.purpose ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        Withdraw
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      policy {active?.policyVersion ?? "—"}
                    </span>
                  </div>
                </div>
              );
            })}
            {purposes === null ? (
              <p className="text-sm text-muted-foreground">Loading consent purposes…</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Asset library */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset library</CardTitle>
          <CardDescription>
            {assets === null ? "Loading…" : `${assets.length} assets — served after an ownership check`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assets !== null && assets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nothing uploaded yet. Face images you upload and worker render
              outputs appear here.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(assets ?? []).map((asset) => (
                <div key={asset.id} className="rounded-lg border overflow-hidden bg-card">
                  {isImage(asset) ? (
                    <img
                      src={`/api/assets/${asset.id}/file`}
                      alt={`${asset.kind} asset (${asset.mimeType})`}
                      className="aspect-video w-full object-cover bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="aspect-video w-full flex items-center justify-center bg-muted">
                      <Film className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{asset.kind}</Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {(asset.sizeBytes / 1024).toFixed(0)} KB
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <a href={`/api/assets/${asset.id}/file?download=1`} download>
                          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                          Download
                        </a>
                      </Button>
                      {isImage(asset) && asset.kind === "FACE_IMAGE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => transformAsset(asset)}
                        >
                          <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Transform
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                      {new Date(asset.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

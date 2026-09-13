"use client";

/**
 * Characters — create, edit, archive, delete. Every action hits the real
 * API and re-reads the real list. The appearance sliders drive the actual
 * transform config the worker applies (hue/saturation/vignette).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CharacterRecord } from "@/lib/types";

interface Props {
  onChanged: () => void;
}

interface Draft {
  name: string;
  style: string;
  hue: number;
  saturation: number;
  vignette: boolean;
}

const DEFAULT_DRAFT: Draft = {
  name: "",
  style: "",
  hue: 210,
  saturation: 1.15,
  vignette: true,
};

export function CharactersView({ onChanged }: Props) {
  const [characters, setCharacters] = useState<CharacterRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/characters");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to load");
      if (!mounted.current) return;
      setCharacters(data.characters);
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
  }, [reload]);

  async function createCharacter() {
    if (!draft.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          style: draft.style.trim(),
          hue: draft.hue,
          saturation: Math.round(draft.saturation * 100) / 100,
          vignette: draft.vignette,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Creation failed");
      setDialogOpen(false);
      setDraft(DEFAULT_DRAFT);
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function removeCharacter(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/characters?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Delete failed");
      }
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function archiveToggle(character: CharacterRecord) {
    setBusyId(character.id);
    try {
      const next = character.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
      const res = await fetch("/api/characters", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: character.id, status: next }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? "Update failed");
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Characters</h2>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New character
        </Button>
      </div>
      <p className="text-sm text-muted-foreground max-w-3xl">
        A character carries the look you want on screen — a color grade
        (hue, saturation) and an optional vignette, applied to your live
        camera and image renders. More appearance powers arrive as they
        clear our quality bar.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-white/90">
          {error}
        </p>
      ) : null}

      {characters === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : characters.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No characters yet — create the first one to start transforming.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-block h-10 w-10 rounded-full border"
                      style={{
                        background: `hsl(${c.appearanceConfig?.hue ?? 210} 60% 55%)`,
                      }}
                    />
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        hue {String(c.appearanceConfig?.hue ?? "—")} · sat{" "}
                        {String(c.appearanceConfig?.saturation ?? "—")}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      c.status === "ACTIVE"
                        ? "border-white/15 bg-white/[0.06] text-white/90"
                        : undefined
                    }
                  >
                    {c.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.appearanceConfig?.style ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {String(c.appearanceConfig.style)}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => archiveToggle(c)}
                    disabled={busyId === c.id}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {c.status === "ACTIVE" ? "Archive" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeCharacter(c.id)}
                    disabled={busyId === c.id}
                    className="text-white/90 hover:bg-primary/10"
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New character</DialogTitle>
            <DialogDescription>
              Set the look — it's applied to your camera and renders in
              real time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="char-name">Name</Label>
              <Input
                id="char-name"
                value={draft.name}
                maxLength={60}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Aurora"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="char-style">Notes (optional)</Label>
              <Textarea
                id="char-style"
                value={draft.style}
                maxLength={500}
                onChange={(e) => setDraft({ ...draft, style: e.target.value })}
                placeholder="Anything you want to remember about this character"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="char-hue">
                Hue: <span className="tabular-nums">{draft.hue}°</span>
              </Label>
              <Slider
                id="char-hue"
                min={0}
                max={360}
                step={1}
                value={[draft.hue]}
                onValueChange={([v]) => setDraft({ ...draft, hue: v })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="char-sat">
                Saturation: <span className="tabular-nums">{draft.saturation.toFixed(2)}</span>
              </Label>
              <Slider
                id="char-sat"
                min={0}
                max={3}
                step={0.05}
                value={[draft.saturation]}
                onValueChange={([v]) => setDraft({ ...draft, saturation: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="char-vig">Vignette</Label>
              <Switch
                id="char-vig"
                checked={draft.vignette}
                onCheckedChange={(v) => setDraft({ ...draft, vignette: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={createCharacter}
              disabled={creating || !draft.name.trim()}
            >
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Create character
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

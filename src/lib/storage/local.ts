/**
 * Local development object store — a real, honest storage backend for the
 * sandbox where no R2 credentials exist (declared in UI and docs as
 * "local-dev storage"; production switches to R2 via environment).
 *
 * - Objects live under <repo>/var/object-store/ (gitignored).
 * - Uploads arrive at PUT /api/assets/upload?ticket=… — the ticket plays
 *   the presigned-URL role: short-lived, scoped, signature-verified.
 * - Downloads are served by GET /api/assets/[id]/file after an ownership
 *   check, or with a short-lived download ticket for assigned workers.
 */

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import type {
  StorageAdapter,
  TicketPayload,
  UploadDirective,
  UploadTicketInput,
} from "@/lib/storage/types";
import { signTicket, verifyTicket } from "@/lib/storage/tickets";

const ROOT =
  process.env.STORAGE_LOCAL_ROOT ?? join(process.cwd(), "var", "object-store");

function safeKeyPath(key: string): string {
  const normalized = normalize(key).replace(/^([.][.][/\\])+/, "");
  const full = join(ROOT, normalized);
  if (!full.startsWith(ROOT)) {
    throw new Error("path traversal blocked");
  }
  return full;
}

export const LOCAL_UPLOAD_PATH = "/api/assets/upload";

export function createLocalStorage(): StorageAdapter {
  return {
    kind: "local-dev",

    async createUploadTicket(
      input: UploadTicketInput,
    ): Promise<UploadDirective> {
      const ttl = input.ttlSeconds ?? 900;
      const payload: TicketPayload = {
        a: input.assetId,
        u: input.userId,
        k: input.kind,
        m: input.mimeType,
        s: input.sizeBytes,
        c: input.characterId ?? null,
        e: Date.now() + ttl * 1000,
        mode: "server",
      };
      const ticket = signTicket(payload);
      return {
        mode: "server",
        uploadUrl: `${LOCAL_UPLOAD_PATH}?ticket=${encodeURIComponent(ticket)}`,
        ticket,
        expiresAt: new Date(payload.e).toISOString(),
      };
    },

    verifyTicket(ticket: string): TicketPayload | null {
      return verifyTicket(ticket);
    },

    async getObject(key: string): Promise<Uint8Array> {
      const bytes = await readFile(safeKeyPath(key));
      return new Uint8Array(bytes);
    },

    async peekObject(key: string, bytes: number): Promise<Uint8Array | null> {
      try {
        const all = await readFile(safeKeyPath(key));
        return new Uint8Array(all.subarray(0, bytes));
      } catch {
        return null;
      }
    },

    async headObject(key: string): Promise<{ size: number } | null> {
      try {
        const s = await stat(safeKeyPath(key));
        return { size: s.size };
      } catch {
        return null;
      }
    },

    async putObject(
      key: string,
      bytes: Uint8Array,
      _mimeType: string,
    ): Promise<void> {
      const path = safeKeyPath(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    },

    async deleteObject(key: string): Promise<void> {
      // Missing objects are fine — the metadata row may outlive the object.
      await rm(safeKeyPath(key), { force: true });
    },
  };
}

/**
 * Cloudflare R2 adapter — SigV4 presigned URLs via aws4fetch (verified
 * provider research; report Ch. 5/6).
 *
 * Status: IMPLEMENTED, PARTIALLY TESTED — unit tests verify the signing
 * shape and URL construction; live verification REQUIRES EXTERNAL
 * CREDENTIAL (R2_ACCESS_KEY_ID etc.), which this sandbox does not have.
 * The control plane never fakes a successful R2 interaction.
 */

import { AwsClient } from "aws4fetch";
import type {
  StorageAdapter,
  TicketPayload,
  UploadDirective,
  UploadTicketInput,
} from "@/lib/storage/types";
import { storageKeyFor, validateUploadDeclaration } from "@/lib/storage/kinds";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function r2ConfigFromEnv(): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    return null;
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  };
}

export function createR2Storage(config: R2Config): StorageAdapter {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const objectUrl = (key: string) =>
    new URL(
      `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    );

  return {
    kind: "r2",

    /** Presigned PUT — the browser uploads directly to R2. */
    async createUploadTicket(
      input: UploadTicketInput,
    ): Promise<UploadDirective> {
      const ttl = input.ttlSeconds ?? 900;
      const validation = validateUploadDeclaration(
        input.kind,
        input.mimeType,
        input.sizeBytes,
      );
      if (!validation.ok || !validation.extension) {
        throw new Error("invalid upload declaration");
      }
      const key = storageKeyFor({
        userId: input.userId,
        assetId: input.assetId,
        extension: validation.extension,
      });
      const request = new Request(objectUrl(key), { method: "PUT" });
      const signed = await client.sign(request, {
        aws: { signQuery: true },
      });
      const presigned = new URL(signed.url);
      presigned.searchParams.set("X-Amz-Expires", String(ttl));
      const payload: TicketPayload = {
        a: input.assetId,
        u: input.userId,
        k: input.kind,
        m: input.mimeType,
        s: input.sizeBytes,
        c: input.characterId ?? null,
        e: Date.now() + ttl * 1000,
        mode: "direct",
      };
      return {
        mode: "direct",
        uploadUrl: presigned.toString(),
        ticket: Buffer.from(JSON.stringify(payload)).toString("base64url"),
        expiresAt: new Date(payload.e).toISOString(),
      };
    },

    /** R2 tickets are metadata blobs verified by the confirm endpoint. */
    verifyTicket(ticket: string): TicketPayload | null {
      try {
        const payload = JSON.parse(
          Buffer.from(ticket, "base64url").toString("utf8"),
        ) as TicketPayload;
        if (payload.mode !== "direct") return null;
        if (typeof payload.e !== "number" || payload.e < Date.now()) return null;
        return payload;
      } catch {
        return null;
      }
    },

    async getObject(key: string): Promise<Uint8Array> {
      const signed = await client.sign(
        new Request(objectUrl(key), { method: "GET" }),
        { aws: { signQuery: true } },
      );
      const res = await fetch(signed.url);
      if (!res.ok) {
        throw new Error(`R2 GET failed: ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    },

    async peekObject(key: string, bytes: number): Promise<Uint8Array | null> {
      const signed = await client.sign(
        new Request(objectUrl(key), { method: "GET" }),
        { aws: { signQuery: true } },
      );
      const res = await fetch(signed.url, {
        headers: { Range: `bytes=0-${bytes - 1}` },
      });
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    },

    async headObject(key: string): Promise<{ size: number } | null> {
      const signed = await client.sign(new Request(objectUrl(key), { method: "HEAD" }), {
        aws: { signQuery: true },
      });
      const res = await fetch(signed.url);
      if (!res.ok) return null;
      const len = res.headers.get("content-length");
      return len ? { size: Number(len) } : null;
    },

    async putObject(
      key: string,
      bytes: Uint8Array,
      mimeType: string,
    ): Promise<void> {
      const signed = await client.sign(
        new Request(objectUrl(key), {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: bytes as unknown as BodyInit,
        }),
      );
      const res = await fetch(signed);
      if (!res.ok) {
        throw new Error(`R2 PUT failed: ${res.status}`);
      }
    },
  };
}

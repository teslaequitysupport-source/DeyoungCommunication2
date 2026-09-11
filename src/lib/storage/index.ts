/**
 * Storage plane entry — selects the adapter from the environment.
 *
 *   R2_* block present  → Cloudflare R2 (presigned direct uploads).
 *   otherwise           → local-dev object store (ticketed server uploads).
 *
 * The active mode is surfaced in the UI ("local-dev storage" badge) so
 * nothing about where media lives is misrepresented.
 */

import { createLocalStorage } from "@/lib/storage/local";
import { createR2Storage, r2ConfigFromEnv } from "@/lib/storage/r2";
import type { StorageAdapter } from "@/lib/storage/types";

export function createStorage(): StorageAdapter {
  const r2 = r2ConfigFromEnv();
  if (r2) return createR2Storage(r2);
  return createLocalStorage();
}

let singleton: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!singleton) singleton = createStorage();
  return singleton;
}

export function storageModeLabel(): string {
  return r2ConfigFromEnv() ? "Cloudflare R2" : "local-dev object store";
}

export * from "@/lib/storage/types";
export {
  ASSET_KINDS,
  isAssetKind,
  validateUploadDeclaration,
  sniffMime,
  declaredMatchesSniffed,
  storageKeyFor,
} from "@/lib/storage/kinds";

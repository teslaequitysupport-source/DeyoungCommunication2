/**
 * Asset kinds and the upload validation contract (spec §14: MIME
 * validation, file-size limits, extension validation).
 *
 * Magic-byte sniffing (not the client-declared MIME) decides whether a
 * payload is what it claims — a text file renamed to .png is rejected.
 */

export const ASSET_KINDS = [
  "FACE_IMAGE",
  "VOICE_SAMPLE",
  "VIDEO_CLIP",
  "RENDER_OUTPUT",
  "OTHER",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && (ASSET_KINDS as readonly string[]).includes(value);
}

interface KindRule {
  mimeTypes: readonly string[];
  maxBytes: number;
  /** Extension used for storage keys. */
  extensionFor: (mime: string) => string;
}

const imageExt = (mime: string) =>
  mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

const KIND_RULES: Record<AssetKind, KindRule> = {
  FACE_IMAGE: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 10 * 1024 * 1024,
    extensionFor: imageExt,
  },
  VOICE_SAMPLE: {
    mimeTypes: ["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4"],
    maxBytes: 50 * 1024 * 1024,
    extensionFor: (mime) =>
      mime === "audio/webm" ? "webm" : mime === "audio/wav" ? "wav" : mime === "audio/mpeg" ? "mp3" : "m4a",
  },
  VIDEO_CLIP: {
    mimeTypes: ["video/webm", "video/mp4", "video/quicktime"],
    maxBytes: 200 * 1024 * 1024,
    extensionFor: (mime) => (mime === "video/webm" ? "webm" : mime === "video/mp4" ? "mp4" : "mov"),
  },
  RENDER_OUTPUT: {
    mimeTypes: ["video/webm", "video/mp4", "image/jpeg", "image/png"],
    maxBytes: 200 * 1024 * 1024,
    extensionFor: (mime) =>
      mime.startsWith("image/") ? imageExt(mime) : mime === "video/mp4" ? "mp4" : "webm",
  },
  OTHER: {
    mimeTypes: ["application/pdf"],
    maxBytes: 20 * 1024 * 1024,
    extensionFor: () => "pdf",
  },
};

export type ValidationFailure =
  | "kind_unknown"
  | "mime_not_allowed"
  | "size_too_large"
  | "magic_bytes_mismatch";

export interface UploadValidation {
  ok: boolean;
  failure?: ValidationFailure;
  extension?: string;
}

export function validateUploadDeclaration(
  kind: AssetKind,
  mimeType: string,
  sizeBytes: number,
): UploadValidation {
  const rule = KIND_RULES[kind];
  if (!rule) return { ok: false, failure: "kind_unknown" };
  if (!rule.mimeTypes.includes(mimeType)) {
    return { ok: false, failure: "mime_not_allowed" };
  }
  if (sizeBytes <= 0 || sizeBytes > rule.maxBytes) {
    return { ok: false, failure: "size_too_large" };
  }
  return { ok: true, extension: rule.extensionFor(mimeType) };
}

/**
 * Byte-level check: the leading bytes must match a supported container.
 * Returns the sniffed MIME or null when nothing matches.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  const startsWith = (...sig: number[]) => sig.every((v, i) => b[i] === v);

  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 12 && startsWith(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) {
    // EBML: webm/matroska family. `video/webm` is the accepted member here.
    return "video/webm";
  }
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return "video/mp4"; // ftyp box (mp4 / quicktime)
  }
  if (b.length >= 12 && startsWith(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) {
    return "audio/wav"; // RIFF....WAVE
  }
  if (startsWith(0x49, 0x44, 0x33)) return "audio/mpeg"; // ID3
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  return null;
}

export function declaredMatchesSniffed(declared: string, sniffed: string): boolean {
  if (declared === sniffed) return true;
  // mp4 container family overlap (quicktime declared as mp4).
  if (declared === "video/mp4" && sniffed === "video/mp4") return true;
  if (declared === "video/quicktime" && sniffed === "video/mp4") return true;
  return false;
}

export function storageKeyFor(input: {
  userId: string;
  assetId: string;
  extension: string;
}): string {
  return `u/${input.userId}/${input.assetId}.${input.extension}`;
}

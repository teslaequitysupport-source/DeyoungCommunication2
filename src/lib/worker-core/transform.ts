/**
 * Dev transform — a REAL pixel pipeline (sharp), honestly scoped.
 *
 * This is the Phase-1 "real (simple) transform" of the approved plan: a
 * deterministic color grade (hue/saturation) with an optional vignette,
 * driven by the character's appearance config. It is NOT an AI face swap
 * and never labeled as one — the UI and job registry call it exactly what
 * it is. Phase 2 adds verified model capabilities (MiniMax H3 via the
 * official API) behind the same worker protocol.
 */

import sharp from "sharp";

export interface TransformConfig {
  hue?: number; // 0-360
  saturation?: number; // 0-3
  vignette?: boolean;
}

export interface TransformStats {
  inBytes: number;
  outBytes: number;
  width: number;
  height: number;
  durationMs: number;
}

function vignetteSvg(width: number, height: number): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}">
       <defs>
         <radialGradient id="v" cx="50%" cy="50%" r="75%">
           <stop offset="55%" stop-color="black" stop-opacity="0"/>
           <stop offset="100%" stop-color="black" stop-opacity="0.55"/>
         </radialGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#v)"/>
     </svg>`,
  );
}

export async function transformImage(
  input: Uint8Array | Buffer,
  config: TransformConfig,
): Promise<{ data: Buffer; stats: TransformStats }> {
  const started = Date.now();
  const image = sharp(Buffer.from(input), { failOn: "error" });
  const meta = await image.metadata();

  let pipeline = sharp(await image
    .modulate({
      hue: config.hue ?? 210,
      saturation: config.saturation ?? 1.15,
    })
    .toBuffer());

  if (config.vignette !== false && meta.width && meta.height) {
    pipeline = pipeline.composite([
      { input: vignetteSvg(meta.width, meta.height), blend: "over" },
    ]);
  }

  const { data, info } = await pipeline
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    stats: {
      inBytes: input.byteLength,
      outBytes: data.byteLength,
      width: info.width,
      height: info.height,
      durationMs: Date.now() - started,
    },
  };
}

export interface LiveFrameResult {
  data: Buffer;
  durationMs: number;
}

/**
 * Live-frame path: same pipeline, JPEG-in/JPEG-out, tuned for latency
 * (no mozjpeg crunch). Frames that fail to decode are reported (never
 * silently dropped as "success").
 */
export async function transformFrame(
  input: Uint8Array | Buffer,
  config: TransformConfig,
): Promise<LiveFrameResult | null> {
  const started = Date.now();
  try {
    const out = await sharp(Buffer.from(input), { failOn: "error" })
      .rotate() // honor EXIF
      .modulate({
        hue: config.hue ?? 210,
        saturation: config.saturation ?? 1.15,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { data: out, durationMs: Date.now() - started };
  } catch {
    return null; // corrupt frame — caller counts it
  }
}

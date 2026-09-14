/**
 * Transform the generated man image into the woman character version
 * (image-to-image, preserves bone structure / pose / lighting).
 */
import ZAI from "z-ai-web-dev-sdk";
import { readFileSync, writeFileSync } from "node:fs";

const inPath = process.argv[2] ?? "var/gen-man.png";
const outPath = process.argv[3] ?? "var/gen-woman.png";
const prompt = process.argv[4];

if (!prompt) {
  console.error("usage: bun scripts/edit-pair.ts <in> <out> <prompt>");
  process.exit(1);
}

const b64 = readFileSync(inPath).toString("base64");
const dataUrl = `data:image/png;base64,${b64}`;

const zai = await ZAI.create();
// The runtime accepts a `images` array (as documented); the local .d.ts
// only knows `image`, so cast through the looser shape.
const res = await zai.images.generations.edit({
  prompt,
  images: [{ url: dataUrl }],
  size: "1152x864",
} as Parameters<typeof zai.images.generations.edit>[0] & {
  images: { url: string }[];
});

const out = Buffer.from(res.data[0].base64, "base64");
writeFileSync(outPath, out);
console.log("wrote", outPath, out.length, "bytes");

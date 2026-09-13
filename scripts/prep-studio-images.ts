/**
 * Prepare studio mockup imagery: resize/compress the generated pair
 * and cut square avatars for the character roster.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public/studio", { recursive: true });

const jobs: Array<{
  in: string;
  out: string;
  w: number;
  h: number;
  q?: number;
}> = [
  {
    in: "var/gen-man.png",
    out: "public/studio/camera-input.jpg",
    w: 640,
    h: 480,
  },
  {
    in: "var/gen-woman.png",
    out: "public/studio/character-output.jpg",
    w: 640,
    h: 480,
  },
  {
    in: "var/gen-woman.png",
    out: "public/studio/character-avatar.jpg",
    w: 240,
    h: 240,
    q: 82,
  },
  {
    in: "var/gen-kamal.png",
    out: "public/studio/character-kamal.jpg",
    w: 320,
    h: 320,
    q: 80,
  },
  {
    in: "var/gen-zara.png",
    out: "public/studio/character-zara.jpg",
    w: 320,
    h: 320,
    q: 80,
  },
  {
    in: "var/gen-ada2.png",
    out: "public/studio/character-ada2.jpg",
    w: 320,
    h: 320,
    q: 80,
  },
];

for (const j of jobs) {
  await sharp(j.in)
    .resize(j.w, j.h, { fit: "cover", position: "attention" })
    .jpeg({ quality: j.q ?? 78, mozjpeg: true })
    .toFile(j.out);
  console.log("wrote", j.out);
}

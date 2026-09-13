/**
 * Prepare studio mockup imagery: resize/compress the generated pair
 * and cut a square avatar from the character render.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public/studio", { recursive: true });

const jobs: Array<{
  in: string;
  out: string;
  w: number;
  h: number;
  fit: "cover";
}> = [
  {
    in: "var/gen-cam.png",
    out: "public/studio/camera-input.jpg",
    w: 640,
    h: 480,
    fit: "cover",
  },
  {
    in: "var/gen-char.png",
    out: "public/studio/character-output.jpg",
    w: 640,
    h: 480,
    fit: "cover",
  },
  {
    in: "var/gen-char.png",
    out: "public/studio/character-avatar.jpg",
    w: 160,
    h: 160,
    fit: "cover",
  },
];

for (const j of jobs) {
  await sharp(j.in)
    .resize(j.w, j.h, { fit: j.fit, position: "attention" })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(j.out);
  console.log("wrote", j.out);
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * TransformCanvas — the signature WebGL moment.
 *
 * A real shader pipeline performing the product's core promise on
 * loop: the live camera frame dissolving into the rendered
 * character through a red scan pass. The motion explains the
 * product; it never decorates.
 *
 * Fallbacks: no WebGL or failed textures → the static character
 * image. prefers-reduced-motion → a single held frame. Pauses
 * off-screen via IntersectionObserver.
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_cam;
uniform sampler2D u_char;
uniform float u_progress;   // 0 = camera, 1 = character
uniform float u_time;       // seconds, for the glitch flicker
varying vec2 v_uv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

const vec3 RED = vec3(0.886, 0.114, 0.180);

void main() {
  vec2 uv = v_uv;

  // The scan — a slightly slanted sweep line
  float scan = u_progress * 1.5 - 0.25;
  scan += (uv.y - 0.5) * 0.10;

  // Per-cell jitter so the dissolve breaks organically
  vec2 cell = floor(uv * vec2(46.0, 34.0));
  float jitter = (hash(cell) - 0.5) * 0.22;
  float local = uv.x + jitter;

  // Glitch band around the scan line
  float dist = abs(local - scan);
  float glitch = smoothstep(0.09, 0.0, dist);

  // Horizontal slice displacement inside the band
  float row = floor(uv.y * 34.0);
  float shift = (hash(vec2(row, floor(u_time * 22.0))) - 0.5) * 0.06;
  vec2 uvGlitch = vec2(uv.x + shift * glitch, uv.y);

  // Sample both frames
  vec3 cam = texture2D(u_cam, uvGlitch).rgb;
  vec3 chr = texture2D(u_char, uvGlitch).rgb;

  // Red channel split inside the band (red-only aberration)
  cam.r = texture2D(u_cam, uvGlitch + vec2(0.008 * glitch, 0.0)).r;
  chr.r = texture2D(u_char, uvGlitch - vec2(0.008 * glitch, 0.0)).r;

  // Per-cell hard flip at the scan
  float flip = step(local, scan);
  vec3 color = mix(cam, chr, flip);

  // Red wash + the crisp scan line itself
  color = mix(color, RED, glitch * 0.38);
  float line = smoothstep(0.006, 0.0, abs(local - scan));
  color = mix(color, RED, line * 0.9);

  gl_FragColor = vec4(color, 1.0);
}`;

function loadTexture(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  src: string,
  slot: number,
  name: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const tex = gl.createTexture();
      gl.activeTexture(slot);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        img
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR
      );
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        gl.LINEAR
      );
      gl.uniform1i(gl.getUniformLocation(program, name), slot - gl.TEXTURE0);
      resolve();
    };
    img.onerror = () => reject(new Error(`texture failed: ${src}`));
    img.src = src;
  });
}

/** Hold → sweep → hold → sweep back. Returns progress 0..1. */
function cycle(t: number): number {
  const HOLD = 2.4;
  const SWEEP = 1.15;
  const half = HOLD + SWEEP;
  const t0 = t % (half * 2);
  if (t0 < HOLD) return 0;
  if (t0 < half) {
    const s = (t0 - HOLD) / SWEEP;
    return 1 - Math.pow(1 - s, 3); // ease-out: fast start, settles
  }
  const t1 = t0 - half;
  if (t1 < HOLD) return 1;
  const s2 = (t1 - HOLD) / SWEEP;
  return 1 - Math.pow(s2, 3); // ease-in: departs slowly, finishes fast
}

export function TransformCanvas({
  cameraSrc = "/studio/camera-input.jpg",
  characterSrc = "/studio/character-output.jpg",
  className,
  alt = "Live character render output",
}: {
  cameraSrc?: string;
  characterSrc?: string;
  className?: string;
  alt?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let disposed = false;
    let observer: IntersectionObserver | null = null;
    let visible = true;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) ?? "shader compile failed");
      }
      return sh;
    };

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("link failed");
      }
    } catch {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    sizeCanvas();

    let started = 0;

    const frame = (now: number) => {
      if (disposed) return;
      if (!started) started = now;
      sizeCanvas();
      const t = (now - started) / 1000;
      const p = reduced ? 1 : cycle(t);
      gl.uniform1f(gl.getUniformLocation(program, "u_progress"), p);
      gl.uniform1f(gl.getUniformLocation(program, "u_time"), t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduced && visible) {
        raf = requestAnimationFrame(frame);
      }
    };

    Promise.all([
      loadTexture(gl, program, cameraSrc, gl.TEXTURE0, "u_cam"),
      loadTexture(gl, program, characterSrc, gl.TEXTURE1, "u_char"),
    ])
      .then(() => {
        if (disposed) return;
        setReady(true);
        if (reduced) {
          raf = requestAnimationFrame(frame); // single held frame
          return;
        }
        if ("IntersectionObserver" in window) {
          observer = new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting;
              if (visible && !raf) raf = requestAnimationFrame(frame);
              if (!visible && raf) {
                cancelAnimationFrame(raf);
                raf = 0;
              }
            },
            { threshold: 0.05 }
          );
          observer.observe(canvas);
        }
        raf = requestAnimationFrame(frame);
      })
      .catch(() => setFailed(true));

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [cameraSrc, characterSrc]);

  if (failed) {
    // Static fallback: the character frame, simply
    return (
      <img
        src={characterSrc}
        alt={alt}
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      {/* Skeleton until the first frame is drawn */}
      {!ready && (
        <Skeleton
          className="absolute inset-0 h-full w-full rounded-none"
          aria-hidden="true"
        />
      )}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        className="h-full w-full"
      />
    </div>
  );
}

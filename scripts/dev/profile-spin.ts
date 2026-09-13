/**
 * Attach to a running node inspector, CPU-profile 4s, print top self-time frames.
 * Diagnostic tool (loose typing on purpose — ws ships no types).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const WS = (require("ws") as any).default ?? require("ws");
const target = process.argv[2];
const ws: any = new WS(target, { maxPayload: 256 * 1024 * 1024 });
let id = 0;
const pending = new Map<number, (result: any) => void>();

function send(method: string, params: object = {}): Promise<any> {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

ws.on("message", (raw: Buffer) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)?.(msg.result);
    pending.delete(msg.id);
  }
});

ws.on("open", async () => {
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 10_000 });
  await send("Profiler.start");
  await new Promise((r) => setTimeout(r, 4000));
  const { profile } = await send("Profiler.stop");

  // Self time per (functionName, url:line)
  const self = new Map<string, number>();
  const byId = new Map<number, any>();
  for (const n of profile.nodes) byId.set(n.id, n);
  for (const s of profile.samples) {
    const node = byId.get(s);
    if (!node) continue;
    const cf = node.callFrame;
    const key = `${cf.functionName || "(anon)"} @ ${cf.url.replace(/^.*node_modules\//, "")}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + 1);
  }
  const total = profile.samples.length;
  console.log(`samples: ${total}`);
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`${((v / total) * 100).toFixed(1)}%  ${k}`);
  }
  process.exit(0);
});

ws.on("error", (e: Error) => {
  console.error("ws error:", e.message);
  process.exit(1);
});

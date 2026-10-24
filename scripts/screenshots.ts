// Renders project screenshots to PNG using the real level maps and the real
// echo model. Run: `npx esbuild scripts/screenshots.ts --bundle --format=esm
// --platform=node --outfile=scripts/.screenshots.mjs && node scripts/.screenshots.mjs`
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { LEVEL_DEFS } from '../src/levels';
import { parseLevel, type Level } from '../src/world/level';
import { WALL_PROPS } from '../src/world/materials';
import { computeEcho } from '../src/audio/echo';
import { defaultTuning } from '../src/audio/tuning';
import { astar, bfsField } from '../src/world/path';

// ── minimal PNG writer ─────────────────────────────────────────────────
function crc32(buf: Buffer): number {
  let c: number;
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t?: Int32Array }).t = table;
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const b = Buffer.alloc(8 + data.length + 4);
  b.writeUInt32BE(data.length, 0);
  b.write(type, 4, 'ascii');
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
class Img {
  px: Uint8Array;
  constructor(public w: number, public h: number, bg = [5, 5, 7]) {
    this.px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 4] = bg[0]; this.px[i * 4 + 1] = bg[1]; this.px[i * 4 + 2] = bg[2];
      this.px[i * 4 + 3] = 255;
    }
  }
  set(x: number, y: number, rgb: number[], a = 1): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    this.px[o] = this.px[o] * (1 - a) + rgb[0] * a;
    this.px[o + 1] = this.px[o + 1] * (1 - a) + rgb[1] * a;
    this.px[o + 2] = this.px[o + 2] * (1 - a) + rgb[2] * a;
  }
  rect(x: number, y: number, w: number, h: number, rgb: number[], a = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, rgb, a);
  }
  disc(cx: number, cy: number, r: number, rgb: number[], a = 1): void {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) this.set(cx + x, cy + y, rgb, a);
    }
  }
  ring(cx: number, cy: number, r: number, rgb: number[], a = 1): void {
    const steps = Math.ceil(2 * Math.PI * r);
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      this.set(cx + r * Math.cos(t), cy + r * Math.sin(t), rgb, a);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, rgb: number[], a = 1): void {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rgb, a);
    }
  }
  save(path: string): void {
    const raw = Buffer.alloc(this.h * (this.w * 4 + 1));
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      Buffer.from(this.px.buffer, y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    writeFileSync(path, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]));
    console.log('wrote', path);
  }
}

const hex = (s: string): number[] => [
  parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16),
];

// ── render a level the same way replay/render.ts does ──────────────────
function render(l: Level, opts: {
  player?: { x: number; y: number; heading: number };
  path?: { x: number; y: number }[];
  clicks?: { x: number; y: number; hits: { x: number; y: number }[] }[];
  creature?: { x: number; y: number };
}): Img {
  const W = 900;
  const H = Math.round((l.height / l.width) * W) + 60;
  const img = new Img(W, H);
  const pad = 30;
  const scale = Math.min((W - pad * 2) / l.width, (H - pad * 2) / l.height);
  const ox = (W - l.width * scale) / 2;
  const oy = (H - l.height * scale) / 2;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;

  for (let r = 0; r < l.height; r++) {
    for (let c = 0; c < l.width; c++) {
      const i = r * l.width + c;
      const w = l.walls[i];
      if (w) img.rect(X(c), Y(r), scale + 1, scale + 1, hex(WALL_PROPS[w].color));
      else img.rect(X(c), Y(r), scale + 1, scale + 1, l.floors[i] === 'water' ? hex('#16324a') : hex('#101018'));
    }
  }
  for (const e of l.exits) img.rect(X(e.col), Y(e.row), scale, scale, hex('#57cc99'));

  if (opts.path && opts.path.length > 1) {
    for (let i = 1; i < opts.path.length; i++) {
      img.line(X(opts.path[i - 1].x), Y(opts.path[i - 1].y), X(opts.path[i].x), Y(opts.path[i].y), hex('#f4f1de'), 0.9);
      img.line(X(opts.path[i - 1].x), Y(opts.path[i - 1].y) + 1, X(opts.path[i].x), Y(opts.path[i].y) + 1, hex('#f4f1de'), 0.9);
    }
  }
  if (opts.clicks) {
    for (const c of opts.clicks) {
      img.ring(X(c.x), Y(c.y), scale * 1.8, hex('#72c9ff'), 0.7);
      for (const hpt of c.hits) {
        img.line(X(c.x), Y(c.y), X(hpt.x), Y(hpt.y), hex('#72c9ff'), 0.4);
        img.disc(X(hpt.x), Y(hpt.y), Math.max(2, scale * 0.12), hex('#72c9ff'), 0.9);
      }
    }
  }
  if (opts.creature) {
    img.disc(X(opts.creature.x), Y(opts.creature.y), Math.max(4, scale * 0.3), hex('#e63946'));
    img.ring(X(opts.creature.x), Y(opts.creature.y), Math.max(6, scale * 0.55), hex('#e63946'), 0.8);
  }
  if (opts.player) {
    const p = opts.player;
    const px = X(p.x), py = Y(p.y);
    // heading cone
    for (let a = -0.5; a <= 0.5; a += 0.02) {
      img.line(px, py, px + Math.sin(p.heading + a) * scale * 1.6, py - Math.cos(p.heading + a) * scale * 1.6, hex('#f4f1de'), 0.12);
    }
    img.disc(px, py, Math.max(4, scale * 0.28), hex('#f4f1de'));
    img.line(px, py, px + Math.sin(p.heading) * scale * 0.8, py - Math.cos(p.heading) * scale * 0.8, hex('#f4f1de'));
  }
  return img;
}

mkdirSync('screenshots', { recursive: true });
const t = defaultTuning();

for (const def of LEVEL_DEFS) {
  const l = parseLevel(def);
  const px = l.playerStart.col + 0.5;
  const py = l.playerStart.row + 0.5;
  const heading = (l.meta.playerHeading * Math.PI) / 180;
  const echo = computeEcho(l, px, py, heading, t);
  const img = render(l, {
    player: { x: px, y: py, heading },
    clicks: [{ x: px, y: py, hits: echo.hitPoints }],
    creature: l.creatureSpawn ? { x: l.creatureSpawn.col + 0.5, y: l.creatureSpawn.row + 0.5 } : undefined,
  });
  img.save(`screenshots/level-${l.meta.id}.png`);
}

// A mid-run shot for Hold: partial path, creature closing in, two clicks.
{
  const l = parseLevel(LEVEL_DEFS.find((d) => d.meta.id === 'hold')!);
  const field = bfsField(l, l.playerStart.col, l.playerStart.row);
  const toExit = astar(l, l.playerStart, l.exits[0]) ?? [];
  const path = toExit.slice(0, Math.floor(toExit.length * 0.55)).map((c) => ({ x: c.col + 0.5, y: c.row + 0.5 }));
  const p = path[path.length - 1];
  const h = Math.PI / 2;
  const e1 = computeEcho(l, path[0].x, path[0].y, h, t);
  const e2 = computeEcho(l, p.x, p.y, h, t);
  const creatureCell = field ? { x: l.creatureSpawn!.col + 0.5 - 3, y: l.creatureSpawn!.row + 0.5 + 1 } : undefined;
  const img = render(l, {
    player: { x: p.x, y: p.y, heading: h },
    path,
    clicks: [
      { x: path[0].x, y: path[0].y, hits: e1.hitPoints },
      { x: p.x, y: p.y, hits: e2.hitPoints },
    ],
    creature: creatureCell,
  });
  img.save('screenshots/hold-run.png');
}
console.log('done');

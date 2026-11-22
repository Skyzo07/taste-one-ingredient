import * as fs from "node:fs";
import * as zlib from "node:zlib";

// The picture that tastes of one ingredient: LEMON.
// One giant cut lemon half on deep leaf green, a bitten wedge,
// two leaves, flying juice, and the word LEMON.
// Own pixel buffer + own PNG writer. Deterministic: seeded RNG only.
const W = 1024;
const H = 1024;
const buf = Buffer.alloc(W * H * 4);

let seed = 20261122;
function rng(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}
type RGB = [number, number, number];
function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
}
function blendPx(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (a >= 1) { setPx(x, y, c); return; }
  const i = (y * W + x) * 4;
  buf[i] = mix(buf[i], c[0], a);
  buf[i + 1] = mix(buf[i + 1], c[1], a);
  buf[i + 2] = mix(buf[i + 2], c[2], a);
}
function bgColor(x: number, y: number): RGB {
  const t = y / (H - 1);
  let r = mix(0x17, 0x07, t), g = mix(0x5c, 0x26, t), b = mix(0x3a, 0x1c, t);
  const dx = x - 512, dy = y - 520;
  const d = Math.sqrt(dx * dx + dy * dy);
  const glow = clamp(1 - d / 620, 0, 1);
  r = mix(r, 0x2e, glow * 0.35); g = mix(g, 0x8a, glow * 0.35); b = mix(b, 0x55, glow * 0.35);
  return [r, g, b];
}
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) setPx(x, y, bgColor(x, y));

// soft shadow under the lemon
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - 512) / 380, dy = (y - 905) / 55;
  const d = dx * dx + dy * dy;
  if (d < 1) blendPx(x, y, [0x02, 0x14, 0x0e], 0.45 * (1 - d));
}

// ---- two green leaves, top right, behind the lemon ----
function leaf(cx: number, cy: number, rx: number, ry: number, ang: number, c1: RGB, c2: RGB): void {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = Math.floor(cy - rx); y <= Math.ceil(cy + rx); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = x - cx, dy = y - cy;
      const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
      const d = u * u + v * v;
      if (d > 1) continue;
      const pinch = 1 - Math.max(0, u) * 0.25 * Math.abs(v);
      if (d > pinch * pinch) continue;
      const t = clamp((u + 1) / 2, 0, 1);
      const c: RGB = [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
      setPx(x, y, c);
      if (Math.abs(v) < 0.03 && u > -0.9 && u < 0.95) setPx(x, y, [0x9f, 0xd8, 0xa8]);
    }
}
leaf(800, 185, 165, 62, -0.55, [0x2f, 0x9e, 0x5f], [0x1d, 0x7a, 0x44]);
leaf(875, 305, 120, 48, 0.45, [0x37, 0xb0, 0x6a], [0x22, 0x7a, 0x45]);

// ---- the giant cut lemon half ----
const CX = 512, CY = 530, R_OUT = 365, R_PITH = 332, R_FLESH = 318;
for (let y = CY - R_OUT - 4; y <= CY + R_OUT + 4; y++) {
  for (let x = CX - R_OUT - 4; x <= CX + R_OUT + 4; x++) {
    const dx = x - CX, dy = y - CY;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > R_OUT) continue;
    const ang = Math.atan2(dy, dx);
    const light = clamp(0.5 + 0.5 * Math.cos(ang + 2.4) * 0.6 + 0.5 * (1 - r / R_OUT) * 0.4, 0, 1);
    let c: RGB = [mix(0xf7, 0xff, light * 0.55), mix(0xce, 0xe0, light * 0.55), mix(0x2e, 0x66, light * 0.55)];
    if (r <= R_PITH) {
      c = [0xff, 0xf6, 0xc8];
      if (r <= R_FLESH) {
        const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8);
        const frac = (((ang + Math.PI) / (Math.PI * 2)) * 8) % 1;
        const nearEdge = Math.min(frac, 1 - frac);
        const base: RGB = seg % 2 === 0 ? [0xfb, 0xe9, 0x6a] : [0xf7, 0xde, 0x4e];
        c = base;
        const sp = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const f = sp - Math.floor(sp);
        if (f > 0.93) c = [0xfd, 0xf2, 0x8e];
        if (nearEdge < 0.022 || (r > 60 && r < 66)) c = [0xff, 0xf8, 0xd0];
        if (nearEdge < 0.010) c = [0xff, 0xfb, 0xe6];
      }
    }
    if (r > R_OUT - 6) c = [mix(c[0], 0xd9, 0.5), mix(c[1], 0xa8, 0.5), mix(c[2], 0x1e, 0.5)];
    setPx(x, y, c);
  }
}
// star core at the centre
for (let y = CY - 70; y <= CY + 70; y++) for (let x = CX - 70; x <= CX + 70; x++) {
  const dx = x - CX, dy = y - CY;
  const r = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(dy, dx);
  const star = 34 + 26 * Math.abs(Math.cos(4 * ang));
  if (r <= star) setPx(x, y, [0xff, 0xfb, 0xe0]);
}
// gloss highlight on the rind, upper left
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - 330) / 150, dy = (y - 330) / 70;
  const d = dx * dx + dy * dy;
  if (d < 1) blendPx(x, y, [255, 255, 255], 0.35 * (1 - d));
}

// ---- small wedge, bottom left, with two bites ----
const WX = 225, WY = 820, WR = 145;
const A0 = -2.5, A1 = -0.9; // sector angles (pointing down-left)
for (let y = WY - WR - 4; y <= WY + WR + 4; y++) {
  for (let x = WX - WR - 4; x <= WX + WR + 4; x++) {
    const dx = x - WX, dy = y - WY;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > WR) continue;
    let ang = Math.atan2(dy, dx);
    if (ang > 0) ang -= Math.PI * 2;
    if (ang < A0 || ang > A1) continue;
    let c: RGB = [0xf7, 0xce, 0x2e];
    if (r <= WR - 16) c = [0xfb, 0xe9, 0x6a];
    if (r <= WR - 30) {
      const frac = (((ang - A0) / (A1 - A0)) * 3) % 1;
      if (Math.min(frac, 1 - frac) < 0.05) c = [0xff, 0xf8, 0xd0];
    }
    setPx(x, y, c);
  }
}
// two bites notched out of the wedge rim: repaint with background
const bites: Array<[number, number, number]> = [[150, 715, 26], [105, 790, 22]];
for (const [bx, by, br] of bites) {
  for (let y = by - br; y <= by + br; y++) for (let x = bx - br; x <= bx + br; x++) {
    if ((x - bx) * (x - bx) + (y - by) * (y - by) <= br * br) setPx(x, y, bgColor(x, y));
  }
}
// flying juice droplets off the wedge
for (let i = 0; i < 14; i++) {
  const px = Math.round(70 + rng() * 130), py = Math.round(600 + rng() * 220);
  const rr = 4 + Math.floor(rng() * 9);
  for (let y = py - rr; y <= py + rr; y++) for (let x = px - rr; x <= px + rr; x++) {
    if ((x - px) * (x - px) + (y - py) * (y - py) <= rr * rr) setPx(x, y, [0xff, 0xe9, 0x7a]);
  }
  setPx(px - 2, py - 2, [255, 255, 255]);
}

// ---- the word LEMON in small cream bitmap capitals ----
const GLYPHS: Record<string, string[]> = {
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
};
function drawText(word: string, x0: number, y0: number, s: number, c: RGB): void {
  let cx = x0;
  for (const ch of word) {
    const g = GLYPHS[ch];
    if (!g) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (g[row][col] !== "1") continue;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
        setPx(cx + col * s + dx, y0 + row * s + dy, c);
    }
    cx += 6 * s;
  }
}
drawText("LEMON", 404, 938, 7, [0xff, 0xf6, 0xc8]);

// ---- own PNG writer ----
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 4, di = y * (1 + W * 3) + 1 + x * 3;
    raw[di] = buf[si]; raw[di + 1] = buf[si + 1]; raw[di + 2] = buf[si + 2];
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync("/output", { recursive: true });
fs.writeFileSync("/output/entry.png", png);
console.log("wrote /output/entry.png", png.length, "bytes, 1024x1024");

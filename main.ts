// taste-one-ingredient — "LEMON"
// One ingredient, one picture: a giant cut lemon, drawn pixel by pixel.
// Node 22 stdlib only (node:fs, node:zlib). No assets, no network, no
// randomness that isn't seeded — two runs produce byte-identical PNGs.
// Writes a 1024x1024 PNG to $MAKEFUN_OUTPUT_DIR/entry.png (default /output).

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---- deterministic RNG (mulberry32) ---------------------------------------
let seed = 0x1eaf00d;
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---- pixel buffer ----------------------------------------------------------
const buf = Buffer.alloc(W * H * 3);
type RGB = [number, number, number];

function clamp(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}

// Alpha-blend a colour over the pixel already there.
function blendPx(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  buf[i] = clamp(buf[i] + (c[0] - buf[i]) * a);
  buf[i + 1] = clamp(buf[i + 1] + (c[1] - buf[i + 1]) * a);
  buf[i + 2] = clamp(buf[i + 2] + (c[2] - buf[i + 2]) * a);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    clamp(a[0] + (b[0] - a[0]) * t),
    clamp(a[1] + (b[1] - a[1]) * t),
    clamp(a[2] + (b[2] - a[2]) * t),
  ];
}

// Filled disc, optionally shaded by a per-pixel colour function.
function disc(cx: number, cy: number, r: number, col: (x: number, y: number, d: number) => RGB): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) setPx(x, y, col(x, y, Math.sqrt(d2) / r));
    }
  }
}

function ring(cx: number, cy: number, rOuter: number, rInner: number, c: RGB): void {
  const o2 = rOuter * rOuter, i2 = rInner * rInner;
  for (let y = Math.floor(cy - rOuter); y <= Math.ceil(cy + rOuter); y++) {
    for (let x = Math.floor(cx - rOuter); x <= Math.ceil(cx + rOuter); x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 <= o2 && d2 > i2) setPx(x, y, c);
    }
  }
}

// Thick line (round caps) via stepped discs.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len);
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    const r = w / 2;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy <= r * r) {
          if (a >= 1) setPx(x + dx, y + dy, c); else blendPx(x + dx, y + dy, c, a);
        }
      }
    }
  }
}

// Rotated filled ellipse (for leaves).
function ellipse(cx: number, cy: number, rx: number, ry: number, ang: number, col: (u: number, v: number) => RGB): void {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = Math.floor(cy - ry - rx); y <= Math.ceil(cy + ry + rx); y++) {
    for (let x = Math.floor(cx - ry - rx); x <= Math.ceil(cx + ry + rx); x++) {
      const dx = x - cx, dy = y - cy;
      const u = (dx * ca + dy * sa) / rx;
      const v = (-dx * sa + dy * ca) / ry;
      if (u * u + v * v <= 1) setPx(x, y, col(u, v));
    }
  }
}

// ---- palette ---------------------------------------------------------------
const BG_IN: RGB = [23, 92, 58];
const BG_OUT: RGB = [7, 38, 28];
const RIND: RGB = [233, 180, 0];
const RIND_DARK: RGB = [196, 146, 0];
const PITH: RGB = [255, 243, 196];
const FLESH_A: RGB = [255, 217, 77];
const FLESH_B: RGB = [247, 206, 46];
const FLESH_C: RGB = [255, 224, 102];
const MEMBRANE: RGB = [255, 246, 208];
const CORE: RGB = [255, 251, 234];
const LEAF: RGB = [47, 125, 50];
const LEAF_LT: RGB = [87, 167, 115];
const LEAF_VEIN: RGB = [216, 243, 220];
const CREAM: RGB = [255, 246, 216];
const WHITE: RGB = [255, 255, 255];

// ---- 1. background: deep-green radial glow + faint texture ------------------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - 512) / 512, dy = (y - 470) / 512;
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const t = d * d * 0.85 + d * 0.15;
    setPx(x, y, mix(BG_IN, BG_OUT, t));
  }
}

// ---- 2. leaves peeking in from the top right --------------------------------
ellipse(845, 130, 150, 52, -0.55, (u, v) => mix(LEAF, LEAF_LT, Math.max(0, 0.6 - v * 0.6)));
ellipse(905, 235, 120, 42, -1.15, (u, v) => mix(LEAF, LEAF_LT, Math.max(0, 0.5 - v * 0.5)));
thickLine(734, 198, 956, 62, 7, LEAF_VEIN, 0.85);
thickLine(864, 326, 946, 144, 6, LEAF_VEIN, 0.85);

// ---- 3. the lemon half: cut face toward the viewer --------------------------
const CX = 512, CY = 465, R = 332;

// Rind: shaded disc, darker at the rim, warm light from upper left.
disc(CX, CY, R, (x, y, d) => {
  const light = Math.max(0, 1 - ((x - (CX - 130)) / 420) ** 2 - ((y - (CY - 140)) / 420) ** 2);
  let c = mix(RIND_DARK, RIND, Math.min(1, 0.35 + light * 0.65));
  if (d > 0.97) c = mix(c, RIND_DARK, 0.6);
  return c;
});
// Pale pith ring.
ring(CX, CY, 302, 282, PITH);
// Flesh disc.
const FLESH = [FLESH_A, FLESH_B, FLESH_C, FLESH_A, FLESH_B, FLESH_C, FLESH_A, FLESH_B];
disc(CX, CY, 282, (x, y, d) => {
  const ang = Math.atan2(y - CY, x - CX);
  const seg = ((Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  const base = FLESH[seg];
  // Juice shading: brighter toward the middle of each segment, darker at rim.
  const shade = 0.92 + 0.08 * Math.cos(d * Math.PI);
  return [clamp(base[0] * shade), clamp(base[1] * shade), clamp(base[2] * shade)];
});
// Membranes: 8 cream spokes + centre star.
for (let s = 0; s < 8; s++) {
  const a = (s / 8) * Math.PI * 2 - Math.PI / 2 + 0.12;
  thickLine(CX, CY, CX + Math.cos(a) * 282, CY + Math.sin(a) * 282, 9, MEMBRANE);
}
// Segment inner arcs: thin cream curve near the rim of each segment.
for (let s = 0; s < 8; s++) {
  const a0 = (s / 8) * Math.PI * 2 - Math.PI / 2 + 0.22;
  const a1 = ((s + 1) / 8) * Math.PI * 2 - Math.PI / 2 - 0.02;
  for (let a = a0; a <= a1; a += 0.01) {
    thickLine(
      CX + Math.cos(a) * 258, CY + Math.sin(a) * 258,
      CX + Math.cos(a + 0.01) * 258, CY + Math.sin(a + 0.01) * 258,
      4, MEMBRANE,
    );
  }
}
// Juice vesicles: deterministic sparkle dots inside the flesh.
for (let i = 0; i < 260; i++) {
  const a = rnd() * Math.PI * 2;
  const r = 55 + rnd() * 215;
  const x = Math.round(CX + Math.cos(a) * r);
  const y = Math.round(CY + Math.sin(a) * r * 0.98);
  const rr = 2 + rnd() * 4;
  disc(x, y, rr, () => (rnd() > 0.5 ? [255, 240, 160] : [255, 250, 205]));
}
// Centre star core.
disc(CX, CY, 42, (x, y, d) => mix(CORE, MEMBRANE, d));
for (let s = 0; s < 8; s++) {
  const a = (s / 8) * Math.PI * 2;
  thickLine(CX, CY, CX + Math.cos(a) * 40, CY + Math.sin(a) * 40, 5, MEMBRANE);
}
// Gloss highlight on the rind, upper left.
for (let i = 0; i < 26; i++) {
  const a = -2.35 + i * 0.02;
  thickLine(CX + Math.cos(a) * 318, CY + Math.sin(a) * 318,
    CX + Math.cos(a + 0.02) * 318, CY + Math.sin(a + 0.02) * 318, 10, WHITE, 0.5);
}

// ---- 4. a wedge with one bite taken out of it (the taste cue) ---------------
const WX = 215, WY = 845, WR = 150;
// Wedge body: sector from 190deg to 320deg, flesh + rind rim.
for (let y = WY - WR; y <= WY + WR; y++) {
  for (let x = WX - WR; x <= WX + WR; x++) {
    const dx = x - WX, dy = y - WY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > WR) continue;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    const deg = (a * 180) / Math.PI;
    if (deg < 185 || deg > 325) continue;
    // Bite: two scoops out of the top rim.
    const b1 = Math.hypot(x - 164, y - 704);
    const b2 = Math.hypot(x - 267, y - 704);
    if (b1 < 30 || b2 < 28) continue;
    if (d > WR - 18) setPx(x, y, RIND);
    else if (d > WR - 34) setPx(x, y, PITH);
    else setPx(x, y, mix(FLESH_A, FLESH_C, 0.5 + 0.5 * Math.sin(a * 3)));
  }
}
// Bite rim highlight: only the lower arc (the part inside the wedge).
for (const [bx, by, br] of [[164, 704, 30], [267, 704, 28]] as const) {
  for (let a = 0; a <= Math.PI; a += 0.03) {
    const x = Math.round(bx + Math.cos(a) * br);
    const y = Math.round(by + Math.sin(a) * br);
    blendPx(x, y, WHITE, 0.55);
  }
}
// Wedge membranes.
for (const m of [205, 240, 275, 305] as const) {
  const a = (m * Math.PI) / 180;
  thickLine(WX, WY, WX + Math.cos(a) * (WR - 36), WY + Math.sin(a) * (WR - 36), 6, MEMBRANE);
}

// ---- 5. juice droplets flying off the wedge ---------------------------------
const DROPS: Array<[number, number, number]> = [
  [360, 700, 12], [395, 745, 8], [330, 660, 7], [415, 690, 5],
  [300, 630, 6], [430, 800, 9], [150, 700, 6], [380, 845, 6],
  [90, 830, 8], [455, 760, 5], [265, 600, 5], [130, 770, 4],
];
for (const [dx, dy, dr] of DROPS) {
  disc(dx, dy, dr, () => [255, 244, 170]);
  disc(dx - dr * 0.3, dy - dr * 0.3, dr * 0.35, () => WHITE);
}

// ---- 6. the word LEMON, small, cream, bottom centre -------------------------
const FONT: Record<string, string[]> = {
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
};
function drawText(word: string, cx: number, top: number, scale: number, c: RGB): void {
  const cw = 5 * scale + 2 * scale; // glyph + gap
  const total = word.length * cw - 2 * scale;
  let x0 = Math.round(cx - total / 2);
  for (const ch of word) {
    const g = FONT[ch];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              setPx(x0 + col * scale + dx, top + r * scale + dy, c);
            }
          }
        }
      }
    }
    x0 += cw;
  }
}
drawText("LEMON", 512, 928, 7, CREAM);
// Thin cream rule above the word.
thickLine(412, 912, 612, 912, 3, CREAM);

// ---- 7. vignette -------------------------------------------------------------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - 512) / 512, dy = (y - 512) / 512;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.85) {
      const a = Math.min(0.35, (d - 0.85) * 1.2);
      blendPx(x, y, [0, 0, 0], a);
    }
  }
}

// ---- PNG writer: posterise + 8x8 Bayer dither, best filter per row -----------
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];
const LEVELS = 24; // posterise to 24 steps per channel
function quant(v: number, x: number, y: number): number {
  const step = 255 / (LEVELS - 1);
  const t = (BAYER[y & 7][x & 7] - 32) / 64; // -0.5..0.5
  const q = Math.round(v / step + t);
  return clamp(Math.round(Math.max(0, Math.min(LEVELS - 1, q)) * step));
}

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
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
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const rowBase = y * (1 + W * 3);
  const prev = y === 0 ? null : raw.subarray((y - 1) * (1 + W * 3) + 1, y * (1 + W * 3));
  // Build the 5 filtered candidates, pick the one with the smallest
  // sum of absolute signed-byte values.
  let best: Buffer | null = null;
  let bestScore = Infinity;
  for (let f = 0; f < 5; f++) {
    const row = Buffer.alloc(1 + W * 3);
    row[0] = f;
    let score = 0;
    for (let x = 0; x < W; x++) {
      for (let ch = 0; ch < 3; ch++) {
        const i = (y * W + x) * 3 + ch;
        const v = quant(buf[i], x, y);
        const left = x === 0 ? 0 : quant(buf[i - 3], x - 1, y);
        const up = prev ? prev[x * 3 + ch] : 0;
        const upLeft = x === 0 || !prev ? 0 : prev[(x - 1) * 3 + ch];
        let fv: number;
        if (f === 0) fv = v;
        else if (f === 1) fv = v - left;
        else if (f === 2) fv = v - up;
        else if (f === 3) fv = v - ((left + up) >> 1);
        else fv = v - paeth(left, up, upLeft);
        const b = fv & 0xff;
        row[1 + x * 3 + ch] = b;
        score += Math.abs(b < 128 ? b : b - 256);
      }
    }
    if (score < bestScore) { bestScore = score; best = row; }
  }
  best!.copy(raw, rowBase);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "entry.png");
fs.writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);

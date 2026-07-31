// Generates docs/public/logo.png and docs/public/favicon.ico.
//
// ponytail: hand-rolled rather than adding a raster toolchain (sharp, canvas,
// resvg) to a repo that needs exactly two small images that change ~never. Node
// ships zlib, a PNG is a header plus deflated scanlines, and an .ico is a
// 22-byte wrapper around a PNG. Re-run with `node scripts/generate-brand-assets.mjs`
// if the mark changes; nothing calls this at build time.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "public");

// ---------- PNG encoding ----------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10..12 stay zero: deflate, adaptive filtering, no interlace

  // One filter byte (0 = none) per scanline, then the raw pixels.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ---------- the mark ----------

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a + (b - a) * t;
/** Smooth 0..1 ramp across a one-pixel edge, so nothing comes out jagged. */
const cover = (distance, feather) => clamp01(0.5 - distance / feather);

/** Distance from p to the segment ab, used to draw the strokes of the glyph. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance to a rounded rectangle centred in the tile, negative inside. */
function distanceToRoundedRect(px, py, size, radius) {
  const half = size / 2 - radius;
  const qx = Math.abs(px - size / 2) - half;
  const qy = Math.abs(py - size / 2) - half;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * An "A" over a rounded violet tile. The glyph is three thick strokes rather
 * than a font, so this needs no typeface and scales to any size.
 */
function renderMark(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = size / 512;
  const feather = 1.5 * unit;

  const apexX = size * 0.5;
  const apexY = size * 0.235;
  const footY = size * 0.775;
  const leftX = size * 0.255;
  const rightX = size * 0.745;
  const stroke = size * 0.088;
  const barY = size * 0.612;
  const barInset = size * 0.135;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const tile = cover(distanceToRoundedRect(px, py, size, size * 0.22), feather);
      if (tile <= 0) {
        continue;
      }

      // Vertical gradient, deep indigo into Twitch violet.
      const t = clamp01(py / size);
      let r = mix(76, 145, t);
      let g = mix(29, 70, t);
      let b = mix(149, 255, t);

      const glyph = Math.max(
        cover(distanceToSegment(px, py, apexX, apexY, leftX, footY) - stroke / 2, feather),
        cover(distanceToSegment(px, py, apexX, apexY, rightX, footY) - stroke / 2, feather),
        cover(
          distanceToSegment(px, py, leftX + barInset, barY, rightX - barInset, barY) - stroke / 2,
          feather
        )
      );

      r = mix(r, 255, glyph);
      g = mix(g, 255, glyph);
      b = mix(b, 255, glyph);

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(tile * 255);
    }
  }

  return rgba;
}

// ---------- write them out ----------

mkdirSync(outDir, { recursive: true });

const logo = encodePng(512, 512, renderMark(512));
writeFileSync(join(outDir, "logo.png"), logo);

// An .ico may hold a PNG directly (every browser since IE11): 6-byte header,
// one 16-byte directory entry, then the image.
const iconSize = 64;
const iconPng = encodePng(iconSize, iconSize, renderMark(iconSize));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(1, 4); // one image
const entry = Buffer.alloc(16);
entry[0] = iconSize;
entry[1] = iconSize;
entry[2] = 0; // truecolour, no palette
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(iconPng.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);
writeFileSync(join(outDir, "favicon.ico"), Buffer.concat([header, entry, iconPng]));

console.log(`logo.png     ${logo.length} bytes (512x512)`);
console.log(`favicon.ico  ${header.length + entry.length + iconPng.length} bytes (${iconSize}x${iconSize})`);

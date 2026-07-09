import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
// lcd.ts has zero runtime imports, so Node's type stripping loads it directly.
import {
  parseLcdDump,
  lcdPixel,
  renderLcdAscii,
  lcdStats,
  encodeLcdPng,
  toBase64,
  describeLcd,
} from "../src/core/lcd.ts";

/** Build a device-realistic `lcd d` capture from a 1024-byte framebuffer. */
function makeDump(bytes, { noise = true } = {}) {
  const hex = [...bytes].map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0"));
  const lines = [];
  for (let i = 0; i < hex.length; i += 16) lines.push(hex.slice(i, i + 16).join(","));
  return [
    ...(noise ? ["[DBG] some earlier log at addr 0x20001234", "-SIG-> AC_DISPLAY_SHOW_LOGO"] : []),
    "[DUMP] frame buffer lcd => start",
    "width=128 height=64 bytes=1024",
    lines.join(",\n"),
    "[DUMP] frame buffer lcd => end",
    ...(noise ? ["[DBG] later noise 0xFF should not matter (outside markers)"] : []),
  ].join("\n");
}

/** Framebuffer with pixels lit at (0,0), (5,12), (127,63) — page-major, LSB=top. */
function fixtureBytes() {
  const buf = new Uint8Array(1024);
  buf[0 * 128 + 0] |= 1 << 0; // (0,0): page 0, bit 0
  buf[1 * 128 + 5] |= 1 << 4; // (5,12): page 1, bit 4
  buf[7 * 128 + 127] |= 1 << 7; // (127,63): page 7, bit 7
  return buf;
}

test("parses a realistic dump, ignoring hex noise outside the markers", () => {
  const fb = parseLcdDump(makeDump(fixtureBytes()));
  assert.equal(fb.width, 128);
  assert.equal(fb.height, 64);
  assert.equal(fb.bytes.length, 1024);
  assert.equal(fb.warnings.length, 0);
  assert.equal(lcdPixel(fb, 0, 0), 1);
  assert.equal(lcdPixel(fb, 5, 12), 1);
  assert.equal(lcdPixel(fb, 127, 63), 1);
  assert.equal(lcdPixel(fb, 1, 0), 0);
  assert.equal(lcdPixel(fb, 5, 11), 0);
});

test("stats and description report exactly the lit pixels", () => {
  const fb = parseLcdDump(makeDump(fixtureBytes()));
  const s = lcdStats(fb);
  assert.equal(s.lit, 3);
  assert.equal(s.total, 128 * 64);
  assert.deepEqual(s.box, { x0: 0, y0: 0, x1: 127, y1: 63 });
  assert.match(describeLcd(fb), /3\/8192 pixels lit/);
});

test("ascii render places half-block characters at the right cells", () => {
  const fb = parseLcdDump(makeDump(fixtureBytes()));
  const lines = renderLcdAscii(fb).split("\n");
  assert.equal(lines.length, 34); // 32 rows + 2 border lines
  // (0,0) is the TOP pixel of char row 0 -> '▀' at column 1 (after border '|')
  assert.equal(lines[1][1], "▀");
  // (5,12): y=12 is the TOP pixel of char row 6 -> '▀' at column 6
  assert.equal(lines[7][6], "▀");
  // (127,63): y=63 is the BOTTOM pixel of char row 31 -> '▄' at column 128
  assert.equal(lines[32][128], "▄");
});

test("blank screen renders blank and says so", () => {
  const fb = parseLcdDump(makeDump(new Uint8Array(1024)));
  assert.match(describeLcd(fb), /completely blank/);
  assert.equal(lcdStats(fb).box, null);
});

test("truncated dump warns but still renders whole pages", () => {
  const bytes = fixtureBytes().slice(0, 300); // 2 full pages + 44 bytes
  const fb = parseLcdDump(makeDump(bytes)); // header still claims 1024
  assert.equal(fb.bytes.length, 256);
  assert.equal(fb.height, 16);
  assert.ok(fb.warnings.some((w) => /1024/.test(w)));
  assert.ok(fb.warnings.some((w) => /partial page/.test(w)));
  assert.equal(lcdPixel(fb, 5, 12), 1); // page-1 pixel survived
});

test("garbage input throws a helpful error", () => {
  assert.throws(() => parseLcdDump("no framebuffer here"), /lcd d/);
});

test("PNG: valid signature, IHDR dims honor scale, pixels round-trip via zlib", () => {
  const fb = parseLcdDump(makeDump(fixtureBytes()));
  const scale = 2;
  const png = encodeLcdPng(fb, scale);

  // signature
  assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // IHDR: width/height big-endian at offsets 16/20; bit depth 1, grayscale 0
  const dv = new DataView(png.buffer, png.byteOffset);
  assert.equal(dv.getUint32(16), 128 * scale);
  assert.equal(dv.getUint32(20), 64 * scale);
  assert.equal(png[24], 1);
  assert.equal(png[25], 0);

  // locate IDAT and inflate it with real zlib
  let off = 8;
  let idat = null;
  while (off < png.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(...png.slice(off + 4, off + 8));
    if (type === "IDAT") idat = png.slice(off + 8, off + 8 + len);
    off += 12 + len;
  }
  assert.ok(idat, "IDAT chunk missing");
  const raw = inflateSync(idat);

  const W = 128 * scale;
  const rowBytes = Math.ceil(W / 8);
  assert.equal(raw.length, 64 * scale * (1 + rowBytes));

  const pngPixel = (x, y) => {
    const rowOff = y * (1 + rowBytes);
    assert.equal(raw[rowOff], 0); // filter type 0
    return (raw[rowOff + 1 + (x >> 3)] >> (7 - (x & 7))) & 1;
  };
  // (0,0) lit -> the scale x scale block at origin is white
  assert.equal(pngPixel(0, 0), 1);
  assert.equal(pngPixel(1, 1), 1);
  assert.equal(pngPixel(2, 0), 0); // neighbor block dark
  // (5,12) -> block at (10..11, 24..25)
  assert.equal(pngPixel(10, 24), 1);
  assert.equal(pngPixel(11, 25), 1);
  assert.equal(pngPixel(12, 24), 0);
  // (127,63) -> bottom-right block
  assert.equal(pngPixel(255, 127), 1);
});

test("base64 encoder matches Buffer's output", () => {
  for (const len of [0, 1, 2, 3, 100, 1023]) {
    const data = new Uint8Array(len).map((_, i) => (i * 37 + len) & 0xff);
    assert.equal(toBase64(data), Buffer.from(data).toString("base64"), `len=${len}`);
  }
});

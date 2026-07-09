/**
 * lcd.ts — decode the AK base kit's OLED framebuffer dump (`lcd d` shell command)
 * so an agent can "see" the screen headlessly.
 *
 * Framebuffer format (verified against driver/Adafruit_oled_drv/Adafruit_oled_drv.cpp
 * drawPixel): 128×64 @ 1 bpp, PAGE-MAJOR — byte index = (y/8)*WIDTH + x, and the
 * LSB of each byte is the TOP pixel of its 8-pixel page: bit = (y % 8).
 *
 * IMPORTANT: zero runtime imports (like analyze.ts) so tests can load this file
 * directly through Node's type stripping with no build step.
 */

export interface LcdFrame {
  width: number;
  height: number;
  /** page-major bytes, length = width * height / 8 */
  bytes: Uint8Array;
  warnings: string[];
}

const DEFAULT_WIDTH = 128;
const DEFAULT_HEIGHT = 64;

/** Read pixel (x, y): 1 = lit. */
export function lcdPixel(fb: LcdFrame, x: number, y: number): number {
  const byte = fb.bytes[(y >> 3) * fb.width + x];
  return (byte >> (y & 7)) & 1;
}

/**
 * Parse the raw text of a `lcd d` capture into a framebuffer.
 *
 * Device output looks like:
 *   [DUMP] frame buffer lcd => start
 *   width=128 height=64 bytes=1024
 *   0x00,0xFF,0x3C,... (16 per line)
 *   [DUMP] frame buffer lcd => end
 *
 * Tolerates surrounding log noise: if the [DUMP] markers are present only the
 * text between them is scanned, and only standalone 0xNN byte tokens count
 * (so an address like 0x20001234 elsewhere can't pollute the data).
 */
export function parseLcdDump(text: string): LcdFrame {
  const warnings: string[] = [];

  let region = text;
  const start = text.indexOf("frame buffer lcd => start");
  const end = text.indexOf("frame buffer lcd => end");
  if (start !== -1 && end !== -1 && end > start) {
    region = text.slice(start, end);
  } else if (start !== -1 || end !== -1) {
    warnings.push("dump start/end markers incomplete — capture may be truncated");
    region = start !== -1 ? text.slice(start) : text;
  }

  let width = DEFAULT_WIDTH;
  let declaredBytes: number | null = null;
  const header = region.match(/width\s*=\s*(\d+)\s+height\s*=\s*(\d+)(?:\s+bytes\s*=\s*(\d+))?/);
  if (header) {
    width = parseInt(header[1], 10);
    if (header[3]) declaredBytes = parseInt(header[3], 10);
  }

  const tokens = region.match(/\b0x([0-9a-fA-F]{1,2})\b/g) ?? [];
  const bytes = new Uint8Array(tokens.length);
  tokens.forEach((t, i) => (bytes[i] = parseInt(t.slice(2), 16)));

  if (bytes.length === 0) {
    throw new Error(
      "No framebuffer bytes found. Paste the raw output of the shell command `lcd d` " +
        "(lines of 0xNN,0xNN,... between the [DUMP] markers)."
    );
  }
  if (declaredBytes !== null && declaredBytes !== bytes.length) {
    warnings.push(
      `device declared ${declaredBytes} bytes but ${bytes.length} were parsed — capture may be truncated`
    );
  }
  if (bytes.length % width !== 0) {
    warnings.push(
      `${bytes.length} bytes is not a whole number of ${width}-byte pages — trailing partial page ignored`
    );
  }
  const pages = Math.floor(bytes.length / width);
  if (pages === 0) {
    throw new Error(
      `Only ${bytes.length} bytes parsed — not even one ${width}-byte page. Capture is too truncated to render.`
    );
  }
  const height = pages * 8;
  if (height !== DEFAULT_HEIGHT && width === DEFAULT_WIDTH) {
    warnings.push(`rendering ${width}x${height} (expected ${DEFAULT_WIDTH}x${DEFAULT_HEIGHT})`);
  }

  return { width, height, bytes: bytes.slice(0, pages * width), warnings };
}

/**
 * Render as text, two vertical pixels per character (▀ ▄ █ ·), framed.
 * 128×64 → 32 lines of 128 chars — compact enough to paste, dense enough to read.
 */
export function renderLcdAscii(fb: LcdFrame, invert = false): string {
  const on = (x: number, y: number) => lcdPixel(fb, x, y) === (invert ? 0 : 1);
  const lines: string[] = [];
  const hborder = "+" + "-".repeat(fb.width) + "+";
  lines.push(hborder);
  for (let y = 0; y < fb.height; y += 2) {
    let row = "|";
    for (let x = 0; x < fb.width; x++) {
      const top = on(x, y);
      const bot = y + 1 < fb.height ? on(x, y + 1) : false;
      row += top && bot ? "█" : top ? "▀" : bot ? "▄" : " ";
    }
    lines.push(row + "|");
  }
  lines.push(hborder);
  return lines.join("\n");
}

export interface LcdStats {
  lit: number;
  total: number;
  pct: number;
  /** bounding box of lit pixels, or null when the screen is blank */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}

export function lcdStats(fb: LcdFrame): LcdStats {
  let lit = 0;
  let x0 = fb.width, y0 = fb.height, x1 = -1, y1 = -1;
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      if (lcdPixel(fb, x, y)) {
        lit++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const total = fb.width * fb.height;
  return {
    lit,
    total,
    pct: (lit * 100) / total,
    box: lit ? { x0, y0, x1, y1 } : null,
  };
}

/* ---------------------------------------------------------------------------
 * Minimal PNG encoder — 1-bit grayscale, uncompressed ("stored") deflate
 * blocks inside a valid zlib stream. No dependencies.
 * ------------------------------------------------------------------------- */

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  const td = concat([t, data]);
  return concat([u32be(data.length), td, u32be(crc32(td))]);
}

/** zlib stream with stored (uncompressed) deflate blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const MAX = 65535;
  for (let off = 0; off < raw.length; off += MAX) {
    const blk = raw.subarray(off, Math.min(off + MAX, raw.length));
    const final = off + MAX >= raw.length ? 1 : 0;
    parts.push(
      new Uint8Array([
        final,
        blk.length & 0xff,
        (blk.length >> 8) & 0xff,
        ~blk.length & 0xff,
        (~blk.length >> 8) & 0xff,
      ]),
      blk
    );
  }
  parts.push(u32be(adler32(raw)));
  return concat(parts);
}

/**
 * Encode the framebuffer as a 1-bit grayscale PNG, scaled up by an integer
 * factor (crisp pixels). scale=4 → 512×256, ~1–22 KB total.
 */
export function encodeLcdPng(fb: LcdFrame, scale = 4, invert = false): Uint8Array {
  const W = fb.width * scale;
  const H = fb.height * scale;
  const rowBytes = Math.ceil(W / 8);
  const raw = new Uint8Array(H * (1 + rowBytes)); // filter byte 0 + packed bits

  for (let y = 0; y < fb.height; y++) {
    // Build one packed scanline for source row y, then replicate it `scale` times.
    const line = new Uint8Array(rowBytes);
    for (let x = 0; x < fb.width; x++) {
      const px = lcdPixel(fb, x, y) === (invert ? 0 : 1) ? 1 : 0; // 1 = white
      if (!px) continue;
      for (let sx = 0; sx < scale; sx++) {
        const bit = x * scale + sx;
        line[bit >> 3] |= 0x80 >> (bit & 7); // PNG packs MSB-first
      }
    }
    for (let sy = 0; sy < scale; sy++) {
      const off = (y * scale + sy) * (1 + rowBytes);
      raw.set(line, off + 1); // raw[off] = filter type 0
    }
  }

  const ihdr = concat([
    u32be(W),
    u32be(H),
    new Uint8Array([1 /* bit depth */, 0 /* grayscale */, 0, 0, 0]),
  ]);
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Base64 without Buffer/btoa so this file stays runtime-import-free. */
export function toBase64(data: Uint8Array): string {
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i];
    const b1 = i + 1 < data.length ? data[i + 1] : 0;
    const b2 = i + 2 < data.length ? data[i + 2] : 0;
    out += ABC[b0 >> 2] + ABC[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < data.length ? ABC[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < data.length ? ABC[b2 & 63] : "=";
  }
  return out;
}

/** One-line human summary of what's on screen. */
export function describeLcd(fb: LcdFrame): string {
  const s = lcdStats(fb);
  if (!s.box) return "Screen is completely blank (no lit pixels).";
  const b = s.box;
  return (
    `${s.lit}/${s.total} pixels lit (${s.pct.toFixed(1)}%), content bounding box ` +
    `x:${b.x0}–${b.x1}, y:${b.y0}–${b.y1} (${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1}).`
  );
}

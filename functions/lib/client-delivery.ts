/**
 * CODE Rx SOCIETY — client delivery stamping pipeline (Phase 8).
 *
 * Every client-facing document leaves this system as a *stamped representation*:
 * a branded, watermarked, printable artifact generated here, on the server. The
 * untouched internal original is never delivered, never proxied, and never
 * reachable from the Client Portal.
 *
 * Design rules enforced by this module:
 *
 *   1. There is no code path that returns a source file unchanged. Every
 *      supported source is decoded, re-rendered with the Code Rx header, footer,
 *      metadata block and watermark, and re-encoded.
 *   2. Anything that cannot be stamped is refused with a controlled error. A
 *      format this module cannot stamp produces no delivery at all — never a
 *      passthrough.
 *   3. The stamp lives in the delivered bytes themselves (PDF page content
 *      streams, PNG pixels), never in CSS, a viewer layer or a separate file, so
 *      the viewer, a download and a print all carry the branding.
 *
 * The runtime has no image decoder (`createImageBitmap`/`OffscreenCanvas` are
 * absent in workerd), so this module ships its own PNG codec, canvas and bitmap
 * font, and writes PDF by hand. Only the Web platform primitives that do exist —
 * `CompressionStream`, `DecompressionStream`, `crypto.subtle`, `TextEncoder` —
 * are used.
 */

// ---------------------------------------------------------------------------
// Web platform helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/** zlib "deflate" (what PNG IDAT and PDF /FlateDecode use). */
export const deflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
};

export const inflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new DecompressionStream('deflate');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
};

export const inflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
};

export const sha256Hex = async (value: string | Uint8Array): Promise<string> => {
  const data = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

// ---------------------------------------------------------------------------
// CRC-32 (PNG chunks)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// ---------------------------------------------------------------------------
// PNG decoder — colour types 0/2/3/4/6, bit depths 1/2/4/8/16, no interlace.
// Output is always 8-bit RGBA so every later stage has one pixel format.
// ---------------------------------------------------------------------------

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  rgba: Uint8Array;
}

export class DeliveryError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message || reason);
    this.name = 'DeliveryError';
    this.reason = reason;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const isPng = (bytes: Uint8Array): boolean =>
  bytes.length > 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

const unfilter = (raw: Uint8Array, width: number, height: number, bytesPerPixel: number, stride: number): Uint8Array => {
  const out = new Uint8Array(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source];
    source += 1;
    const rowStart = y * stride;
    const previousStart = rowStart - stride;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[source + x];
      const left = x >= bytesPerPixel ? out[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? out[previousStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out[previousStart + x - bytesPerPixel] : 0;
      let value: number;
      switch (filter) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + left; break;
        case 2: value = rawByte + up; break;
        case 3: value = rawByte + ((left + up) >> 1); break;
        case 4: value = rawByte + paeth(left, up, upLeft); break;
        default: throw new DeliveryError('png_bad_filter', `Unsupported PNG filter ${filter}`);
      }
      out[rowStart + x] = value & 0xff;
    }
    source += stride;
  }
  return out;
};

/**
 * Decodes a PNG into RGBA. Unsupported PNGs (Adam7 interlace, unusual
 * bit depths) throw `DeliveryError`, which the caller turns into a controlled
 * refusal — never a passthrough of the original bytes.
 */
export const decodePng = async (bytes: Uint8Array): Promise<DecodedImage> => {
  if (!isPng(bytes)) throw new DeliveryError('not_png', 'Not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataStart = offset + 8;
    if (dataStart + length > bytes.length) throw new DeliveryError('png_truncated', 'PNG chunk runs past the end of the file');
    const data = bytes.subarray(dataStart, dataStart + length);
    if (type === 'IHDR') {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      depth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'PLTE') {
      palette = data.slice();
    } else if (type === 'IDAT') {
      idat.push(data.slice());
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4;
  }

  if (!width || !height) throw new DeliveryError('png_no_header', 'PNG has no dimensions');
  if (interlace !== 0) throw new DeliveryError('png_interlaced', 'Interlaced PNGs are not supported');
  if (![1, 2, 4, 8, 16].includes(depth)) throw new DeliveryError('png_bad_depth', `Unsupported PNG bit depth ${depth}`);
  if (![0, 2, 3, 4, 6].includes(colorType)) throw new DeliveryError('png_bad_color', `Unsupported PNG colour type ${colorType}`);
  if (colorType === 3 && !palette) throw new DeliveryError('png_no_palette', 'Indexed PNG without a palette');
  if (idat.length === 0) throw new DeliveryError('png_no_pixels', 'PNG has no image data');

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const concatenated = new Uint8Array(idat.reduce((total, chunk) => total + chunk.length, 0));
  {
    let cursor = 0;
    for (const chunk of idat) {
      concatenated.set(chunk, cursor);
      cursor += chunk.length;
    }
  }
  const raw = await inflate(concatenated);
  const expected = (stride + 1) * height;
  if (raw.length < expected) throw new DeliveryError('png_truncated_pixels', 'PNG pixel data is incomplete');
  const pixels = unfilter(raw, width, height, Math.max(1, Math.ceil(bitsPerPixel / 8)), stride);

  // Expand to RGBA.
  const rgba = new Uint8Array(width * height * 4);
  const sample = (row: number, index: number): number => {
    if (depth === 8) return pixels[row * stride + index];
    if (depth === 16) return pixels[row * stride + index * 2];
    const bitOffset = index * depth;
    const byte = pixels[row * stride + (bitOffset >> 3)];
    const shift = 8 - depth - (bitOffset & 7);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = depth === 1 ? 255 : depth === 2 ? 85 : depth === 4 ? 17 : 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      if (colorType === 3) {
        const index = sample(y, x);
        const base = index * 3;
        rgba[target] = palette![base] ?? 0;
        rgba[target + 1] = palette![base + 1] ?? 0;
        rgba[target + 2] = palette![base + 2] ?? 0;
        rgba[target + 3] = 255;
      } else if (colorType === 0 || colorType === 4) {
        // Greyscale-with-alpha interleaves its two channels per pixel.
        const greyIndex = colorType === 4 ? x * channels : x;
        const grey = sample(y, greyIndex) * scale;
        rgba[target] = grey;
        rgba[target + 1] = grey;
        rgba[target + 2] = grey;
        rgba[target + 3] = colorType === 4 ? sample(y, greyIndex + 1) * scale : 255;
      } else {
        rgba[target] = sample(y, x * channels) * scale;
        rgba[target + 1] = sample(y, x * channels + 1) * scale;
        rgba[target + 2] = sample(y, x * channels + 2) * scale;
        rgba[target + 3] = colorType === 6 ? sample(y, x * channels + 3) * scale : 255;
      }
    }
  }

  return { width, height, rgba };
};

/** Encodes RGBA pixels back to a PNG (colour type 6, 8-bit, filter type 0). */
/**
 * Trims the empty margin around a decoded logo so the artwork itself fills the
 * frame. The official mark ships on a 512×512 canvas with a band of opaque
 * padding around it; served whole, that padding makes the logo look small (or,
 * paired with the rotated wordmark, sit far off centre). A `thumbnail` value is
 * the length of the final square's edge; when omitted the crop stays at the
 * source scale and is only as large as the artwork. Both delivery engines use
 * this one trim, so the header band, the stamping pipeline and the generated
 * page watermark always draw the same full logo.
 */
export const squareCropArtwork = (image: DecodedImage, thumbnail?: number): DecodedImage => {
  const { width, height, rgba } = image;
  const at = (x: number, y: number): number => rgba[(y * width + x) * 4 + 3];
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(x, y) > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return image;
  const artWidth = maxX - minX + 1;
  const artHeight = maxY - minY + 1;
  const side = Math.max(artWidth, artHeight);
  // Keep the artwork centred on the oversized axis so it reads as one mark and
  // not as a floating fragment weighted to one edge.
  const left = minX - Math.round((side - artWidth) / 2);
  const top = minY - Math.round((side - artHeight) / 2);
  const size = thumbnail && Number.isInteger(thumbnail) && thumbnail > 0 ? thumbnail : side;
  const out = new Uint8Array(size * size * 4);
  const remap = (px: number, py: number): number => {
    const sx = Math.min(width - 1, Math.max(0, Math.floor(left + (px / size) * side)));
    const sy = Math.min(height - 1, Math.max(0, Math.floor(top + (py / size) * side)));
    return (sy * width + sx) * 4;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const src = remap(x, y);
      const dst = (y * size + x) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = rgba[src + 3];
    }
  }
  return { width: size, height: size, rgba: out };
};

export const encodePng = async (image: DecodedImage): Promise<Uint8Array> => {
  const { width, height, rgba } = image;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const compressed = await deflate(raw);

  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(data.length + 12);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out[4] = type.charCodeAt(0);
    out[5] = type.charCodeAt(1);
    out[6] = type.charCodeAt(2);
    out[7] = type.charCodeAt(3);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [new Uint8Array(PNG_SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Canvas — the drawing surface used to stamp raster sources.
// ---------------------------------------------------------------------------

export const BRAND = {
  /** Matches the emerald used across the Code Rx client surfaces. */
  green: [5, 150, 105] as [number, number, number],
  greenDark: [4, 120, 87] as [number, number, number],
  ink: [15, 23, 42] as [number, number, number],
  slate: [100, 116, 139] as [number, number, number],
  watermark: [15, 23, 42] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export class Canvas {
  width: number;
  height: number;
  rgba: Uint8Array;

  constructor(width: number, height: number, rgba?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.rgba = rgba ?? new Uint8Array(width * height * 4);
  }

  static from(image: DecodedImage): Canvas {
    return new Canvas(image.width, image.height, image.rgba.slice());
  }

  clone(): Canvas {
    return new Canvas(this.width, this.height, this.rgba.slice());
  }

  blend(x: number, y: number, color: [number, number, number], alpha: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const target = (y * this.width + x) * 4;
    const a = Math.min(1, alpha);
    const existingAlpha = this.rgba[target + 3] / 255;
    const outAlpha = a + existingAlpha * (1 - a);
    if (outAlpha <= 0) return;
    for (let channel = 0; channel < 3; channel += 1) {
      const base = this.rgba[target + channel];
      const value = (color[channel] * a + base * existingAlpha * (1 - a)) / outAlpha;
      this.rgba[target + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
    this.rgba[target + 3] = Math.round(outAlpha * 255);
  }

  fillRect(x: number, y: number, width: number, height: number, color: [number, number, number], alpha = 1): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + width));
    const y1 = Math.min(this.height, Math.ceil(y + height));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) this.blend(px, py, color, alpha);
    }
  }

  strokeRect(x: number, y: number, width: number, height: number, color: [number, number, number], thickness = 1, alpha = 1): void {
    this.fillRect(x, y, width, thickness, color, alpha);
    this.fillRect(x, y + height - thickness, width, thickness, color, alpha);
    this.fillRect(x, y, thickness, height, color, alpha);
    this.fillRect(x + width - thickness, y, thickness, height, color, alpha);
  }

  /** Draws another canvas over this one at (x, y), optionally scaled. */
  drawImage(source: Canvas, x: number, y: number, scale = 1, alpha = 1): void {
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    for (let py = 0; py < height; py += 1) {
      const sourceY = Math.min(source.height - 1, Math.floor((py / height) * source.height));
      for (let px = 0; px < width; px += 1) {
        const sourceX = Math.min(source.width - 1, Math.floor((px / width) * source.width));
        const offset = (sourceY * source.width + sourceX) * 4;
        const pixelAlpha = (source.rgba[offset + 3] / 255) * alpha;
        if (pixelAlpha <= 0) continue;
        this.blend(x + px, y + py, [source.rgba[offset], source.rgba[offset + 1], source.rgba[offset + 2]], pixelAlpha);
      }
    }
  }

  /** Rotated text, used for the diagonal watermark that cannot be cropped off. */
  drawRotatedText(
    text: string,
    centerX: number,
    centerY: number,
    scale: number,
    angleRadians: number,
    color: [number, number, number],
    alpha: number,
  ): void {
    const font = BITMAP_FONT;
    const textWidth = text.length * (font.glyphWidth + font.glyphGap) * scale;
    const textHeight = font.glyphHeight * scale;
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    // Walk the rotated bounding box and inverse-map every pixel, so the glyph
    // bitmaps stay source-accurate at any angle.
    const radius = Math.ceil(Math.hypot(textWidth, textHeight) / 2) + 2;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const localX = dx * cos + dy * sin + textWidth / 2;
        const localY = -dx * sin + dy * cos + textHeight / 2;
        if (localX < 0 || localY < 0 || localX >= textWidth || localY >= textHeight) continue;
        const glyphIndex = Math.floor(localX / ((font.glyphWidth + font.glyphGap) * scale));
        const withinGlyph = Math.floor((localX % ((font.glyphWidth + font.glyphGap) * scale)) / scale);
        if (withinGlyph >= font.glyphWidth) continue;
        const row = Math.floor(localY / scale);
        const glyph = font.glyphs[text[glyphIndex]?.toUpperCase()] || font.glyphs['?'];
        if (!glyph) continue;
        if (glyph[row]?.[withinGlyph]) {
          this.blend(Math.round(centerX + dx), Math.round(centerY + dy), color, alpha);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Bitmap font — 5x7, used to stamp text into raster images without a font
// engine. Uppercase, digits and the punctuation the client copy needs.
// ---------------------------------------------------------------------------

const FONT_GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '·': ['00000', '00000', '01100', '01100', '00000', '00000', '00000'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export const BITMAP_FONT = { glyphs: FONT_GLYPHS, glyphWidth: 5, glyphHeight: 7, glyphGap: 1 };

export const BITMAP_FONT_LINE = 9;

/** Draws simple pixel text (uppercase) onto a canvas. Returns the width drawn. */
export const drawPixelText = (
  canvas: Canvas,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: [number, number, number],
  alpha = 1,
): number => {
  let cursor = x;
  for (const character of text.toUpperCase()) {
    const glyph = FONT_GLYPHS[character] || FONT_GLYPHS['?'];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === '1') {
          canvas.fillRect(cursor + column * scale, y + row * scale, scale, scale, color, alpha);
        }
      }
    }
    cursor += (BITMAP_FONT.glyphWidth + BITMAP_FONT.glyphGap) * scale;
  }
  return cursor - x;
};

export const pixelTextWidth = (text: string, scale: number): number =>
  text.length * (BITMAP_FONT.glyphWidth + BITMAP_FONT.glyphGap) * scale;

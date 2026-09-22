/**
 * CODE Rx SOCIETY — PDF engine for the client delivery pipeline.
 *
 * Two capabilities, both written here because the runtime has no PDF library:
 *
 *   `buildBrandedPdf`  — composes the Code Rx client document (header band,
 *                        logo, metadata block, body, per-page footer and
 *                        watermark) from the document's client-safe content.
 *   `stampPdfSource`   — takes an existing PDF that a client document points at,
 *                        flattens every page's content, appends the same
 *                        branding to each page, and rebuilds the file. The
 *                        original content streams are re-encoded in place, so the
 *                        delivered file contains only stamped pages.
 *
 * Everything fails closed: an input this engine cannot fully understand throws
 * `DeliveryError`, and the caller returns a controlled error instead of any
 * kind of passthrough.
 */

import {
  BRAND,
  DeliveryError,
  deflate,
  inflate,
  squareCropArtwork,
  type DecodedImage,
} from './client-delivery';

/**
 * PDF strings and content streams are byte-oriented (WinAnsiEncoding for text,
 * raw operators for graphics). `TextEncoder` would encode them as UTF-8 and
 * turn a middle dot into two bytes, so every string that goes into the file is
 * written through this Latin-1 encoder instead — one code point, one byte.
 */
const latin1Encode = (value: string): Uint8Array => {
  const out = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) out[index] = value.charCodeAt(index) & 0xff;
  return out;
};

/**
 * Resource names the stamping operators use. The generated-document path takes
 * the plain names; the source-PDF stamper prefixes everything with `Crx`, so the
 * stamp can never be shadowed by a font or graphics state the source already
 * defines under the same short name.
 */
export interface StampNames {
  bold: string;
  regular: string;
  mono: string;
  gs: string;
  headerLogo: string;
  watermarkLogo: string;
}

const GENERATED_NAMES: StampNames = {
  bold: 'F1', regular: 'F2', mono: 'F3', gs: 'GS1',
  headerLogo: 'CrxHeaderLogo', watermarkLogo: 'CrxWatermarkLogo',
};

const SOURCE_NAMES: StampNames = {
  bold: 'CrxF1', regular: 'CrxF2', mono: 'CrxF3', gs: 'CrxGS1',
  headerLogo: 'CrxHeaderLogo', watermarkLogo: 'CrxWatermarkLogo',
};

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export const STAMP_HEADLINE = 'CODE Rx SOCIETY';
export const STAMP_DESIGNATION = 'CLIENT PROJECT DOCUMENT';
export const STAMP_NOTE = 'Watermarked client copy — do not redistribute';

// ---------------------------------------------------------------------------
// Core font metrics (standard 14 AFM widths, /1000 em)
// ---------------------------------------------------------------------------

const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const COURIER_WIDTH = 600;

/**
 * Widths are deliberately taken as-is for Latin-1 and generously rounded up for
 * anything outside the table, so a line never overruns the printable area.
 */
const measure = (text: string, font: PdfFont, size: number): number => {
  const table = font === 'bold' ? HELVETICA_BOLD_WIDTHS : font === 'mono' ? null : HELVETICA_WIDTHS;
  let total = 0;
  for (const character of text) {
    const code = character.codePointAt(0) || 32;
    const width = table ? (table[code - 32] || 600) : COURIER_WIDTH;
    total += (width / 1000) * size;
  }
  return total;
};

export type PdfFont = 'regular' | 'bold' | 'mono';

// ---------------------------------------------------------------------------
// WinAnsi-safe text
// ---------------------------------------------------------------------------

const WIN_ANSI_SPECIALS: Record<string, string> = {
  '€': '', '‚': ',', 'ƒ': 'f', '„': '"', '…': '...', '†': '+', '‡': '+',
  'ˆ': '^', '‰': '%', 'Š': 'S', '‹': '<', 'Œ': 'OE', 'Ž': 'Z',
  '‘': "'", '’': "'", '“': '"', '”': '"', '•': '-', '–': '-', '—': '-',
  '˜': '~', '™': '(TM)', 'š': 's', '›': '>', 'œ': 'oe', 'ž': 'z', 'Ÿ': 'Y',
};

/** Maps a string onto WinAnsi-encodable characters (the core fonts' encoding). */
export const toWinAnsi = (value: string): string => {
  let out = '';
  for (const character of value.replace(/\r\n?/g, '\n')) {
    if (WIN_ANSI_SPECIALS[character] !== undefined) {
      out += WIN_ANSI_SPECIALS[character];
      continue;
    }
    const code = character.codePointAt(0) || 32;
    if (character === '\t') out += '    ';
    else if (code === 10) out += '\n';
    else if (code < 256) out += character;
    else if (code === 0x2018 || code === 0x2019) out += "'";
    else out += '?';
  }
  return out;
};

/**
 * Escapes a literal PDF string. The value is normalised to WinAnsi first: the
 * core fonts are only guaranteed to have glyphs for the 256 WinAnsi codes, so
 * an em dash or middle dot has to be mapped before it reaches the file.
 */
const escapePdfString = (value: string): string => {
  value = toWinAnsi(value);
  let out = '';
  for (const character of value) {
    const code = character.codePointAt(0) || 32;
    if (character === '(' || character === ')' || character === '\\') out += `\\${character}`;
    else if (code === 10) out += '\\n';
    else if (code === 13) out += '\\r';
    else if (code < 32) out += ' ';
    else out += character;
  }
  return out;
};

const pdfNumber = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

// ---------------------------------------------------------------------------
// Document builder
// ---------------------------------------------------------------------------

class PdfFile {
  private objects: Uint8Array[] = [];

  /** Adds an object and returns its 1-based object number. */
  add(body: Uint8Array | string): number {
    this.objects.push(typeof body === 'string' ? latin1Encode(body) : body);
    return this.objects.length;
  }

  /**
   * Claims an object number whose body is written later. The page tree and the
   * catalogue are circular (pages point at /Parent, the tree lists the pages),
   * so their slots are reserved up front instead of patched afterwards.
   */
  reserve(): number {
    this.objects.push(latin1Encode('null'));
    return this.objects.length;
  }

  setObject(number: number, body: string | Uint8Array): void {
    this.objects[number - 1] = typeof body === 'string' ? latin1Encode(body) : body;
  }

  /** Adds a FlateDecode stream object and returns its object number. */
  addStream(dictionary: string, data: Uint8Array): number {
    const body = data;
    const extras = ' /Filter /FlateDecode';
    const head = latin1Encode(`<< ${dictionary}${extras} /Length ${body.length} >>\nstream\n`);
    const tail = latin1Encode('\nendstream');
    const out = new Uint8Array(head.length + body.length + tail.length);
    out.set(head, 0);
    out.set(body, head.length);
    out.set(tail, head.length + body.length);
    return this.add(out);
  }

  async addCompressedStream(dictionary: string, text: string): Promise<number> {
    return this.addStream(dictionary, await deflate(latin1Encode(text)));
  }

  /** Snapshots the objects written so far so another writer can re-emit them. */
  async exportObjects(): Promise<Uint8Array[]> {
    return [...this.objects];
  }

  /** Writes the file with a classic cross-reference table. */
  async serialize(root: number, info: number | null, extraTrailer = ''): Promise<Uint8Array> {
    const map = new Map<number, string | Uint8Array>();
    this.objects.forEach((body, index) => map.set(index + 1, body));
    return serializePdf(map, { root, info, extra: extraTrailer });
  }
}

/** Flattens RGBA pixels onto a solid background and returns RGB bytes. */
const flattenToRgb = (image: DecodedImage, background: [number, number, number] = [255, 255, 255]): Uint8Array => {
  const out = new Uint8Array(image.width * image.height * 3);
  for (let index = 0; index < image.width * image.height; index += 1) {
    const source = index * 4;
    const alpha = image.rgba[source + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      out[index * 3 + channel] = Math.round(image.rgba[source + channel] * alpha + background[channel] * (1 - alpha));
    }
  }
  return out;
};

/** Adds an image XObject (FlateDecode + PNG predictors) and returns its object number. */
const addImageObject = async (file: PdfFile, image: DecodedImage, background?: [number, number, number]): Promise<number> => {
  const rgb = flattenToRgb(image, background);
  const compressed = await deflate(rgb);
  return file.addStream(
    `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} `
    + '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate true '
    + `/DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${image.width} >>`,
    compressed,
  );
};

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

interface StampMeta {
  projectName: string;
  projectReference: string;
  documentTitle: string;
  documentReference: string;
  version: string;
  clientName: string;
  category: string;
  issuedAt: Date;
}

const formatDate = (date: Date): string =>
  `${date.toISOString().slice(0, 10)}`;

const safe = (value: string | null | undefined, fallback = ''): string =>
  toWinAnsi(String(value ?? fallback)).replace(/[\n\r]+/g, ' ').trim();

/**
 * The header band (page 1), the slim running header (later pages), the footer
 * and the diagonal watermark. Returned as content-stream operators so the
 * branding is part of the page itself — it prints, it survives a re-save, and
 * there is nothing for a client to switch off.
 */
/** Circular clipping path in unit coordinates [0, 1] x [0, 1] to cleanly remove square bounding boxes/borders */
const circleClipPath = (cx = 0.5, cy = 0.5, r = 0.46): string => {
  const k = 0.552284749831 * r;
  return [
    `${(cx + r).toFixed(4)} ${cy.toFixed(4)} m`,
    `${(cx + r).toFixed(4)} ${(cy + k).toFixed(4)} ${(cx + k).toFixed(4)} ${(cy + r).toFixed(4)} ${cx.toFixed(4)} ${(cy + r).toFixed(4)} c`,
    `${(cx - k).toFixed(4)} ${(cy + r).toFixed(4)} ${(cx - r).toFixed(4)} ${(cy + k).toFixed(4)} ${(cx - r).toFixed(4)} ${cy.toFixed(4)} c`,
    `${(cx - r).toFixed(4)} ${(cy - k).toFixed(4)} ${(cx - k).toFixed(4)} ${(cy - r).toFixed(4)} ${cx.toFixed(4)} ${(cy - r).toFixed(4)} c`,
    `${(cx + k).toFixed(4)} ${(cy - r).toFixed(4)} ${(cx + r).toFixed(4)} ${(cy - k).toFixed(4)} ${(cx + r).toFixed(4)} ${cy.toFixed(4)} c`,
    'h W n',
  ].join('\n');
};

const headerOperators = (
  meta: StampMeta,
  logos: { header: number | null; watermark: number | null },
  names: StampNames = GENERATED_NAMES,
): string => {
  const lines: string[] = [];
  const bandHeight = 92;
  lines.push('q');
  lines.push(`${pdfNumber(BRAND.greenDark[0] / 255)} ${pdfNumber(BRAND.greenDark[1] / 255)} ${pdfNumber(BRAND.greenDark[2] / 255)} rg`);
  lines.push(`0 ${pdfNumber(PAGE_HEIGHT - bandHeight)} ${pdfNumber(PAGE_WIDTH)} ${bandHeight} re f`);
  lines.push(`${pdfNumber(BRAND.green[0] / 255)} ${pdfNumber(BRAND.green[1] / 255)} ${pdfNumber(BRAND.green[2] / 255)} rg`);
  lines.push(`0 ${pdfNumber(PAGE_HEIGHT - bandHeight)} ${pdfNumber(PAGE_WIDTH)} 3 re f`);
  lines.push('Q');

  if (logos.header !== null) {
    lines.push('q');
    lines.push(`44 0 0 44 44 ${pdfNumber(PAGE_HEIGHT - bandHeight + 24)} cm`);
    lines.push(circleClipPath(0.495, 0.510, 0.435));
    lines.push(`/${names.headerLogo} Do`);
    lines.push('Q');
  }

  const textX = logos.header !== null ? 100 : 44;
  lines.push('BT');
  lines.push(`/${names.bold} 16 Tf`);
  lines.push('1 1 1 rg');
  lines.push(`${pdfNumber(textX)} ${pdfNumber(PAGE_HEIGHT - 44)} Td`);
  lines.push(`(${escapePdfString(STAMP_HEADLINE)}) Tj`);
  lines.push('ET');

  lines.push('BT');
  lines.push(`/${names.bold} 8 Tf`);
  lines.push('0.85 0.93 0.89 rg');
  lines.push(`${pdfNumber(textX)} ${pdfNumber(PAGE_HEIGHT - 60)} Td`);
  lines.push(`(${escapePdfString(STAMP_DESIGNATION)}) Tj`);
  lines.push('ET');

  lines.push('BT');
  lines.push(`/${names.regular} 8 Tf`);
  lines.push('0.85 0.93 0.89 rg');
  const issued = `Issued ${formatDate(meta.issuedAt)}`;
  lines.push(`${pdfNumber(PAGE_WIDTH - 44 - measure(issued, 'regular', 8))} ${pdfNumber(PAGE_HEIGHT - 44)} Td`);
  lines.push(`(${escapePdfString(issued)}) Tj`);
  lines.push('ET');

  lines.push('BT');
  lines.push(`/${names.regular} 7.5 Tf`);
  lines.push('0.78 0.88 0.84 rg');
  const clientLine = safe(meta.clientName).toUpperCase();
  lines.push(`${pdfNumber(PAGE_WIDTH - 44 - measure(clientLine, 'regular', 7.5))} ${pdfNumber(PAGE_HEIGHT - 58)} Td`);
  lines.push(`(${escapePdfString(clientLine)}) Tj`);
  lines.push('ET');

  return lines.join('\n');
};

const runningHeaderOperators = (meta: StampMeta, names: StampNames = GENERATED_NAMES): string => {
  const lines: string[] = [];
  const text = `${STAMP_HEADLINE}  ·  ${STAMP_DESIGNATION}`;
  lines.push('q');
  lines.push('0.86 0.89 0.92 rg');
  lines.push(`44 ${pdfNumber(PAGE_HEIGHT - 60)} ${pdfNumber(PAGE_WIDTH - 88)} 0.6 re f`);
  lines.push('Q');
  lines.push('BT');
  lines.push(`/${names.regular} 8 Tf`);
  lines.push(`0.39 0.45 0.55 rg`);
  lines.push(`44 ${pdfNumber(PAGE_HEIGHT - 52)} Td`);
  lines.push(`(${escapePdfString(text)}) Tj`);
  lines.push('ET');
  lines.push('BT');
  lines.push(`/${names.regular} 8 Tf`);
  lines.push(`0.39 0.45 0.55 rg`);
  const right = safe(meta.documentReference);
  lines.push(`${pdfNumber(PAGE_WIDTH - 44 - measure(right, 'regular', 8))} ${pdfNumber(PAGE_HEIGHT - 52)} Td`);
  lines.push(`(${escapePdfString(right)}) Tj`);
  lines.push('ET');
  return lines.join('\n');
};

const footerOperators = (meta: StampMeta, page: number, total: number, names: StampNames = GENERATED_NAMES): string => {
  const lines: string[] = [];
  lines.push('q');
  lines.push('0.86 0.89 0.92 rg');
  lines.push(`44 54 ${pdfNumber(PAGE_WIDTH - 88)} 0.6 re f`);
  lines.push('Q');
  lines.push('BT');
  lines.push(`/${names.bold} 7.5 Tf`);
  lines.push('0.06 0.09 0.16 rg');
  lines.push(`44 40 Td`);
  lines.push(`(${escapePdfString(`${STAMP_HEADLINE} · ${STAMP_DESIGNATION}`)}) Tj`);
  lines.push('ET');
  lines.push('BT');
  lines.push(`/${names.regular} 7.5 Tf`);
  lines.push('0.39 0.45 0.55 rg');
  const pageLabel = `Page ${page} of ${total}`;
  lines.push(`${pdfNumber(PAGE_WIDTH - 44 - measure(pageLabel, 'regular', 7.5))} 40 Td`);
  lines.push(`(${escapePdfString(pageLabel)}) Tj`);
  lines.push('ET');
  lines.push('BT');
  lines.push(`/${names.regular} 7 Tf`);
  lines.push('0.45 0.5 0.58 rg');
  lines.push(`44 28 Td`);
  const detail = `${safe(meta.clientName)} · ${safe(meta.projectName)} · ${safe(meta.projectReference)}`
    + ` · ${safe(meta.documentReference)} · v${safe(meta.version)}`;
  lines.push(`(${escapePdfString(detail)}) Tj`);
  lines.push('ET');
  lines.push('BT');
  lines.push(`/${names.regular} 7 Tf`);
  lines.push('0.45 0.5 0.58 rg');
  lines.push(`${pdfNumber(PAGE_WIDTH - 44 - measure(STAMP_NOTE, 'regular', 7))} 28 Td`);
  lines.push(`(${escapePdfString(STAMP_NOTE)}) Tj`);
  lines.push('ET');
  return lines.join('\n');
};

/**
 * Where the single centred logo watermark sits on a page. A page may span both
 * an optional stamped source page and the generated A4 sheet, but the logo is
 * always centred on the delivered page and sized to roughly a third of the
 * smaller edge, so it never dwarfs a small source page. `leanRight` also slides
 * it slightly toward the lower right; the rotated `CODE Rx SOCIETY` wordmark is
 * always drawn along the opposite diagonal, so the two never collide.
 */
const markPosition = (pageWidth: number, pageHeight: number, leanRight: boolean) => {
  const markSize = Math.max(96, Math.min(260, Math.round(Math.min(pageWidth, pageHeight) * 0.46)));
  const angle = Math.atan2(1, 2.6);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const centerX = pageWidth / 2 + markSize * 0.2;
  const centerY = pageHeight / 2 - markSize * 0.26;
  const anchorX = centerX - (markSize / 2) * cos + (markSize / 2) * sin - (leanRight ? markSize * 0.08 : 0);
  const anchorY = centerY - (markSize / 2) * sin - (markSize / 2) * cos;
  return { markSize, angle, cos, sin, anchorX, anchorY };
};

/** The subtle page watermark: a single centred Code Rx mark, with the wordmark
 * on its own offset diagonal so it never overlaps the logo. */
const watermarkOperators = (
  logos: { watermark: number | null },
  names: StampNames = GENERATED_NAMES,
  options: { leanRight?: boolean } = {},
): string => {
  const lines: string[] = [];
  const word = 'CODE Rx SOCIETY';
  const size = 58;
  const width = measure(word, 'bold', size);
  const angle = Math.atan2(1, 2.6);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const centerX = PAGE_WIDTH / 2;
  const centerY = PAGE_HEIGHT / 2;

  if (logos.watermark !== null) {
    const logo = markPosition(PAGE_WIDTH, PAGE_HEIGHT, options.leanRight === true);
    lines.push('q');
    lines.push(`/${names.gs} gs`);
    lines.push(`${pdfNumber(logo.cos)} ${pdfNumber(logo.sin)} ${pdfNumber(-logo.sin)} ${pdfNumber(logo.cos)} `
      + `${pdfNumber(logo.anchorX)} ${pdfNumber(logo.anchorY)} cm`);
    lines.push(`${pdfNumber(logo.markSize)} 0 0 ${pdfNumber(logo.markSize)} 0 0 cm`);
    lines.push(circleClipPath(0.495, 0.510, 0.455));
    lines.push(`/${names.watermarkLogo} Do`);
    lines.push('Q');
  }

  // The wordmark stays below and to the left of centre, on the same diagonal as
  // the logo but offset far enough that the two never share a pixel.
  lines.push('q');
  lines.push(`/${names.gs} gs`);
  lines.push(`${pdfNumber(cos)} ${pdfNumber(sin)} ${pdfNumber(-sin)} ${pdfNumber(cos)} `
    + `${pdfNumber(centerX - (width / 2) * cos - 120)} ${pdfNumber(centerY - 4 - (width / 2) * sin - 110)} cm`);
  lines.push('BT');
  lines.push(`/${names.bold} ${size} Tf`);
  lines.push('0 0 0 rg');
  lines.push('0 0 Td');
  lines.push(`(${escapePdfString(word)}) Tj`);
  lines.push('ET');
  lines.push('Q');

  const small = 'CLIENT PROJECT DOCUMENT';
  lines.push('q');
  lines.push(`/${names.gs} gs`);
  lines.push(`${pdfNumber(cos)} ${pdfNumber(sin)} ${pdfNumber(-sin)} ${pdfNumber(cos)} `
    + `${pdfNumber(centerX - (measure(small, 'regular', 20) / 2) * cos - 120)} ${pdfNumber(centerY - 52 - (measure(small, 'regular', 20) / 2) * sin - 110)} cm`);
  lines.push('BT');
  lines.push(`/${names.regular} 20 Tf`);
  lines.push('0 0 0 rg');
  lines.push('0 0 Td');
  lines.push(`(${escapePdfString(small)}) Tj`);
  lines.push('ET');
  lines.push('Q');
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Body content model
// ---------------------------------------------------------------------------

export type ContentBlock =
  | { type: 'heading'; text: string; level: number }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'quote'; text: string }
  | { type: 'callout'; text: string; variant?: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'divider' }
  | { type: 'image'; caption?: string; image?: DecodedImage | null }
  | { type: 'file'; caption?: string };

interface BuildOptions {
  meta: StampMeta;
  blocks: ContentBlock[];
  logo?: DecodedImage | null;
}

const MARGIN = 44;
const CONTENT_TOP = PAGE_HEIGHT - 118;
const CONTENT_BOTTOM = 74;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const wrap = (text: string, font: PdfFont, size: number, maxWidth: number): string[] => {
  const paragraphs = safe(text).split('\n');
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      out.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, font, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) out.push(current);
      if (measure(word, font, size) <= maxWidth) {
        current = word;
        continue;
      }
      // A single unbreakable token: split it so it never overruns the margin.
      let piece = '';
      for (const character of word) {
        if (measure(piece + character, font, size) > maxWidth && piece) {
          out.push(piece);
          piece = character;
        } else {
          piece += character;
        }
      }
      current = piece;
    }
    if (current) out.push(current);
  }
  return out;
};

const colourOperator = (colour: [number, number, number]): string =>
  `${pdfNumber(colour[0] / 255)} ${pdfNumber(colour[1] / 255)} ${pdfNumber(colour[2] / 255)} rg`;

const textOperator = (text: string, font: string, size: number, x: number, y: number, colour: [number, number, number]): string =>
  `BT /${font} ${size} Tf ${colourOperator(colour)} ${pdfNumber(x)} ${pdfNumber(y)} Td `
  + `(${escapePdfString(text)}) Tj ET`;

const ROW_HEIGHT = 30;

/**
 * Renders a client document into a branded, watermarked, multi-page PDF.
 *
 * Page 1 leads with the metadata block the brief asks for (project, document,
 * reference, version, client, client-document designation); every page carries
 * the diagonal Code Rx watermark, the running header and the footer, so the
 * branding survives the viewer, a download and a print.
 */
export const buildBrandedPdf = async (options: BuildOptions): Promise<Uint8Array> => {
  const { meta, blocks } = options;
  const names = GENERATED_NAMES;
  const file = new PdfFile();
  const t = (text: string, font: PdfFont, size: number, x: number, y: number, colour: [number, number, number]): string =>
    textOperator(text, names[font], size, x, y, colour);

  const pagesRef = file.reserve();
  const catalogRef = file.reserve();
  const fontRegular = file.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = file.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontMono = file.add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const gstate = file.add('<< /Type /ExtGState /ca 0.10 /CA 0.10 /BM /Multiply >>');
  const headerLogo = options.logo ? await addImageObject(file, options.logo, BRAND.greenDark) : null;
  const watermarkLogo = options.logo ? await addImageObject(file, squareCropArtwork(options.logo), [255, 255, 255]) : null;

  const pages: string[][] = [];
  let pageLines: string[] = [];
  let cursorY = CONTENT_TOP;
  const bodyImages: Array<[string, number]> = [];

  const pushPage = () => {
    pages.push(pageLines);
    pageLines = [];
    cursorY = PAGE_HEIGHT - 92;
  };
  const ensure = (needed: number) => {
    if (cursorY - needed < CONTENT_BOTTOM) pushPage();
  };
  const emitLines = (
    text: string,
    font: PdfFont,
    size: number,
    leading: number,
    colour: [number, number, number],
    x = MARGIN,
  ) => {
    for (const line of wrap(text, font, size, CONTENT_WIDTH - (x - MARGIN))) {
      ensure(leading);
      pageLines.push(t(line, names[font], size, x, cursorY, colour));
      cursorY -= leading;
    }
  };

  // --- metadata block (page 1) ---------------------------------------------
  const metaRows: Array<[string, string]> = [
    ['Project', safe(meta.projectName)],
    ['Document', safe(meta.documentTitle)],
    ['Reference', safe(meta.documentReference)],
    ['Version', safe(meta.version)],
    ['Client', safe(meta.clientName)],
    ['Designation', `${STAMP_DESIGNATION} · ${STAMP_HEADLINE}`],
  ];
  const blockHeight = metaRows.length * ROW_HEIGHT + 18;
  pageLines.push('q');
  pageLines.push('0.94 0.97 0.95 rg');
  pageLines.push(`${MARGIN} ${pdfNumber(cursorY - blockHeight)} ${pdfNumber(CONTENT_WIDTH)} ${pdfNumber(blockHeight)} re f`);
  pageLines.push('0.85 0.91 0.87 RG 0.7 w');
  pageLines.push(`${MARGIN} ${pdfNumber(cursorY - blockHeight)} ${pdfNumber(CONTENT_WIDTH)} ${pdfNumber(blockHeight)} re S`);
  pageLines.push('Q');
  let rowY = cursorY - 26;
  for (const [label, value] of metaRows) {
    pageLines.push(t(label.toUpperCase(), 'bold', 7, MARGIN + 14, rowY + 8, BRAND.slate));
    pageLines.push(t(value.slice(0, 120), 'regular', 10, MARGIN + 130, rowY, BRAND.ink));
    rowY -= ROW_HEIGHT;
  }
  cursorY -= blockHeight + 22;
  pageLines.push(t(`Issued ${formatDate(meta.issuedAt)} by ${STAMP_HEADLINE}`, 'regular', 8.5, MARGIN, cursorY, BRAND.slate));
  cursorY -= 24;

  // --- body ----------------------------------------------------------------
  for (const block of blocks) {
    switch (block.type) {
      case 'heading': {
        const size = block.level <= 1 ? 15 : block.level === 2 ? 12.5 : 11;
        ensure(size + 18);
        if (cursorY < CONTENT_TOP - 4) cursorY -= 8;
        emitLines(block.text, 'bold', size, size + 6, BRAND.greenDark);
        cursorY -= 4;
        break;
      }
      case 'paragraph':
        emitLines(block.text, 'regular', 10.5, 15.5, BRAND.ink);
        cursorY -= 6;
        break;
      case 'list': {
        const items = block.items || [];
        for (let index = 0; index < items.length; index += 1) {
          const marker = block.ordered ? `${index + 1}.` : '•';
          const lines = wrap(items[index], 'regular', 10.5, CONTENT_WIDTH - 22);
          lines.forEach((line, lineIndex) => {
            ensure(15.5);
            if (lineIndex === 0) pageLines.push(t(marker, 'regular', 10.5, MARGIN + 6, cursorY, BRAND.green));
            pageLines.push(t(line, 'regular', 10.5, MARGIN + 22, cursorY, BRAND.ink));
            cursorY -= 15.5;
          });
        }
        cursorY -= 6;
        break;
      }
      case 'quote': {
        const lines = wrap(block.text, 'regular', 10.5, CONTENT_WIDTH - 26);
        const blockPixels = lines.length * 15.5 + 12;
        ensure(blockPixels);
        pageLines.push('q');
        pageLines.push(colourOperator(BRAND.green));
        pageLines.push(`${MARGIN} ${pdfNumber(cursorY - blockPixels + 10)} 2.5 ${pdfNumber(blockPixels)} re f`);
        pageLines.push('Q');
        for (const line of lines) {
          pageLines.push(t(line, 'regular', 10.5, MARGIN + 14, cursorY, BRAND.ink));
          cursorY -= 15.5;
        }
        cursorY -= 8;
        break;
      }
      case 'callout': {
        const lines = wrap(block.text, 'regular', 10.5, CONTENT_WIDTH - 30);
        const blockPixels = lines.length * 15.5 + 18;
        ensure(blockPixels);
        pageLines.push('q');
        pageLines.push('0.93 0.97 0.94 rg');
        pageLines.push(`${MARGIN} ${pdfNumber(cursorY - blockPixels + 10)} ${pdfNumber(CONTENT_WIDTH)} ${pdfNumber(blockPixels)} re f`);
        pageLines.push('Q');
        pageLines.push(t(STAMP_HEADLINE, 'bold', 6.5, MARGIN + 12, cursorY - 2, BRAND.greenDark));
        cursorY -= 16;
        for (const line of lines) {
          pageLines.push(t(line, 'regular', 10.5, MARGIN + 12, cursorY, BRAND.ink));
          cursorY -= 15.5;
        }
        cursorY -= 10;
        break;
      }
      case 'code': {
        const lines = safe(block.text).split('\n').flatMap((line) => wrap(line || ' ', 'mono', 9, CONTENT_WIDTH - 24));
        for (const line of lines) {
          ensure(12.5);
          pageLines.push('q');
          pageLines.push('0.96 0.97 0.98 rg');
          pageLines.push(`${MARGIN} ${pdfNumber(cursorY - 3)} ${pdfNumber(CONTENT_WIDTH)} 12.5 re f`);
          pageLines.push('Q');
          pageLines.push(t(line, 'mono', 9, MARGIN + 10, cursorY, BRAND.ink));
          cursorY -= 12.5;
        }
        cursorY -= 8;
        break;
      }
      case 'table': {
        const rows = (block.rows || []).filter((row) => row.length);
        if (!rows.length) break;
        const columns = Math.max(...rows.map((row) => row.length));
        const columnWidth = CONTENT_WIDTH / columns;
        for (const row of rows) {
          const cellLines = Array.from({ length: columns }, (_value, index) =>
            wrap(row[index] ?? '', 'regular', 9.5, columnWidth - 12));
          const rowLines = Math.max(1, ...cellLines.map((lines) => lines.length));
          const rowPixels = rowLines * 13 + 10;
          ensure(rowPixels);
          pageLines.push('q');
          pageLines.push('0.88 0.9 0.93 RG 0.5 w');
          pageLines.push(`${MARGIN} ${pdfNumber(cursorY - rowPixels + 8)} ${pdfNumber(CONTENT_WIDTH)} ${pdfNumber(rowPixels)} re S`);
          pageLines.push('Q');
          for (let index = 0; index < columns; index += 1) {
            cellLines[index].forEach((line, lineIndex) => {
              pageLines.push(t(
                line, 'regular', 9.5, MARGIN + index * columnWidth + 6, cursorY - lineIndex * 13, BRAND.ink,
              ));
            });
            if (index > 0) {
              pageLines.push('q');
              pageLines.push('0.88 0.9 0.93 rg');
              pageLines.push(`${pdfNumber(MARGIN + index * columnWidth)} ${pdfNumber(cursorY - rowPixels + 8)} 0.5 ${pdfNumber(rowPixels)} re f`);
              pageLines.push('Q');
            }
          }
          cursorY -= rowPixels;
        }
        cursorY -= 10;
        break;
      }
      case 'divider':
        ensure(18);
        pageLines.push('q');
        pageLines.push('0.85 0.88 0.91 rg');
        pageLines.push(`${MARGIN} ${pdfNumber(cursorY + 4)} ${pdfNumber(CONTENT_WIDTH)} 0.8 re f`);
        pageLines.push('Q');
        cursorY -= 18;
        break;
      case 'image': {
        if (!block.image) {
          emitLines(block.caption ? `${block.caption} — image available on request.` : 'Image available on request.',
            'regular', 9.5, 14, BRAND.slate);
          break;
        }
        const scale = Math.min(CONTENT_WIDTH / block.image.width, 320 / block.image.height, 1);
        const drawWidth = block.image.width * scale;
        const drawHeight = block.image.height * scale;
        ensure(drawHeight + 26);
        const name = `CrxBody${bodyImages.length + 1}`;
        const ref = await addImageObject(file, block.image);
        bodyImages.push([name, ref]);
        pageLines.push('q');
        pageLines.push(`${pdfNumber(drawWidth)} 0 0 ${pdfNumber(drawHeight)} ${pdfNumber(MARGIN)} ${pdfNumber(cursorY - drawHeight)} cm`);
        pageLines.push(`/${name} Do`);
        pageLines.push('Q');
        cursorY -= drawHeight + 6;
        if (block.caption) emitLines(block.caption, 'regular', 8.5, 12, BRAND.slate);
        break;
      }
      case 'file':
        emitLines(block.caption ? `${block.caption} — attached file available on request.` : 'Attached file available on request.',
          'regular', 9.5, 14, BRAND.slate);
        break;
      default:
        break;
    }
  }
  pages.push(pageLines);

  // --- pages ---------------------------------------------------------------
  const total = pages.length;
  const pageRefs: number[] = [];
  const imageResources = bodyImages.length
    ? ` /XObject << ${bodyImages.map(([name, ref]) => `/${name} ${ref} 0 R`).join(' ')} >>`
    : '';

  for (let index = 0; index < total; index += 1) {
    const pageNumber = index + 1;
    const ops = [
      watermarkOperators({ watermark: watermarkLogo }, names),
      pageNumber === 1
        ? headerOperators(meta, { header: headerLogo, watermark: watermarkLogo }, names)
        : runningHeaderOperators(meta),
      ...pages[index],
      footerOperators(meta, pageNumber, total),
    ].join('\n');
    const content = await file.addCompressedStream('', ops);
    const xobject = [
      headerLogo !== null ? `/${names.headerLogo} ${headerLogo} 0 R` : '',
      watermarkLogo !== null ? `/${names.watermarkLogo} ${watermarkLogo} 0 R` : '',
    ].filter(Boolean).join(' ');
    const resources = `<< /Font << /${names.bold} ${fontBold} 0 R /${names.regular} ${fontRegular} 0 R /${names.mono} ${fontMono} 0 R >>`
      + ` /ExtGState << /${names.gs} ${gstate} 0 R >>`
      + ` /XObject << ${xobject}${imageResources} >> >>`;
    pageRefs.push(file.add(
      `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${pdfNumber(PAGE_WIDTH)} ${pdfNumber(PAGE_HEIGHT)}] `
      + `/Resources ${resources} /Contents ${content} 0 R >>`,
    ));
  }

  file.setObject(pagesRef, `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  file.setObject(catalogRef, `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);

  const info = file.add(
    `<< /Title (${escapePdfString(`${safe(meta.documentTitle)} — ${safe(meta.documentReference)}`)}) `
    + `/Author (${escapePdfString(STAMP_HEADLINE)}) `
    + `/Subject (${escapePdfString(`${STAMP_DESIGNATION}: ${safe(meta.projectName)} (${safe(meta.projectReference)}) ${safe(meta.documentReference)} v${safe(meta.version)}`)}) `
    + `/Keywords (${escapePdfString(`${STAMP_HEADLINE}, ${STAMP_DESIGNATION}, ${safe(meta.projectName)}, ${safe(meta.documentReference)}, v${safe(meta.version)}, ${safe(meta.clientName)}`)}) `
    + `/Creator (${escapePdfString(`${STAMP_HEADLINE} Client Portal`)}) `
    + `/Producer (${escapePdfString(`${STAMP_HEADLINE} stamping pipeline`)}) `
    + `/CreationDate (D:${meta.issuedAt.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z) >>`,
  );

  return file.serialize(catalogRef, info);
};

/**
 * Repaints an existing PDF's pages with the Code Rx branding.
 *
 * Every page's content streams are decoded, their own drawing is preserved, and
 * the branding operators are appended — so the delivered file contains stamped
 * pages only. The page dictionary is rewritten (`/Contents` and `/Resources`
 * point at the flattened stream and a merged resource dictionary), the original
 * content streams are dropped, unreachable leftovers are pruned, and the whole
 * file is re-emitted with a fresh cross-reference table.
 *
 * Returns `null` when the source uses a PDF feature this engine cannot verify —
 * the caller then refuses the delivery rather than sending anything unstamped.
 */
/** Either the stamped bytes, or the reason the source could not be stamped. */
export type StampResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: DeliveryError };

export const stampPdfSource = async (
  source: Uint8Array,
  meta: StampMeta,
  logo: DecodedImage | null | undefined,
): Promise<StampResult> => {
  try {
    return { ok: true, bytes: await stampPdfInternal(source, meta, logo) };
  } catch (error) {
    const failure = error instanceof DeliveryError
      ? error
      : new DeliveryError('pdf_stamp_failed', error instanceof Error ? error.message : String(error));
    return { ok: false, error: failure };
  }
};

/** Fonts, images and graphics state the stamp itself needs, numbered from 1. */
const buildStampFurniture = async (
  file: PdfFile,
  logo: DecodedImage | null | undefined,
): Promise<{ fontRegular: number; fontBold: number; gstate: number; headerLogo: number | null; watermarkLogo: number | null }> => {
  const fontRegular = file.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = file.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const gstate = file.add('<< /Type /ExtGState /ca 0.10 /CA 0.10 /BM /Multiply >>');
  const headerLogo = logo ? await addImageObject(file, logo, BRAND.greenDark) : null;
  const watermarkLogo = logo ? await addImageObject(file, squareCropArtwork(logo), [255, 255, 255]) : null;
  return { fontRegular, fontBold, gstate, headerLogo, watermarkLogo };
};

const stampPdfInternal = async (
  source: Uint8Array,
  meta: StampMeta,
  logo: DecodedImage | null | undefined,
): Promise<Uint8Array> => {
  const text = decoder.decode(source);
  if (!text.startsWith('%PDF-')) throw new DeliveryError('pdf_not_pdf', 'Not a PDF file');
  if (text.includes('/Encrypt')) throw new DeliveryError('pdf_encrypted', 'Encrypted PDFs are not supported');
  if (text.includes('/ObjStm') || /\/Type\s*\/XRef/.test(text)) {
    throw new DeliveryError('pdf_modern_xref', 'This PDF uses cross-reference streams, which the stamper does not rewrite');
  }
  if (dictContainsName(text, 'JavaScript') || dictContainsName(text, 'EmbeddedFile')) {
    throw new DeliveryError('pdf_unsafe_features', 'The PDF carries scripts or embedded files');
  }

  const objects = parsePdfObjects(source, text);
  const trailer = `<<${text.match(/trailer\s*<<([\s\S]*?)>>/)?.[1] || ''}>>`;
  const rootValue = findDictValue(trailer, 'Root');
  const rootRef = rootValue ? parseIndirectRef(trailer.slice(rootValue.start, rootValue.end)) : null;
  if (!rootRef) throw new DeliveryError('pdf_no_root', 'The trailer has no catalogue');
  const root = objects.get(rootRef);
  if (!root) throw new DeliveryError('pdf_no_catalogue', 'The catalogue is missing');

  const valueOf = (dictionary: string, key: string): string | null => {
    const range = findDictValue(dictionary, key);
    return range ? dictionary.slice(range.start, range.end).trim() : null;
  };
  const pagesRef = parseIndirectRef(valueOf(root.text, 'Pages') || '');
  if (!pagesRef) throw new DeliveryError('pdf_no_pages', 'The catalogue has no page tree');
  const pagesNode = objects.get(pagesRef);
  if (!pagesNode) throw new DeliveryError('pdf_no_pages', 'The page tree node is missing');

  // --- walk the page tree ---------------------------------------------------
  const pageNumbers: number[] = [];
  const walk = (number: number, inherited: { mediaBox?: string; resources?: string }, depth = 0): void => {
    if (depth > 64) throw new DeliveryError('pdf_page_tree_deep', 'The page tree is unreasonably deep');
    const node = objects.get(number);
    if (!node) throw new DeliveryError('pdf_page_missing', `Page node ${number} is missing`);
    const nextInherited = {
      mediaBox: valueOf(node.text, 'MediaBox') || inherited.mediaBox,
      resources: valueOf(node.text, 'Resources') || inherited.resources,
    };
    if (valueOf(node.text, 'Type') === '/Pages') {
      const kids = valueOf(node.text, 'Kids') || '';
      if (!kids.startsWith('[')) throw new DeliveryError('pdf_kids_missing', 'A page tree node has no /Kids array');
      const refs = [...kids.matchAll(/(\d+)\s+\d+\s+R/g)].map((match) => Number(match[1]));
      if (!refs.length) throw new DeliveryError('pdf_kids_empty', 'An empty page tree node');
      for (const kid of refs) walk(kid, nextInherited, depth + 1);
      return;
    }
    pageNumbers.push(number);
    mediaBoxes.set(number, nextInherited.mediaBox || null);
    inheritedResources.set(number, nextInherited.resources || null);
  };
  const mediaBoxes = new Map<number, string | null>();
  const inheritedResources = new Map<number, string | null>();
  walk(pagesRef, {});

  // --- stamp furniture ------------------------------------------------------
  const furniture = new PdfFile();
  const { fontRegular, fontBold, gstate, headerLogo, watermarkLogo } = await buildStampFurniture(furniture, logo);
  const furnitureObjects = await furniture.exportObjects();
  const furnitureBase = Math.max(0, ...objects.keys());
  const furnitureNumber = (local: number): number => furnitureBase + local;
  const contentBase = furnitureBase + furnitureObjects.length;

  // --- per-page flattening --------------------------------------------------
  const emitted = new Map<number, string | Uint8Array>();
  const droppedObjects = new Set<number>();
  const pages: Array<{ number: number; contentNumber: number; resources: string }> = [];

  for (const pageNumber of pageNumbers) {
    const page = objects.get(pageNumber)!;
    const mediaBox = mediaBoxes.get(pageNumber) || '[0 0 612 792]';
    const box = mediaBox.match(/-?[\d.]+/g)?.map(Number) || [];
    if (box.length < 4) throw new DeliveryError('pdf_bad_mediabox', 'A page has no usable /MediaBox');
    const [x0, y0, x1, y1] = box;
    const pageWidth = x1 - x0;
    const pageHeight = y1 - y0;
    if (!(pageWidth > 0) || !(pageHeight > 0)) throw new DeliveryError('pdf_bad_mediabox', 'A page has an empty /MediaBox');

    const contentsValue = valueOf(page.text, 'Contents');
    if (!contentsValue) throw new DeliveryError('pdf_no_contents', 'A page has no /Contents');
    const contentRefs = contentsValue.startsWith('[')
      ? [...contentsValue.matchAll(/(\d+)\s+\d+\s+R/g)].map((match) => Number(match[1]))
      : [parseIndirectRef(contentsValue)].filter((value): value is number => value !== null);
    if (!contentRefs.length) throw new DeliveryError('pdf_no_contents', 'A page has no content stream');

    const parts: string[] = [];
    for (const ref of contentRefs) {
      const streamObject = objects.get(ref);
      if (!streamObject || !streamObject.stream) throw new DeliveryError('pdf_stream_missing', `Content stream ${ref} is missing`);
      parts.push(await decodeStreamText(streamObject));
      droppedObjects.add(ref);
    }

    // Uniform scale so the branding keeps its proportions on any page size, and
    // anchored to the page's top-left edge so the footer lands in the margin.
    const scale = Math.min(pageWidth / PAGE_WIDTH, pageHeight / PAGE_HEIGHT);
    const translateX = x0;
    const translateY = y1 - PAGE_HEIGHT * scale;
    const transform = `${pdfNumber(scale)} 0 0 ${pdfNumber(scale)} ${pdfNumber(translateX)} ${pdfNumber(translateY)} cm`;
    const pageIndex = pageNumbers.indexOf(pageNumber);

    const stampStream = [
      'q',
      transform,
      // The stamped source's own artwork is opaque and can sit on top of the
      // transparent watermark group; the rotated wordmark is kept on the
      // opposite diagonal from the centred logo so neither clashes with the
      // client's content.
      watermarkOperators({ watermark: watermarkLogo === null ? null : furnitureNumber(watermarkLogo) }, SOURCE_NAMES, { leanRight: true }),
      'Q',
      'q',
      parts.join('\n'),
      'Q',
      'q',
      transform,
      runningHeaderOperators(meta, SOURCE_NAMES),
      footerOperators(meta, pageIndex + 1, pageNumbers.length),
      'Q',
    ].join('\n');

    const contentNumber = contentBase + pages.length + 1;
    emitted.set(contentNumber, await compressedStream(stampStream));

    const originalResources = inheritedResources.get(pageNumber) || null;
    const resources = mergeStampResources(originalResources, {
      font: {
        [SOURCE_NAMES.bold]: furnitureNumber(fontBold),
        [SOURCE_NAMES.regular]: furnitureNumber(fontRegular),
      },
      xobject: {
        ...(watermarkLogo === null ? {} : { [SOURCE_NAMES.watermarkLogo]: furnitureNumber(watermarkLogo) }),
        ...(headerLogo === null ? {} : { [SOURCE_NAMES.headerLogo]: furnitureNumber(headerLogo) }),
      },
      gstate: { [SOURCE_NAMES.gs]: furnitureNumber(gstate) },
    });
    pages.push({ number: pageNumber, contentNumber, resources });
  }

  // --- rewritten page dictionaries -----------------------------------------
  for (const page of pages) {
    const original = objects.get(page.number)!.text;
    emitted.set(page.number, rewritePageDictionary(
      original,
      page.contentNumber,
      page.resources,
      mediaBoxes.get(page.number) || '[0 0 612 792]',
    ));
  }

  // --- reachability: nothing unreferenced survives into the delivery --------
  const reachable = new Set<number>();
  const queue: number[] = [rootRef];
  const infoRange = findDictValue(trailer, 'Info');
  const infoRef = infoRange ? parseIndirectRef(trailer.slice(infoRange.start, infoRange.end)) : null;
  if (infoRef) queue.push(infoRef);
  while (queue.length) {
    const number = queue.pop()!;
    if (reachable.has(number) || droppedObjects.has(number)) continue;
    const object = objects.get(number);
    if (!object) continue;
    reachable.add(number);
    for (const reference of collectReferences(object.text)) queue.push(reference);
  }

  const emit = new Map<number, string | Uint8Array>();
  for (const [number, object] of objects) {
    if (!reachable.has(number) || droppedObjects.has(number)) continue;
    emit.set(number, object.stream ? withStream(object.text, object.stream) : object.text);
  }
  for (const [number, body] of emitted) emit.set(number, body);
  for (let index = 0; index < furnitureObjects.length; index += 1) {
    emit.set(furnitureBase + index + 1, furnitureObjects[index]);
  }

  return serializePdf(emit, {
    root: rootRef,
    info: infoRef,
    extra: `/Producer (${escapePdfString(`${STAMP_HEADLINE} stamping pipeline`)})`,
  });
};

/**
 * Merges the stamp's resource names into whatever the page already had. Every
 * original entry is preserved; an existing sub-dictionary is extended in place,
 * and an indirect sub-dictionary is referenced through a fresh direct dictionary
 * so the page keeps its own fonts and images.
 */
const mergeStampResources = (
  originalResources: string | null,
  additions: MergeOptions,
): string => {
  if (!originalResources) {
    const render = (entries: Record<string, number> | undefined) =>
      Object.entries(entries || {}).map(([name, ref]) => `/${name} ${ref} 0 R`).join(' ');
    return `<< /Font << ${render(additions.font)} >> /XObject << ${render(additions.xobject)} >>`
      + ` /ExtGState << ${render(additions.gstate)} >> >>`;
  }
  return mergeResourceDict(originalResources, additions);
};

const decodeStreamText = async (object: PdfObject): Promise<string> => {
  const filters = findDictValue(object.text, 'Filter');
  const filterText = (filters ? object.text.slice(filters.start, filters.end) : '').trim();
  if (!filterText) return decoder.decode(object.stream as Uint8Array);
  if (filterText === '/FlateDecode' || filterText === '/Fl') {
    try {
      return decoder.decode(await inflate(object.stream as Uint8Array));
    } catch {
      throw new DeliveryError('pdf_stream_undecodable', 'A content stream could not be decoded');
    }
  }
  throw new DeliveryError('pdf_unsupported_filter', 'A content stream uses an unsupported filter');
};

const rewritePageDictionary = (
  dictionary: string,
  contentsNumber: number,
  resources: string,
  mediaBox: string,
): string => {
  const open = dictionary.indexOf('<<');
  if (open === -1) throw new DeliveryError('pdf_page_not_dict', 'A page object is not a dictionary');
  let body = dictionary.slice(open);
  const close = body.lastIndexOf('>>');
  body = body.slice(0, close);
  for (const key of ['Contents', 'Resources', 'MediaBox']) {
    const removeKey = (target: string, name: string): string => {
      const range = findDictValue(`<<${target}>>`, name);
      if (!range) return target;
      return target.slice(0, range.start) + target.slice(range.end);
    };
    body = removeKey(body, key);
  }
  const cleanBox = mediaBox.match(/-?[\d.]+/g)?.slice(0, 4).map(Number) || [0, 0, 612, 792];
  return `<< ${body} /MediaBox [${cleanBox.map((value) => pdfNumber(value)).join(' ')}] `
    + `/Resources ${resources} /Contents ${contentsNumber} 0 R >>`;
};

export interface MergeOptions {
  font?: Record<string, number>;
  xobject?: Record<string, number>;
  gstate?: Record<string, number>;
}

/**
 * Inserts the stamp's font, image and graphics-state names into an existing
 * resource dictionary. Names are prefixed `Crx` so they collide with nothing a
 * source is likely to define, and every existing entry survives.
 */
export const mergeResourceDict = (dictionary: string, additions: MergeOptions): string => {
  const open = dictionary.indexOf('<<');
  if (open === -1) throw new DeliveryError('pdf_bad_resources', 'A resource dictionary is malformed');
  let body = dictionary.slice(open + 2);
  const close = body.lastIndexOf('>>');
  if (close === -1) throw new DeliveryError('pdf_bad_resources', 'A resource dictionary is unterminated');
  body = body.slice(0, close);

  // Everything below works on the wrapped dictionary, so the ranges
  // `findDictValue` returns can be applied to this string directly.
  let wrapper = `<<${body}>>`;
  const groups: Array<[string, Record<string, number> | undefined]> = [
    ['Font', additions.font],
    ['XObject', additions.xobject],
    ['ExtGState', additions.gstate],
  ];

  for (const [key, entries] of groups) {
    if (!entries || !Object.keys(entries).length) continue;
    const insertion = Object.entries(entries).map(([name, ref]) => `/${name} ${ref} 0 R`).join(' ');
    const range = findDictValue(wrapper, key);
    if (!range) {
      wrapper = `${wrapper.slice(0, -2)} /${key} << ${insertion} >> >>`;
      continue;
    }
    const value = wrapper.slice(range.start, range.end);
    if (value.trim().startsWith('<<')) {
      const inner = value.trim();
      wrapper = wrapper.slice(0, range.start) + `${inner.slice(0, -2)} ${insertion} >>` + wrapper.slice(range.end);
      continue;
    }
    // An indirect sub-dictionary: the page gets a direct dictionary that keeps
    // the source's entries and adds ours, rather than losing the source's names.
    const referencedValue = value.trim();
    if (parseIndirectRef(referencedValue) === null) {
      throw new DeliveryError('pdf_bad_resources', `The /${key} resource sub-dictionary is malformed`);
    }
    wrapper = wrapper.slice(0, range.start) + `<< ${insertion} ${referencedValue} >>` + wrapper.slice(range.end);
  }
  return wrapper;
};

// ---------------------------------------------------------------------------
// Source-PDF parsing helpers
// ---------------------------------------------------------------------------

const parsePdfObjects = (source: Uint8Array, text: string): Map<number, PdfObject> => {
  const startXref = /startxref\s+(\d+)/g;
  let match: RegExpExecArray | null;
  let lastOffset: number | null = null;
  while ((match = startXref.exec(text)) !== null) lastOffset = Number(match[1]);
  if (lastOffset === null) throw new DeliveryError('pdf_no_xref', 'No cross-reference table');

  const offsets = new Map<number, number>();
  const seen = new Set<number>();
  let xrefOffset: number | null = lastOffset;
  while (xrefOffset !== null && !seen.has(xrefOffset)) {
    seen.add(xrefOffset);
    if (!text.startsWith('xref', xrefOffset)) throw new DeliveryError('pdf_modern_xref', 'Only classic cross-reference tables are supported');
    let cursor = xrefOffset + 4;
    while (true) {
      const header = /^\s*(\d+)\s+(\d+)\s*/.exec(text.slice(cursor, cursor + 40));
      if (!header) break;
      let first = Number(header[1]);
      const count = Number(header[2]);
      cursor += header[0].length;
      for (let index = 0; index < count; index += 1) {
        const entry = text.slice(cursor, cursor + 20);
        const parsed = /^(\d{10})\s(\d{5})\s([nf])/.exec(entry);
        if (!parsed) throw new DeliveryError('pdf_bad_xref_entry', 'Malformed cross-reference entry');
        if (parsed[3] === 'n' && !offsets.has(first)) offsets.set(first, Number(parsed[1]));
        first += 1;
        cursor += 20;
      }
      if (/^\s*trailer/.test(text.slice(cursor))) break;
    }
    const trailerMatch = /trailer\s*<<([\s\S]*?)>>/.exec(text.slice(cursor));
    if (!trailerMatch) throw new DeliveryError('pdf_no_trailer', 'No trailer dictionary');
    const dictionary = `<<${trailerMatch[1]}>>`;
    const previous = findDictValue(dictionary, 'Prev');
    const previousValue = previous ? Number(dictionary.slice(previous.start, previous.end).trim()) : NaN;
    xrefOffset = Number.isFinite(previousValue) && previousValue > 0 ? previousValue : null;
  }

  const objects = new Map<number, PdfObject>();
  for (const [number, offset] of offsets) {
    if (!number) continue;
    const header = new RegExp(`^${number}\\s+(\\d+)\\s+obj`).exec(text.slice(offset, offset + 40));
    if (!header) throw new DeliveryError('pdf_object_missing', `Object ${number} is not where the xref says it is`);
    const bodyStart = offset + header[0].length;
    const endIndex = text.indexOf('endobj', bodyStart);
    if (endIndex === -1) throw new DeliveryError('pdf_object_unterminated', `Object ${number} has no endobj`);
    let bodyText = text.slice(bodyStart, endIndex);
    let stream: Uint8Array | undefined;
    const streamMatch = /stream\s*(\r\n|\n|\r)/.exec(bodyText);
    if (streamMatch) {
      const dictionaryText = bodyText.slice(0, streamMatch.index);
      const streamStart = bodyStart + streamMatch.index + streamMatch[0].length;
      const endStreamIndex = text.indexOf('endstream', streamStart);
      if (endStreamIndex === -1) throw new DeliveryError('pdf_stream_unterminated', `Object ${number} has no endstream`);
      const available = endStreamIndex - streamStart;
      const lengthRange = findDictValue(dictionaryText, 'Length');
      const declared = lengthRange ? Number(dictionaryText.slice(lengthRange.start, lengthRange.end).trim()) : NaN;
      // A producer whose /Length disagrees with the bytes on disk must not make
      // the reader swallow the `endstream` marker or read past the object.
      const streamLength = Number.isFinite(declared) && declared > 0 && declared <= available ? declared : available;
      stream = source.subarray(streamStart, streamStart + streamLength);
      bodyText = dictionaryText;
    }
    objects.set(number, { number, generation: Number(header[1]), offset, text: bodyText, stream });
  }
  return objects;
};

/** Every indirect reference a dictionary/array body contains (strings excluded). */
export const collectReferences = (body: string): number[] => {
  const refs: number[] = [];
  let index = 0;
  while (index < body.length) {
    const token = readToken(body, index);
    if (token.kind === 'eof') break;
    if (token.kind === 'string' || token.kind === 'hex' || token.kind === 'name' || token.kind === 'dict-open'
      || token.kind === 'dict-close' || token.kind === 'array-open' || token.kind === 'array-close') {
      index = token.end;
      continue;
    }
    if (token.kind === 'word' && /^\d+$/.test(token.token)) {
      const second = readToken(body, token.end);
      if (second.kind === 'word' && /^\d+$/.test(second.token)) {
        const third = readToken(body, second.end);
        if (third.kind === 'word' && third.token === 'R') {
          refs.push(Number(token.token));
          index = third.end;
          continue;
        }
      }
    }
    index = token.end;
  }
  return refs;
};

const withStream = (dictionary: string, stream: Uint8Array): Uint8Array => {
  const head = latin1Encode(`${dictionary}stream\n`);
  const tail = latin1Encode('\nendstream');
  const out = new Uint8Array(head.length + stream.length + tail.length);
  out.set(head, 0);
  out.set(stream, head.length);
  out.set(tail, head.length + stream.length);
  return out;
};

const compressedStream = async (content: string): Promise<Uint8Array> => {
  const compressed = await deflate(latin1Encode(content));
  const head = latin1Encode(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`);
  const tail = latin1Encode('\nendstream');
  const out = new Uint8Array(head.length + compressed.length + tail.length);
  out.set(head, 0);
  out.set(compressed, head.length);
  out.set(tail, head.length + compressed.length);
  return out;
};

export interface SerializeOptions {
  root: number;
  info?: number | null;
  extra?: string;
}

/** Writes a complete PDF file: header, objects, classic xref table, trailer. */
export const serializePdf = (objects: Map<number, string | Uint8Array>, options: SerializeOptions): Uint8Array => {
  const numbers = [...objects.keys()].sort((a, b) => a - b);
  const size = Math.max(...numbers) + 1;
  const header = latin1Encode('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');
  const chunks: Uint8Array[] = [header];
  const offsets = new Map<number, number>();
  let offset = header.length;
  for (const number of numbers) {
    const body = objects.get(number)!;
    const bodyBytes = typeof body === 'string' ? latin1Encode(body) : body;
    const head = latin1Encode(`${number} 0 obj\n`);
    const tail = latin1Encode('\nendobj\n');
    offsets.set(number, offset);
    chunks.push(head, bodyBytes, tail);
    offset += head.length + bodyBytes.length + tail.length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let number = 1; number < size; number += 1) {
    const position = offsets.get(number);
    xref += position === undefined
      ? '0000000000 65535 f \n'
      : `${String(position).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${size} /Root ${options.root} 0 R`;
  if (options.info) xref += ` /Info ${options.info} 0 R`;
  if (options.extra) xref += ` ${options.extra}`;
  xref += ` >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(latin1Encode(xref));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Low-level PDF tokenizer
//
// Shared by the object walker: `findDictValue` locates a top-level key while
// balancing nested dictionaries, `readToken` understands the five PDF token
// shapes, and `collectReferences` finds the indirect references inside a body.
// ---------------------------------------------------------------------------

const decoder = new TextDecoder('latin1');

const isWhitespace = (character: string): boolean =>
  character === ' ' || character === '\n' || character === '\r' || character === '\t' || character === '\f' || character === '\0';

const isDelimiter = (character: string): boolean => '()<>[]{}/%'.includes(character);

/** Skips whitespace and comments; returns the new index. */
const skipWhitespace = (text: string, index: number): number => {
  let cursor = index;
  while (cursor < text.length) {
    const character = text[cursor];
    if (isWhitespace(character)) {
      cursor += 1;
      continue;
    }
    if (character === '%') {
      while (cursor < text.length && text[cursor] !== '\n') cursor += 1;
      continue;
    }
    break;
  }
  return cursor;
};

/** Reads one PDF token (name, number, string, hex string, array or keyword). */
const readToken = (text: string, start: number): { token: string; end: number; kind: string } => {
  let index = skipWhitespace(text, start);
  if (index >= text.length) return { token: '', end: index, kind: 'eof' };
  const character = text[index];
  if (character === '/') {
    index += 1;
    const begin = index;
    while (index < text.length && !isWhitespace(text[index]) && !isDelimiter(text[index])) index += 1;
    return { token: text.slice(begin, index), end: index, kind: 'name' };
  }
  if (character === '<' && text[index + 1] === '<') return { token: '<<', end: index + 2, kind: 'dict-open' };
  if (character === '>' && text[index + 1] === '>') return { token: '>>', end: index + 2, kind: 'dict-close' };
  if (character === '<') {
    const close = text.indexOf('>', index);
    const end = close === -1 ? text.length : close + 1;
    return { token: text.slice(index, end), end, kind: 'hex' };
  }
  if (character === '[') return { token: '[', end: index + 1, kind: 'array-open' };
  if (character === ']') return { token: ']', end: index + 1, kind: 'array-close' };
  if (character === '(') {
    let depth = 0;
    let cursor = index;
    while (cursor < text.length) {
      const current = text[cursor];
      if (current === '\\') {
        cursor += 2;
        continue;
      }
      if (current === '(') depth += 1;
      else if (current === ')') {
        depth -= 1;
        if (depth === 0) {
          cursor += 1;
          break;
        }
      }
      cursor += 1;
    }
    return { token: text.slice(index, cursor), end: cursor, kind: 'string' };
  }
  const begin = index;
  while (index < text.length && !isWhitespace(text[index]) && !isDelimiter(text[index])) index += 1;
  return { token: text.slice(begin, index), end: index, kind: 'word' };
};

/**
 * Finds a top-level key inside a dictionary body and returns the range of its
 * value. Depth tracking means a nested `/Contents` never shadows the real one,
 * and a key that is absent returns `null` instead of a guess.
 */
export const findDictValue = (dictionary: string, key: string): { start: number; end: number } | null => {
  let index = dictionary.indexOf('<<');
  if (index === -1) return null;
  index += 2;
  let depth = 0;
  while (index < dictionary.length) {
    const token = readToken(dictionary, index);
    if (token.kind === 'eof') return null;
    if (token.kind === 'dict-open') {
      depth += 1;
      index = token.end;
      continue;
    }
    if (token.kind === 'dict-close') {
      if (depth === 0) return null;
      depth -= 1;
      index = token.end;
      continue;
    }
    if (token.kind === 'array-open' || token.kind === 'array-close') {
      index = token.end;
      continue;
    }
    if (token.kind === 'name' && depth === 0 && token.token === key) {
      const valueStart = skipWhitespace(dictionary, token.end);
      if (dictionary.startsWith('<<', valueStart)) {
        // The opening '<<' is consumed here, so the depth starts at one.
        let cursor = valueStart + 2;
        let nested = 1;
        while (cursor < dictionary.length && nested > 0) {
          const inner = readToken(dictionary, cursor);
          if (inner.kind === 'eof') break;
          if (inner.kind === 'dict-open') nested += 1;
          else if (inner.kind === 'dict-close') nested -= 1;
          cursor = inner.end;
        }
        return { start: valueStart, end: cursor };
      }
      // An array value is consumed whole, an indirect reference keeps all three
      // tokens, and anything else is a single token.
      if (dictionary.startsWith('[', valueStart)) {
        let cursor = valueStart + 1;
        let nested = 1;
        while (cursor < dictionary.length && nested > 0) {
          const inner = readToken(dictionary, cursor);
          if (inner.kind === 'eof') break;
          if (inner.kind === 'array-open') nested += 1;
          else if (inner.kind === 'array-close') nested -= 1;
          cursor = inner.end;
        }
        return { start: valueStart, end: cursor };
      }
      const value = readToken(dictionary, valueStart);
      if (value.kind === 'eof') return null;
      if (value.kind === 'word' && /^\d+$/.test(value.token)) {
        const second = readToken(dictionary, value.end);
        if (second.kind === 'word' && /^\d+$/.test(second.token)) {
          const third = readToken(dictionary, second.end);
          if (third.kind === 'word' && third.token === 'R') {
            return { start: valueStart, end: third.end };
          }
        }
      }
      return { start: valueStart, end: value.end };
    }
    index = token.end;
  }
  return null;
};

/** True when the file mentions a name at all (used for the safety vetoes). */
export const dictContainsName = (text: string, name: string): boolean => text.includes(`/${name}`);

/** Reads an indirect reference (`12 0 R`) and returns its object number. */
const parseIndirectRef = (value: string): number | null => {
  const match = /^\s*(\d+)\s+(\d+)\s+R\s*$/.exec(value);
  return match ? Number(match[1]) : null;
};

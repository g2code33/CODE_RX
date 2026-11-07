/**
 * CODE Rx — one printed-document engine for Class & Group Management.
 *
 * Every record the organizer can print (a group member sheet, an election
 * record, a roster) goes through this file, so a printed document always looks
 * like the same official paper:
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  [CODE Rx mark]  CODE Rx SOCIETY                    [Class & Group]   │
 *   │                  Class & Group Management           RX 30 CLASS B     │
 *   │  ──────────────────────────────────────────────────────────────────  │
 *   │  ELECTION RECORD                                                     │
 *   │  Group leadership election                                           │
 *   │  ...                                                                 │
 *   │  ──────────────────────────────────────────────────────────────────  │
 *   │  Prepared by <organizer> · PHANTOM oversight · <date>      Page 1/2  │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Three outputs, one design:
 *   • PNG  — canvas, a single tall sheet at 1400px wide (chat / WhatsApp)
 *   • PDF  — genuine A4, multi-page, real embedded logos (filing / printing)
 *   • Print — the same document through a hidden iframe
 *
 * Nothing here invents data: the document model is built from the record the
 * API returned, and the footer always names the organizer and PHANTOM.
 */

// ---------------------------------------------------------------------------
// Palette and brand marks
// ---------------------------------------------------------------------------

export const PRINT_COLORS = {
  emerald: '#047857',
  deep: '#064e3b',
  soft: '#ecfdf5',
  gold: '#b45309',
  goldSoft: '#fffbeb',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  // RGB triplets for the PDF content streams (0–1).
  emeraldRgb: '0.016 0.471 0.341',
  deepRgb: '0.024 0.306 0.231',
  softRgb: '0.925 0.992 0.960',
  goldSoftRgb: '1 0.984 0.929',
  inkRgb: '0.059 0.090 0.165',
  mutedRgb: '0.392 0.455 0.545',
  lineRgb: '0.886 0.910 0.941',
  whiteRgb: '1 1 1',
};

/** The two marks every document carries: society on the left, class on the right. */
export const PRINT_MARKS = {
  codeRx: '/CODE%20RX11.png',
  classGroups: '/CGP.jpg',
};

export interface PrintImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface PrintBrand {
  /** Loaded, drawable marks (canvas). */
  codeRx?: HTMLImageElement | null;
  classGroups?: HTMLImageElement | null;
  /** JPEG copies for embedding in the PDF. */
  codeRxJpeg?: PrintImage | null;
  classGroupsJpeg?: PrintImage | null;
}

const loadImage = (src: string): Promise<HTMLImageElement | null> => new Promise((resolve) => {
  if (typeof Image === 'undefined') { resolve(null); return; }
  const image = new Image();
  let settled = false;
  const done = (value: HTMLImageElement | null) => { if (!settled) { settled = true; resolve(value); } };
  image.onload = () => done(image);
  image.onerror = () => done(null);
  image.src = src;
  // jsdom never loads resources: a mark must never hang a download.
  window.setTimeout(() => done(image.complete && image.naturalWidth > 0 ? image : null), 4000);
});

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes base64 without atob: it must behave identically in every realm. */
export const decodeBase64 = (input: string): Uint8Array => {
  const clean = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const out = new Uint8Array(Math.floor((clean.replace(/=+$/, '').length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let at = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === '=') break;
    const value = BASE64.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at] = (buffer >> bits) & 0xff;
      at += 1;
    }
  }
  return at === out.length ? out : out.subarray(0, at);
};

const imageToJpeg = (image: HTMLImageElement, maxWidth = 480): PrintImage | null => {
  try {
    if (typeof document === 'undefined') return null;
    const natural = Math.max(1, image.naturalWidth || image.width || 1);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const scale = Math.min(1, maxWidth / natural);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(natural * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) return null;
    return { bytes: decodeBase64(base64), width: canvas.width, height: canvas.height };
  } catch { return null; }
};

let brandCache: Promise<PrintBrand> | null = null;

/**
 * Loads both marks once per page load. A missing image is not an error: the
 * letterhead still prints its wordmark, it just has no picture.
 */
export const loadPrintBrand = (force = false): Promise<PrintBrand> => {
  if (!brandCache || force) {
    brandCache = (async () => {
      const [codeRx, classGroups] = await Promise.all([
        loadImage(PRINT_MARKS.codeRx),
        loadImage(PRINT_MARKS.classGroups),
      ]);
      return {
        codeRx, classGroups,
        codeRxJpeg: codeRx ? imageToJpeg(codeRx, 420) : null,
        classGroupsJpeg: classGroups ? imageToJpeg(classGroups, 420) : null,
      } as PrintBrand;
    })();
  }
  return brandCache;
};

// ---------------------------------------------------------------------------
// The document model
// ---------------------------------------------------------------------------

export interface PrintStat { label: string; value: string; hint?: string }

export interface PrintLink { label: string; url: string; hint?: string }

/**
 * One bar on a ranked list — a candidate with their votes. `ratio` is 0…1 and
 * drives the bar length; the number and the share are always printed beside it,
 * so a phone reader never has to measure a bar to read a result.
 */
export interface PrintBar {
  label: string;
  value: string;
  share?: string;
  ratio: number;
  note?: string;
}

export type PrintSection =
  | { kind: 'table'; heading: string; columns: string[]; rows: string[][]; note?: string; align?: Array<'left' | 'right'> }
  | { kind: 'keyvalues'; heading: string; rows: Array<[string, string]> }
  | { kind: 'lines'; heading: string; lines: string[]; tone?: 'plain' | 'good' | 'warn' }
  | { kind: 'callout'; heading: string; body: string }
  /** The one thing the reader opened the paper for — printed big, near the top. */
  | { kind: 'hero'; heading?: string; label: string; value: string; detail?: string; tone?: 'good' | 'warn' | 'plain' }
  /** A ranked list with bars: readable on a phone without zooming. */
  | { kind: 'bars'; heading: string; rows: PrintBar[]; note?: string };

export interface PrintDoc {
  /** Small caps line above the title — "Election record", "Member sheet". */
  kind: string;
  title: string;
  subtitle?: string;
  badges?: string[];
  /** Letterhead right block. */
  className: string;
  classCode?: string;
  institution?: string;
  /** Letterhead left block second line. */
  societyLine?: string;
  /** Who made this document — printed in the footer with PHANTOM. */
  organizer: string;
  issuedAt: Date;
  stats?: PrintStat[];
  sections: PrintSection[];
  links?: PrintLink[];
  /** Heading over the links block — the group link is worth naming plainly. */
  linksTitle?: string;
  notes?: string[];
  fileName: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "7 Nov 2026, 09:51" — the one date format every printed document uses. */
export const printDate = (value: Date | string | number | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hours}:${minutes}`;
};

/** The footer of every document: organizer, PHANTOM, class, date, page. */
/**
 * "Prepared by <organizer> · PHANTOM oversight (Code Rx Society)". When PHANTOM
 * itself is the organizer the line would say PHANTOM twice, so it credits the
 * society's oversight instead — the footer always names an owner and PHANTOM.
 */
export const preparedBy = (organizer?: string | null): string => {
  const who = String(organizer || '').trim();
  if (!who) return 'Prepared by the class organizer · PHANTOM oversight (Code Rx Society)';
  if (/^phantom$/i.test(who)) return 'Prepared by PHANTOM · Code Rx Society oversight';
  return `Prepared by ${who} · PHANTOM oversight (Code Rx Society)`;
};

export const footerLines = (doc: PrintDoc, page = 1, pages = 1): [string, string] => [
  `${preparedBy(doc.organizer)} · ${printDate(doc.issuedAt)}`,
  `${doc.className}${doc.classCode ? ` (${doc.classCode})` : ''} · Document ref ${doc.fileName} · Page ${page} of ${pages}`,
];

export const documentFileName = (doc: PrintDoc, extension: string): string => {
  const base = String(doc.fileName || doc.title || 'code-rx-document').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'code-rx-document'}.${extension}`;
};

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

/** PDF text is WinAnsi: fold decorative characters down to plain ASCII. */
export const pdfSafe = (value: unknown): string => String(value ?? '')
  .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
  .replace(/[\u201C\u201D\u201E]/g, '"')
  .replace(/[\u2013\u2014\u2015]/g, '-')
  .replace(/\u2026/g, '...')
  .replace(/[\u00B7\u2022]/g, '-')
  .replace(/\u2192/g, '->')
  .replace(/[\u2713\u2714]/g, 'v')
  .replace(/\u00A0/g, ' ')
  .replace(/[^\x20-\x7E]/g, '?');

const escapePdf = (value: unknown): string => pdfSafe(value)
  .split('').map((character) => {
    if (character === String.fromCharCode(92)) return String.fromCharCode(92, 92);
    if (character === '(' || character === ')') return String.fromCharCode(92) + character;
    return character;
  }).join('');

/** Escaped ASCII for a PDF text operator — shared with the group-sheet writer. */
export const pdfText = (value: unknown): string => escapePdf(value);

const clip = (value: unknown, maxChars: number): string => {
  const text = pdfSafe(value);
  return text.length > maxChars ? `${text.slice(0, Math.max(3, maxChars - 1))}...` : text;
};

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Word-wrap that measures with a callback (canvas) or a character budget (PDF). */
export const wrapBy = (value: unknown, fits: (line: string) => boolean): string[] => {
  const out: string[] = [];
  for (const paragraph of String(value ?? '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && !fits(next)) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
};

/** Column widths for a table: short headers (#, No.) get a narrow fixed column. */
export const tableWidths = (columns: string[], total: number, shortWidth: number): number[] => {
  const fixed = columns.map((column) => (String(column ?? '').trim().length <= 3 ? shortWidth : 0));
  const fixedTotal = fixed.reduce((sum, width) => sum + width, 0);
  const weights = columns.map((column, index) => (fixed[index] ? 0 : Math.max(6, String(column ?? '').length)));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return columns.map((_, index) => fixed[index] || ((total - fixedTotal) * weights[index]) / weightTotal);
};

// ---------------------------------------------------------------------------
// PDF writer — byte oriented, so real logos can be embedded
// ---------------------------------------------------------------------------

type Chunk = string | Uint8Array;

export class PdfFile {
  private objects: Array<Chunk[] | null> = [null];

  add(parts: Chunk[]): number {
    this.objects.push(parts);
    return this.objects.length - 1;
  }

  reserve(): number {
    this.objects.push(null);
    return this.objects.length - 1;
  }

  set(id: number, parts: Chunk[]): void { this.objects[id] = parts; }

  /**
   * Embeds a JPEG as an image XObject and returns its id. Used by every
   * document that carries the two letterhead marks.
   */
  embedJpeg(image: PrintImage | null | undefined): number | null {
    if (!image || !image.bytes.length) return null;
    return this.add([
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      image.bytes,
      '\nendstream',
    ]);
  }

  build(rootId: number): Uint8Array {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const push = (chunk: Chunk) => {
      const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
      chunks.push(bytes);
      length += bytes.length;
    };
    push('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n');
    const offsets: number[] = [];
    for (let id = 1; id < this.objects.length; id += 1) {
      const parts = this.objects[id];
      if (!parts) continue;
      offsets[id] = length;
      push(`${id} 0 obj\n`);
      parts.forEach(push);
      push('\nendobj\n');
    }
    const xrefAt = length;
    push(`xref\n0 ${this.objects.length}\n0000000000 65535 f \n`);
    for (let id = 1; id < this.objects.length; id += 1) {
      push(`${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`);
    }
    push(`trailer\n<< /Size ${this.objects.length} /Root ${rootId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
  }
}

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const FOOTER_TOP = 62;

/** Helvetica is proportional; this is close enough to right-align numbers. */
const textWidth = (value: string, size: number, bold = false): number =>
  pdfSafe(value).length * size * (bold ? 0.545 : 0.5);

// ---------------------------------------------------------------------------
// PDF — A4, multi-page, letterhead on every page
//
// The type here is deliberately LARGE (10–24pt body, 20pt table rows). These
// sheets are opened on phones far more often than they are filed, and 8pt type
// on an A4 page is unreadable once the page is scaled to a phone screen.
// ---------------------------------------------------------------------------

export const buildPrintPdf = (doc: PrintDoc, brand?: PrintBrand | null): Uint8Array => {
  const file = new PdfFile();
  const fontRegular = file.add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  const fontBold = file.add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
  const fontItalic = file.add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>']);

  const codeRxId = file.embedJpeg(brand?.codeRxJpeg);
  const classId = file.embedJpeg(brand?.classGroupsJpeg);

  const usable = A4.width - MARGIN * 2;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = A4.height - MARGIN;

  const text = (x: number, at: number, size: number, bold: boolean, value: unknown, color = PRINT_COLORS.inkRgb, italic = false) =>
    ops.push(`BT ${color} rg /${bold ? 'F2' : italic ? 'F3' : 'F1'} ${size} Tf ${x.toFixed(2)} ${at.toFixed(2)} Td (${escapePdf(value)}) Tj ET`);
  const textRight = (right: number, at: number, size: number, bold: boolean, value: unknown, color = PRINT_COLORS.inkRgb) =>
    text(right - textWidth(String(value ?? ''), size, bold), at, size, bold, value, color);
  const rect = (x: number, at: number, width: number, height: number, color: string) =>
    ops.push(`${color} rg ${x.toFixed(2)} ${at.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  const rule = (at: number, color = PRINT_COLORS.lineRgb, thickness = 0.6) =>
    ops.push(`${color} rg ${MARGIN} ${at.toFixed(2)} ${usable} ${thickness.toFixed(2)} re f`);
  const image = (id: number, x: number, at: number, width: number, height: number) =>
    ops.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${at.toFixed(2)} cm /Im${id} Do Q`);

  /** Nothing but the footer may live below this line. */
  const pageFloor = FOOTER_TOP + 16;
  /** Every page is a solid white sheet — a printed page is never transparent. */
  const whitePage = () => ops.push(`1 1 1 rg 0 0 ${A4.width.toFixed(2)} ${A4.height.toFixed(2)} re f`);

  /** The letterhead: society mark left, class mark right, rule under both. */
  const letterhead = (full: boolean) => {
    const top = A4.height - MARGIN;
    const markSize = full ? 38 : 24;
    if (full) {
      if (codeRxId) image(codeRxId, MARGIN, top - markSize, markSize, markSize);
      if (classId) image(classId, A4.width - MARGIN - markSize, top - markSize, markSize, markSize);
      const leftText = MARGIN + (codeRxId ? markSize + 12 : 0);
      text(leftText, top - 12, 12, true, 'CODE Rx SOCIETY', PRINT_COLORS.deepRgb);
      text(leftText, top - 26, 8.5, false, doc.societyLine || 'Class & Group Management', PRINT_COLORS.mutedRgb);
      const rightText = A4.width - MARGIN - (classId ? markSize + 12 : 0);
      textRight(rightText, top - 12, 10, true, clip(doc.className, 30), PRINT_COLORS.inkRgb);
      textRight(rightText, top - 26, 8, false, clip([doc.classCode, doc.institution].filter(Boolean).join(' · '), 40), PRINT_COLORS.mutedRgb);
    } else {
      text(MARGIN, top - 10, 9, true, clip(doc.title, 56), PRINT_COLORS.mutedRgb);
      textRight(A4.width - MARGIN, top - 10, 9, false, clip(doc.className, 40), PRINT_COLORS.mutedRgb);
    }
    rule(top - markSize - 10, PRINT_COLORS.emeraldRgb, 1.8);
    return top - markSize - 26;
  };

  // Where each page's real content starts (everything before it is the
  // letterhead), so a page opened for nothing can be dropped at the end.
  const contentStart: number[] = [];
  const startPage = (first: boolean) => {
    if (ops.length) pages.push(ops);
    ops = [];
    whitePage();
    y = first ? letterhead(true) : letterhead(false);
    contentStart[pages.length] = ops.length;
  };

  startPage(true);

  // --- Title block -----------------------------------------------------------
  const pillWidth = textWidth(doc.kind.toUpperCase(), 8, true) + 16;
  rect(MARGIN, y - 4, pillWidth, 16, PRINT_COLORS.softRgb);
  text(MARGIN + 8, y + 1, 8, true, doc.kind.toUpperCase(), PRINT_COLORS.emeraldRgb);
  y -= 28;

  for (const line of wrapBy(clip(doc.title, 120), (candidate) => textWidth(candidate, 23, true) <= usable)) {
    text(MARGIN, y, 23, true, line, PRINT_COLORS.inkRgb);
    y -= 27;
  }
  if (doc.subtitle) {
    for (const line of wrapBy(clip(doc.subtitle, 200), (candidate) => textWidth(candidate, 10.5) <= usable)) {
      text(MARGIN, y, 10.5, false, line, PRINT_COLORS.mutedRgb);
      y -= 14;
    }
  }
  if (doc.badges?.length) {
    y -= 2;
    let badgeX = MARGIN;
    for (const badge of doc.badges) {
      const width = textWidth(badge.toUpperCase(), 7.5, true) + 16;
      if (badgeX + width > A4.width - MARGIN) break;
      rect(badgeX, y - 4, width, 15, PRINT_COLORS.softRgb);
      text(badgeX + 8, y, 7.5, true, badge.toUpperCase(), PRINT_COLORS.emeraldRgb);
      badgeX += width + 6;
    }
    y -= 22;
  }

  y -= 2;
  rule(y);
  y -= 16;
  text(MARGIN, y, 9, false, `Issued ${printDate(doc.issuedAt)}`, PRINT_COLORS.mutedRgb);
  textRight(A4.width - MARGIN, y, 9, false, `Organizer: ${clip(doc.organizer, 40)}`, PRINT_COLORS.mutedRgb);
  y -= 24;

  // --- Headline numbers (three across, big) ----------------------------------
  if (doc.stats?.length) {
    const perRow = doc.stats.length > 3 ? Math.ceil(doc.stats.length / 2) : doc.stats.length;
    const gap = 8;
    const boxWidth = (usable - gap * (perRow - 1)) / perRow;
    const boxHeight = 56;
    for (let index = 0; index < doc.stats.length; index += perRow) {
      const row = doc.stats.slice(index, index + perRow);
      if (y - boxHeight < pageFloor) startPage(false);
      row.forEach((stat, column) => {
        const x = MARGIN + column * (boxWidth + gap);
        rect(x, y - boxHeight, boxWidth, boxHeight, PRINT_COLORS.softRgb);
        text(x + 12, y - 13, 7.5, true, clip(stat.label.toUpperCase(), Math.floor(boxWidth / 5)), PRINT_COLORS.emeraldRgb);
        text(x + 12, y - 36, 19, true, clip(stat.value, Math.floor(boxWidth / 11)), PRINT_COLORS.deepRgb);
        if (stat.hint) text(x + 12, y - 49, 7.5, false, clip(stat.hint, Math.floor(boxWidth / 4.2)), PRINT_COLORS.mutedRgb);
      });
      y -= boxHeight + 12;
    }
    y -= 4;
  }

  // --- Sections --------------------------------------------------------------
  const heading = (value: string) => {
    if (y - 34 < pageFloor) startPage(false);
    y -= 8;
    text(MARGIN, y, 9.5, true, value.toUpperCase(), PRINT_COLORS.emeraldRgb);
    rule(y - 6, PRINT_COLORS.emeraldRgb, 1);
    y -= 22;
  };

  for (const section of doc.sections) {
    if (section.kind === 'hero') {
      if (section.heading) heading(section.heading);
      const valueLines = wrapBy(clip(section.value, 90), (candidate) => textWidth(candidate, 21, true) <= usable - 28);
      const height = 44 + valueLines.length * 24 + (section.detail ? 18 : 0);
      if (y - height < pageFloor) startPage(false);
      rect(MARGIN, y - height, usable, height, section.tone === 'warn' ? PRINT_COLORS.goldSoftRgb : PRINT_COLORS.softRgb);
      rect(MARGIN, y - height, 6, height, section.tone === 'warn' ? '0.706 0.325 0.035' : PRINT_COLORS.emeraldRgb);
      text(MARGIN + 18, y - 18, 8.5, true, section.label.toUpperCase(), section.tone === 'warn' ? '0.545 0.251 0.067' : PRINT_COLORS.emeraldRgb);
      let lineY = y - 46;
      for (const line of valueLines) {
        text(MARGIN + 18, lineY, 21, true, line, PRINT_COLORS.deepRgb);
        lineY -= 24;
      }
      if (section.detail) text(MARGIN + 18, lineY + 4, 10.5, false, clip(section.detail, 90), PRINT_COLORS.mutedRgb);
      y -= height + 14;
      continue;
    }

    if (section.kind === 'bars') {
      heading(section.heading);
      section.rows.forEach((row) => {
        if (y - 40 < pageFloor) startPage(false);
        text(MARGIN, y, 11, true, clip(row.label, 52), PRINT_COLORS.inkRgb);
        textRight(A4.width - MARGIN, y, 11, true, clip(`${row.value}${row.share ? `  ${row.share}` : ''}`, 24), PRINT_COLORS.deepRgb);
        if (row.note) text(MARGIN, y - 12, 8, false, clip(row.note, 70), PRINT_COLORS.mutedRgb);
        const trackY = y - 20;
        rect(MARGIN, trackY, usable, 7, '0.941 0.965 0.949');
        const filled = Math.max(0, Math.min(1, Number(row.ratio) || 0));
        if (filled > 0) rect(MARGIN, trackY, Math.max(3, usable * filled), 7, PRINT_COLORS.emeraldRgb);
        y -= 34;
      });
      if (section.note) {
        y -= 2;
        for (const line of wrapBy(clip(section.note, 220), (candidate) => textWidth(candidate, 8.5) <= usable)) {
          text(MARGIN, y, 8.5, false, line, PRINT_COLORS.mutedRgb);
          y -= 12;
        }
      }
      y -= 10;
      continue;
    }

    if (section.kind === 'table') {
      const widths = tableWidths(section.columns, usable, 24);
      const align = section.align || [];
      heading(section.heading);
      const head = () => {
        rect(MARGIN, y - 20, usable, 20, PRINT_COLORS.emeraldRgb);
        let x = MARGIN;
        section.columns.forEach((column, index) => {
          const label = clip(column, Math.floor(widths[index] / 5));
          if (align[index] === 'right') textRight(x + widths[index] - 7, y - 14, 8.5, true, label, PRINT_COLORS.whiteRgb);
          else text(x + 7, y - 14, 8.5, true, label, PRINT_COLORS.whiteRgb);
          x += widths[index];
        });
        y -= 20;
      };
      head();
      section.rows.forEach((row, rowIndex) => {
        if (y - 20 < pageFloor) { startPage(false); head(); }
        if (rowIndex % 2 === 1) rect(MARGIN, y - 20, usable, 20, '0.968 0.976 0.984');
        let x = MARGIN;
        row.forEach((cell, index) => {
          const label = clip(cell, Math.floor(widths[index] / 5));
          if (align[index] === 'right') textRight(x + widths[index] - 7, y - 14, 9.5, index === 0, label, PRINT_COLORS.inkRgb);
          else text(x + 7, y - 14, 9.5, index === 0, label, PRINT_COLORS.inkRgb);
          x += widths[index];
        });
        y -= 20;
      });
      if (section.note) {
        y -= 4;
        for (const line of wrapBy(clip(section.note, 200), (candidate) => textWidth(candidate, 8.5) <= usable)) {
          text(MARGIN, y, 8.5, false, line, PRINT_COLORS.mutedRgb);
          y -= 12;
        }
      }
      y -= 12;
      continue;
    }

    if (section.kind === 'keyvalues') {
      heading(section.heading);
      const half = usable * 0.42;
      section.rows.forEach(([label, value], index) => {
        if (y - 22 < pageFloor) startPage(false);
        if (index % 2 === 0) rect(MARGIN, y - 22, usable, 22, '0.973 0.976 0.984');
        text(MARGIN + 8, y - 15, 9, true, clip(label, Math.floor(half / 5)), PRINT_COLORS.mutedRgb);
        const valueLines = wrapBy(clip(value, 160), (candidate) => textWidth(candidate, 10) <= usable - half - 16);
        text(MARGIN + half, y - 15, 10, false, valueLines[0], PRINT_COLORS.inkRgb);
        y -= 22;
      });
      y -= 12;
      continue;
    }

    if (section.kind === 'lines') {
      heading(section.heading);
      const toneRgb = section.tone === 'warn' ? '0.706 0.325 0.035' : section.tone === 'good' ? PRINT_COLORS.emeraldRgb : PRINT_COLORS.inkRgb;
      for (const line of section.lines) {
        const lines = wrapBy(clip(line, 240), (candidate) => textWidth(candidate, 10) <= usable - 16);
        if (y - 13 * lines.length < pageFloor) startPage(false);
        rect(MARGIN + 1, y - 4, 4, 4, toneRgb);
        lines.forEach((part, partIndex) => text(MARGIN + 12, y - partIndex * 14, 10, false, part, toneRgb));
        y -= 14 * lines.length + 6;
      }
      y -= 8;
      continue;
    }

    // callout
    const bodyLines = wrapBy(clip(section.body, 320), (candidate) => textWidth(candidate, 10) <= usable - 28);
    const height = 30 + bodyLines.length * 14 + 10;
    if (y - height < pageFloor) startPage(false);
    rect(MARGIN, y - height, usable, height, PRINT_COLORS.goldSoftRgb);
    text(MARGIN + 12, y - 17, 8.5, true, section.heading.toUpperCase(), '0.545 0.251 0.067');
    bodyLines.forEach((line, index) => text(MARGIN + 12, y - 34 - index * 14, 10, false, line, PRINT_COLORS.inkRgb));
    y -= height + 12;
  }

  // --- Links (the group link and the date live here) -------------------------
  if (doc.links?.length) {
    heading(doc.linksTitle || 'Links in this record');
    doc.links.forEach((link) => {
      if (y - 46 < pageFloor) startPage(false);
      text(MARGIN + 8, y - 8, 8.5, true, clip(link.label, 60), PRINT_COLORS.mutedRgb);
      if (link.hint) textRight(A4.width - MARGIN, y - 8, 8, false, clip(link.hint, 44), PRINT_COLORS.mutedRgb);
      let urlY = y - 24;
      for (const line of wrapBy(clip(link.url, 150), (candidate) => textWidth(candidate, 10.5) <= usable - 16)) {
        text(MARGIN + 8, urlY, 10.5, false, line, PRINT_COLORS.emeraldRgb);
        urlY -= 14;
      }
      rule(urlY - 2, PRINT_COLORS.lineRgb, 0.4);
      y = urlY - 16;
    });
  }

  // --- Notes -----------------------------------------------------------------
  // A closing note belongs to the sheet it closes: it sits in the band just
  // above the footer rule instead of opening a nearly empty page of its own.
  // The test is on the last line's DESCENDER, not on its baseline, so a note
  // that visibly clears the rule is not pushed away by a phantom margin.
  if (doc.notes?.length) {
    y -= 4;
    doc.notes.forEach((note) => {
      const lines = wrapBy(clip(note, 260), (candidate) => textWidth(candidate, 8.5) <= usable);
      const bottom = y - (lines.length - 1) * 12 - 2;
      if (bottom < FOOTER_TOP + 6) startPage(false);
      lines.forEach((line) => {
        text(MARGIN, y, 8.5, false, line, PRINT_COLORS.mutedRgb);
        y -= 12;
      });
    });
  }

  if (ops.length) pages.push(ops);

  // A page that received no content (layout opened it, then everything already
  // fitted) would print as an empty sheet — never leave one behind.
  while (pages.length > 1) {
    const last = pages.length - 1;
    if (pages[last].length > (contentStart[last] ?? 0)) break;
    pages.pop();
  }

  // --- Footers, once the page count is known ---------------------------------
  const pageCount = Math.max(1, pages.length);
  pages.forEach((pageOps, index) => {
    const [left, right] = footerLines(doc, index + 1, pageCount);
    pageOps.push(`${PRINT_COLORS.emeraldRgb} rg ${MARGIN} ${FOOTER_TOP} ${usable} 1.4 re f`);
    pageOps.push(`BT ${PRINT_COLORS.mutedRgb} rg /F1 8 Tf ${MARGIN} ${FOOTER_TOP - 14} Td (${escapePdf(clip(left, 116))}) Tj ET`);
    pageOps.push(`BT ${PRINT_COLORS.mutedRgb} rg /F1 7.5 Tf ${MARGIN} ${FOOTER_TOP - 26} Td (${escapePdf(clip(right, 124))}) Tj ET`);
  });

  // --- Assemble --------------------------------------------------------------
  const resources = `<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontItalic} 0 R >>`
    + `${codeRxId ? ` /XObject << /Im${codeRxId} ${codeRxId} 0 R${classId ? ` /Im${classId} ${classId} 0 R` : ''} >>` : ''} >>`;
  const contentIds: number[] = [];
  const pageIds: number[] = [];
  pages.forEach((pageOps) => {
    const stream = pageOps.join('\n');
    const contentId = file.add([`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]);
    contentIds.push(contentId);
  });
  const pagesId = file.reserve();
  pages.forEach((_, index) => {
    const pageId = file.add([`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Contents ${contentIds[index]} 0 R /Resources ${resources} >>`]);
    pageIds.push(pageId);
  });
  file.set(pagesId, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`]);
  const catalogId = file.add([`<< /Type /Catalog /Pages ${pagesId} 0 R >>`]);
  return file.build(catalogId);
};

// ---------------------------------------------------------------------------
// PNG — canvas, one tall sheet
//
// This is the copy that travels through WhatsApp, so it is drawn for a phone
// screen: fewer blocks, much larger type and generous spacing. A 1400px sheet
// is shown at roughly a third of its width on a handset, which is why nothing
// here is smaller than 13px.
// ---------------------------------------------------------------------------

interface CanvasSurface {
  ctx: CanvasRenderingContext2D;
  draw: boolean;
}

const FONT_STACK = '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';

const paint = (surface: CanvasSurface, width: number, doc: PrintDoc, brand: PrintBrand) => {
  // Aliases keep the drawing code readable; nothing here is module state, so
  // two documents can never paint into each other.
  const docRef = doc;
  const brandRef = brand;
  const { ctx } = surface;
  const margin = 56;

  const wrapWidth = (value: unknown, size: number, bold: boolean, max: number) =>
    wrapBy(value, (candidate) => { ctx.font = `${bold ? '700' : '400'} ${size}px ${FONT_STACK}`; return ctx.measureText(candidate).width <= max; });

  const rect = (x: number, y: number, w: number, h: number, fill: string, radius = 0) => {
    if (!surface.draw) return;
    ctx.fillStyle = fill;
    if (!radius) { ctx.fillRect(x, y, w, h); return; }
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  };
  const text = (value: unknown, x: number, y: number, size: number, bold: boolean, color: string, align: 'left' | 'right' = 'left') => {
    if (!surface.draw) return;
    ctx.font = `${bold ? '700' : '400'} ${size}px ${FONT_STACK}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(value ?? ''), x, y);
    ctx.textAlign = 'left';
  };
  const measure = (value: unknown, size: number, bold: boolean) => {
    ctx.font = `${bold ? '700' : '400'} ${size}px ${FONT_STACK}`;
    return ctx.measureText(String(value ?? '')).width;
  };

  // A printed sheet is white paper: paint the whole surface before anything else
  // so a PNG never arrives with a transparent background.
  rect(0, 0, width, 30000, '#ffffff');

  let y = 0;
  const markSize = 62;

  // Letterhead.
  const topY = 44;
  if (surface.draw && brandRef.codeRx) ctx.drawImage(brandRef.codeRx, margin, topY, markSize, markSize);
  const leftText = margin + (brandRef.codeRx ? markSize + 20 : 0);
  text('CODE Rx SOCIETY', leftText, topY + 30, 26, true, PRINT_COLORS.deep);
  text(docRef.societyLine || 'Class & Group Management', leftText, topY + 54, 15, false, PRINT_COLORS.muted);

  const rightEdge = width - margin;
  if (surface.draw && brandRef.classGroups) {
    ctx.save();
    ctx.beginPath();
    const r = 12;
    const mx = rightEdge - markSize;
    ctx.moveTo(mx + r, topY);
    ctx.arcTo(rightEdge, topY, rightEdge, topY + markSize, r);
    ctx.arcTo(rightEdge, topY + markSize, mx, topY + markSize, r);
    ctx.arcTo(mx, topY + markSize, mx, topY, r);
    ctx.arcTo(mx, topY, rightEdge, topY, r);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(brandRef.classGroups, mx, topY, markSize, markSize);
    ctx.restore();
  }
  const rightText = rightEdge - (brandRef.classGroups ? markSize + 20 : 0);
  text(clip(docRef.className, 40), rightText, topY + 30, 20, true, PRINT_COLORS.ink, 'right');
  text(clip([docRef.classCode, docRef.institution].filter(Boolean).join(' · '), 44), rightText, topY + 54, 14, false, PRINT_COLORS.muted, 'right');

  y = topY + markSize + 24;
  rect(margin, y, width - margin * 2, 4, PRINT_COLORS.emerald);
  rect(margin, y, 150, 4, PRINT_COLORS.gold);
  y += 42;

  // Title block.
  const kindWidth = measure(docRef.kind.toUpperCase(), 14, true) + 28;
  rect(margin, y - 22, kindWidth, 32, PRINT_COLORS.soft, 16);
  text(docRef.kind.toUpperCase(), margin + 14, y, 14, true, PRINT_COLORS.emerald);
  y += 46;
  for (const line of wrapWidth(docRef.title, 42, true, width - margin * 2)) {
    text(line, margin, y, 42, true, PRINT_COLORS.ink);
    y += 48;
  }
  if (docRef.subtitle) {
    for (const line of wrapWidth(docRef.subtitle, 19, false, width - margin * 2)) {
      text(line, margin, y, 19, false, PRINT_COLORS.muted);
      y += 26;
    }
  }
  if (docRef.badges?.length) {
    y += 8;
    let badgeX = margin;
    for (const badge of docRef.badges) {
      const badgeText = badge.toUpperCase();
      const badgeWidth = measure(badgeText, 13, true) + 28;
      rect(badgeX, y - 19, badgeWidth, 30, PRINT_COLORS.soft, 15);
      text(badgeText, badgeX + 14, y, 13, true, PRINT_COLORS.emerald);
      badgeX += badgeWidth + 10;
    }
    y += 30;
  }

  y += 12;
  rect(margin, y, width - margin * 2, 1.5, PRINT_COLORS.line);
  y += 30;
  text(`Issued ${printDate(docRef.issuedAt)}`, margin, y, 15, false, PRINT_COLORS.muted);
  text(`Organizer: ${clip(docRef.organizer, 30)}`, rightEdge, y, 15, false, PRINT_COLORS.muted, 'right');
  y += 34;

  // Stats — three across, then a second row only if there are more.
  if (docRef.stats?.length) {
    const perRow = docRef.stats.length > 3 ? Math.ceil(docRef.stats.length / Math.ceil(docRef.stats.length / 3)) : docRef.stats.length;
    const gap = 14;
    const boxWidth = (width - margin * 2 - gap * (perRow - 1)) / perRow;
    for (let index = 0; index < docRef.stats.length; index += perRow) {
      const row = docRef.stats.slice(index, index + perRow);
      row.forEach((stat, column) => {
        const x = margin + column * (boxWidth + gap);
        rect(x, y - 10, boxWidth, 96, PRINT_COLORS.soft, 14);
        text(stat.label.toUpperCase(), x + 18, y + 18, 13, true, PRINT_COLORS.emerald);
        text(stat.value, x + 18, y + 58, 36, true, PRINT_COLORS.deep);
        if (stat.hint) text(stat.hint, x + 18, y + 78, 13, false, PRINT_COLORS.muted);
      });
      y += 110;
    }
    y += 6;
  }

  // Sections.
  const heading = (value: string) => {
    y += 16;
    text(value.toUpperCase(), margin, y, 15, true, PRINT_COLORS.emerald);
    y += 10;
    rect(margin, y, width - margin * 2, 2, PRINT_COLORS.emerald, 1);
    y += 30;
  };

  for (const section of docRef.sections) {
    if (section.kind === 'hero') {
      if (section.heading) heading(section.heading);
      const valueLines = wrapWidth(section.value, 38, true, width - margin * 2 - 48);
      const height = 62 + valueLines.length * 44 + (section.detail ? 28 : 0);
      const warn = section.tone === 'warn';
      rect(margin, y - 18, width - margin * 2, height, warn ? PRINT_COLORS.goldSoft : PRINT_COLORS.soft, 18);
      rect(margin, y - 18, 8, height, warn ? PRINT_COLORS.gold : PRINT_COLORS.emerald);
      text(section.label.toUpperCase(), margin + 30, y + 8, 14, true, warn ? PRINT_COLORS.gold : PRINT_COLORS.emerald);
      let lineY = y + 50;
      for (const line of valueLines) { text(line, margin + 30, lineY, 38, true, PRINT_COLORS.deep); lineY += 44; }
      if (section.detail) text(section.detail, margin + 30, lineY - 6, 17, false, PRINT_COLORS.muted);
      y += height + 18;
      continue;
    }

    if (section.kind === 'bars') {
      heading(section.heading);
      section.rows.forEach((row) => {
        text(clip(row.label, 42), margin, y, 21, true, PRINT_COLORS.ink);
        text(`${row.value}${row.share ? `  ·  ${row.share}` : ''}`, rightEdge, y, 21, true, PRINT_COLORS.deep, 'right');
        const trackY = y + 20;
        rect(margin, trackY, width - margin * 2, 16, '#eef2f6', 8);
        const filled = Math.max(0, Math.min(1, Number(row.ratio) || 0));
        if (filled > 0) rect(margin, trackY, Math.max(10, (width - margin * 2) * filled), 16, PRINT_COLORS.emerald, 8);
        y = trackY + 44;
        if (row.note) { text(clip(row.note, 60), margin, y - 8, 13, false, PRINT_COLORS.muted); y += 16; }
      });
      if (section.note) { y += 4; for (const line of wrapWidth(section.note, 14, false, width - margin * 2)) { text(line, margin, y, 14, false, PRINT_COLORS.muted); y += 20; } }
      y += 14;
      continue;
    }

    if (section.kind === 'table') {
      heading(section.heading);
      const widths = tableWidths(section.columns, width - margin * 2, 74);
      const align = section.align || [];
      const drawHead = () => {
        rect(margin, y - 20, width - margin * 2, 38, PRINT_COLORS.emerald, 8);
        let x = margin;
        section.columns.forEach((column, columnIndex) => {
          if (align[columnIndex] === 'right') text(clip(column, Math.floor(widths[columnIndex] / 11)), x + widths[columnIndex] - 14, y + 6, 14, true, '#ffffff', 'right');
          else text(clip(column, Math.floor(widths[columnIndex] / 11)), x + 14, y + 6, 14, true, '#ffffff');
          x += widths[columnIndex];
        });
        y += 46;
      };
      drawHead();
      section.rows.forEach((row, rowIndex) => {
        if (rowIndex % 2 === 1) rect(margin, y - 24, width - margin * 2, 40, '#f8fafc');
        let x = margin;
        row.forEach((cell, columnIndex) => {
          const isFirst = columnIndex === 0;
          if (align[columnIndex] === 'right') text(cell, x + widths[columnIndex] - 14, y + 6, 17, isFirst, PRINT_COLORS.ink, 'right');
          else text(clip(cell, Math.floor(widths[columnIndex] / 10)), x + 14, y + 6, 17, isFirst, PRINT_COLORS.ink);
          x += widths[columnIndex];
        });
        y += 40;
      });
      if (section.note) { y += 6; for (const line of wrapWidth(section.note, 14, false, width - margin * 2)) { text(line, margin, y, 14, false, PRINT_COLORS.muted); y += 20; } }
      y += 18;
      continue;
    }

    if (section.kind === 'keyvalues') {
      heading(section.heading);
      const half = (width - margin * 2) * 0.44;
      section.rows.forEach(([label, value], index) => {
        if (index % 2 === 0) rect(margin, y - 24, width - margin * 2, 44, '#f8fafc', 8);
        text(clip(label, 26), margin + 16, y + 4, 15, true, PRINT_COLORS.muted);
        text(clip(value, 60), margin + half + 16, y + 4, 17, false, PRINT_COLORS.ink);
        y += 44;
      });
      y += 14;
      continue;
    }

    if (section.kind === 'lines') {
      heading(section.heading);
      const tone = section.tone === 'warn' ? PRINT_COLORS.gold : section.tone === 'good' ? PRINT_COLORS.emerald : PRINT_COLORS.ink;
      for (const line of section.lines) {
        const lines = wrapWidth(line, 17, false, width - margin * 2 - 30);
        rect(margin + 4, y - 6, 7, 7, tone === PRINT_COLORS.ink ? PRINT_COLORS.muted : tone, 3.5);
        lines.forEach((part, partIndex) => text(part, margin + 26, y + 2 + partIndex * 26, 17, false, tone));
        y += lines.length * 26 + 10;
      }
      y += 10;
      continue;
    }

    // callout
    const bodyLines = wrapWidth(section.body, 17, false, width - margin * 2 - 52);
    const height = 48 + bodyLines.length * 26 + 18;
    rect(margin, y - 20, width - margin * 2, height, PRINT_COLORS.goldSoft, 16);
    text(section.heading.toUpperCase(), margin + 24, y + 4, 14, true, PRINT_COLORS.gold);
    bodyLines.forEach((line, index) => text(line, margin + 24, y + 34 + index * 26, 17, false, PRINT_COLORS.ink));
    y += height + 16;
  }

  // Links.
  if (docRef.links?.length) {
    heading(docRef.linksTitle || 'Links in this record');
    docRef.links.forEach((link) => {
      rect(margin, y - 20, width - margin * 2, 84, '#f8fafc', 12);
      text(link.label, margin + 20, y + 4, 14, true, PRINT_COLORS.muted);
      if (link.hint) text(link.hint, rightEdge - 20, y + 4, 13, false, PRINT_COLORS.muted, 'right');
      ctx.font = `700 18px "SFMono-Regular", Menlo, monospace`;
      text(clip(link.url, 62), margin + 20, y + 34, 18, false, PRINT_COLORS.emerald);
      y += 96;
    });
    y += 6;
  }

  // Notes.
  if (docRef.notes?.length) {
    y += 10;
    for (const note of docRef.notes) {
      for (const line of wrapWidth(note, 14, false, width - margin * 2)) {
        text(line, margin, y, 14, false, PRINT_COLORS.muted);
        y += 20;
      }
    }
  }

  // Footer — organizer, PHANTOM, class and the date.
  y += 22;
  rect(margin, y, width - margin * 2, 2.5, PRINT_COLORS.emerald);
  y += 30;
  const [footerLeft, footerRight] = footerLines(docRef, 1, 1);
  text(footerLeft, margin, y, 14, true, PRINT_COLORS.muted);
  y += 24;
  text(footerRight, margin, y, 13, false, PRINT_COLORS.muted);
  y += 26;

  return Math.ceil(y + 20);
};

export const renderPrintCanvas = (doc: PrintDoc, brand?: PrintBrand | null): HTMLCanvasElement => {
  const width = 1400;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the printable sheet.');
  // Pass 1 measures every line without painting (draw = false). The measuring
  // context still needs the full surface so the white page fill is counted.
  const height = paint({ ctx, draw: false }, width, doc, brand || {});
  canvas.width = width;
  canvas.height = Math.max(600, height);
  const real = canvas.getContext('2d')!;
  // The measured pass assumed a huge page; the real sheet is exactly this tall.
  paint({ ctx: real, draw: true }, width, doc, brand || {});
  return canvas;
};

// ---------------------------------------------------------------------------
// HTML — the print sheet
//
// Same document, on real paper: A4, white, and the type is set for a sheet
// photographed on a phone rather than for a desktop reading pane.
// ---------------------------------------------------------------------------

export const buildPrintHtml = (doc: PrintDoc): string => {
  const absolute = (path: string) => (typeof window === 'undefined' ? path : `${window.location.origin}${path}`);
  const stats = doc.stats?.length
    ? `<div class="stats">${doc.stats.map((stat) => `<div class="stat"><span class="k">${escapeHtml(stat.label)}</span><span class="v">${escapeHtml(stat.value)}</span>${stat.hint ? `<span class="h">${escapeHtml(stat.hint)}</span>` : ''}</div>`).join('')}</div>`
    : '';
  const badges = doc.badges?.length
    ? `<div class="badges">${doc.badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}</div>`
    : '';
  const sections = doc.sections.map((section) => {
    if (section.kind === 'hero') {
      return `<section class="hero ${section.tone === 'warn' ? 'warn' : ''}">
${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}
<div class="result"><span class="l">${escapeHtml(section.label)}</span><strong>${escapeHtml(section.value)}</strong>${section.detail ? `<span class="d">${escapeHtml(section.detail)}</span>` : ''}</div></section>`;
    }
    if (section.kind === 'bars') {
      return `<section><h2>${escapeHtml(section.heading)}</h2>
<ul class="bars">${section.rows.map((row) => `<li><div class="row"><strong>${escapeHtml(row.label)}</strong><span class="v">${escapeHtml(row.value)}${row.share ? `<em>${escapeHtml(row.share)}</em>` : ''}</span></div>${row.note ? `<span class="n">${escapeHtml(row.note)}</span>` : ''}<div class="track"><i style="width:${Math.round(Math.max(0, Math.min(1, Number(row.ratio) || 0)) * 100)}%"></i></div></li>`).join('')}</ul>
${section.note ? `<p class="note">${escapeHtml(section.note)}</p>` : ''}</section>`;
    }
    if (section.kind === 'table') {
      const align = section.align || [];
      return `<section><h2>${escapeHtml(section.heading)}</h2>
<table><thead><tr>${section.columns.map((column, index) => `<th class="${align[index] === 'right' ? 'r' : ''}">${escapeHtml(column)}</th>`).join('')}</tr></thead>
<tbody>${section.rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${align[index] === 'right' ? 'r' : ''}${index === 0 ? ' b' : ''}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
${section.note ? `<p class="note">${escapeHtml(section.note)}</p>` : ''}</section>`;
    }
    if (section.kind === 'keyvalues') {
      return `<section><h2>${escapeHtml(section.heading)}</h2><dl>${section.rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>`;
    }
    if (section.kind === 'lines') {
      return `<section><h2>${escapeHtml(section.heading)}</h2><ul class="${section.tone || 'plain'}">${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></section>`;
    }
    return `<section><div class="callout"><h3>${escapeHtml(section.heading)}</h3><p>${escapeHtml(section.body)}</p></div></section>`;
  }).join('');
  const links = doc.links?.length
    ? `<section><h2>${escapeHtml(doc.linksTitle || 'Links in this record')}</h2><ul class="links">${doc.links.map((link) => `<li><span>${escapeHtml(link.label)}</span><code>${escapeHtml(link.url)}</code>${link.hint ? `<em>${escapeHtml(link.hint)}</em>` : ''}</li>`).join('')}</ul></section>`
    : '';
  const notes = doc.notes?.length ? `<div class="notes">${doc.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</div>` : '';
  const [footerLeft, footerRight] = footerLines(doc, 1, 1);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)} — CODE Rx Society</title>
<style>
  @page { size: A4; margin: 12mm 11mm 14mm; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; color: ${PRINT_COLORS.ink}; margin: 0; font-size: 11.5pt; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .head .left, .head .right { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .head img { height: 42px; width: 42px; object-fit: contain; }
  .head .right img { object-fit: cover; border-radius: 10px; }
  .head strong { display: block; font-size: 14pt; letter-spacing: -0.01em; color: ${PRINT_COLORS.deep}; }
  .head small { display: block; font-size: 9pt; color: ${PRINT_COLORS.muted}; font-weight: 600; }
  .head .right { text-align: right; }
  .rule { height: 3px; background: ${PRINT_COLORS.emerald}; margin: 9px 0 0; border-radius: 2px; position: relative; }
  .rule::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 74px; background: ${PRINT_COLORS.gold}; border-radius: 2px; }
  .kind { display: inline-block; margin: 14px 0 5px; padding: 4px 12px; border-radius: 999px; background: ${PRINT_COLORS.soft}; color: ${PRINT_COLORS.emerald}; font-size: 8pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  h1 { font-size: 25pt; margin: 0 0 4px; letter-spacing: -0.02em; line-height: 1.1; }
  .sub { margin: 0; color: ${PRINT_COLORS.muted}; font-size: 11pt; font-weight: 600; }
  .badges { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .badges span { background: ${PRINT_COLORS.soft}; color: ${PRINT_COLORS.emerald}; font-size: 8pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; }
  .meta { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid ${PRINT_COLORS.line}; border-bottom: 1px solid ${PRINT_COLORS.line}; padding: 8px 0; margin: 12px 0 0; font-size: 9.5pt; color: ${PRINT_COLORS.muted}; font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 9px; margin: 13px 0 4px; }
  .stat { background: ${PRINT_COLORS.soft}; border-radius: 9px; padding: 9px 11px; }
  .stat .k { display: block; font-size: 8pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: ${PRINT_COLORS.emerald}; }
  .stat .v { display: block; font-size: 20pt; font-weight: 800; color: ${PRINT_COLORS.deep}; line-height: 1.1; }
  .stat .h { display: block; font-size: 8pt; color: ${PRINT_COLORS.muted}; font-weight: 600; }
  section { margin-top: 15px; break-inside: avoid; }
  h2 { font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: ${PRINT_COLORS.emerald}; margin: 0 0 7px; border-bottom: 1.5px solid ${PRINT_COLORS.emerald}; padding-bottom: 4px; }
  .result { background: ${PRINT_COLORS.soft}; border-left: 6px solid ${PRINT_COLORS.emerald}; border-radius: 10px; padding: 12px 14px; }
  .hero.warn .result { background: ${PRINT_COLORS.goldSoft}; border-left-color: ${PRINT_COLORS.gold}; }
  .result .l { display: block; font-size: 8pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: ${PRINT_COLORS.emerald}; margin-bottom: 4px; }
  .hero.warn .result .l { color: ${PRINT_COLORS.gold}; }
  .result strong { display: block; font-size: 21pt; line-height: 1.15; color: ${PRINT_COLORS.deep}; letter-spacing: -0.01em; }
  .result .d { display: block; margin-top: 5px; font-size: 10.5pt; color: ${PRINT_COLORS.muted}; font-weight: 600; }
  ul.bars { list-style: none; padding: 0; margin: 0; }
  ul.bars li { margin-bottom: 12px; }
  ul.bars .row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  ul.bars strong { font-size: 11.5pt; }
  ul.bars .v { font-size: 11.5pt; font-weight: 800; color: ${PRINT_COLORS.deep}; white-space: nowrap; }
  ul.bars .v em { font-style: normal; font-weight: 700; color: ${PRINT_COLORS.muted}; margin-left: 8px; }
  ul.bars .n { display: block; font-size: 9pt; color: ${PRINT_COLORS.muted}; }
  ul.bars .track { height: 7px; border-radius: 4px; background: #e8f0ec; margin-top: 5px; overflow: hidden; }
  ul.bars .track i { display: block; height: 100%; background: ${PRINT_COLORS.emerald}; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: ${PRINT_COLORS.emerald}; color: #fff; text-align: left; padding: 7px 8px; font-size: 8.5pt; letter-spacing: .04em; }
  td { padding: 6px 8px; border-bottom: 1px solid ${PRINT_COLORS.line}; }
  td.b { font-weight: 700; }
  th.r, td.r { text-align: right; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  dl { margin: 0; }
  dl div { display: grid; grid-template-columns: 42% 1fr; gap: 8px; padding: 6px 8px; border-radius: 6px; }
  dl div:nth-child(odd) { background: #f8fafc; }
  dt { font-size: 9pt; font-weight: 700; color: ${PRINT_COLORS.muted}; }
  dd { margin: 0; font-size: 10pt; }
  ul { margin: 0; padding-left: 18px; font-size: 10pt; }
  ul li { margin-bottom: 5px; }
  ul.warn li { color: ${PRINT_COLORS.gold}; }
  ul.good li { color: ${PRINT_COLORS.emerald}; }
  .callout { background: ${PRINT_COLORS.goldSoft}; border-radius: 9px; padding: 11px 13px; }
  .callout h3 { margin: 0 0 4px; font-size: 8.5pt; letter-spacing: .1em; text-transform: uppercase; color: ${PRINT_COLORS.gold}; }
  .callout p { margin: 0; font-size: 10pt; }
  .note { margin: 6px 0 0; font-size: 9pt; color: ${PRINT_COLORS.muted}; }
  .links { list-style: none; padding: 0; margin: 0; }
  .links li { background: #f8fafc; border-radius: 9px; padding: 8px 11px; margin-bottom: 6px; }
  .links span { display: block; font-size: 8pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: ${PRINT_COLORS.muted}; }
  .links code { font-size: 10pt; color: ${PRINT_COLORS.emerald}; word-break: break-all; }
  .links em { display: block; font-size: 8pt; color: ${PRINT_COLORS.muted}; font-style: normal; }
  .notes p { margin: 3px 0 0; font-size: 8.5pt; color: ${PRINT_COLORS.muted}; }
  /* The footer sits in the flow, not pinned to the window: a fixed element
     repeats on every printed page in Chrome and lands on top of the notes. */
  .foot { margin-top: 14px; background: #ffffff; border-top: 1.5px solid ${PRINT_COLORS.emerald}; padding-top: 6px; display: flex; justify-content: space-between; gap: 12px; font-size: 8pt; color: ${PRINT_COLORS.muted}; font-weight: 600; }
  .foot .l { font-weight: 800; }
</style></head><body>
<header class="head">
  <div class="left">
    <img src="${absolute(PRINT_MARKS.codeRx)}" alt="CODE Rx Society">
    <span><strong>CODE Rx SOCIETY</strong><small>${escapeHtml(doc.societyLine || 'Class &amp; Group Management')}</small></span>
  </div>
  <div class="right">
    <span><strong>${escapeHtml(doc.className)}</strong><small>${escapeHtml([doc.classCode, doc.institution].filter(Boolean).join(' · '))}</small></span>
    <img src="${absolute(PRINT_MARKS.classGroups)}" alt="Class &amp; Groups">
  </div>
</header>
<div class="rule"></div>
<span class="kind">${escapeHtml(doc.kind)}</span>
<h1>${escapeHtml(doc.title)}</h1>
${doc.subtitle ? `<p class="sub">${escapeHtml(doc.subtitle)}</p>` : ''}
${badges}
<div class="meta"><span>Issued ${escapeHtml(printDate(doc.issuedAt))}</span><span>Organizer: ${escapeHtml(doc.organizer)}</span></div>
${stats}
${sections}
${links}
${notes}
<footer class="foot"><span class="l">${escapeHtml(footerLeft)}</span><span>${escapeHtml(footerRight)}</span></footer>
</body></html>`;
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

const download = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const downloadPrintPdf = async (doc: PrintDoc): Promise<void> => {
  const brand = await loadPrintBrand();
  const bytes = buildPrintPdf(doc, brand);
  download(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), documentFileName(doc, 'pdf'));
};

export const downloadPrintPng = async (doc: PrintDoc): Promise<void> => {
  const brand = await loadPrintBrand();
  const canvas = renderPrintCanvas(doc, brand);
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) download(blob, documentFileName(doc, 'png'));
      resolve();
    }, 'image/png');
  });
};

/** Browser print of the same document, through a hidden iframe. */
export const printPrintDoc = (doc: PrintDoc): void => {
  const html = buildPrintHtml(doc);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-testid', 'cgm-print-frame');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  frame.srcdoc = html;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      window.setTimeout(() => frame.remove(), 60_000);
    }
  };
};

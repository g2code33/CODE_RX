/**
 * CODE Rx SOCIETY — office document conversion for client delivery (Phase 8).
 *
 * A `.docx` is a ZIP of XML. The runtime has no office library, no ZIP reader
 * and no XML parser, so this module reads the archive with `DecompressionStream`
 * (`deflate-raw`) and pulls the readable text out of `word/document.xml`.
 *
 * The output is text, never the source archive: the caller renders it into a
 * stamped Code Rx PDF, so a client can receive a properly generated client copy
 * of a Word document without the untouched original ever being exposed. Anything
 * this reader cannot handle — compression methods other than deflate/store, an
 * archive that is not a Word document — is reported as unsupported and the
 * delivery is refused rather than degraded.
 */

import { DeliveryError, inflateRaw } from './client-delivery';

const decoder = new TextDecoder('utf-8', { fatal: false });

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const findEndOfCentralDirectory = (bytes: Uint8Array): number => {
  const limit = Math.max(0, bytes.length - 66000);
  for (let offset = bytes.length - 22; offset >= limit; offset -= 1) {
    if (
      bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b
      && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06
    ) return offset;
  }
  return -1;
};

/** Reads the ZIP central directory. Throws when the archive is malformed. */
export const readZipDirectory = (bytes: Uint8Array): ZipEntry[] => {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new DeliveryError('office_not_zip', 'Not a ZIP archive');
  }
  const end = findEndOfCentralDirectory(bytes);
  if (end === -1) throw new DeliveryError('office_no_directory', 'No ZIP central directory');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length) throw new DeliveryError('office_truncated_directory', 'Truncated central directory');
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_HEADER) {
      throw new DeliveryError('office_bad_entry', 'Malformed central directory entry');
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, method, compressedSize, uncompressedSize, dataOffset: localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

/** Extracts one entry, inflating it with `deflate-raw` when it is compressed. */
export const readZipEntry = async (bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.dataOffset + 30 > bytes.length) throw new DeliveryError('office_truncated_entry', 'Truncated local header');
  if (view.getUint32(entry.dataOffset, true) !== LOCAL_FILE_HEADER) {
    throw new DeliveryError('office_bad_local_header', 'Malformed local file header');
  }
  const nameLength = view.getUint16(entry.dataOffset + 26, true);
  const extraLength = view.getUint16(entry.dataOffset + 28, true);
  const start = entry.dataOffset + 30 + nameLength + extraLength;
  const end = start + (entry.compressedSize || 0);
  if (end > bytes.length) throw new DeliveryError('office_truncated_data', 'Truncated entry data');
  const payload = bytes.subarray(start, end);
  if (entry.method === 0) return payload.slice();
  if (entry.method !== 8) {
    throw new DeliveryError('office_unsupported_compression', `Unsupported ZIP compression method ${entry.method}`);
  }
  try {
    return await inflateRaw(payload);
  } catch {
    throw new DeliveryError('office_inflate_failed', 'An archive entry could not be decompressed');
  }
};

// ---------------------------------------------------------------------------
// WordprocessingML → text
// ---------------------------------------------------------------------------

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const paragraphStyle = (paragraphXml: string): string => {
  const style = /<w:pStyle[^>]*w:val="([^"]+)"/.exec(paragraphXml);
  return style ? style[1].toLowerCase() : '';
};

const headingLevelFor = (style: string): number => {
  if (!style) return 0;
  const heading = /^heading(\d)/.exec(style) || /^h(\d)$/.exec(style);
  if (heading) return Math.max(1, Math.min(4, Number(heading[1])));
  if (style.includes('title')) return 1;
  return 0;
};

const isListParagraph = (paragraphXml: string): boolean =>
  /<w:numPr>/.test(paragraphXml) || /<w:pStyle[^>]*w:val="[^"]*(list|bullet)[^"]*"/i.test(paragraphXml);

const runsToText = (paragraphXml: string): string => {
  let text = '';
  const tokens = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:(?:drawing|pict)\b[\s\S]*?<\/w:\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(paragraphXml)) !== null) {
    if (match[1] !== undefined) text += decodeXmlEntities(match[1]);
    else if (match[0].startsWith('<w:tab')) text += '    ';
    else if (match[0].startsWith('<w:br')) text += '\n';
    else text += ' [image omitted from client copy] ';
  }
  return text.replace(/[ \t]{3,}/g, '   ').trim();
};

interface OfficeParagraph {
  text: string;
  heading: number;
  list: boolean;
  bullet: boolean;
}

/** Pulls the paragraphs (and simple table rows) out of `word/document.xml`. */
export const wordDocumentParagraphs = (xml: string): OfficeParagraph[] => {
  const paragraphs: OfficeParagraph[] = [];
  const blockPattern = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:tbl>([\s\S]*?)<\/w:tbl>|<w:p\b[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(xml)) !== null) {
    if (match[2] !== undefined) {
      // A table: flatten each row into a single line so the stamped copy keeps
      // the data without pretending to reproduce the layout.
      const rows = match[2].match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
      for (const row of rows) {
        const cells = (row.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g) || []).map((cell) => runsToText(cell));
        const line = cells.filter(Boolean).join('  |  ');
        if (line.trim()) paragraphs.push({ text: line, heading: 0, list: false, bullet: false });
      }
      continue;
    }
    const inner = match[1] || '';
    const text = runsToText(inner);
    if (!text.trim()) continue;
    const style = paragraphStyle(inner);
    paragraphs.push({
      text,
      heading: headingLevelFor(style),
      list: isListParagraph(inner),
      bullet: /<w:numPr>/.test(inner) || /bullet/i.test(style),
    });
  }
  return paragraphs;
};

export interface OfficeConversion {
  text: string;
  notes: string[];
  kind: 'docx' | 'odt' | 'text';
  paragraphCount: number;
}

/**
 * Converts a Word document (or an OpenDocument text file) into text for the
 * stamped client PDF. Returns `null` when the archive is not a document this
 * reader can render — the caller then refuses the delivery.
 */
export const convertOfficeDocument = async (
  bytes: Uint8Array,
  mimeType: string | null,
): Promise<OfficeConversion | null> => {
  let entries: ZipEntry[];
  try {
    entries = readZipDirectory(bytes);
  } catch {
    return null;
  }
  const names = new Set(entries.map((entry) => entry.name));
  const notes: string[] = [];

  const documentEntry = entries.find((entry) => entry.name === 'word/document.xml');
  if (documentEntry) {
    const xml = decoder.decode(await readZipEntry(bytes, documentEntry));
    const paragraphs = wordDocumentParagraphs(xml);
    const lines: string[] = [];
    let listOpen = false;
    for (const paragraph of paragraphs) {
      if (paragraph.heading) {
        lines.push(`${'#'.repeat(paragraph.heading)} ${paragraph.text}`);
        listOpen = false;
        continue;
      }
      if (paragraph.list) {
        lines.push(`${paragraph.bullet ? '-' : '-'} ${paragraph.text}`);
        listOpen = true;
        continue;
      }
      if (listOpen) lines.push('');
      listOpen = false;
      lines.push(paragraph.text);
    }
    const media = entries.filter((entry) => entry.name.startsWith('word/media/'));
    if (media.length) {
      notes.push(`${media.length} embedded image${media.length === 1 ? '' : 's'} omitted from the stamped client copy; the source file stays in the Code Rx Vault.`);
    }
    const text = lines.join('\n').trim();
    if (!text) return null;
    return { text, notes, kind: 'docx', paragraphCount: paragraphs.length };
  }

  const odtEntry = entries.find((entry) => entry.name === 'content.xml');
  if (odtEntry) {
    const xml = decoder.decode(await readZipEntry(bytes, odtEntry));
    const paragraphs = [...xml.matchAll(/<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)>/g)]
      .map((match) => decodeXmlEntities(match[1].replace(/<text:s\/>/g, ' ').replace(/<[^>]+>/g, '')).trim())
      .filter(Boolean);
    if (!paragraphs.length) return null;
    return { text: paragraphs.join('\n'), notes, kind: 'odt', paragraphCount: paragraphs.length };
  }

  // A plain-text file that happens to be zipped, or an archive we cannot read.
  if (names.size) return null;
  void mimeType;
  return null;
};

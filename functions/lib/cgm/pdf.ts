/**
 * CODE Rx — minimal PDF writer for class & group report exports.
 *
 * Produces a genuine, printable single-file PDF (Helvetica/Courier, A4
 * portrait) with a title row, a repeated header per page and wrapped text —
 * no external dependency, so the export path stays as dependency-light as the
 * rest of the module.
 */

const PAGE_WIDTH = 842; // A4 landscape, in PDF points
const PAGE_HEIGHT = 595;
const MARGIN = 36;
const ROW_HEIGHT = 15;
const FONT_SIZE = 8.5;
const TITLE_SIZE = 15;
const MAX_COL_WIDTH = 220;

const escapePdfText = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    // PDF basic strings are latin-1-ish; drop anything outside to stay valid.
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

/** Rough Courier width: every glyph is a fixed 0.6 em. */
const clipped = (value: string, maxWidth: number) => {
  const maxChars = Math.floor(maxWidth / (FONT_SIZE * 0.6));
  const text = value.length > maxChars ? `${value.slice(0, Math.max(4, maxChars - 1))}…` : value;
  return text;
};

export const buildReportPdf = (
  title: string,
  header: string[],
  rows: Array<Array<string | number | null>>,
  generatedFor: string,
): Uint8Array => {
  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const columnWidth = Math.min(MAX_COL_WIDTH, usableWidth / Math.max(1, header.length));
  const rowsPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2 - ROW_HEIGHT * 2) / ROW_HEIGHT);

  // One content stream per page.
  const pages: string[] = [];
  const chunks: string[][] = [];
  let current: string[][] = [];
  for (const row of rows) chunks.push(row.map((cell) => String(cell ?? '')));
  if (!chunks.length) chunks.push(header.map(() => ''));
  const pagesOfChunks: string[][][] = [];
  for (let i = 0; i < chunks.length; i += rowsPerPage) {
    pagesOfChunks.push(chunks.slice(i, i + rowsPerPage));
  }
  if (!pagesOfChunks.length) pagesOfChunks.push([header.map(() => '')]);

  pagesOfChunks.forEach((pageRows, pageIndex) => {
    const lines: string[] = ['BT'];
    let y = PAGE_HEIGHT - MARGIN - TITLE_SIZE;
    lines.push(`/F1 ${TITLE_SIZE} Tf`);
    lines.push(`1 0 0 1 ${MARGIN} ${y} Tm`);
    lines.push(`(${escapePdfText(`${title} — CODE Rx Society`)}) Tj`);
    y -= ROW_HEIGHT;
    lines.push(`/F2 8 Tf`);
    lines.push(`1 0 0 1 ${MARGIN} ${y} Tm`);
    lines.push(`(${escapePdfText(`${generatedFor} · page ${pageIndex + 1} of ${pagesOfChunks.length}`)}) Tj`);
    y -= ROW_HEIGHT + 4;
    // Header row.
    lines.push('/F2 9 Tf');
    let x = MARGIN;
    const headerParts: string[] = [];
    header.forEach((cell) => {
      headerParts.push(`1 0 0 1 ${x} ${y} Tm (${escapePdfText(clipped(cell, columnWidth))}) Tj`);
      x += columnWidth;
    });
    lines.push(...headerParts);
    y -= ROW_HEIGHT;
    for (const row of pageRows) {
      x = MARGIN;
      const rowParts: string[] = [];
      row.forEach((cell, index) => {
        rowParts.push(`1 0 0 1 ${x} ${y} Tm (${escapePdfText(clipped(cell, columnWidth))}) Tj`);
        x += index < header.length - 1 ? columnWidth : 0;
      });
      lines.push(...rowParts);
      y -= ROW_HEIGHT;
    }
    lines.push('ET');
    pages.push(lines.join('\n'));
  });

  const objects: string[] = [];
  const pageCount = pages.length;
  // 1: catalog, 2: pages tree, 3: font Helvetica, 4: font Courier, then per
  // page: page object + content stream object.
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  pages.forEach((content, index) => {
    const pageId = pageObjectIds[index];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
};

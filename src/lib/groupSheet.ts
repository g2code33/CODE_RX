/**
 * CODE Rx — group member sheet (dependency-free).
 *
 * One sheet definition renders three ways the organizer chooses from:
 *   • a downloadable PNG (canvas),
 *   • a genuine multi-page PDF (A4 portrait, built in `cgmPrint`'s byte writer),
 *   • a browser print of the same document.
 *
 * Every output carries the shared CODE Rx letterhead — the society mark on the
 * left, the class & grouping mark on the right, the class and activity line, the
 * group title, the GROUP TOPIC block (toggleable), the chosen member columns,
 * the AOB block, and a footer that names the organizer and PHANTOM, with the
 * issue date and the group link.
 */

import {
  PRINT_COLORS,
  PRINT_MARKS,
  PdfFile,
  loadPrintBrand,
  preparedBy,
  printDate,
  pdfText,
  type PrintBrand,
} from './cgmPrint';

export interface GroupSheet {
  groupName: string;
  topic?: string;
  /** Feature the group topic as a printed block (default: on). */
  includeTopic?: boolean;
  aob?: string;
  className: string;
  activityName: string;
  dateLabel: string;
  columns: string[];
  rows: string[][];
  /** Blank write-in rows at 1-based member-row positions (handwriting space). */
  blankRows?: Array<{ position: number; count: number }>;
  footer: string;
  /** Who produced the sheet — printed in the footer beside PHANTOM. */
  organizer?: string;
  classCode?: string;
  /** The group's own link, printed with the issue date. */
  groupLink?: string;
}

const EMERALD = PRINT_COLORS.emerald;
const EMERALD_SOFT = PRINT_COLORS.soft;
const AMBER_SOFT = PRINT_COLORS.goldSoft;
const INK = PRINT_COLORS.ink;
const MUTED = PRINT_COLORS.muted;
const LINE = PRINT_COLORS.line;

const wrap = (text: string, maxChars: number): string[] => {
  const out: string[] = [];
  for (const paragraph of String(text || '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      if ((line + ' ' + word).trim().length > maxChars) { if (line) out.push(line.trim()); line = word; }
      else line = `${line} ${word}`;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out.length ? out : [''];
};

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const safeName = (value: string) => String(value || 'group').replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 60) || 'group';

/** The footer of every sheet: organizer, PHANTOM, class, date, group link. */
export const sheetFooter = (sheet: GroupSheet): [string, string] => [
  `${preparedBy(sheet.organizer || sheet.footer)} · ${sheet.dateLabel}`,
  [sheet.className, sheet.classCode ? `(${sheet.classCode})` : null, sheet.groupLink ? `Group link ${sheet.groupLink}` : null]
    .filter(Boolean).join(' · '),
];

// ---------------------------------------------------------------------------
// Blank write-in rows — the organizer can add ruled empty rows at chosen
// positions (for signatures, late additions, marks). They render in every
// output as empty banded rows with a write-in line, and never count as
// members in the header count.
// ---------------------------------------------------------------------------
type SheetRow = { cells: string[]; blank: boolean };
const buildRenderRows = (sheet: GroupSheet): SheetRow[] => {
  const rows = sheet.rows.length ? sheet.rows : [sheet.columns.map(() => '')];
  const out: SheetRow[] = [];
  let cursor = 1; // 1-based position in `rows`
  const batches = [...(sheet.blankRows || [])].sort((a, b) => a.position - b.position);
  for (const batch of batches) {
    const pos = Math.min(Math.max(1, Math.round(batch.position)), rows.length + 1);
    while (cursor < pos && cursor <= rows.length) { out.push({ cells: rows[cursor - 1], blank: false }); cursor += 1; }
    for (let i = 0; i < Math.max(0, Math.round(batch.count)); i += 1) out.push({ cells: [], blank: true });
  }
  while (cursor <= rows.length) { out.push({ cells: rows[cursor - 1], blank: false }); cursor += 1; }
  return out;
};

// ---------------------------------------------------------------------------
// PNG — canvas rendering
// ---------------------------------------------------------------------------
export const renderGroupSheetCanvas = (sheet: GroupSheet, brand?: PrintBrand | null): HTMLCanvasElement => {
  const width = 1240;
  const margin = 48;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '16px system-ui, sans-serif';
  const measure = (text: string, font: string) => { ctx.font = font; return ctx.measureText(text).width; };

  const showTopic = sheet.includeTopic !== false && Boolean(sheet.topic);
  const topicLines = showTopic ? wrap(sheet.topic || '', 108) : [];
  const aobLines = sheet.aob ? wrap(sheet.aob, 108) : [];
  const colWidth = (width - margin * 2) / Math.max(1, sheet.columns.length);
  const rowH = 40;
  const tableRows = buildRenderRows(sheet);

  // Pass 1: measure total height.
  ctx.font = '16px system-ui, sans-serif';
  let y = 0;
  const headerH = 132;                     // letterhead band (marks + rule)
  y += headerH + 40;                       // band + title area
  y += topicLines.length ? 52 + topicLines.length * 24 + 14 : 0;
  y += 46;                                  // table head
  y += tableRows.length * rowH;
  y += aobLines.length ? 52 + aobLines.length * 24 + 14 : 0;
  y += sheet.groupLink ? 60 : 0;
  y += 96;                                  // footer
  const height = Math.round(y);

  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;

  // --- Letterhead: society mark left, class & grouping mark right ----------
  const markSize = 54;
  if (brand?.codeRx) g.drawImage(brand.codeRx, margin, 26, markSize, markSize);
  const leftText = margin + (brand?.codeRx ? markSize + 16 : 0);
  g.fillStyle = PRINT_COLORS.deep;
  g.font = '700 21px system-ui, sans-serif';
  g.fillText('CODE Rx SOCIETY', leftText, 52);
  g.fillStyle = MUTED;
  g.font = '13px system-ui, sans-serif';
  g.fillText('Class & Group Management', leftText, 71);

  if (brand?.classGroups) {
    const mx = width - margin - markSize;
    g.save();
    g.beginPath();
    const r = 12;
    g.moveTo(mx + r, 26);
    g.arcTo(mx + markSize, 26, mx + markSize, 26 + markSize, r);
    g.arcTo(mx + markSize, 26 + markSize, mx, 26 + markSize, r);
    g.arcTo(mx, 26 + markSize, mx, 26, r);
    g.arcTo(mx, 26, mx + markSize, 26, r);
    g.closePath();
    g.clip();
    g.drawImage(brand.classGroups, mx, 26, markSize, markSize);
    g.restore();
  }
  const rightText = width - margin - (brand?.classGroups ? markSize + 16 : 0);
  g.textAlign = 'right';
  g.fillStyle = INK;
  g.font = '700 16px system-ui, sans-serif';
  g.fillText(sheet.className, rightText, 52);
  g.fillStyle = MUTED;
  g.font = '12px system-ui, sans-serif';
  g.fillText([sheet.classCode, sheet.activityName].filter(Boolean).join(' · '), rightText, 71);
  g.textAlign = 'left';

  g.fillStyle = EMERALD;
  g.fillRect(margin, 100, width - margin * 2, 3);
  g.fillStyle = PRINT_COLORS.gold;
  g.fillRect(margin, 100, 110, 3);

  // --- Title + topic --------------------------------------------------------
  let cursor = headerH + 44;
  g.fillStyle = INK;
  g.font = '800 34px system-ui, sans-serif';
  g.fillText(sheet.groupName, margin, cursor);
  g.font = '400 15px system-ui, sans-serif';
  g.fillStyle = MUTED;
  g.textAlign = 'right';
  g.fillText(`${sheet.rows.length} member(s) · ${sheet.dateLabel}`, width - margin, cursor);
  g.textAlign = 'left';
  cursor += 14;

  // Featured GROUP TOPIC block (toggleable — on by default).
  if (topicLines.length) {
    cursor += 24;
    g.fillStyle = AMBER_SOFT;
    g.fillRect(margin, cursor, width - margin * 2, 40 + topicLines.length * 24);
    g.fillStyle = '#92400e';
    g.font = '800 13px system-ui, sans-serif';
    g.fillText('GROUP TOPIC', margin + 16, cursor + 24);
    g.fillStyle = INK;
    g.font = '15px system-ui, sans-serif';
    topicLines.forEach((line, index) => g.fillText(line, margin + 16, cursor + 46 + index * 24));
    cursor += 40 + topicLines.length * 24 + 14;
  }

  // Table.
  cursor += 14;
  g.fillStyle = EMERALD;
  g.fillRect(margin, cursor, width - margin * 2, 34);
  g.fillStyle = '#ffffff';
  g.font = '700 14px system-ui, sans-serif';
  sheet.columns.forEach((column, index) => g.fillText(column, margin + index * colWidth + 10, cursor + 22));
  cursor += 34;
  tableRows.forEach((row, rowIndex) => {
    g.fillStyle = rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff';
    g.fillRect(margin, cursor, width - margin * 2, rowH);
    g.strokeStyle = LINE;
    g.strokeRect(margin, cursor, width - margin * 2, rowH);
    if (row.blank) {
      // A ruled write-in line across the row — space to handwrite.
      g.strokeStyle = '#94a3b8';
      g.beginPath();
      g.moveTo(margin + 10, cursor + rowH - 12);
      g.lineTo(width - margin - 10, cursor + rowH - 12);
      g.stroke();
    } else {
      g.fillStyle = INK;
      g.font = '14px system-ui, sans-serif';
      row.cells.forEach((cell, index) => {
        const text = String(cell ?? '');
        const clipped = measure(text, '14px system-ui, sans-serif') > colWidth - 16
          ? `${text.slice(0, Math.max(3, Math.floor((colWidth - 16) / 8)))}…` : text;
        g.fillText(clipped, margin + index * colWidth + 10, cursor + 25);
      });
    }
    cursor += rowH;
  });

  // AOB block.
  if (aobLines.length) {
    cursor += 24;
    g.fillStyle = EMERALD_SOFT;
    g.fillRect(margin, cursor, width - margin * 2, 40 + aobLines.length * 24);
    g.fillStyle = EMERALD;
    g.font = '800 13px system-ui, sans-serif';
    g.fillText('AOB / OTHER BUSINESS', margin + 16, cursor + 24);
    g.fillStyle = INK;
    g.font = '15px system-ui, sans-serif';
    aobLines.forEach((line, index) => g.fillText(line, margin + 16, cursor + 46 + index * 24));
    cursor += 40 + aobLines.length * 24 + 14;
  }

  // Group link.
  if (sheet.groupLink) {
    cursor += 18;
    g.fillStyle = '#f8fafc';
    g.fillRect(margin, cursor, width - margin * 2, 40);
    g.fillStyle = MUTED;
    g.font = '800 11px system-ui, sans-serif';
    g.fillText('GROUP LINK', margin + 14, cursor + 17);
    g.fillStyle = EMERALD;
    g.font = '700 13px "SFMono-Regular", Menlo, monospace';
    g.fillText(sheet.groupLink, margin + 14, cursor + 33);
    cursor += 46;
  }

  // Footer: organizer + PHANTOM on the left, class + date on the right.
  const [footerLeft, footerRight] = sheetFooter(sheet);
  g.fillStyle = EMERALD;
  g.fillRect(margin, height - 62, width - margin * 2, 2);
  g.fillStyle = MUTED;
  g.font = '700 11.5px system-ui, sans-serif';
  g.fillText(footerLeft, margin, height - 40);
  g.font = '400 11px system-ui, sans-serif';
  g.textAlign = 'right';
  g.fillText(footerRight, width - margin, height - 24);
  g.textAlign = 'left';
  return canvas;
};

export const downloadGroupSheetPng = (sheet: GroupSheet): void => {
  void loadPrintBrand().then((brand) => {
    const canvas = renderGroupSheetCanvas(sheet, brand);
    canvas.toBlob((blob) => { if (blob) download(blob, `${safeName(sheet.groupName)}-members.png`); }, 'image/png');
  });
};

// ---------------------------------------------------------------------------
// PDF — genuine multi-page A4 document, shared letterhead + footer
// ---------------------------------------------------------------------------
const PDF_W = 595.28; const PDF_H = 841.89; const PDF_MARGIN = 42;
const pdfEscape = (value: string) => pdfText(value);
const pdfClip = (value: string, maxChars: number) => {
  const text = String(value ?? '');
  return text.length > maxChars ? `${text.slice(0, Math.max(3, maxChars - 1))}...` : text;
};

export const buildGroupSheetPdf = (sheet: GroupSheet, brand?: PrintBrand | null): Uint8Array => {
  const file = new PdfFile();
  const fontRegular = file.add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  const fontBold = file.add(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
  const codeRxId = file.embedJpeg(brand?.codeRxJpeg);
  const classId = file.embedJpeg(brand?.classGroupsJpeg);

  const usable = PDF_W - PDF_MARGIN * 2;
  const colWidth = usable / Math.max(1, sheet.columns.length);
  const colChars = Math.floor(colWidth / 4.8);
  const showTopic = sheet.includeTopic !== false && Boolean(sheet.topic);
  const topicLines = showTopic ? wrap(sheet.topic || '', 92) : [];
  const aobLines = sheet.aob ? wrap(sheet.aob, 92) : [];
  const tableRows = buildRenderRows(sheet);

  const pages: string[][] = [];
  let ops: string[] = [];
  let cursor = PDF_H - PDF_MARGIN;
  const text = (x: number, y: number, size: number, bold: boolean, value: string, gray = 0) =>
    ops.push(`BT ${gray} g /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  const rect = (x: number, y: number, w: number, h: number, r: number, g: number, b: number) =>
    ops.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f`);

  const letterhead = () => {
    const top = PDF_H - PDF_MARGIN;
    const markSize = 34;
    if (codeRxId) ops.push(`q ${markSize} 0 0 ${markSize} ${PDF_MARGIN} ${top - markSize + 2} cm /Im${codeRxId} Do Q`);
    const leftText = PDF_MARGIN + (codeRxId ? markSize + 10 : 0);
    text(leftText, top - 10, 12.5, true, 'CODE Rx SOCIETY', 1);
    text(leftText, top - 22, 8, false, 'Class & Group Management', 0.55);
    if (classId) ops.push(`q ${markSize} 0 0 ${markSize} ${PDF_W - PDF_MARGIN - markSize} ${top - markSize + 2} cm /Im${classId} Do Q`);
    const rightText = PDF_W - PDF_MARGIN - (classId ? markSize + 10 : 0);
    const className = pdfClip(sheet.className, 34);
    text(rightText - className.length * 5.4, top - 10, 10.5, true, className, 0.05);
    const sub = pdfClip([sheet.classCode, sheet.activityName].filter(Boolean).join(' - '), 44);
    text(rightText - sub.length * 3.6, top - 22, 7.5, false, sub, 0.45);
    rect(PDF_MARGIN, top - markSize - 6, usable, 1.6, 0.016, 0.471, 0.341);
    return top - markSize - 22;
  };

  const footer = (pageOps: string[], page: number, pagesCount: number) => {
    const [left, right] = sheetFooter(sheet);
    pageOps.push(`0.016 0.471 0.341 rg ${PDF_MARGIN} 52 ${usable} 1 re f`);
    pageOps.push(`BT 0.392 0.455 0.545 rg /F1 7 Tf ${PDF_MARGIN} 40 Td (${pdfEscape(pdfClip(left, 120))}) Tj ET`);
    pageOps.push(`BT 0.392 0.455 0.545 rg /F1 6.5 Tf ${PDF_MARGIN} 29 Td (${pdfEscape(pdfClip(right, 120))}) Tj ET`);
    pageOps.push(`BT 0.392 0.455 0.545 rg /F1 6.5 Tf ${PDF_W - PDF_MARGIN - 40} 40 Td (${pdfEscape(`Page ${page} of ${pagesCount}`)}) Tj ET`);
  };

  const newPage = (continuation = false) => {
    pages.push(ops);
    ops = [];
    cursor = letterhead();
    if (continuation) {
      text(PDF_MARGIN, cursor - 8, 9, false, `${sheet.groupName} — member sheet (continued)`, 0.45);
      cursor -= 26;
    }
  };

  // Page 1 — letterhead, then the group title.
  cursor = letterhead();
  text(PDF_MARGIN, cursor, 17, true, pdfClip(sheet.groupName, 44));
  const countLabel = `${sheet.rows.length} member(s)`;
  text(PDF_W - PDF_MARGIN - countLabel.length * 4.6, cursor, 10, false, countLabel, 0.35);
  cursor -= 8;

  const block = (heading: string, body: string[], fill: [number, number, number], headingGray: number) => {
    if (!body.length) return;
    const height = 34 + body.length * 14 + 8;
    if (cursor - height < 76) newPage();
    rect(PDF_MARGIN, cursor - height, usable, height, fill[0], fill[1], fill[2]);
    text(PDF_MARGIN + 10, cursor - 16, 8.5, true, heading, headingGray);
    body.forEach((line, index) => text(PDF_MARGIN + 10, cursor - 32 - index * 14, 9.5, false, line));
    cursor -= height + 14;
  };
  block('GROUP TOPIC', topicLines, [1, 0.972, 0.921], 0.09);

  // Table with page breaks + repeated header.
  const drawTableHead = () => {
    rect(PDF_MARGIN, cursor - 20, usable, 20, 0.016, 0.471, 0.341);
    sheet.columns.forEach((column, index) => text(PDF_MARGIN + index * colWidth + 5, cursor - 14, 8.5, true, pdfClip(column, colChars), 1));
    cursor -= 20;
  };
  if (cursor - 40 < 76) newPage();
  drawTableHead();
  tableRows.forEach((row, rowIndex) => {
    if (cursor - 18 < 76) { newPage(true); drawTableHead(); }
    if (rowIndex % 2 === 0) rect(PDF_MARGIN, cursor - 18, usable, 18, 0.972, 0.980, 0.988);
    if (row.blank) {
      // Ruled write-in line per cell, so handwriting stays inside its column.
      sheet.columns.forEach((_, index) => op0(PDF_MARGIN + index * colWidth + 5, cursor - 4, colWidth - 10));
    } else {
      row.cells.forEach((cell, index) => text(PDF_MARGIN + index * colWidth + 5, cursor - 13, 9, false, pdfClip(cell, colChars)));
    }
    cursor -= 18;
  });
  function op0(x: number, y: number, w: number) {
    ops.push(`0.62 0.66 0.72 rg ${x} ${y} ${w} 0.7 re f`);
  }

  block('AOB / OTHER BUSINESS', aobLines, [0.925, 0.992, 0.960], 0.2);

  if (sheet.groupLink) {
    const height = 34;
    if (cursor - height < 76) newPage();
    rect(PDF_MARGIN, cursor - height, usable, height, 0.973, 0.976, 0.984);
    text(PDF_MARGIN + 10, cursor - 14, 8, true, 'GROUP LINK', 0.35);
    text(PDF_MARGIN + 10, cursor - 26, 9.5, false, pdfClip(sheet.groupLink, 90), 0.2);
    cursor -= height + 12;
  }

  if (cursor - 20 < 76) newPage();
  pages.push(ops);

  const pageCount = Math.max(1, pages.length);
  pages.forEach((pageOps, index) => footer(pageOps, index + 1, pageCount));

  const resources = `<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >>`
    + `${codeRxId ? ` /XObject << /Im${codeRxId} ${codeRxId} 0 R /Im${classId} ${classId} 0 R >>` : ''} >>`;
  const contentIds: number[] = [];
  const pageIds: number[] = [];
  pages.forEach((pageOps) => {
    const stream = pageOps.join('\n');
    contentIds.push(file.add([`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]));
  });
  const pagesId = file.reserve();
  pages.forEach((_, index) => {
    pageIds.push(file.add([`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Contents ${contentIds[index]} 0 R /Resources ${resources} >>`]));
  });
  file.set(pagesId, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`]);
  const catalogId = file.add([`<< /Type /Catalog /Pages ${pagesId} 0 R >>`]);
  return file.build(catalogId);
};

export const downloadGroupSheetPdf = (sheet: GroupSheet): void => {
  void loadPrintBrand().then((brand) => {
    const bytes = buildGroupSheetPdf(sheet, brand);
    download(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), `${safeName(sheet.groupName)}-members.pdf`);
  });
};

// ---------------------------------------------------------------------------
// Print — the same document through a hidden iframe
// ---------------------------------------------------------------------------
export const printGroupSheet = (sheet: GroupSheet): void => {
  const showTopic = sheet.includeTopic !== false && Boolean(sheet.topic);
  const aobRows = sheet.aob ? wrap(sheet.aob, 110) : [];
  const tableRows = buildRenderRows(sheet);
  const escapeHtml = (value: string) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const [footerLeft, footerRight] = sheetFooter(sheet);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sheet.groupName)} — member sheet</title>
<style>
  @page { size: A4; margin: 14mm 12mm 20mm; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif; color: ${INK}; margin: 0; font-size: 10pt; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .head .left, .head .right { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .head img { height: 44px; width: 44px; object-fit: contain; }
  .head .right img { object-fit: cover; border-radius: 10px; }
  .head strong { display: block; font-size: 13pt; color: ${PRINT_COLORS.deep}; }
  .head small { display: block; font-size: 8pt; color: ${MUTED}; font-weight: 600; }
  .head .right { text-align: right; }
  .rule { height: 3px; background: ${EMERALD}; margin-top: 10px; position: relative; border-radius: 2px; }
  .rule::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 70px; background: ${PRINT_COLORS.gold}; border-radius: 2px; }
  h2 { font-size: 20pt; margin: 16px 0 2px; }
  .topic { color: ${EMERALD}; font-weight: 700; font-size: 12px; }
  .count { color: ${MUTED}; font-size: 11px; }
  .block { background: ${AMBER_SOFT}; border-radius: 8px; padding: 10px 14px; margin: 12px 0; }
  .block.green { background: ${EMERALD_SOFT}; }
  .block h3 { margin: 0 0 6px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #92400e; }
  .block.green h3 { color: ${EMERALD}; }
  .block p { margin: 0; font-size: 12px; white-space: pre-wrap; }
  .link { background: #f8fafc; border-radius: 8px; padding: 8px 12px; font-size: 11px; color: ${EMERALD}; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
  th { background: ${EMERALD}; color: #fff; text-align: left; padding: 6px 8px; }
  td { border-bottom: 1px solid ${LINE}; padding: 6px 8px; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr.blank td { height: 22px; }
  tr.blank td.fill { background: linear-gradient(#ffffff, #ffffff) bottom / 100% 1px no-repeat; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1.5px solid ${EMERALD}; padding-top: 5px; display: flex; justify-content: space-between; gap: 12px; font-size: 7pt; color: ${MUTED}; font-weight: 600; }
</style></head><body>
<header class="head">
  <div class="left"><img src="${origin}${PRINT_MARKS.codeRx}" alt="CODE Rx Society"><span><strong>CODE Rx SOCIETY</strong><small>Class &amp; Group Management</small></span></div>
  <div class="right"><span><strong>${escapeHtml(sheet.className)}</strong><small>${escapeHtml([sheet.classCode, sheet.activityName].filter(Boolean).join(' · '))}</small></span><img src="${origin}${PRINT_MARKS.classGroups}" alt="Class &amp; Groups"></div>
</header>
<div class="rule"></div>
<h2>${escapeHtml(sheet.groupName)}</h2>
<p class="count">${sheet.rows.length} member(s) · ${escapeHtml(sheet.dateLabel)}</p>
${showTopic ? `<div class="block"><h3>Group topic</h3><p>${escapeHtml(sheet.topic ?? '')}</p></div>` : ''}
<table><thead><tr>${sheet.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
<tbody>${tableRows.map((row) => row.blank
  ? `<tr class="blank">${sheet.columns.map(() => `<td class="fill"></td>`).join('')}</tr>`
  : `<tr>${row.cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
${aobRows.length ? `<div class="block green"><h3>AOB / Other business</h3><p>${escapeHtml(sheet.aob ?? '')}</p></div>` : ''}
${sheet.groupLink ? `<p class="link">Group link — ${escapeHtml(sheet.groupLink)}</p>` : ''}
<footer class="foot"><span>${escapeHtml(footerLeft)}</span><span>${escapeHtml(footerRight)}</span></footer>
</body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  frame.srcdoc = html;
  frame.onload = () => {
    try { frame.contentWindow!.focus(); frame.contentWindow!.print(); }
    finally { window.setTimeout(() => frame.remove(), 60_000); }
  };
};

export { printDate };

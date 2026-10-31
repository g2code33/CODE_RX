/**
 * CODE Rx — group member sheet rendering (dependency-free).
 *
 * One sheet definition renders three ways the organizer chooses from:
 *   • a downloadable PNG (canvas),  • a genuine multi-page PDF (built here,
 * Helvetica, A4 portrait, with the agenda + AOB preamble on page one),
 *   • a browser print of the same document.
 * The header (society · class · activity), the group title, the featured
 * GROUP TOPIC block (organizer can toggle it off), the chosen member
 * columns and an AOB block appear — the printout is a real working
 * document for the group.
 */

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
}

const EMERALD = '#047857';
const EMERALD_SOFT = '#ecfdf5';
const AMBER_SOFT = '#fffbeb';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

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
export const renderGroupSheetCanvas = (sheet: GroupSheet): HTMLCanvasElement => {
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
  const headerH = 96;
  y += headerH + 40;                       // band + title area
  y += topicLines.length ? 52 + topicLines.length * 24 + 14 : 0;
  y += 46;                                  // table head
  y += tableRows.length * rowH;
  y += aobLines.length ? 52 + aobLines.length * 24 + 14 : 0;
  y += 72;                                  // footer
  const height = Math.round(y);

  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;

  // Header band.
  g.fillStyle = EMERALD;
  g.fillRect(0, 0, width, headerH);
  g.fillStyle = '#ffffff';
  g.font = '700 22px system-ui, sans-serif';
  g.fillText('CODE Rx SOCIETY — Class & Group Management', margin, 38);
  g.font = '15px system-ui, sans-serif';
  g.fillText(`${sheet.className}  ·  ${sheet.activityName}`, margin, 64);
  g.textAlign = 'right';
  g.fillText(sheet.dateLabel, width - margin, 38);
  g.textAlign = 'left';

  // Title + topic.
  let cursor = headerH + 52;
  g.fillStyle = INK;
  g.font = '800 34px system-ui, sans-serif';
  g.fillText(sheet.groupName, margin, cursor);
  g.font = '400 16px system-ui, sans-serif';
  g.fillStyle = MUTED;
  g.textAlign = 'right';
  g.fillText(`${sheet.rows.length} member(s)`, width - margin, cursor);
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

  // Footer.
  g.fillStyle = MUTED;
  g.font = '12px system-ui, sans-serif';
  g.fillText(sheet.footer, margin, height - 24);
  return canvas;
};

export const downloadGroupSheetPng = (sheet: GroupSheet): void => {
  const canvas = renderGroupSheetCanvas(sheet);
  canvas.toBlob((blob) => { if (blob) download(blob, `${safeName(sheet.groupName)}-members.png`); }, 'image/png');
};

// ---------------------------------------------------------------------------
// PDF — genuine multi-page A4 document
// ---------------------------------------------------------------------------
const PDF_W = 595; const PDF_H = 842; const PDF_MARGIN = 42;
const pdfEscape = (value: string) => String(value ?? '')
  .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
const pdfClip = (value: string, maxChars: number) => {
  const text = String(value ?? '');
  return text.length > maxChars ? `${text.slice(0, Math.max(3, maxChars - 1))}…` : text;
};

export const buildGroupSheetPdf = (sheet: GroupSheet): Uint8Array => {
  const usable = PDF_W - PDF_MARGIN * 2;
  const colWidth = usable / Math.max(1, sheet.columns.length);
  const colChars = Math.floor(colWidth / 4.8);
  const showTopic = sheet.includeTopic !== false && Boolean(sheet.topic);
  const topicLines = showTopic ? wrap(sheet.topic || '', 92) : [];
  const aobLines = sheet.aob ? wrap(sheet.aob, 92) : [];
  const tableRows = buildRenderRows(sheet);

  type Op = string;
  const pages: Op[][] = [];
  let ops: Op[] = [];
  let cursor = PDF_H - PDF_MARGIN;
  const text = (x: number, y: number, size: number, bold: boolean, value: string, gray = 0) =>
    ops.push(`BT /F${bold ? 2 : 1} ${size} Tf ${gray} g ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  const newPage = (continuation = false) => {
    pages.push(ops);
    ops = [];
    cursor = PDF_H - PDF_MARGIN;
    if (continuation) {
      text(PDF_MARGIN, cursor - 8, 9, false, `${sheet.groupName} — member sheet (continued)`, 0.45);
      cursor -= 26;
    }
  };

  // Page 1 header.
  ops.push(`0.016 0.471 0.341 rg ${PDF_MARGIN} ${cursor - 54} ${usable} 58 re f`);
  text(PDF_MARGIN + 12, cursor - 20, 13, true, 'CODE Rx SOCIETY — Class & Group Management', 1);
  text(PDF_MARGIN + 12, cursor - 38, 9, false, `${pdfClip(`${sheet.className}  ·  ${sheet.activityName}`, 90)}   (${sheet.dateLabel})`, 1);
  cursor -= 76;
  text(PDF_MARGIN, cursor, 17, true, pdfClip(sheet.groupName, 44));
  const countLabel = `${sheet.rows.length} member(s)`;
  text(PDF_W - PDF_MARGIN - countLabel.length * 4.6, cursor, 10, false, countLabel, 0.35);
  cursor -= 8;

  const block = (heading: string, body: string[], fill: string, headingColor: number) => {
    if (!body.length) return;
    const height = 34 + body.length * 14 + 8;
    if (cursor - height < PDF_MARGIN + 40) newPage();
    ops.push(`${fill} rg ${PDF_MARGIN} ${cursor - height} ${usable} ${height} re f`);
    text(PDF_MARGIN + 10, cursor - 16, 8.5, true, heading, headingColor);
    body.forEach((line, index) => text(PDF_MARGIN + 10, cursor - 32 - index * 14, 9.5, false, line));
    cursor -= height + 14;
  };
  block('GROUP TOPIC', topicLines, '1 0.972 0.921', 0.09);

  // Table with page breaks + repeated header.
  const drawTableHead = () => {
    ops.push(`0.016 0.471 0.341 rg ${PDF_MARGIN} ${cursor - 20} ${usable} 20 re f`);
    sheet.columns.forEach((column, index) => text(PDF_MARGIN + index * colWidth + 5, cursor - 14, 8.5, true, pdfClip(column, colChars), 1));
    cursor -= 20;
  };
  if (cursor - 40 < PDF_MARGIN) newPage();
  drawTableHead();
  tableRows.forEach((row, rowIndex) => {
    if (cursor - 18 < PDF_MARGIN + 30) { newPage(true); drawTableHead(); }
    if (rowIndex % 2 === 0) ops.push(`0.972 0.980 0.988 rg ${PDF_MARGIN} ${cursor - 18} ${usable} 18 re f`);
    if (row.blank) {
      // Ruled write-in line per cell, so handwriting stays inside its column.
      sheet.columns.forEach((_, index) => ops.push(`0.62 0.66 0.72 rg ${PDF_MARGIN + index * colWidth + 5} ${cursor - 4} ${colWidth - 10} 0.7 re f`));
    } else {
      row.cells.forEach((cell, index) => text(PDF_MARGIN + index * colWidth + 5, cursor - 13, 9, false, pdfClip(cell, colChars)));
    }
    cursor -= 18;
  });

  block('AOB / OTHER BUSINESS', aobLines, '0.925 0.992 0.960', 0.2);

  if (cursor - 20 < PDF_MARGIN) newPage();
  text(PDF_MARGIN, cursor - 6, 7.5, false, pdfClip(sheet.footer, 130), 0.5);
  pages.push(ops);

  // Assemble the PDF file.
  const objects: string[] = [];
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  const fontRegularId = 1; const fontBoldId = 2;
  let nextId = 3;
  for (const pageOps of pages) {
    const contentId = nextId++; const pageId = nextId++;
    contentIds.push(contentId); pageIds.push(pageId);
    objects[contentId] = `<< /Length ${pageOps.join('\n').length} >>\nstream\n${pageOps.join('\n')}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent PAGES /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`;
  }
  const pagesId = nextId++;
  objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[fontRegularId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[fontBoldId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  const catalogId = nextId++;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < nextId; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id += 1) pdf += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(pdf);
};

export const downloadGroupSheetPdf = (sheet: GroupSheet): void => {
  const bytes = buildGroupSheetPdf(sheet);
  download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeName(sheet.groupName)}-members.pdf`);
};

// ---------------------------------------------------------------------------
// Print — the same document through a hidden iframe
// ---------------------------------------------------------------------------
export const printGroupSheet = (sheet: GroupSheet): void => {
  const showTopic = sheet.includeTopic !== false && Boolean(sheet.topic);
  const aobRows = sheet.aob ? wrap(sheet.aob, 110) : [];
  const tableRows = buildRenderRows(sheet);
  const escapeHtml = (value: string) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sheet.groupName)} — member sheet</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: system-ui, sans-serif; color: #0f172a; margin: 0; }
  .band { background: ${EMERALD}; color: #fff; padding: 14px 18px; }
  .band h1 { font-size: 15px; margin: 0 0 4px; }
  .band p { font-size: 11px; margin: 0; opacity: .9; }
  h2 { font-size: 22px; margin: 16px 0 2px; }
  .topic { color: ${EMERALD}; font-weight: 700; font-size: 12px; }
  .count { color: ${MUTED}; font-size: 11px; }
  .block { background: ${AMBER_SOFT}; border-radius: 8px; padding: 10px 14px; margin: 12px 0; }
  .block.green { background: ${EMERALD_SOFT}; }
  .block h3 { margin: 0 0 6px; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #92400e; }
  .block.green h3 { color: ${EMERALD}; }
  .block p { margin: 0; font-size: 12px; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
  th { background: ${EMERALD}; color: #fff; text-align: left; padding: 6px 8px; }
  td { border-bottom: 1px solid ${LINE}; padding: 6px 8px; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr.blank td { height: 22px; }
  tr.blank td.fill { background: linear-gradient(#ffffff, #ffffff) bottom / 100% 1px no-repeat; }
  footer { color: ${MUTED}; font-size: 9px; margin-top: 18px; }
</style></head><body>
<div class="band"><h1>CODE Rx SOCIETY — Class &amp; Group Management</h1><p>${escapeHtml(sheet.className)} · ${escapeHtml(sheet.activityName)} · ${escapeHtml(sheet.dateLabel)}</p></div>
<h2>${escapeHtml(sheet.groupName)}</h2>
<p class="count">${sheet.rows.length} member(s)</p>
${showTopic ? `<div class="block"><h3>Group topic</h3><p>${escapeHtml(sheet.topic)}</p></div>` : ''}
<table><thead><tr>${sheet.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
<tbody>${tableRows.map((row) => row.blank
  ? `<tr class="blank">${sheet.columns.map(() => `<td class="fill"></td>`).join('')}</tr>`
  : `<tr>${row.cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
${aobRows.length ? `<div class="block green"><h3>AOB / Other business</h3><p>${escapeHtml(sheet.aob)}</p></div>` : ''}
<footer>${escapeHtml(sheet.footer)}</footer>
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

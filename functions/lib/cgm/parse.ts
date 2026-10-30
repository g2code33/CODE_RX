/**
 * CODE Rx SOCIETY — roster file parsing (CSV / JSON / XLSX).
 *
 * One import pipeline feeds all three formats: everything becomes a list of
 * row objects, then the same column mapping, validation and duplicate rules
 * run. XLSX parsing uses the `xlsx` package; CSV and JSON are parsed directly.
 */

const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ['full name', 'name', 'student name', 'fullname'],
  index_number: ['index number', 'index', 'indexno', 'index no'],
  university_id: ['university id', 'university student id', 'student id', 'universityid'],
  phone: ['phone', 'telephone', 'phone number', 'telephone number', 'mobile'],
  gender: ['gender', 'sex'],
  email: ['email', 'email address', 'e-mail'],
};

export const ROSTER_FIELDS = ['full_name', 'index_number', 'university_id', 'phone', 'gender', 'email'] as const;
export type RosterField = (typeof ROSTER_FIELDS)[number];

const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/** Suggests a mapping from header names. Ambiguous headers stay unmapped. */
export const suggestMapping = (headers: string[]): Partial<Record<RosterField, string>> => {
  const mapping: Partial<Record<RosterField, string>> = {};
  for (const field of ROSTER_FIELDS) {
    const aliases = HEADER_ALIASES[field] || [];
    const hit = headers.find((header) => aliases.includes(normalizeHeader(header)));
    if (hit) mapping[field] = hit;
  }
  return mapping;
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC-4180-flavoured CSV splitting: quoted cells, doubled quotes, CRLF. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i += 1; }
        else inQuotes = false;
      } else cell += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell); cell = '';
    } else if (char === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (char === '\r') {
      // skip; \n handles the row break
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((entry) => entry.some((value) => String(value).trim() !== ''));
};

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export const parseJsonRows = (text: string): Record<string, unknown>[] => {
  const parsed = JSON.parse(String(text || ''));
  if (Array.isArray(parsed)) return parsed.filter((entry) => entry && typeof entry === 'object');
  throw new Error('The JSON file must contain an array of student objects.');
};

// ---------------------------------------------------------------------------
// XLSX (via the xlsx package)
// ---------------------------------------------------------------------------

export const parseXlsxRows = async (bytes: ArrayBuffer): Promise<Record<string, unknown>[]> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook has no sheets.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
  return rows;
};

export interface NormalizedRow {
  values: Partial<Record<RosterField, string>>;
  custom: Record<string, string>;
}

/** Applies an explicit mapping to a raw row object and normalizes values. */
export const applyMapping = (
  row: Record<string, unknown>,
  mapping: Partial<Record<RosterField, string>>,
  knownHeaders: string[],
  knownCustomKeys: string[],
): NormalizedRow => {
  const values: Partial<Record<RosterField, string>> = {};
  for (const field of ROSTER_FIELDS) {
    const column = mapping[field];
    if (!column) continue;
    const raw = row[column];
    const text = raw === undefined || raw === null ? '' : String(raw).trim();
    if (text) values[field] = text.slice(0, 200);
  }
  const custom: Record<string, string> = {};
  for (const header of knownHeaders) {
    if (Object.values(mapping).includes(header)) continue;
    const key = normalizeHeader(header).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!key || !knownCustomKeys.includes(key)) continue;
    const text = row[header] === undefined || row[header] === null ? '' : String(row[header]).trim();
    if (text) custom[key] = text.slice(0, 200);
  }
  return { values, custom };
};

export const normalizeGender = (value: unknown): 'male' | 'female' | 'unknown' => {
  const text = String(value ?? '').trim().toLowerCase();
  if (['m', 'male', 'man', 'boy'].includes(text)) return 'male';
  if (['f', 'female', 'woman', 'girl'].includes(text)) return 'female';
  return 'unknown';
};

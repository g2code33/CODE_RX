import { audit, type Actor } from './vault';

export const DOCUMENT_BLOCK_TYPES = [
  'paragraph', 'heading', 'bulletList', 'numberedList', 'checklist', 'quote', 'callout',
  'code', 'divider', 'table', 'image', 'file', 'formula', 'embed',
] as const;

export type DocumentBlockType = typeof DOCUMENT_BLOCK_TYPES[number];

export interface VaultDocumentBlock {
  id: string;
  type: DocumentBlockType;
  content?: string;
  level?: number;
  items?: Array<{ id?: string; text: string; checked?: boolean }>;
  language?: string;
  rows?: string[][];
  variant?: string;
  fileKey?: string;
  attachmentId?: number;
  url?: string;
  caption?: string;
}

export interface NormalizedDocumentContent {
  blocks: VaultDocumentBlock[];
  contentJson: string;
  plainText: string;
  wordCount: number;
}

const ALLOWED_LANGUAGES = new Set([
  'plaintext', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp',
  'html', 'css', 'sql', 'bash', 'json', 'yaml', 'markdown', 'php', 'go', 'rust', 'r',
]);

const newBlockId = () => crypto.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const clampString = (value: unknown, limit: number) => typeof value === 'string' ? value.slice(0, limit) : '';

const RICH_TEXT_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'mark', 'a', 'code', 'br', 'span']);

const decodeHtmlEntities = (value: string) => value
  .replace(/&#(x[0-9a-f]+|\d+);?/gi, (_match, entity: string) => {
    const codePoint = entity.toLowerCase().startsWith('x') ? parseInt(entity.slice(1), 16) : parseInt(entity, 10);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
  })
  .replace(/&(amp|quot|apos|lt|gt|colon|tab|newline|nbsp);?/gi, (_match, entity: string) => ({
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', tab: '\t', newline: '\n', nbsp: ' ',
  }[entity.toLowerCase()] || ''));

const escapeHtmlAttribute = (value: string) => value
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const attributeValue = (attributes: string, name: string) => {
  const expression = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`, 'i');
  const match = attributes.match(expression);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
};

const safeLinkHref = (value: string) => {
  const href = decodeHtmlEntities(value).trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  return /^(?:https?:\/\/|mailto:|#|\/(?!\/))/i.test(href) ? href : '';
};

const safeSpanStyle = (attributes: string) => {
  const style = decodeHtmlEntities(attributeValue(attributes, 'style')).trim().replace(/\s+/g, ' ');
  // Preserve the editor's own highlight command without allowing arbitrary CSS.
  return /^background-color:\s*(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|0?\.\d+|1))?\s*\)|[a-z]{3,20})\s*;?$/i.test(style)
    ? style
    : '';
};

/**
 * Rich text is reconstructed from a very small allow-list rather than merely
 * stripping suspicious fragments. Attributes are dropped by default; anchors
 * retain only a safe URL and spans retain only the editor's highlight color.
 * This protects both stored documents and the contentEditable rendering path.
 */
export const sanitizeRichText = (value: unknown) => {
  let html = clampString(value, 30_000).replace(/\u0000/g, '');
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  return html.replace(/<\s*(\/?)([a-z0-9:-]+)([^>]*)>/gi, (full, slash: string, rawTag: string, attributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!RICH_TEXT_TAGS.has(tag)) return '';
    if (slash) return tag === 'br' ? '' : `</${tag}>`;
    if (tag === 'a') {
      const href = safeLinkHref(attributeValue(attributes, 'href'));
      return href ? `<a href="${escapeHtmlAttribute(href)}" rel="noopener noreferrer">` : '<a>';
    }
    if (tag === 'span') {
      const style = safeSpanStyle(attributes);
      return style ? `<span style="${escapeHtmlAttribute(style)}">` : '<span>';
    }
    return `<${tag}>`;
  });
};

const visibleText = (value: string) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeItems = (value: unknown, checklist = false) => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((item) => {
    if (typeof item === 'string') return { id: newBlockId(), text: sanitizeRichText(item), ...(checklist ? { checked: false } : {}) };
    const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      id: clampString(raw.id, 100) || newBlockId(),
      text: sanitizeRichText(raw.text),
      ...(checklist ? { checked: Boolean(raw.checked) } : {}),
    };
  }).filter((item) => item.text || checklist);
};

const normalizeRows = (value: unknown) => {
  if (!Array.isArray(value)) return [['', ''], ['', '']];
  return value.slice(0, 50).map((row) => Array.isArray(row)
    ? row.slice(0, 20).map((cell) => sanitizeRichText(cell))
    : ['']
  );
};

const cleanUrl = (value: unknown) => {
  const url = clampString(value, 1_000).trim();
  return /^(https?:\/\/|\/api\/vault-files\/)/i.test(url) ? url : '';
};

const normalizeBlock = (raw: unknown): VaultDocumentBlock | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const type = DOCUMENT_BLOCK_TYPES.includes(input.type as DocumentBlockType) ? input.type as DocumentBlockType : 'paragraph';
  const block: VaultDocumentBlock = { id: clampString(input.id, 100) || newBlockId(), type };

  if (type === 'divider') return block;
  if (type === 'heading') {
    block.level = [1, 2, 3].includes(Number(input.level)) ? Number(input.level) : 2;
    block.content = sanitizeRichText(input.content);
    return block;
  }
  if (type === 'bulletList' || type === 'numberedList' || type === 'checklist') {
    block.items = normalizeItems(input.items, type === 'checklist');
    return block;
  }
  if (type === 'code') {
    const language = clampString(input.language, 30).toLowerCase();
    block.language = ALLOWED_LANGUAGES.has(language) ? language : 'plaintext';
    block.content = clampString(input.content, 100_000);
    return block;
  }
  if (type === 'table') {
    block.rows = normalizeRows(input.rows);
    return block;
  }
  if (type === 'callout') {
    const variants = new Set(['idea', 'warning', 'security', 'pharmacy', 'code', 'research', 'important', 'project']);
    block.variant = variants.has(clampString(input.variant, 30).toLowerCase()) ? clampString(input.variant, 30).toLowerCase() : 'important';
    block.content = sanitizeRichText(input.content);
    return block;
  }
  if (type === 'image' || type === 'file' || type === 'embed') {
    block.url = cleanUrl(input.url);
    block.fileKey = clampString(input.fileKey, 700);
    block.attachmentId = Number.isInteger(Number(input.attachmentId)) ? Number(input.attachmentId) : undefined;
    block.caption = sanitizeRichText(input.caption);
    block.content = sanitizeRichText(input.content);
    return block;
  }
  if (type === 'formula') {
    block.content = clampString(input.content, 20_000);
    return block;
  }
  block.content = sanitizeRichText(input.content);
  return block;
};

export const normalizeDocumentContent = (input: unknown, fallbackPlainText = ''): NormalizedDocumentContent => {
  let candidate: unknown = input;
  if (typeof input === 'string') {
    try { candidate = JSON.parse(input); } catch { candidate = null; }
  }
  const rawBlocks = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>).blocks
    : null;
  let blocks = Array.isArray(rawBlocks) ? rawBlocks.slice(0, 500).map(normalizeBlock).filter(Boolean) as VaultDocumentBlock[] : [];
  if (!blocks.length) blocks = [{ id: newBlockId(), type: 'paragraph', content: sanitizeRichText(fallbackPlainText) }];

  const plainText = blocks.map((block) => {
    if (block.type === 'code' || block.type === 'formula') return block.content || '';
    if (block.items) return block.items.map((item) => visibleText(item.text)).join(' ');
    if (block.rows) return block.rows.flat().map(visibleText).join(' ');
    return visibleText(block.content || block.caption || '');
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  return { blocks, contentJson: JSON.stringify({ version: 1, blocks }), plainText, wordCount };
};

export const parseStoredDocumentContent = (contentJson: unknown, plainText = '') => normalizeDocumentContent(contentJson, plainText);

export const attachmentIdsFromBlocks = (blocks: VaultDocumentBlock[]) => blocks
  .map((block) => block.attachmentId)
  .filter((id): id is number => Number.isInteger(id) && id > 0);

export const normalizeTags = (input: unknown) => {
  let raw: unknown[] = [];
  if (Array.isArray(input)) raw = input;
  else if (typeof input === 'string') {
    try { const parsed = JSON.parse(input); raw = Array.isArray(parsed) ? parsed : input.split(','); }
    catch { raw = input.split(','); }
  }
  const tags = raw.map((tag) => clampString(tag, 50).trim().replace(/^#/, '').toLowerCase())
    .map((tag) => tag.replace(/[^a-z0-9_-]/g, ''))
    .filter(Boolean);
  return Array.from(new Set(tags)).slice(0, 20);
};

export const syncDocumentTags = async (db: D1Database, documentId: number, tags: string[]) => {
  await db.prepare('DELETE FROM vault_document_tags WHERE document_id = ?').bind(documentId).run();
  for (const tag of tags) {
    await db.prepare('INSERT OR IGNORE INTO vault_tags (normalized_name, display_name) VALUES (?, ?)').bind(tag, tag).run();
    const rows = await db.prepare('SELECT id FROM vault_tags WHERE normalized_name = ?').bind(tag).all<{ id: number }>();
    const tagId = rows.results?.[0]?.id;
    if (tagId) await db.prepare('INSERT OR IGNORE INTO vault_document_tags (document_id, tag_id) VALUES (?, ?)').bind(documentId, tagId).run();
  }
};

export const recordVaultActivity = async (
  db: D1Database,
  actor: Actor | null,
  action: string,
  sectionId: number | null,
  documentId: number | null,
  details: Record<string, unknown> = {},
) => {
  try {
    await db.prepare(
      'INSERT INTO vault_activity (actor_member_profile_id, action, section_id, document_id, details_json) VALUES (?, ?, ?, ?, ?)'
    ).bind(actor?.profileId ?? null, action.slice(0, 120), sectionId, documentId, JSON.stringify(details).slice(0, 20_000)).run();
    await audit(db, actor, `vault.${action}`, documentId ? 'vault_document' : 'vault', documentId, details);
  } catch (error) {
    console.error('[code-rx] vault activity error:', error);
  }
};

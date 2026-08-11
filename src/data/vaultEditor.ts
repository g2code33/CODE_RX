export type VaultBlockType =
  | 'paragraph' | 'heading' | 'bulletList' | 'numberedList' | 'checklist' | 'quote'
  | 'callout' | 'code' | 'divider' | 'table' | 'image' | 'file' | 'formula' | 'embed';

export interface VaultBlock {
  id: string;
  type: VaultBlockType;
  content?: string;
  level?: number;
  items?: Array<{ id: string; text: string; checked?: boolean }>;
  language?: string;
  rows?: string[][];
  variant?: 'idea' | 'warning' | 'security' | 'pharmacy' | 'code' | 'research' | 'important' | 'project';
  fileKey?: string;
  attachmentId?: number;
  url?: string;
  caption?: string;
}

export interface VaultDocumentContent {
  version: 1;
  blocks: VaultBlock[];
}

export interface VaultDocumentDraft {
  title: string;
  blocks: VaultBlock[];
  tags: string[];
  status: 'draft' | 'in_review' | 'approved' | 'active';
  visibility: 'section' | 'members' | 'restricted';
  relatedProjectId: number | null;
}

export const newId = () => globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const newBlock = (type: VaultBlockType = 'paragraph'): VaultBlock => {
  const id = newId();
  if (type === 'heading') return { id, type, level: 2, content: '' };
  if (type === 'bulletList' || type === 'numberedList' || type === 'checklist') return { id, type, items: [{ id: newId(), text: '', checked: false }] };
  if (type === 'code') return { id, type, language: 'typescript', content: '' };
  if (type === 'table') return { id, type, rows: [['Header', 'Header'], ['', '']] };
  if (type === 'callout') return { id, type, variant: 'important', content: '' };
  if (type === 'divider') return { id, type };
  if (type === 'image' || type === 'file' || type === 'embed') return { id, type, url: '', caption: '' };
  return { id, type, content: '' };
};

const RICH_TEXT_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'mark', 'a', 'code', 'br', 'span']);
const VALID_BLOCK_TYPES = new Set<VaultBlockType>([
  'paragraph', 'heading', 'bulletList', 'numberedList', 'checklist', 'quote', 'callout',
  'code', 'divider', 'table', 'image', 'file', 'formula', 'embed',
]);

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

const safeRichLink = (value: string) => {
  const href = Array.from(decodeHtmlEntities(value).trim())
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x20 && (code < 0x7f || code > 0x9f);
    })
    .join('');
  return /^(?:https?:\/\/|mailto:|#|\/(?!\/))/i.test(href) ? href : '';
};

const safeSpanStyle = (attributes: string) => {
  const style = decodeHtmlEntities(attributeValue(attributes, 'style')).trim().replace(/\s+/g, ' ');
  return /^background-color:\s*(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|0?\.\d+|1))?\s*\)|[a-z]{3,20})\s*;?$/i.test(style)
    ? style
    : '';
};

/** Mirrors the Worker-side allow-list before any stored or local draft HTML is rendered. */
export const sanitizeVaultRichText = (value: unknown) => {
  let html = typeof value === 'string' ? value.slice(0, 30_000).replace(/\0/g, '') : '';
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  return html.replace(/<\s*(\/?)([a-z0-9:-]+)([^>]*)>/gi, (_full, slash: string, rawTag: string, attributes: string) => {
    const tag = rawTag.toLowerCase();
    if (!RICH_TEXT_TAGS.has(tag)) return '';
    if (slash) return tag === 'br' ? '' : `</${tag}>`;
    if (tag === 'a') {
      const href = safeRichLink(attributeValue(attributes, 'href'));
      return href ? `<a href="${escapeHtmlAttribute(href)}" rel="noopener noreferrer">` : '<a>';
    }
    if (tag === 'span') {
      const style = safeSpanStyle(attributes);
      return style ? `<span style="${escapeHtmlAttribute(style)}">` : '<span>';
    }
    return `<${tag}>`;
  });
};

export const safeVaultResourceUrl = (value: unknown) => {
  const url = typeof value === 'string' ? value.trim().slice(0, 1_000) : '';
  return /^(?:https?:\/\/|\/api\/vault-files\/)/i.test(url) ? url : '';
};

const normalizeClientBlock = (value: any): VaultBlock => {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const type = VALID_BLOCK_TYPES.has(raw.type as VaultBlockType) ? raw.type as VaultBlockType : 'paragraph';
  const block = { ...newBlock(type), ...raw, id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 100) : newId(), type } as VaultBlock;
  if (type !== 'divider') {
    block.content = type === 'code' || type === 'formula'
      ? (typeof raw.content === 'string' ? raw.content.slice(0, 100_000) : '')
      : sanitizeVaultRichText(raw.content);
  }
  if (typeof raw.caption === 'string') block.caption = sanitizeVaultRichText(raw.caption);
  if (type === 'image' || type === 'file' || type === 'embed') block.url = safeVaultResourceUrl(raw.url);
  if (Array.isArray(raw.items)) block.items = raw.items.slice(0, 200).map((item: any) => ({
    id: typeof item?.id === 'string' && item.id ? item.id.slice(0, 100) : newId(),
    text: sanitizeVaultRichText(item?.text),
    ...(type === 'checklist' ? { checked: Boolean(item?.checked) } : {}),
  }));
  if (Array.isArray(raw.rows)) block.rows = raw.rows.slice(0, 50).map((row: unknown) => Array.isArray(row)
    ? row.slice(0, 20).map((cell) => sanitizeVaultRichText(cell))
    : ['']
  );
  return block;
};

export const emptyDocument = (): VaultDocumentDraft => ({
  title: '',
  blocks: [newBlock('paragraph')],
  tags: [],
  status: 'draft',
  visibility: 'section',
  relatedProjectId: null,
});

export const parseDocumentContent = (value: unknown, fallback = ''): VaultBlock[] => {
  try {
    const candidate = typeof value === 'string' ? JSON.parse(value) : value;
    const blocks = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? (candidate as { blocks?: unknown }).blocks
      : null;
    if (Array.isArray(blocks) && blocks.length) return blocks.slice(0, 500).map(normalizeClientBlock);
  } catch { /* legacy plain text fallback */ }
  return [{ id: newId(), type: 'paragraph', content: sanitizeVaultRichText(fallback) }];
};

export const plainTextFromBlocks = (blocks: VaultBlock[]) => blocks.map((block) => {
  if (block.items) return block.items.map((item) => item.text.replace(/<[^>]+>/g, ' ')).join(' ');
  if (block.rows) return block.rows.flat().join(' ');
  return (block.content || block.caption || '').replace(/<[^>]+>/g, ' ');
}).join('\n').replace(/\s+/g, ' ').trim();

export const wordCount = (blocks: VaultBlock[]) => plainTextFromBlocks(blocks).split(/\s+/).filter(Boolean).length;

export const templateCatalog: Array<{ id: string; title: string; description: string; blocks: () => VaultBlock[] }> = [
  { id: 'blank', title: 'Blank document', description: 'Start with an empty writing canvas.', blocks: () => [newBlock('paragraph')] },
  { id: 'society', title: 'Society document', description: 'Governance, charter, decision, or institutional record.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Purpose' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Context' }, newBlock('paragraph'),
    { ...newBlock('callout'), variant: 'important', content: 'Key society decision or institutional note.' },
  ] },
  { id: 'project', title: 'Project documentation', description: 'Technical and operational project workspace.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Overview' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Architecture' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Tasks and timeline' }, { ...newBlock('checklist'), items: [{ id: newId(), text: 'Define next milestone', checked: false }] },
    { ...newBlock('code'), language: 'typescript', content: '// Project example\nexport const codeRx = true;' },
  ] },
  { id: 'readme', title: 'Project README', description: 'A practical README structure for a Code Rx repository.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Project name' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Getting started' }, { ...newBlock('code'), language: 'bash', content: 'npm install\nnpm run dev' },
    { ...newBlock('heading'), level: 2, content: 'Contributing' }, newBlock('paragraph'),
  ] },
  { id: 'meeting', title: 'Meeting minutes', description: 'Agenda, attendance, decisions, and next actions.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Meeting details' }, { ...newBlock('table'), rows: [['Date', 'Attendees'], ['', '']] },
    { ...newBlock('heading'), level: 2, content: 'Agenda' }, newBlock('bulletList'),
    { ...newBlock('heading'), level: 2, content: 'Decisions' }, newBlock('numberedList'),
    { ...newBlock('heading'), level: 2, content: 'Action items' }, newBlock('checklist'),
  ] },
  { id: 'research', title: 'Research note', description: 'Evidence, hypothesis, methods, and references.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Research question' }, newBlock('paragraph'),
    { ...newBlock('callout'), variant: 'research', content: 'Evidence, ethical consideration, or research limitation.' },
    { ...newBlock('heading'), level: 2, content: 'Findings' }, newBlock('paragraph'),
  ] },
  { id: 'pharmacy', title: 'Pharmacy / healthcare note', description: 'Clinical, safety, workflow, or digital-health documentation.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Clinical or pharmacy context' }, newBlock('paragraph'),
    { ...newBlock('callout'), variant: 'pharmacy', content: 'Patient safety, validation, or professional consideration.' },
    { ...newBlock('heading'), level: 2, content: 'Technology implications' }, newBlock('paragraph'),
  ] },
  { id: 'sop', title: 'SOP', description: 'Repeatable, approved operational procedure.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Purpose and scope' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Procedure' }, newBlock('numberedList'),
    { ...newBlock('callout'), variant: 'security', content: 'Security or compliance requirement.' },
  ] },
  { id: 'idea', title: 'Idea / proposal', description: 'Capture an innovation idea before it is lost.', blocks: () => [
    { ...newBlock('callout'), variant: 'idea', content: 'Core idea' },
    { ...newBlock('heading'), level: 2, content: 'Problem' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Proposed solution' }, newBlock('paragraph'),
  ] },
  { id: 'api', title: 'API documentation', description: 'Endpoints, inputs, responses, and security.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'API overview' }, newBlock('paragraph'),
    { ...newBlock('code'), language: 'json', content: '{\n  "success": true\n}' },
    { ...newBlock('callout'), variant: 'security', content: 'Document authorization and never include credentials.' },
  ] },
  { id: 'technical', title: 'Technical documentation', description: 'System design, setup, operations, and troubleshooting.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Technical overview' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Setup' }, { ...newBlock('code'), language: 'bash', content: '# Setup commands' },
    { ...newBlock('heading'), level: 2, content: 'Troubleshooting' }, newBlock('bulletList'),
  ] },
  { id: 'event', title: 'Event documentation', description: 'Plan, delivery record, outcomes, and follow-up.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Event overview' }, { ...newBlock('table'), rows: [['Date', 'Location'], ['', '']] },
    { ...newBlock('heading'), level: 2, content: 'Outcomes and follow-up' }, newBlock('checklist'),
  ] },
  { id: 'coding-guide', title: 'Coding guide', description: 'Standards, conventions, examples, and developer workflow.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Coding standards' }, newBlock('paragraph'),
    { ...newBlock('code'), language: 'typescript', content: '// Preferred Code Rx pattern' },
    { ...newBlock('callout'), variant: 'code', content: 'Explain the reasoning behind a convention, not only the rule.' },
  ] },
  { id: 'architecture', title: 'Project architecture', description: 'System boundaries, data flow, deployment, and security.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Architecture overview' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Components and data flow' }, newBlock('table'),
    { ...newBlock('callout'), variant: 'security', content: 'Record trust boundaries, authorization, and data protection decisions.' },
  ] },
  { id: 'member', title: 'Member documentation', description: 'Responsibility handover, onboarding, and internal guidance.', blocks: () => [
    { ...newBlock('heading'), level: 1, content: 'Responsibility overview' }, newBlock('paragraph'),
    { ...newBlock('heading'), level: 2, content: 'Key resources and handover' }, newBlock('checklist'),
  ] },
];

export const slashCommands: Array<{ id: string; label: string; hint: string; type: VaultBlockType; language?: string }> = [
  { id: 'text', label: '/text', hint: 'Paragraph', type: 'paragraph' },
  { id: 'heading', label: '/heading', hint: 'Section heading', type: 'heading' },
  { id: 'code', label: '/code', hint: 'Syntax-highlighted code block', type: 'code', language: 'typescript' },
  { id: 'table', label: '/table', hint: 'Table', type: 'table' },
  { id: 'checklist', label: '/checklist', hint: 'Action list', type: 'checklist' },
  { id: 'quote', label: '/quote', hint: 'Quote', type: 'quote' },
  { id: 'callout', label: '/callout', hint: 'Code Rx callout', type: 'callout' },
  { id: 'image', label: '/image', hint: 'Upload or attach image', type: 'image' },
  { id: 'file', label: '/file', hint: 'Attach a file', type: 'file' },
  { id: 'link', label: '/link', hint: 'External or document link', type: 'embed' },
  { id: 'github', label: '/github', hint: 'GitHub repository link', type: 'embed' },
  { id: 'meeting', label: '/meeting', hint: 'Meeting record block', type: 'embed' },
  { id: 'project', label: '/project', hint: 'Project link block', type: 'embed' },
  { id: 'document', label: '/document', hint: 'Linked Vault document', type: 'embed' },
  { id: 'divider', label: '/divider', hint: 'Divider', type: 'divider' },
];

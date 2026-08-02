import { SiteContent, normalizeSiteContent } from '../data/siteState';

export type TextSource = 'content' | 'copy' | 'link';

export interface TextValue {
  value: string;
  source: TextSource;
  isNumber: boolean;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const lookup = (value: unknown, path: string[]) => {
  let cursor: any = value;
  for (const part of path) {
    if (cursor === null || cursor === undefined || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
};

const assign = (root: any, path: string[], value: unknown) => {
  let cursor = root;
  path.forEach((part, index) => {
    if (index === path.length - 1) {
      cursor[part] = value;
      return;
    }
    const nextPart = path[index + 1];
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = /^\d+$/.test(nextPart) ? [] : {};
    cursor = cursor[part];
  });
};

/**
 * A selection can point to structured content (e.g. `projects.0.title`) or to
 * a legacy/static copy key (e.g. `projects.title`). Existing structured paths
 * always win, so content fields and static copy can share understandable names.
 */
export const readEditableText = (content: SiteContent, path: string): TextValue => {
  if (path.startsWith('links.')) {
    const key = path.slice('links.'.length);
    return { value: String(content.links[key] ?? ''), source: 'link', isNumber: false };
  }
  if (path.startsWith('copy.')) {
    const key = path.slice('copy.'.length);
    return { value: String(content.copy[key] ?? ''), source: 'copy', isNumber: false };
  }
  const actual = lookup(content, path.split('.'));
  if (typeof actual === 'string' || typeof actual === 'number') {
    return { value: String(actual), source: 'content', isNumber: typeof actual === 'number' };
  }
  return { value: String(content.copy[path] ?? ''), source: 'copy', isNumber: false };
};

export const writeEditableText = (content: SiteContent, path: string, value: string): SiteContent => {
  const next = clone(content);
  const prior = readEditableText(content, path);
  if (prior.source === 'link') {
    next.links[path.slice('links.'.length)] = value;
  } else if (prior.source === 'copy') {
    const key = path.startsWith('copy.') ? path.slice('copy.'.length) : path;
    next.copy[key] = value;
  } else {
    assign(next, path.split('.'), prior.isNumber ? Number(value) || 0 : value);
  }
  return normalizeSiteContent(next);
};

export const updateMediaAsset = (content: SiteContent, key: string, patch: { src?: string; alt?: string }): SiteContent => {
  const next = clone(content);
  const current = next.media[key] || { src: '', alt: '' };
  next.media[key] = { ...current, ...patch };
  return normalizeSiteContent(next);
};

export const cloneContent = (content: SiteContent) => normalizeSiteContent(clone(content));

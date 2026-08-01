// Cloudflare Pages Functions - Input validation helpers

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length <= 254 && EMAIL_RE.test(v.trim());

/** Returns trimmed string if it's a string of the right length, else null. */
export const cleanStr = (v: unknown, min = 1, max = 500): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length < min || t.length > max) return null;
  return t;
};

export const cleanEmail = (v: unknown): string | null => {
  if (!isEmail(v)) return null;
  return v.trim().toLowerCase();
};

export const cleanOptionalStr = (v: unknown, max = 500): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length === 0) return null;
  if (t.length > max) return null;
  return t;
};

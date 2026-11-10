/**
 * CODE Rx SOCIETY — Sampling team credentials.
 *
 * A team link is a bearer credential: whoever holds it plays as that team. The
 * database therefore stores two things and never a usable plaintext token:
 *
 *   token_hash  SHA-256 lookup hash. Every request hashes the presented token
 *               and looks it up — a database leak cannot be replayed.
 *   token_enc   the token itself, sealed with AES-256-GCM under its own
 *               domain-separated associated data, so the organizer can still
 *               copy a link days later. Tampering fails closed.
 *
 * Key material, in order of preference:
 *   1. `CGM_INVITATION_KEYS` — the same versioned key ring the Class & Group
 *      module already uses (no new secret to provision).
 *   2. HKDF-SHA256 over `JWT_SECRET` — always present in a deployed Worker, so
 *      link re-display keeps working without extra setup. Rotating JWT_SECRET
 *      only invalidates the *display* of existing links (the hashes keep every
 *      team playing); the organizer can regenerate a link at any time.
 *
 * Tokens are 32 random bytes, URL-safe, prefixed `spl_` so a stray token in a
 * log is recognisable. 256 bits of entropy is far beyond guessable, and the
 * routes additionally rate-limit lookups per IP.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const g = globalThis as any;
g.__samplingKeyCache ??= new Map<string, CryptoKey>();

export const SAMPLING_TOKEN_PREFIX = 'spl_';
const SEAL_CONTEXT = encoder.encode('code-rx:sampling-team-token:v1');

const toB64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const fromB64 = (value: string): Uint8Array => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const toBase64Url = (bytes: Uint8Array): string =>
  toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 32 CSPRNG bytes, URL-safe, prefixed. */
export const newTeamToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${SAMPLING_TOKEN_PREFIX}${toBase64Url(bytes)}`;
};

/** A short, non-secret hint for the organizer's link list (`spl_7F2K…`). */
export const tokenHint = (token: string): string => {
  const value = String(token || '');
  return value ? `${value.slice(0, 8)}…` : '';
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** Storage hash — domain separated so a hash from another table can never be replayed. */
export const teamTokenHash = (token: string): Promise<string> =>
  sha256Hex(`code-rx:sampling-team-token:v1:${String(token || '')}`);

// ---------------------------------------------------------------------------
// Key ring
// ---------------------------------------------------------------------------

interface SealedEnv {
  CGM_INVITATION_KEYS?: string;
  JWT_SECRET?: string;
}

const ringKey = async (env: SealedEnv): Promise<{ key: CryptoKey; version: string } | null> => {
  const raw = String(env?.CGM_INVITATION_KEYS || '').trim();
  if (raw) {
    const digest = await sha256Hex(raw);
    const cached = g.__samplingKeyCache.get(`ring:${digest}`);
    // The cache keeps the key VERSION too: a sealed blob is tagged with it, so
    // a cached hit must never rename the version (that would make the blob
    // unreadable on the next cold start).
    if (cached) return { key: cached.key, version: cached.version };
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const versions = Object.keys(parsed || {})
        .map((value) => String(value).trim().toLowerCase())
        .filter((value) => /^v\d+$/.test(value))
        .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      const latest = versions.pop();
      if (latest) {
        const bytes = fromB64(String(parsed[latest] ?? ''));
        if (bytes.length === 32) {
          const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
          g.__samplingKeyCache.set(`ring:${digest}`, { key, version: latest });
          return { key, version: latest };
        }
      }
    } catch {
      /* fall through to the JWT-derived key */
    }
  }

  const secret = String(env?.JWT_SECRET || '').trim();
  if (!secret) return null;
  const cacheKey = `jwt:${await sha256Hex(secret)}`;
  const cached = g.__samplingKeyCache.get(cacheKey);
  if (cached) return { key: cached.key, version: cached.version };
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('code-rx:sampling-team-token'), info: SEAL_CONTEXT },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  g.__samplingKeyCache.set(cacheKey, { key, version: 'jwt' });
  return { key, version: 'jwt' };
};

// ---------------------------------------------------------------------------
// Seal / open
// ---------------------------------------------------------------------------

export interface SealedTeamToken { sealed: string; keyVersion: string }

export const sealTeamToken = async (env: SealedEnv, token: string): Promise<SealedTeamToken | null> => {
  const ring = await ringKey(env);
  if (!ring) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: SEAL_CONTEXT, tagLength: 128 },
    ring.key,
    encoder.encode(String(token)),
  );
  return { sealed: `${ring.version}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`, keyVersion: ring.version };
};

/** Returns null on ANY failure — callers say "regenerate the link", never guess. */
export const openTeamToken = async (env: SealedEnv, sealed: string | null | undefined): Promise<string | null> => {
  if (!sealed) return null;
  const ring = await ringKey(env);
  if (!ring) return null;
  const [version, ivValue, ciphertextValue] = String(sealed).split('.');
  if (version !== ring.version || !ivValue || !ciphertextValue) return null;
  try {
    const iv = fromB64(ivValue);
    const ciphertext = fromB64(ciphertextValue);
    if (iv.length !== 12 || !ciphertext.length) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: SEAL_CONTEXT, tagLength: 128 },
      ring.key,
      ciphertext,
    );
    return decoder.decode(plaintext);
  } catch {
    return null;
  }
};

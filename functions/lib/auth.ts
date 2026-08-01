// Cloudflare Pages Functions - Authentication helpers
// PBKDF2-SHA256 password hashing + HMAC-SHA256 JWTs (Web Crypto only,
// no external deps). Works in Workers, local dev, and production.

import type { Context, Next } from 'hono';
import type { Env } from '../env';

const enc = new TextEncoder();

// ---------- base64 helpers ----------
const b64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const b64url = (bytes: Uint8Array): string =>
  b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

// ---------- password hashing (PBKDF2-SHA256, 100k iterations) ----------
export interface PasswordHash {
  algorithm: string;
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

const parseHash = (stored: string): PasswordHash | null => {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return null;
  return {
    algorithm: parts[0],
    iterations: parseInt(parts[1], 10) || 0,
    salt: fromB64url(parts[2]),
    hash: fromB64url(parts[3]),
  };
};

const derive = async (password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return new Uint8Array(bits);
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, 100_000);
  return `pbkdf2$100000$${b64url(salt)}$${b64url(hash)}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parsed = parseHash(stored);
  if (!parsed || !Number.isFinite(parsed.iterations) || parsed.iterations < 1) return false;
  const hash = await derive(password, parsed.salt, parsed.iterations);
  return timingSafeEqual(hash, parsed.hash);
};

// ---------- JWT (HMAC-SHA256) ----------
export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: 'admin' | 'member';
  iat: number;
  exp: number;
}

const hmacSign = async (data: string, secret: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
};

export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const signToken = async (payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const pl = b64url(enc.encode(JSON.stringify(body)));
  const sig = b64url(await hmacSign(`${header}.${pl}`, secret));
  return `${header}.${pl}.${sig}`;
};

export const verifyToken = async (token: string, secret: string): Promise<JwtPayload | null> => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, pl, sig] = parts;
    const expected = b64url(await hmacSign(`${header}.${pl}`, secret));
    if (!timingSafeEqual(fromB64url(sig), fromB64url(expected))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(pl))) as JwtPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.sub || !payload.email || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
};

// ---------- Hono helpers ----------
export const bearerToken = (c: Context<{ Bindings: Env }>): string => {
  const auth = c.req.header('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
};

/** Middleware: any authenticated user (member or admin). */
export const requireAuth = async (
  c: Context<{ Bindings: Env; Variables: { user: JwtPayload } }>,
  next: Next
) => {
  const token = bearerToken(c);
  if (!token) return c.json({ success: false, error: 'Authentication required' }, 401);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  c.set('user', payload);
  await next();
};

/** Middleware: admin only. */
export const requireAdmin = async (
  c: Context<{ Bindings: Env; Variables: { user: JwtPayload } }>,
  next: Next
) => {
  const token = bearerToken(c);
  if (!token) return c.json({ success: false, error: 'Authentication required' }, 401);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ success: false, error: 'Invalid or expired token' }, 401);
  if (payload.role !== 'admin') return c.json({ success: false, error: 'Admin access required' }, 403);
  c.set('user', payload);
  await next();
};

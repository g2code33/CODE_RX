// Cloudflare Pages Functions - lightweight in-memory rate limiter
// (per isolate; good enough to stop casual spam on public POST endpoints).

import type { Context } from 'hono';
import type { Env } from '../env';

interface Entry {
  count: number;
  resetAt: number;
}

const g = globalThis as any;
const store: Map<string, Entry> = (g.__codeRxRateLimit ??= new Map());
const MAX_ENTRIES = 5000;

const clientKey = (c: Context<{ Bindings: Env }>): string =>
  c.req.header('cf-connecting-ip') ||
  c.req.header('x-real-ip') ||
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
  'local';

/**
 * Returns true if the request is allowed, false if it exceeds the limit.
 * On false, the caller should respond with HTTP 429.
 */
export function checkRateLimit(c: Context<{ Bindings: Env }>, limit: number, windowSec: number): boolean {
  const now = Date.now();
  const key = `${clientKey(c)}:${c.req.path}`;

  // Opportunistic cleanup
  if (store.size > MAX_ENTRIES) {
    for (const [k, v] of store) {
      if (v.resetAt <= now) store.delete(k);
    }
  }

  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

#!/usr/bin/env node
/**
 * CODE Rx — CGM_INVITATION_KEYS validator (ops tool).
 *
 * Verifies a candidate `CGM_INVITATION_KEYS` secret value against the EXACT
 * rules production applies (functions/lib/cgm/invite-crypto.ts keyRing()):
 *
 *   1. non-empty, valid JSON **object**          — a bare key string fails
 *   2. every version name matches v1, v2, v3 …
 *   3. every key is base64 decoding to EXACTLY 32 bytes (AES-256)
 *
 * Generate a fresh key with:   openssl rand -base64 32
 * Then set the Pages secret to: {"v1":"<that output>"}   (include the quotes
 * and braces) and REDEPLOY — Pages binds secrets at deploy time.
 *
 * Usage:
 *   node scripts/verify-invitation-key.mjs '{"v1":"…"}'
 *   echo '<paste>' | node scripts/verify-invitation-key.mjs
 *   node scripts/verify-invitation-key.mjs        # reads $CGM_INVITATION_KEYS
 *
 * The value is only READ here — this tool never prints the key, any part of
 * it, or its hash; verdicts only.
 */
import { readFileSync } from 'node:fs';

const raw = (
  process.argv[2] ??
  (process.stdin.isTTY ? '' : readFileSync(0, 'utf8')) ??
  process.env.CGM_INVITATION_KEYS ??
  ''
).trim();

const fromB64 = (value) => {
  // Same normalisation as the production decoder: url-safe → standard, pad.
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  return new Uint8Array(Buffer.from(base64, 'base64'));
};

const verdict = (value) => {
  const v = String(value ?? '').trim();
  if (!v) return { ok: false, why: 'empty value — nothing is configured' };
  let parsed;
  try { parsed = JSON.parse(v); } catch {
    return { ok: false, why: 'not valid JSON — wrap the key like {"v1":"<key>"} (pasting the bare key string fails in production too)' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, why: 'JSON must be an object of version → key' };
  }
  const versions = Object.entries(parsed);
  if (!versions.length) return { ok: false, why: 'object has no entries' };
  for (const [name, key] of versions) {
    if (!/^v\d+$/.test(String(name).trim().toLowerCase())) {
      return { ok: false, why: `version name "${name}" must look like v1, v2 …` };
    }
    let bytes;
    try { bytes = fromB64(String(key)); } catch {
      return { ok: false, why: `key for ${name} is not valid base64` };
    }
    if (bytes.length !== 32) {
      return { ok: false, why: `key for ${name} decodes to ${bytes.length} BYTES — AES-256 needs exactly 32. Generate with: openssl rand -base64 32 (44 characters — a 32-CHARACTER string is only 24 bytes and will NOT work)` };
    }
  }
  return { ok: true, why: `${versions.length} key version(s) — every key decodes to exactly 32 bytes. Production will accept this value once it is bound and the site is (re)deployed.` };
};

const result = verdict(raw);
console.log(`${result.ok ? 'CGM_INVITATION_KEYS: VALID' : 'CGM_INVITATION_KEYS: INVALID'}`);
console.log(`  → ${result.why}`);
process.exit(result.ok ? 0 : 1);

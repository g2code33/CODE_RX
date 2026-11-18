#!/usr/bin/env node
/**
 * Generates a VAPID key pair for Web Push (system notifications on the phone).
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * Then set the three values in Cloudflare → Pages → Settings → Environment
 * variables (and in .dev.vars for the local preview):
 *
 *   VAPID_PUBLIC_KEY  <printed>
 *   VAPID_PRIVATE_KEY <printed>
 *   VAPID_SUBJECT     mailto:you@example.com
 *
 * The public key is what the browser needs; the private key must NEVER reach
 * the frontend or a git checkpoint — it is only ever read server-side.
 */
const b64url = (bytes) => Buffer.from(bytes).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
);

const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));       // 0x04 || X || Y
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const d = new Uint8Array(Buffer.from(jwk.d.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

console.log('');
console.log('  VAPID_PUBLIC_KEY  = ' + b64url(raw));
console.log('  VAPID_PRIVATE_KEY = ' + b64url(d));
console.log('  VAPID_SUBJECT     = mailto:coderxsociety@gmail.com');
console.log('');
console.log('  Keep the private key server-side only.');
console.log('');

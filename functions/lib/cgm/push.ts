/**
 * Web Push, without a dependency.
 *
 * A push message is a small encrypted POST to whatever endpoint the browser
 * handed us. Doing it properly means VAPID (proving we are the sender) and
 * aes128gcm (so the push service cannot read the message). Both are built here
 * with WebCrypto only, so nothing is added to the bundle or the runtime.
 *
 * Deliberately conservative: every failure is swallowed and reported as "not
 * sent". A student who never granted permission, an expired device, or a
 * missing key must never make saving an announcement fail.
 */
import type { D1Database } from '@cloudflare/workers-types';

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface VapidKeys {
  publicKey: string;   // base64url, uncompressed P-256 point (sent to the browser)
  privateKey: string;  // base64url, the raw 32-byte scalar
  subject: string;     // mailto: or https: contact
}

const b64urlToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const bytesToB64url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const textEncoder = new TextEncoder();

/** The VAPID key pair, read from the environment (never from the client). */
export const vapidKeys = (env: any): VapidKeys | null => {
  const publicKey = String(env?.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env?.VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: String(env?.VAPID_SUBJECT || 'mailto:coderxsociety@gmail.com').trim(),
  };
};

/**
 * Build a signed VAPID Authorization header for one push service origin.
 * `aud` must be the push service origin, not the endpoint path.
 */
const vapidAuthorization = async (keys: VapidKeys, audience: string): Promise<string> => {
  const header = bytesToB64url(textEncoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = bytesToB64url(textEncoder.encode(JSON.stringify({
    aud: audience,
    exp: issuedAt + 12 * 60 * 60, // the spec's ceiling
    sub: keys.subject,
  })));
  const signingInput = `${header}.${payload}`;

  // Import the raw scalar as an ECDSA P-256 private key.
  const raw = b64urlToBytes(keys.privateKey);
  const privateJwk = {
    kty: 'EC',
    crv: 'P-256',
    d: bytesToB64url(raw),
    // The public point is derivable by the runtime but the API wants it too;
    // the configured public key already carries x||y.
    x: bytesToB64url(b64urlToBytes(keys.publicKey).slice(1, 33)),
    y: bytesToB64url(b64urlToBytes(keys.publicKey).slice(33, 65)),
  };
  const key = await crypto.subtle.importKey(
    'jwk', privateJwk as JsonWebKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, textEncoder.encode(signingInput),
  ));
  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${keys.publicKey}`;
};

/**
 * Encrypt one payload for one subscription (aes128gcm, RFC 8291).
 * Returns the complete request body, ready to POST.
 */
const encryptPayload = async (
  payload: string,
  p256dh: string,
  auth: string,
): Promise<{ body: Uint8Array; contentEncoding: string } | null> => {
  try {
    const userPublicKey = b64urlToBytes(p256dh);   // 65 bytes, uncompressed
    const authSecret = b64urlToBytes(auth);        // 16 bytes

    // 1. An ephemeral key pair for this message.
    const ephemeral = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
    ) as CryptoKeyPair;
    const ephemeralRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

    // 2. Shared secret via ECDH with the subscriber's key.
    const subscriberKey = await crypto.subtle.importKey(
      'raw', userPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
    );
    const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'ECDH', public: subscriberKey }, ephemeral.privateKey, 256,
    ));

    // 3. Keys derived exactly as RFC 8291 §3.3–3.4 describe.
    const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) => {
      const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info }, base, length * 8,
      );
      return new Uint8Array(bits);
    };
    const keyInfo = textEncoder.encode('WebPush: info\0');
    const contextInfo = new Uint8Array([...keyInfo, ...userPublicKey, ...ephemeralRaw]);
    const ikm = await hkdf(authSecret, sharedSecret, contextInfo, 32);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cekBytes = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, textEncoder.encode('Content-Encoding: nonce\0'), 12);

    const aesKey = await crypto.subtle.importKey('raw', cekBytes, 'AES-GCM', false, ['encrypt']);
    // The delimiters byte (0x02) marks this as the last record.
    const plaintext = new Uint8Array([...textEncoder.encode(payload), 2]);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce }, aesKey, plaintext,
    ));

    // 4. The aes128gcm body: salt | recordsize | idlen | keyid | ciphertext.
    const recordSize = new Uint8Array(4);
    new DataView(recordSize.buffer).setUint32(0, 4096);
    const body = new Uint8Array([
      ...salt, ...recordSize, ephemeralRaw.length, ...ephemeralRaw, ...encrypted,
    ]);
    return { body, contentEncoding: 'aes128gcm' };
  } catch {
    return null;
  }
};

const sendToSubscription = async (
  env: any,
  subscription: PushSubscriptionRow,
  payload: string,
  keys: VapidKeys,
): Promise<'sent' | 'gone' | 'failed'> => {
  try {
    const url = new URL(subscription.endpoint);
    const encrypted = await encryptPayload(payload, subscription.p256dh, subscription.auth);
    if (!encrypted) return 'failed';
    const authorization = await vapidAuthorization(keys, url.origin);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': encrypted.contentEncoding,
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body: encrypted.body,
    });
    // 404/410 mean the browser threw the subscription away: delete the row so
    // we stop paying for it on every later notice.
    if (response.status === 404 || response.status === 410) return 'gone';
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
};

/**
 * Deliver a notice to every device a student registered. Never throws.
 * Returns how many devices actually took it.
 */
export const pushToStudent = async (
  env: any,
  db: D1Database,
  studentId: number,
  payload: { title: string; body: string; link?: string | null; tag?: string | null },
): Promise<number> => {
  const keys = vapidKeys(env);
  if (!keys) return 0; // not configured — the in-app notice is the record
  try {
    const rows = await (db.prepare(
      'SELECT id, endpoint, p256dh, auth FROM cgm_push_subscriptions WHERE student_id = ? ORDER BY id DESC LIMIT 20'
    ).bind(studentId).all() as any).results as PushSubscriptionRow[] || [];
    if (!rows.length) return 0;
    const message = JSON.stringify({
      title: payload.title, body: payload.body,
      link: payload.link || '#class-groups/student/notifications',
      tag: payload.tag || null,
    });
    let sent = 0;
    for (const row of rows) {
      const outcome = await sendToSubscription(env, row, message, keys);
      if (outcome === 'sent') sent += 1;
      if (outcome === 'gone') {
        await db.prepare('DELETE FROM cgm_push_subscriptions WHERE id = ?').bind(row.id).run().catch(() => undefined);
      }
    }
    return sent;
  } catch {
    return 0;
  }
};

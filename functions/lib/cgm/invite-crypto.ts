/**
 * CODE Rx SOCIETY — CGM invitation secret sealing.
 *
 * Individual invitation tokens are bearer credentials (whoever holds one can
 * claim the seat). At rest the database keeps:
 *   - `token_hash`     — SHA-256 lookup hash, used to VALIDATE a presented
 *                        token (public landing, claim, join). Never reversible.
 *   - `token_enc`      — the secret itself, sealed as `v1.<iv>.<ciphertext>`:
 *                        AES-256-GCM (authenticated encryption) so an
 *                        authorized organizer can still copy or re-QR the
 *                        invitation link later. The authentication tag makes
 *                        any tampering detectable; decryption fails closed.
 *   - `token_key_version` — which key version sealed the blob (rotation aid).
 *
 * General invitations have no bearer secret at all: their public `code` is the
 * shareable half, so no sealed copy is stored for them either.
 *
 * Key material comes EXCLUSIVELY from the `CGM_INVITATION_KEYS` Worker secret —
 * a JSON object mapping versions to base64-encoded 32-byte keys, e.g.
 *   {"v1": "base64-openssl-rand-base64-32"}
 * Nothing is hardcoded here; a deployment without the secret keeps working
 * through the lookup hashes but refuses to create new individual invitations
 * and reports the exact setup step (no silent plaintext fallback, ever).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toB64 = (bytes: Uint8Array) => {
  let binary = '';
  // Keep spreads small: some Workers runtimes reject very large argument lists.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const fromB64 = (value: string) => {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const INVITATION_KEY_ENV = 'CGM_INVITATION_KEYS';
export const INVITATION_KEY_SETUP_HINT =
  `Set the ${INVITATION_KEY_ENV} Cloudflare secret to a JSON object of version → base64 32-byte keys, e.g. {"v1":"$(openssl rand -base64 32)"} — then redeploy. `;

interface SealedEnv { CGM_INVITATION_KEYS?: string }

const g = globalThis as any;
g.__cgmInviteKeyCache ??= new Map<string, Map<string, CryptoKey>>();

/** Parse + import the configured key versions. Returns null when unconfigured/invalid. */
const keyRing = async (env: SealedEnv): Promise<Map<string, CryptoKey> | null> => {
  const raw = String((env as any)?.[INVITATION_KEY_ENV] || '').trim();
  if (!raw) return null;
  // Cache on a digest of the secret — never the secret itself.
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  let cacheKey = '';
  for (const byte of new Uint8Array(digest)) cacheKey += String.fromCharCode(byte);
  const cached = g.__cgmInviteKeyCache.get(cacheKey);
  if (cached) return cached;

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const ring = new Map<string, CryptoKey>();
  for (const [rawVersion, rawKey] of Object.entries(parsed)) {
    const version = String(rawVersion).trim().toLowerCase();
    if (!/^v\d+$/.test(version)) return null;
    let bytes: Uint8Array;
    try { bytes = fromB64(String(rawKey)); } catch { return null; }
    if (bytes.length !== 32) return null; // AES-256 wants exactly 32 bytes.
    ring.set(version, await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));
  }
  if (!ring.size) return null;
  g.__cgmInviteKeyCache.set(cacheKey, ring);
  return ring;
};

/** True when at least one valid key version is configured. */
export const invitationSealingAvailable = async (env: SealedEnv): Promise<boolean> =>
  Boolean(await keyRing(env));

/** The highest configured version — the one new seals use. */
const currentVersion = (ring: Map<string, CryptoKey>): string =>
  [...ring.keys()].sort((a, b) => (Number(a.slice(1)) - Number(b.slice(1)))).pop() as string;

const SEAL_CONTEXT = encoder.encode('code-rx:cgm-individual-invitation:v1');

/**
 * Seal an individual invitation secret. Returns null when the deployment has
 * no usable key configuration — callers must refuse to store plaintext.
 */
export const sealInvitationToken = async (
  env: SealedEnv,
  token: string,
): Promise<{ sealed: string; keyVersion: string } | null> => {
  const ring = await keyRing(env);
  if (!ring) return null;
  const keyVersion = currentVersion(ring);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // random per seal — never reused
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: SEAL_CONTEXT, tagLength: 128 },
    ring.get(keyVersion) as CryptoKey,
    encoder.encode(String(token)),
  );
  return { sealed: `${keyVersion}.${toB64(iv)}.${toB64(new Uint8Array(ciphertext))}`, keyVersion };
};

/**
 * Open a sealed invitation secret. Returns null on ANY failure (unknown key
 * version, malformed blob, authentication-tag mismatch) — callers treat that
 * as "this secret cannot be re-displayed; regenerate the invitation".
 */
export const openInvitationToken = async (
  env: SealedEnv,
  sealed: string | null | undefined,
): Promise<string | null> => {
  const parts = String(sealed || '').split('.');
  if (parts.length !== 3) return null;
  const [version, ivValue, ciphertextValue] = parts;
  if (!/^v\d+$/.test(version)) return null;
  const ring = await keyRing(env);
  const key = ring?.get(version);
  if (!key) return null;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = fromB64(ivValue);
    ciphertext = fromB64(ciphertextValue);
  } catch { return null; }
  if (iv.length !== 12 || !ciphertext.length) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: SEAL_CONTEXT, tagLength: 128 },
      key,
      ciphertext,
    );
    return decoder.decode(plaintext);
  } catch {
    return null; // wrong key, tampered ciphertext or corrupted tag
  }
};

const countPending = async (db: D1Database): Promise<number> => {
  const rows = await (db.prepare(
    "SELECT COUNT(*) AS c FROM cgm_invitations WHERE kind = 'individual' AND token_value IS NOT NULL AND token_enc IS NULL"
  ).all());
  return Number(((rows.results || [])[0] as any)?.c || 0);
};

export interface InvitationSealMigrationResult {
  encrypted: number;
  droppedGeneralRawTokens: number;
  pendingPlaintext: number;
  keyConfigured: boolean;
}

/**
 * Idempotent backfill, safe to run on every cold boot:
 *   1. General invitations never needed a raw bearer secret (their public code
 *      is the shareable half) — any legacy raw value is cleared.
 *   2. Individual invitations still carrying a legacy plaintext token are
 *      sealed with the configured key and the plaintext is removed.
 * Without a configured key nothing is written: the legacy rows KEEP WORKING
 * through their lookup hashes, the pending count is reported loudly, and no
 * plaintext fallback is introduced anywhere. Secret values are never logged.
 */
export const migrateInvitationTokenStorage = async (db: D1Database, env: SealedEnv): Promise<InvitationSealMigrationResult> => {
  const cleared = await db.prepare(
    "UPDATE cgm_invitations SET token_value = NULL WHERE kind = 'general' AND token_value IS NOT NULL"
  ).run();
  const droppedGeneralRawTokens = Number(cleared.meta?.changes || 0);

  let encrypted = 0;
  const keyConfigured = await invitationSealingAvailable(env);
  if (keyConfigured) {
    const rows = await (db.prepare(
      'SELECT id, token_value FROM cgm_invitations WHERE kind = \'individual\' AND token_value IS NOT NULL AND token_enc IS NULL'
    ).all());
    for (const row of (rows.results || []) as Array<{ id: number; token_value: string }>) {
      const sealed = await sealInvitationToken(env, String(row.token_value || ''));
      if (!sealed) break; // key vanished mid-run — leave the row for the next boot
      await db.prepare(
        'UPDATE cgm_invitations SET token_enc = ?, token_key_version = ?, token_value = NULL WHERE id = ?'
      ).bind(sealed.sealed, sealed.keyVersion, Number(row.id)).run();
      encrypted += 1;
    }
  }
  const pendingPlaintext = await countPending(db);
  if (pendingPlaintext > 0) {
    // Loud, once per boot, and without a single secret character in it.
    console.error(
      `[cgm] ${INVITATION_KEY_SETUP_HINT}` +
      `${pendingPlaintext} individual invitation secret(s) are still stored as legacy plaintext; ` +
      `they keep working via their lookup hashes but will only be sealed once the secret is configured.`,
    );
  }
  return { encrypted, droppedGeneralRawTokens, pendingPlaintext, keyConfigured };
};

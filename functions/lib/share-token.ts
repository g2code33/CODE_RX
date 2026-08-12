/**
 * Vault share URLs are bearer credentials. D1 stores a SHA-256 lookup hash for
 * public verification and an AES-GCM encrypted copy solely so an authorized
 * owner can copy an existing link again later. A database export by itself
 * cannot recreate a live share URL without the deployment's JWT secret.
 */

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  // Keep spreads small: some Workers runtimes reject very large argument lists.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted share token.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const keyFor = async (secret: string) => {
  const normalized = String(secret || '').trim();
  if (!normalized) throw new Error('A JWT secret is required to protect Vault share links.');
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`code-rx:vault-share-link:v1:${normalized}`));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

/** Encrypt a raw, public Vault token before it is persisted in D1. */
export const encryptVaultShareToken = async (token: string, secret: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(secret);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token));
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
};

/** Returns a raw token only after authenticated server-side authorization. */
export const decryptVaultShareToken = async (sealed: string, secret: string) => {
  const [version, ivValue, ciphertextValue, extra] = String(sealed || '').split('.');
  if (version !== 'v1' || !ivValue || !ciphertextValue || extra) throw new Error('Unsupported encrypted share token.');
  const iv = fromBase64Url(ivValue);
  if (iv.length !== 12) throw new Error('Invalid encrypted share token.');
  const key = await keyFor(secret);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromBase64Url(ciphertextValue));
  return new TextDecoder().decode(plaintext);
};

// Class & Group Management — the accounts this device has signed in as.
//
// "Remember me" keeps TWO different things apart on purpose:
//
//   1. The session (codeRx_cgmStudentSession). It is written only after a real
//      sign-in and lives in localStorage, so a student stays signed in until
//      they press Sign out. Signing out clears it — that must never change.
//
//   2. The ACCOUNT. This file. It is the answer to "what do I type next time?"
//      It remembers the identifier (index number or telephone) and how that
//      student signs in — never the passkey itself. A returning student taps
//      their tile, the identifier is filled in, they type the passkey and they
//      are in. Storing the passkey would make a stolen device a stolen account,
//      so it is deliberately not stored.
//
// Signing out does NOT erase the account list: that is the whole point of the
// feature ("log out, come back, sign straight in"). Turning the Remember me
// toggle off is the explicit way to forget, and it forgets this device.

const ACCOUNTS_KEY = 'codeRx_cgmRememberedAccounts';
const MAX_ACCOUNTS = 6;

export type RememberedIdentifierType = 'index_number' | 'phone';

export interface RememberedAccount {
  /** Stable per-student key: the class-scoped student id, or the identifier. */
  key: string;
  identifierType: RememberedIdentifierType;
  identifier: string;
  /** What the tile says — never a credential. */
  label: string;
  /** Optional context lines so two similar index numbers are unambiguous. */
  className?: string | null;
  indexNumber?: string | null;
  /** ISO timestamp of the last successful sign-in on this device. */
  lastUsedAt: string;
  /** How many times this device has signed in as them. */
  uses: number;
}

const safeParse = (raw: string | null): RememberedAccount[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.identifier === 'string' && entry.identifier.trim())
      .map((entry) => ({
        key: String(entry.key || entry.identifier),
        identifierType: entry.identifierType === 'phone' ? 'phone' : 'index_number',
        identifier: String(entry.identifier),
        label: String(entry.label || entry.identifier),
        className: entry.className ? String(entry.className) : null,
        indexNumber: entry.indexNumber ? String(entry.indexNumber) : null,
        lastUsedAt: String(entry.lastUsedAt || new Date(0).toISOString()),
        uses: Number(entry.uses || 1),
      }));
  } catch {
    return [];
  }
};

const read = (): RememberedAccount[] => {
  try { return safeParse(localStorage.getItem(ACCOUNTS_KEY)); } catch { return []; }
};

const write = (accounts: RememberedAccount[]) => {
  try {
    if (accounts.length) localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, MAX_ACCOUNTS)));
    else localStorage.removeItem(ACCOUNTS_KEY);
  } catch { /* private mode: remembering is best-effort, never a broken sign-in */ }
};

/** Newest first — the account someone used last sits first. */
export const listRememberedAccounts = (): RememberedAccount[] => read()
  .slice()
  .sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0));

/** The account to prefill with no interaction at all: the most recent one. */
export const lastRememberedAccount = (): RememberedAccount | null => listRememberedAccounts()[0] || null;

export const findRememberedAccount = (key: string): RememberedAccount | null =>
  read().find((entry) => entry.key === key) || null;

/**
 * Record a successful sign-in. Called only AFTER the server accepted the
 * credentials, so the device never remembers an account that never worked.
 */
export const rememberAccount = (
  account: Omit<RememberedAccount, 'lastUsedAt' | 'uses'> & { uses?: number },
): RememberedAccount[] => {
  const identifier = String(account.identifier || '').trim();
  if (!identifier) return read();
  const key = String(account.key || identifier);
  const existing = read().find((entry) => entry.key === key);
  const next: RememberedAccount = {
    key,
    identifierType: account.identifierType === 'phone' ? 'phone' : 'index_number',
    identifier,
    label: String(account.label || identifier).trim() || identifier,
    className: account.className ? String(account.className) : null,
    indexNumber: account.indexNumber ? String(account.indexNumber) : null,
    lastUsedAt: new Date().toISOString(),
    uses: Number(existing?.uses || account.uses || 0) + 1,
  };
  const others = read().filter((entry) => entry.key !== key);
  const accounts = [next, ...others].slice(0, MAX_ACCOUNTS);
  write(accounts);
  return accounts;
};

/** Forget ONE account (the tile's own × button). The session is untouched. */
export const forgetRememberedAccount = (key: string): RememberedAccount[] => {
  const accounts = read().filter((entry) => entry.key !== key);
  write(accounts);
  return accounts;
};

/** Forget every account on this device (turning Remember me off does this). */
export const forgetAllRememberedAccounts = () => write([]);

export const REMEMBERED_ACCOUNTS_STORAGE_KEY = ACCOUNTS_KEY;

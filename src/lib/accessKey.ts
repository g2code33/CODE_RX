/**
 * Client access key helpers.
 *
 * Pure functions with no DOM or React dependency so the formatting, validation
 * and message rules can be unit tested directly.
 *
 * The alphabet matches the server (`functions/lib/client-auth.ts`): the
 * ambiguous glyphs 0, O, 1 and I are never part of a key, which is what makes
 * the format legible when it is read aloud or typed from paper.
 */

export const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACCESS_KEY_GROUP_SIZE = 4;
/** Canonical body length: 4 groups of 4 characters (80 bits). */
export const ACCESS_KEY_BODY_LENGTH = 16;
/** Shorter legacy keys are still accepted by the server (12–32 characters). */
export const ACCESS_KEY_MIN_BODY_LENGTH = 12;
export const ACCESS_KEY_MAX_BODY_LENGTH = 32;
export const ACCESS_KEY_PREFIX = 'CRX';
export const ACCESS_KEY_PLACEHOLDER = 'CRX-____-____-____';

/** Characters that are NOT in the alphabet but are commonly mistyped. */
const AMBIGUOUS = ['0', 'O', '1', 'I'];

export interface AccessKeyFormat {
  /** What the input should display, e.g. `CRX-8K4P-X92M-7LQF-B3TD`. */
  display: string;
  /** The characters that will be sent to the server, e.g. `8K4PX92M7LQFB3TD`. */
  body: string;
  /** Mistyped characters that were dropped, de-duplicated and ordered. */
  ignored: string[];
  /** True once the body is a complete canonical key. */
  complete: boolean;
}

/**
 * Formats whatever the client has typed into the canonical CRX shape.
 * Dashes, spaces, lowercase and the optional prefix are all tolerated; the
 * ambiguous glyphs are dropped and reported so the screen can explain why.
 */
export const formatAccessKey = (raw: string): AccessKeyFormat => {
  const upper = String(raw ?? '').toUpperCase();
  const ignored: string[] = [];
  let body = '';

  for (const character of upper) {
    if (ACCESS_KEY_ALPHABET.includes(character)) {
      if (body.length < ACCESS_KEY_MAX_BODY_LENGTH) body += character;
      continue;
    }
    // Letters typed in lowercase, dashes, spaces and the CRX prefix are expected
    // input, not mistakes. Everything else that is alphanumeric is a mistyping.
    if (/[A-Z0-9]/.test(character) && !ignored.includes(character)) ignored.push(character);
  }

  // A pasted key may include the CRX prefix; the alphabet filtering above keeps
  // those letters, so strip a leading CRX when it is not part of the key itself.
  if (body.length > ACCESS_KEY_BODY_LENGTH && body.startsWith(ACCESS_KEY_PREFIX)) {
    body = body.slice(ACCESS_KEY_PREFIX.length);
  }

  const groups: string[] = [];
  for (let index = 0; index < body.length; index += ACCESS_KEY_GROUP_SIZE) {
    groups.push(body.slice(index, index + ACCESS_KEY_GROUP_SIZE));
  }

  return {
    display: groups.length ? `${ACCESS_KEY_PREFIX}-${groups.join('-')}` : '',
    body,
    ignored: ignored.sort(),
    complete: body.length === ACCESS_KEY_BODY_LENGTH,
  };
};

export interface AccessKeyValidation {
  ok: boolean;
  body: string;
  /** A message for the access screen, or null when the key looks usable. */
  problem: string | null;
}

/** Client-side validation. The server always validates again. */
export const validateAccessKey = (raw: string): AccessKeyValidation => {
  const formatted = formatAccessKey(raw);
  if (!formatted.body) {
    return { ok: false, body: '', problem: 'Enter the project access key Code Rx Society gave you.' };
  }
  if (formatted.body.length < ACCESS_KEY_MIN_BODY_LENGTH) {
    return { ok: false, body: formatted.body, problem: 'This access key looks too short. Check it and try again.' };
  }
  if (formatted.ignored.length) {
    return {
      ok: false,
      body: formatted.body,
      problem: `Access keys never contain ${formatted.ignored.join(', ')} — check the key and try again.`,
    };
  }
  return { ok: true, body: formatted.body, problem: null };
};

const AMBIGUOUS_HINT = `Access keys never contain ${AMBIGUOUS.join(', ')}.`;

/** Short, non-technical guidance shown under the input while typing. */
export const accessKeyHint = (formatted: AccessKeyFormat): string | null => {
  if (formatted.ignored.length) return AMBIGUOUS_HINT;
  if (!formatted.body) return null;
  if (formatted.complete) return null;
  return 'Keep going — the key has four groups of four characters.';
};

/**
 * Messages for a state the server reported. The server's own message is
 * preferred; this table covers offline, timeout and unexpected responses so
 * the screen never shows a raw status code or an empty box.
 */
export const FAILURE_MESSAGES: Record<string, string> = {
  invalid_key: 'This project access key was not recognised. Check the key and try again.',
  key_expired: 'This project access key has expired. Please contact Code Rx Society for a new one.',
  key_revoked: 'This project access key has been revoked. Please contact Code Rx Society if you still need access.',
  client_suspended: 'Access for this client is currently suspended. Please contact Code Rx Society.',
  client_archived: 'This client account has been archived, so access is closed.',
  client_revoked: 'Access for this client has been withdrawn. Please contact Code Rx Society.',
  project_unavailable: 'The project linked to this access key is not available at the moment.',
  no_project: 'This access key is not linked to a project yet. Please contact Code Rx Society.',
  link_invalid: 'This access link was not recognised. Please ask Code Rx Society for a new one.',
  link_expired: 'This access link has expired. Please ask Code Rx Society for a new one.',
  link_revoked: 'This access link has been revoked. Please ask Code Rx Society for a new one.',
  link_exhausted: 'This access link has already been used the maximum number of times.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  session_expired: 'Your secure session has ended. Enter your access key to continue.',
  unavailable: 'Client access is not available right now. Please try again shortly.',
  offline: 'We could not reach Code Rx Society. Check your connection and try again.',
  server_error: 'Something went wrong on our side. Please try again shortly.',
};

export const failureMessage = (
  code: string | null | undefined,
  fallback: keyof typeof FAILURE_MESSAGES = 'unavailable',
): string => (code && FAILURE_MESSAGES[code]) || FAILURE_MESSAGES[fallback];

/**
 * Maps a thrown request failure onto a screen message without ever surfacing
 * a status code, an endpoint or a server stack.
 */
export const messageForFailure = (status: number, code?: string | null): string => {
  if (code && FAILURE_MESSAGES[code]) return FAILURE_MESSAGES[code];
  if (status === 0) return FAILURE_MESSAGES.offline;
  if (status === 429) return FAILURE_MESSAGES.rate_limited;
  if (status >= 500) return FAILURE_MESSAGES.server_error;
  return FAILURE_MESSAGES.unavailable;
};

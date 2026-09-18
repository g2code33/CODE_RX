/**
 * Client access key helpers.
 *
 * Pure functions with no DOM or React dependency so the formatting, validation
 * and message rules can be unit tested directly.
 *
 * Shape: `CRX-XXX-XXX-ABC` — two random groups and a three-letter project code
 * the client can recognise. It is the only key format: every key is entered in
 * three fixed boxes, so these helpers work in groups, never on one long string.
 *
 * The alphabet matches the server (`functions/lib/client-auth.ts`): the
 * ambiguous glyphs 0, O, 1 and I are never part of a random group, which is what
 * makes the key legible when it is read aloud or typed from paper.
 */

export const ACCESS_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACCESS_KEY_PREFIX = 'CRX';
export const ACCESS_KEY_GROUP_LENGTH = 3;
export const ACCESS_KEY_GROUPS = 3;
/** The trailing group is the project code: letters only, never digits. */
export const ACCESS_KEY_CODE_LENGTH = 3;
/** Two random groups plus the project code — the one and only key length. */
export const ACCESS_KEY_BODY_LENGTH = ACCESS_KEY_GROUP_LENGTH * (ACCESS_KEY_GROUPS - 1) + ACCESS_KEY_CODE_LENGTH;
/**
 * How much of a paste the helpers will hold. It is deliberately longer than a
 * key: a key from the old long format is kept whole so it can be *reported* as
 * the wrong length, never silently cut down to something the server would then
 * reject for the wrong reason.
 */
const ACCESS_KEY_MAX_TYPED_LENGTH = 32;
export const ACCESS_KEY_PLACEHOLDER = 'CRX-___-___-ABC';

/** Characters that are NOT in the alphabet but are commonly mistyped. */
const AMBIGUOUS = ['0', 'O', '1', 'I'];

export interface AccessKeyFormat {
  /** What the field shows, e.g. `CRX-8K4-P92-MSD`. */
  display: string;
  /** The characters sent to the server, e.g. `8K4P92MSD`. */
  body: string;
  /** The same body split into the three boxes. */
  groups: string[];
  /** Mistyped characters that were kept and reported, de-duplicated and ordered. */
  ignored: string[];
  /** True once the body is a complete canonical key. */
  complete: boolean;
}

/**
 * Removes a leading CRX the client typed or pasted in front of the key.
 *
 * The rule is length-based on purpose: a body that is exactly the canonical
 * length is taken as the body, so a key whose own random group happens to start
 * with the letters C-R-X is never mangled; anything longer that begins with CRX
 * is a key with the prefix attached.
 */
const stripPrefix = (compact: string): string =>
  compact.length > ACCESS_KEY_BODY_LENGTH && compact.startsWith(ACCESS_KEY_PREFIX)
    ? compact.slice(ACCESS_KEY_PREFIX.length)
    : compact;

/** Exactly the three boxes the client sees, each already trimmed to three characters. */
export const splitAccessKey = (raw: string): string[] => {
  const compact = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = stripPrefix(compact);
  const groups: string[] = [];
  for (let index = 0; index < ACCESS_KEY_GROUPS; index += 1) {
    groups.push(body.slice(index * ACCESS_KEY_GROUP_LENGTH, (index + 1) * ACCESS_KEY_GROUP_LENGTH));
  }
  return groups;
};

/** The compact body a set of boxes represents, ready for the server. */
export const joinAccessKey = (groups: string[]): string =>
  groups.join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ACCESS_KEY_BODY_LENGTH);

/**
 * Formats anything a client has typed into the canonical CRX shape.
 * Dashes, spaces, lowercase and the optional prefix are all tolerated; a
 * character the alphabet cannot contain is kept and reported, never dropped
 * silently, so the screen can explain what happened.
 */
export const formatAccessKey = (raw: string): AccessKeyFormat => {
  const upper = String(raw ?? '').toUpperCase();
  const ignored: string[] = [];
  let compact = '';

  for (const character of upper) {
    if (ACCESS_KEY_ALPHABET.includes(character)) {
      // Collected in full first: the prefix rule needs the value as typed, and
      // only then is the body cut down to the one length a key can have.
      compact += character;
      continue;
    }
    // Lowercase letters, dashes, spaces and the CRX prefix are expected input,
    // not mistakes. Everything else that is alphanumeric is a mistyping.
    if (/[A-Z0-9]/.test(character) && !ignored.includes(character)) ignored.push(character);
  }

  const body = stripPrefix(compact).slice(0, ACCESS_KEY_MAX_TYPED_LENGTH);

  const groups: string[] = [];
  for (let index = 0; index < body.length; index += ACCESS_KEY_GROUP_LENGTH) {
    groups.push(body.slice(index, index + ACCESS_KEY_GROUP_LENGTH));
  }

  return {
    display: groups.length ? `${ACCESS_KEY_PREFIX}-${groups.join('-')}` : '',
    body,
    groups: splitAccessKey(body),
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

const EMPTY_PROBLEM = 'Enter the project access key Code Rx Society gave you.';
const SHORT_PROBLEM = `An access key is ${ACCESS_KEY_BODY_LENGTH} characters — ${ACCESS_KEY_GROUPS} boxes of ${ACCESS_KEY_GROUP_LENGTH}. Check it and try again.`;
const LONG_PROBLEM = `An access key is ${ACCESS_KEY_BODY_LENGTH} characters. Check the key and try again.`;
const CODE_PROBLEM = 'The last group is the project code — three letters, like MSD.';

/** Validation for the three fixed boxes: two random groups, then the project code. */
export const validateAccessKeyGroups = (boxes: string[]): AccessKeyValidation => {
  const groups = boxes.map((value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const body = joinAccessKey(groups);
  if (!body) return { ok: false, body: '', problem: EMPTY_PROBLEM };
  if (body.length < ACCESS_KEY_BODY_LENGTH) return { ok: false, body, problem: SHORT_PROBLEM };
  const ambiguous = groups.join('').split('').filter((character) => AMBIGUOUS.includes(character));
  if (ambiguous.length) {
    return { ok: false, body, problem: `Access keys never contain ${[...new Set(ambiguous)].join(', ')} — check the key and try again.` };
  }
  const code = groups[ACCESS_KEY_GROUPS - 1] || '';
  if (code.length < ACCESS_KEY_CODE_LENGTH || /\d/.test(code)) {
    return { ok: false, body, problem: CODE_PROBLEM };
  }
  return { ok: true, body, problem: null };
};

/**
 * Validation for a whole key given as one string — what a paste produces, and
 * what the paste handler runs before it fills the boxes. The server always
 * validates again.
 */
export const validateAccessKey = (raw: string): AccessKeyValidation => {
  const formatted = formatAccessKey(raw);
  if (!formatted.body) return { ok: false, body: '', problem: EMPTY_PROBLEM };
  if (formatted.body.length < ACCESS_KEY_BODY_LENGTH) return { ok: false, body: formatted.body, problem: SHORT_PROBLEM };
  if (formatted.body.length > ACCESS_KEY_BODY_LENGTH) return { ok: false, body: formatted.body, problem: LONG_PROBLEM };
  if (formatted.ignored.length) {
    return {
      ok: false,
      body: formatted.body,
      problem: `Access keys never contain ${formatted.ignored.join(', ')} — check the key and try again.`,
    };
  }
  if (!formatted.complete) return { ok: false, body: formatted.body, problem: LONG_PROBLEM };
  return { ok: true, body: formatted.body, problem: null };
};

const AMBIGUOUS_HINT = `Access keys never contain ${AMBIGUOUS.join(', ')}.`;

/** Short, non-technical guidance shown under the boxes while typing. */
export const accessKeyHint = (formatted: AccessKeyFormat): string | null => {
  if (formatted.ignored.length) return AMBIGUOUS_HINT;
  if (!formatted.body) return null;
  if (formatted.complete) return null;
  return `Keep going — ${ACCESS_KEY_GROUP_LENGTH} characters in each box, then the project code.`;
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

/**
 * CODE Rx SOCIETY — Sampling (Phase 1) core rules.
 *
 * Pure functions only: no database, no network, no clock. Everything the routes
 * and the tests rely on for fairness lives here:
 *
 *   - the shape a game configuration must have before it may be created;
 *   - the team name generator and the duplicate rules;
 *   - the turn arithmetic (who plays after whom);
 *   - an UNBIASED uniform pick over the numbers still available, backed by
 *     `crypto.getRandomValues` — never `Math.random()`;
 *   - the public shapes returned to a team (never a token, never organizer data).
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
// A game is a phone-first party game, not a dataset: the caps keep every draw
// cheap (the pool is read and filtered in one go) and every screen readable.
export const SAMPLING_LIMITS = {
  minTotal: 1,
  maxTotal: 2000,
  minTeams: 1,
  maxTeams: 40,
  maxTeamName: 40,
  maxTitle: 120,
  maxInstructions: 600,
} as const;

export type SamplingGameStatus = 'draft' | 'active' | 'paused' | 'completed' | 'ended';

export const SAMPLING_STATUS_LABEL: Record<SamplingGameStatus, string> = {
  draft: 'Ready to start',
  active: 'In play',
  paused: 'Paused',
  completed: 'Completed',
  ended: 'Ended early',
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** `Team A … Team Z, Team AA …` — never repeats, never needs a partner table. */
export const teamNameForPosition = (position: number): string => {
  let index = Math.max(1, Math.floor(Number(position) || 1));
  let suffix = '';
  while (index > 0) {
    const remainder = (index - 1) % 26;
    suffix = String.fromCharCode(65 + remainder) + suffix;
    index = Math.floor((index - 1) / 26);
  }
  return `Team ${suffix}`;
};

export const defaultTeamNames = (count: number): string[] =>
  Array.from({ length: Math.max(0, Math.min(SAMPLING_LIMITS.maxTeams, Math.floor(Number(count) || 0))) },
    (_, index) => teamNameForPosition(index + 1));

const collapse = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

export interface ParsedGameConfig {
  ok: true;
  title: string;
  instructions: string | null;
  totalNumbers: number;
  teamNames: string[];
}
export interface GameConfigError { ok: false; error: string }

/**
 * Validates a create-game payload. Every failure names the field the organizer
 * has to fix — a game is never created half-configured.
 */
export const parseGameConfig = (body: Record<string, unknown>): ParsedGameConfig | GameConfigError => {
  const totalRaw = Number(body.totalNumbers ?? body.total ?? body.totalNumber);
  if (!Number.isFinite(totalRaw) || Math.floor(totalRaw) !== totalRaw) {
    return { ok: false, error: 'Give the total number as a whole number — for example 100.' };
  }
  const totalNumbers = Math.floor(totalRaw);
  if (totalNumbers < SAMPLING_LIMITS.minTotal || totalNumbers > SAMPLING_LIMITS.maxTotal) {
    return {
      ok: false,
      error: `The total number must be between ${SAMPLING_LIMITS.minTotal} and ${SAMPLING_LIMITS.maxTotal}.`,
    };
  }

  const rawNames: unknown[] = Array.isArray(body.teamNames)
    ? body.teamNames
    : Array.isArray(body.teams) ? body.teams as unknown[] : [];
  if (!rawNames.length) return { ok: false, error: 'Add at least one team — every team gets its own link.' };
  if (rawNames.length > SAMPLING_LIMITS.maxTeams) {
    return { ok: false, error: `A game can have at most ${SAMPLING_LIMITS.maxTeams} teams.` };
  }

  const seen = new Set<string>();
  const teamNames: string[] = [];
  for (let index = 0; index < rawNames.length; index += 1) {
    const name = collapse(rawNames[index]);
    if (!name) return { ok: false, error: `Team ${index + 1} needs a name.` };
    if (name.length > SAMPLING_LIMITS.maxTeamName) {
      return { ok: false, error: `Team names must be ${SAMPLING_LIMITS.maxTeamName} characters or fewer.` };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Two teams are both called “${name}”. Give each team its own name.` };
    seen.add(key);
    teamNames.push(name);
  }

  const title = collapse(body.title).slice(0, SAMPLING_LIMITS.maxTitle) || 'Sampling game';
  const instructions = collapse(body.instructions).slice(0, SAMPLING_LIMITS.maxInstructions) || null;

  return { ok: true, title, instructions, totalNumbers, teamNames };
};

// ---------------------------------------------------------------------------
// Turn arithmetic
// ---------------------------------------------------------------------------
// The sequence is fixed and automatic: positions 1…n, then back to 1. The
// backend owns the cursor; a team can never pick who plays next.
export const nextTeamPosition = (currentPosition: number, teamCount: number): number => {
  const count = Math.max(1, Math.floor(Number(teamCount) || 1));
  const current = Math.floor(Number(currentPosition) || 0);
  if (current < 1 || current > count) return 1;
  return (current % count) + 1;
};

// ---------------------------------------------------------------------------
// Uniform random selection
// ---------------------------------------------------------------------------

/**
 * A uniform integer in `[0, maxExclusive)` drawn from the platform CSPRNG.
 *
 * Rejection sampling, not modulo: `2**32` is almost never a multiple of
 * `maxExclusive`, so a plain `% maxExclusive` would favour the low values. We
 * discard the short tail instead, which keeps every value exactly as likely as
 * every other — the fairness requirement of the game.
 */
export const uniformIndex = (
  maxExclusive: number,
  source: (target: Uint32Array) => void = (target) => { crypto.getRandomValues(target); },
): number => {
  const max = Math.floor(Number(maxExclusive));
  if (!Number.isFinite(max) || max <= 0) throw new Error('uniformIndex needs a positive range');
  if (max === 1) return 0;
  const span = 0x1_0000_0000; // 2**32
  const limit = span - (span % max);
  const buffer = new Uint32Array(1);
  // Bounded loop: a rejection is astronomically unlikely, and this guarantees
  // the function can never hang a request even with a hostile source.
  for (let attempt = 0; attempt < 128; attempt += 1) {
    source(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
  return buffer[0] % max;
};

/** Picks one number out of the still-available pool, uniformly. */
export const pickAvailableNumber = (
  available: number[],
  source?: (target: Uint32Array) => void,
): number => {
  if (!available.length) throw new Error('pickAvailableNumber called with an empty pool');
  return available[uniformIndex(available.length, source)];
};

/** Every integer in 1…total that is not yet in `drawn`. */
export const availableNumbers = (total: number, drawn: Iterable<number>): number[] => {
  const taken = new Set<number>();
  for (const value of drawn) {
    const number = Number(value);
    if (Number.isFinite(number)) taken.add(Math.floor(number));
  }
  const out: number[] = [];
  for (let number = 1; number <= total; number += 1) if (!taken.has(number)) out.push(number);
  return out;
};

// ---------------------------------------------------------------------------
// Presentation helpers shared by the API responses
// ---------------------------------------------------------------------------

/** A 1-based ordinal for the turn number ("Turn 7"). */
export const turnLabel = (turnIndex: number): string => `Turn ${Math.max(1, Math.floor(Number(turnIndex) || 0) + 1)}`;

export const percent = (part: number, whole: number): number => {
  const total = Number(whole) || 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(part) || 0) / total * 100)));
};

/**
 * Everything a TEAM is allowed to see about the shared game. Deliberately
 * explicit: no tokens, no organizer label, no admin counters. Other teams'
 * numbers are public inside a game — it is one shared pool — but their access
 * links never leave the organizer's screen.
 */
export interface TeamVisibleTeam {
  id: number;
  name: string;
  position: number;
  draws: number[];
  drawCount: number;
  status: 'active' | 'revoked';
  lastDrawAt: string | null;
}

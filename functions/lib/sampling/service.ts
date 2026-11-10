/**
 * CODE Rx SOCIETY — Sampling (Phase 1) service layer.
 *
 * All database work for the game lives here so the routes stay thin and every
 * rule is enforced in ONE place. The three guarantees the game is built on:
 *
 *   1. ONE POOL — `UNIQUE(game_id, number)` refuses a repeat at the storage
 *      layer, not in a check-then-write race.
 *   2. ONE TURN — a draw is only accepted while the game row still points at
 *      the asking team and still sits on the turn the team believes it is
 *      playing; the insert and the turn advance go through `db.batch()` as one
 *      transaction.
 *   3. ONE ANSWER — a retried request carrying the same idempotency key returns
 *      the draw that already happened instead of drawing again.
 */

import type { Context } from 'hono';
import type { Env } from '../../env';
import { audit as platformAudit } from '../vault';
import { openTeamToken, sealTeamToken, teamTokenHash } from './tokens';
import {
  availableNumbers,
  nextTeamPosition,
  pickAvailableNumber,
  percent,
  SAMPLING_STATUS_LABEL,
  type SamplingGameStatus,
  type TeamVisibleTeam,
} from './core';

export const asRows = async <T>(statement: D1PreparedStatement): Promise<T[]> => {
  const result = await statement.all<T>();
  return result.results || [];
};
export const oneRow = async <T>(statement: D1PreparedStatement): Promise<T | null> =>
  (await asRows<T>(statement))[0] ?? null;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface GameRow {
  id: number;
  public_id: string;
  title: string;
  instructions: string | null;
  total_numbers: number;
  team_count: number;
  status: SamplingGameStatus;
  current_turn: number;
  current_team_id: number | null;
  drawn_count: number;
  version: number;
  owner_user_id: number | null;
  owner_profile_id: number | null;
  organizer_label: string;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamRow {
  id: number;
  game_id: number;
  position: number;
  name: string;
  token_hash: string;
  token_enc: string | null;
  token_key_version: string | null;
  token_hint: string;
  status: 'active' | 'revoked';
  draw_count: number;
  last_draw_at: string | null;
}

export interface DrawRow {
  id: number;
  game_id: number;
  team_id: number;
  number: number;
  turn_index: number;
  drawn_at: string;
}

export interface EventRow {
  id: number;
  game_id: number;
  actor_type: string;
  actor_label: string;
  action: string;
  detail_json: string;
  created_at: string;
}

export const getGame = (db: D1Database, gameId: number): Promise<GameRow | null> =>
  oneRow<GameRow>(db.prepare('SELECT * FROM sampling_games WHERE id = ?').bind(gameId));

export const getTeams = (db: D1Database, gameId: number): Promise<TeamRow[]> =>
  asRows<TeamRow>(db.prepare('SELECT * FROM sampling_teams WHERE game_id = ? ORDER BY position ASC').bind(gameId));

export const getDraws = (db: D1Database, gameId: number): Promise<DrawRow[]> =>
  asRows<DrawRow>(db.prepare('SELECT * FROM sampling_draws WHERE game_id = ? ORDER BY turn_index ASC').bind(gameId));

export const getEvents = (db: D1Database, gameId: number, limit = 200): Promise<EventRow[]> =>
  asRows<EventRow>(db.prepare('SELECT * FROM sampling_events WHERE game_id = ? ORDER BY id DESC LIMIT ?').bind(gameId, limit));

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type SamplingActor =
  | { type: 'organizer'; label: string; userId: number | null; profileId: number | null }
  | { type: 'team'; label: string; teamId: number }
  | { type: 'phantom'; label: string; userId: number | null; profileId: number | null }
  | { type: 'system'; label: string };

/** The game's own history — every action the organizer or a team takes. */
export const recordEvent = async (
  db: D1Database,
  gameId: number,
  action: string,
  actor: SamplingActor,
  detail: Record<string, unknown> = {},
): Promise<void> => {
  try {
    await db.prepare(
      `INSERT INTO sampling_events (game_id, actor_type, actor_label, action, detail_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      gameId,
      actor.type,
      String(actor.label || '').slice(0, 160),
      action.slice(0, 80),
      JSON.stringify(detail).slice(0, 8_000),
    ).run();
  } catch (error) {
    console.error('[sampling] event write failed:', error);
  }
};

/** The platform's audit trail — organizer-level actions also reach PHANTOM. */
export const auditOrganizer = async (
  c: Context<{ Bindings: Env }>,
  actor: { userId: number | null; profileId: number | null },
  action: string,
  gameId: number | null,
  details: Record<string, unknown> = {},
): Promise<void> => {
  try {
    await platformAudit(
      c.env.DB,
      actor.userId ? { userId: actor.userId, profileId: actor.profileId } as any : null,
      `sampling.${action}`,
      'sampling_game',
      gameId,
      details,
    );
  } catch (error) {
    console.error('[sampling] platform audit failed:', error);
  }
};

// ---------------------------------------------------------------------------
// Organizer identity + ownership
// ---------------------------------------------------------------------------

export interface SamplingOrganizer {
  userId: number | null;
  profileId: number | null;
  name: string;
  email: string;
  isPhantom: boolean;
}

/**
 * Sampling reuses the Society's existing member session — there is no second
 * authentication system. Only an active member (or PHANTOM) may open it.
 */
export const samplingOrganizer = async (c: Context<{ Bindings: Env }>): Promise<SamplingOrganizer | null> => {
  const { memberFromRequest } = await import('../cgm/service');
  const member = await memberFromRequest(c).catch(() => null);
  if (!member) return null;
  const isActive = member.memberStatus === 'active';
  if (!isActive && !member.isPhantom) return null;
  return {
    userId: member.userId ?? null,
    profileId: member.profileId ?? null,
    name: member.name || member.email,
    email: member.email,
    isPhantom: Boolean(member.isPhantom),
  };
};

/** A game belongs to the organizer who created it; PHANTOM may inspect any. */
export const canManage = (game: GameRow, organizer: SamplingOrganizer): boolean =>
  organizer.isPhantom || (game.owner_user_id !== null && Number(game.owner_user_id) === Number(organizer.userId));

/**
 * Per-IP throttle for token lookups. The shared rate limiter buckets by
 * path — and a guessed token IS the path — so it cannot see a brute-force
 * sweep. This bucket is global per IP across every sampling route.
 */
const g = globalThis as any;
g.__samplingThrottle ??= new Map<string, { count: number; resetAt: number }>();
export const samplingThrottle = (c: Context<{ Bindings: Env }>, bucket: string, limit: number, windowSec: number): boolean => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const key = `${ip}:${bucket}`;
  const now = Date.now();
  const store: Map<string, { count: number; resetAt: number }> = g.__samplingThrottle;
  if (store.size > 10_000) {
    for (const [entryKey, entry] of store) if (entry.resetAt <= now) store.delete(entryKey);
  }
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
};

// ---------------------------------------------------------------------------
// Snapshots (what the two frontends receive)
// ---------------------------------------------------------------------------

export interface TeamSnapshot {
  id: number;
  name: string;
  position: number;
  status: 'active' | 'revoked';
  drawCount: number;
  numbers: number[];
  lastDrawAt: string | null;
  /** Only the organizer snapshot fills these in. */
  link?: string | null;
  tokenHint?: string;
  tokenSealed?: boolean;
}

export interface DrawSnapshot {
  teamId: number;
  teamName: string;
  number: number;
  turn: number;
  drawnAt: string;
}

export interface EventSnapshot {
  id: number;
  action: string;
  actor: string;
  actorType: string;
  detail: Record<string, unknown>;
  at: string;
}

const parseDetail = (value: string | null | undefined): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const gameProgress = (game: GameRow) => {
  const total = Number(game.total_numbers || 0);
  const drawn = Number(game.drawn_count || 0);
  return {
    total,
    drawn,
    remaining: Math.max(0, total - drawn),
    percent: percent(drawn, total),
  };
};

export const gamePublicState = (game: GameRow, teams: TeamRow[], draws: DrawRow[]) => {
  const currentTeam = teams.find((team) => Number(team.id) === Number(game.current_team_id)) || null;
  return {
    id: Number(game.id),
    title: game.title,
    instructions: game.instructions,
    status: game.status,
    statusLabel: SAMPLING_STATUS_LABEL[game.status] || game.status,
    totalNumbers: Number(game.total_numbers),
    teamCount: Number(game.team_count),
    turn: Number(game.current_turn),
    turnNumber: Number(game.current_turn) + 1,
    currentTeamId: currentTeam ? Number(currentTeam.id) : null,
    currentTeamName: currentTeam ? currentTeam.name : null,
    drawnCount: Number(game.drawn_count),
    remaining: Math.max(0, Number(game.total_numbers) - Number(game.drawn_count)),
    progress: percent(Number(game.drawn_count), Number(game.total_numbers)),
    startedAt: game.started_at,
    pausedAt: game.paused_at,
    completedAt: game.completed_at,
    endedAt: game.ended_at,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
    version: Number(game.version),
    latestDraw: draws.length
      ? { number: draws[draws.length - 1].number, teamId: Number(draws[draws.length - 1].team_id) }
      : null,
  };
};

const teamNumbers = (draws: DrawRow[]): Map<number, number[]> => {
  const map = new Map<number, number[]>();
  for (const draw of draws) {
    const list = map.get(Number(draw.team_id)) || [];
    list.push(Number(draw.number));
    map.set(Number(draw.team_id), list);
  }
  return map;
};

export const teamSnapshots = (teams: TeamRow[], draws: DrawRow[]): TeamSnapshot[] => {
  const numbers = teamNumbers(draws);
  return teams.map((team) => ({
    id: Number(team.id),
    name: team.name,
    position: Number(team.position),
    status: team.status,
    drawCount: Number(team.draw_count || 0),
    numbers: numbers.get(Number(team.id)) || [],
    lastDrawAt: team.last_draw_at,
  }));
};

export const drawSnapshots = (draws: DrawRow[], teams: TeamRow[]): DrawSnapshot[] => {
  const names = new Map(teams.map((team) => [Number(team.id), team.name]));
  return draws.map((draw) => ({
    teamId: Number(draw.team_id),
    teamName: names.get(Number(draw.team_id)) || 'A team',
    number: Number(draw.number),
    turn: Number(draw.turn_index) + 1,
    drawnAt: draw.drawn_at,
  }));
};

export const eventSnapshots = (events: EventRow[]): EventSnapshot[] =>
  events.map((event) => ({
    id: Number(event.id),
    action: event.action,
    actor: event.actor_label,
    actorType: event.actor_type,
    detail: parseDetail(event.detail_json),
    at: event.created_at,
  }));

export interface OrganizerGameBundle {
  game: ReturnType<typeof gamePublicState>;
  organizer: string;
  ownerUserId: number | null;
  teams: TeamSnapshot[];
  draws: DrawSnapshot[];
  events: EventSnapshot[];
  canManage: boolean;
}

/** The full organizer view, with each team's live link. */
export const organizerBundle = async (
  env: { DB: D1Database; CGM_INVITATION_KEYS?: string; JWT_SECRET?: string },
  game: GameRow,
  origin: string,
  options: { canManage: boolean },
): Promise<OrganizerGameBundle> => {
  const [teams, draws, events] = await Promise.all([
    getTeams(env.DB, Number(game.id)),
    getDraws(env.DB, Number(game.id)),
    getEvents(env.DB, Number(game.id)),
  ]);
  const snapshots = teamSnapshots(teams, draws);
  const withLinks: TeamSnapshot[] = [];
  for (const snapshot of snapshots) {
    const row = teams.find((team) => Number(team.id) === snapshot.id);
    let link: string | null = null;
    let sealed = false;
    if (row) {
      const token = await openTeamToken(env, row.token_enc);
      if (token) {
        link = `${origin}/#sampling/team/${token}`;
        sealed = true;
      }
    }
    withLinks.push({
      ...snapshot,
      link,
      tokenHint: row?.token_hint || '',
      tokenSealed: sealed,
    });
  }
  return {
    game: gamePublicState(game, teams, draws),
    organizer: game.organizer_label,
    ownerUserId: game.owner_user_id === null ? null : Number(game.owner_user_id),
    teams: withLinks,
    draws: drawSnapshots(draws, teams),
    events: eventSnapshots(events),
    canManage: options.canManage,
  };
};

/** The team view: shared game state, no tokens, no organizer controls. */
export const teamBundle = async (
  env: { DB: D1Database },
  game: GameRow,
  team: TeamRow,
  token?: string,
) => {
  const [teams, draws] = await Promise.all([getTeams(env.DB, Number(game.id)), getDraws(env.DB, Number(game.id))]);
  const snapshots = teamSnapshots(teams, draws);
  const mine = snapshots.find((entry) => entry.id === Number(team.id));
  const isMyTurn = game.status === 'active' && Number(game.current_team_id) === Number(team.id);
  const visible: TeamVisibleTeam[] = snapshots.map((entry) => ({
    id: entry.id,
    name: entry.name,
    position: entry.position,
    draws: entry.numbers,
    drawCount: entry.drawCount,
    status: entry.status,
    lastDrawAt: entry.lastDrawAt,
  }));
  return {
    game: gamePublicState(game, teams, draws),
    team: {
      id: Number(team.id),
      name: team.name,
      position: Number(team.position),
      status: team.status,
      numbers: mine?.numbers || [],
      drawCount: mine?.drawCount || 0,
      lastDrawAt: mine?.lastDrawAt || null,
    },
    teams: visible,
    draws: drawSnapshots(draws, teams),
    isMyTurn,
    // A sealed copy exists only so the server can answer; never send the token.
    hasLink: Boolean(token),
  };
};

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreatedGame {
  game: GameRow;
  teams: Array<{ id: number; name: string; position: number; token: string }>;
}

export const createGame = async (
  env: { DB: D1Database; CGM_INVITATION_KEYS?: string; JWT_SECRET?: string },
  input: {
    title: string;
    instructions: string | null;
    totalNumbers: number;
    teamNames: string[];
    owner: SamplingOrganizer;
    publicId: string;
    newToken: () => string;
  },
): Promise<CreatedGame> => {
  const db = env.DB;
  const insert = await db.prepare(
    `INSERT INTO sampling_games
       (public_id, title, instructions, total_numbers, team_count, status, owner_user_id, owner_profile_id, organizer_label, current_turn, current_team_id)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0, NULL)`,
  ).bind(
    input.publicId,
    input.title,
    input.instructions,
    input.totalNumbers,
    input.teamNames.length,
    input.owner.userId,
    input.owner.profileId,
    input.owner.name.slice(0, 160),
  ).run();
  const gameId = Number(insert.meta?.last_row_id);
  const game = await getGame(db, gameId);
  if (!game) throw new Error('The game could not be created.');

  const teams: CreatedGame['teams'] = [];
  for (let index = 0; index < input.teamNames.length; index += 1) {
    const token = input.newToken();
    const hash = await teamTokenHash(token);
    const sealed = await sealTeamToken(env, token);
    const result = await db.prepare(
      `INSERT INTO sampling_teams (game_id, position, name, token_hash, token_enc, token_key_version, token_hint, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    ).bind(
      gameId,
      index + 1,
      input.teamNames[index],
      hash,
      sealed?.sealed ?? null,
      sealed?.keyVersion ?? null,
      `${token.slice(0, 8)}…`,
    ).run();
    teams.push({ id: Number(result.meta?.last_row_id), name: input.teamNames[index], position: index + 1, token });
  }
  return { game, teams };
};

// ---------------------------------------------------------------------------
// The draw — atomic, idempotent, fair
// ---------------------------------------------------------------------------

export type DrawOutcome =
  | { ok: true; draw: DrawRow; replayed: boolean; game: GameRow; team: TeamRow }
  | { ok: false; code: 'not_active' | 'not_your_turn' | 'no_numbers' | 'revoked' | 'conflict' | 'game_over'; message: string };

const readDrawByKey = (db: D1Database, gameId: number, key: string): Promise<DrawRow | null> =>
  oneRow<DrawRow>(db.prepare(
    'SELECT * FROM sampling_draws WHERE game_id = ? AND idempotency_key = ? LIMIT 1',
  ).bind(gameId, key));

/**
 * Draws exactly one number for one team, at most once.
 *
 * The number is chosen from the numbers still free at the moment of the
 * attempt, then written by a statement that re-checks (inside SQL, in one
 * transaction) that the turn is still the asking team's, that the turn has no
 * draw yet and that the number is still free. If another request won the race
 * the whole batch is a no-op and the caller is told what happened — never
 * half-applied.
 */
export const drawNumber = async (
  db: D1Database,
  input: { game: GameRow; team: TeamRow; teams: TeamRow[]; idempotencyKey: string; pick?: (available: number[]) => number },
): Promise<DrawOutcome> => {
  const gameId = Number(input.game.id);
  const teamId = Number(input.team.id);
  const key = String(input.idempotencyKey || '').slice(0, 120);

  if (key) {
    const existing = await readDrawByKey(db, gameId, key);
    if (existing) {
      return {
        ok: true,
        draw: existing,
        replayed: true,
        game: input.game,
        team: input.team,
      };
    }
  }

  if (input.team.status === 'revoked') {
    return { ok: false, code: 'revoked', message: 'This team link has been revoked by the organizer.' };
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const game = await getGame(db, gameId);
    if (!game) return { ok: false, code: 'game_over', message: 'This game no longer exists.' };
    if (game.status === 'completed') return { ok: false, code: 'game_over', message: 'This game is complete — every number has been drawn.' };
    if (game.status === 'ended') return { ok: false, code: 'game_over', message: 'The organizer ended this game.' };
    if (game.status === 'paused') return { ok: false, code: 'not_active', message: 'The organizer paused the game. Hold tight.' };
    if (game.status !== 'active') return { ok: false, code: 'not_active', message: 'The game has not started yet.' };
    if (Number(game.current_team_id) !== teamId) {
      return { ok: false, code: 'not_your_turn', message: 'It is not your turn yet.' };
    }

    const teams = await getTeams(db, gameId);
    const draws = await getDraws(db, gameId);
    const taken = draws.map((draw) => Number(draw.number));
    const pool = availableNumbers(Number(game.total_numbers), taken);
    if (!pool.length) {
      return { ok: false, code: 'no_numbers', message: 'Every number has been drawn.' };
    }

    const number = input.pick ? input.pick(pool) : pickAvailableNumber(pool);
    if (!pool.includes(number)) {
      // A caller-supplied picker must not be able to conjure a number.
      return { ok: false, code: 'conflict', message: 'That number is not available.' };
    }

    const turn = Number(game.current_turn);
    const currentPosition = Number(teams.find((entry) => Number(entry.id) === teamId)?.position || 0);
    const nextPosition = nextTeamPosition(currentPosition, teams.length);
    const nextTeam = teams.find((entry) => Number(entry.position) === nextPosition) || null;
    const nextStatus: SamplingGameStatus = Number(game.drawn_count) + 1 >= Number(game.total_numbers)
      ? 'completed'
      : 'active';

    // D1 runs a batch as one transaction; a unique-constraint refusal aborts it
    // and surfaces as a rejected promise. That is a REFUSAL, not a failure: the
    // caller is told what happened and may retry with a fresh pick.
    let results: any[] = [];
    let batchFailed = false;
    try {
      results = await db.batch([
      // 1. The draw itself — refused unless the turn is genuinely this team's,
      //    the turn has no draw yet, and the number is still free.
      db.prepare(
        `INSERT INTO sampling_draws (game_id, team_id, number, turn_index, idempotency_key, drawn_at)
         SELECT g.id, ?, ?, g.current_turn, ?, CURRENT_TIMESTAMP
           FROM sampling_games g
          WHERE g.id = ?
            AND g.status = 'active'
            AND g.current_team_id = ?
            AND g.current_turn = ?
            AND NOT EXISTS (SELECT 1 FROM sampling_draws d WHERE d.game_id = g.id AND d.number = ?)
            AND NOT EXISTS (SELECT 1 FROM sampling_draws d WHERE d.game_id = g.id AND d.turn_index = g.current_turn)
            AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM sampling_draws d WHERE d.game_id = g.id AND d.idempotency_key = ?))`,
      ).bind(teamId, number, key || null, gameId, teamId, turn, number, key || null, key || null),

      // 2. Advance the turn — only if the draw above actually landed.
      db.prepare(
        `UPDATE sampling_games
            SET current_turn = current_turn + 1,
                drawn_count = drawn_count + 1,
                current_team_id = ?,
                status = ?,
                completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'active' AND current_team_id = ? AND current_turn = ?
            AND EXISTS (SELECT 1 FROM sampling_draws d WHERE d.game_id = sampling_games.id AND d.turn_index = ?)`,
      ).bind(nextTeam ? Number(nextTeam.id) : null, nextStatus, nextStatus, gameId, teamId, turn, turn),

      // 3. Team counters — same guard.
      db.prepare(
        `UPDATE sampling_teams
            SET draw_count = draw_count + 1, last_draw_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND EXISTS (SELECT 1 FROM sampling_draws d WHERE d.game_id = ? AND d.turn_index = ?)`,
      ).bind(teamId, gameId, turn),

      // 4. The game's own history entry — same guard.
      db.prepare(
        `INSERT INTO sampling_events (game_id, actor_type, actor_label, action, detail_json)
         SELECT ?, 'team', ?, 'number_drawn', ?
          WHERE EXISTS (SELECT 1 FROM sampling_draws d WHERE d.game_id = ? AND d.turn_index = ?)`,
      ).bind(
        gameId,
        input.team.name.slice(0, 160),
        JSON.stringify({ number, turn: turn + 1, teamId, teamName: input.team.name }),
        gameId,
        turn,
      ),
      ]);
    } catch (error: any) {
      batchFailed = true;
      console.warn('[sampling] draw batch refused:', String(error?.message || error).slice(0, 160));
    }

    const written = !batchFailed && Number(results?.[0]?.meta?.changes || 0) > 0;
    if (written) {
      const draw = key
        ? (await readDrawByKey(db, gameId, key))
        : (await oneRow<DrawRow>(db.prepare(
          'SELECT * FROM sampling_draws WHERE game_id = ? AND turn_index = ?',
        ).bind(gameId, turn)));
      const freshGame = (await getGame(db, gameId)) || game;
      const freshTeam = (await oneRow<TeamRow>(db.prepare('SELECT * FROM sampling_teams WHERE id = ?').bind(teamId))) || input.team;
      return { ok: true, draw: draw as DrawRow, replayed: false, game: freshGame, team: freshTeam };
    }

    // The write was refused: work out why, without guessing.
    if (key) {
      const raced = await readDrawByKey(db, gameId, key);
      if (raced) return { ok: true, draw: raced, replayed: true, game, team: input.team };
    }
    const after = await getGame(db, gameId);
    if (!after) return { ok: false, code: 'game_over', message: 'This game no longer exists.' };
    if (after.status === 'paused') return { ok: false, code: 'not_active', message: 'The organizer paused the game. Hold tight.' };
    if (after.status === 'completed') return { ok: false, code: 'game_over', message: 'This game is complete — every number has been drawn.' };
    if (after.status === 'ended') return { ok: false, code: 'game_over', message: 'The organizer ended this game.' };
    if (Number(after.current_team_id) !== teamId) {
      return { ok: false, code: 'not_your_turn', message: 'It is not your turn yet.' };
    }
    // The only remaining explanation is a number collision: pick again.
  }

  return { ok: false, code: 'conflict', message: 'The board moved while you were drawing. Tap SPIN again.' };
};

// ---------------------------------------------------------------------------
// Organizer controls
// ---------------------------------------------------------------------------

export type ControlResult = { ok: true; game: GameRow } | { ok: false; message: string; status: 400 | 409 };

export const startGame = async (db: D1Database, game: GameRow): Promise<ControlResult> => {
  if (game.status === 'active') return { ok: true, game };
  if (game.status !== 'draft' && game.status !== 'paused') {
    return { ok: false, message: 'This game has already finished. Start a new one.', status: 409 };
  }
  const teams = await getTeams(db, Number(game.id));
  const first = teams.find((team) => team.status === 'active') || teams[0];
  if (!first) return { ok: false, message: 'This game has no teams.', status: 409 };
  await db.prepare(
    `UPDATE sampling_games
        SET status = 'active', current_team_id = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            paused_at = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('draft','paused')`,
  ).bind(Number(first.id), Number(game.id)).run();
  return { ok: true, game: (await getGame(db, Number(game.id))) as GameRow };
};

export const pauseGame = async (db: D1Database, gameId: number): Promise<ControlResult> => {
  const changed = await db.prepare(
    `UPDATE sampling_games SET status = 'paused', paused_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'active'`,
  ).bind(gameId).run();
  if (Number(changed.meta?.changes || 0) === 0) {
    return { ok: false, message: 'Only a game in play can be paused.', status: 409 };
  }
  return { ok: true, game: (await getGame(db, gameId)) as GameRow };
};

export const resumeGame = async (db: D1Database, gameId: number): Promise<ControlResult> => {
  const changed = await db.prepare(
    `UPDATE sampling_games SET status = 'active', paused_at = NULL, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'paused'`,
  ).bind(gameId).run();
  if (Number(changed.meta?.changes || 0) === 0) {
    return { ok: false, message: 'Only a paused game can be resumed.', status: 409 };
  }
  return { ok: true, game: (await getGame(db, gameId)) as GameRow };
};

export const endGame = async (db: D1Database, gameId: number): Promise<ControlResult> => {
  const changed = await db.prepare(
    `UPDATE sampling_games SET status = 'ended', ended_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('draft','active','paused')`,
  ).bind(gameId).run();
  if (Number(changed.meta?.changes || 0) === 0) {
    return { ok: false, message: 'This game has already finished.', status: 409 };
  }
  return { ok: true, game: (await getGame(db, gameId)) as GameRow };
};

/**
 * Skips the team whose turn it is — explicitly, with an audit record, and only
 * when the organizer confirmed it and the game is exactly where they think it
 * is (`expectedTurn`). A skip never removes a number and never draws one.
 */
export const skipTurn = async (
  db: D1Database,
  gameId: number,
  expectedTurn: number,
): Promise<ControlResult & { skippedTeam?: TeamRow }> => {
  const game = await getGame(db, gameId);
  if (!game) return { ok: false, message: 'That game could not be found.', status: 409 };
  if (game.status !== 'active') return { ok: false, message: 'Only a game in play has a turn to skip.', status: 409 };
  if (Number(expectedTurn) !== Number(game.current_turn)) {
    return { ok: false, message: 'The board moved. Check the current team and try again.', status: 409 };
  }
  const teams = await getTeams(db, gameId);
  const current = teams.find((team) => Number(team.id) === Number(game.current_team_id)) || null;
  if (!current) return { ok: false, message: 'There is no active team to skip.', status: 409 };
  const nextPosition = nextTeamPosition(Number(current.position), teams.length);
  const next = teams.find((team) => Number(team.position) === nextPosition) || null;
  const turn = Number(game.current_turn);
  const changed = await db.prepare(
    `UPDATE sampling_games
        SET current_turn = current_turn + 1, current_team_id = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'active' AND current_turn = ? AND current_team_id = ?`,
  ).bind(next ? Number(next.id) : null, gameId, turn, Number(current.id)).run();
  if (Number(changed.meta?.changes || 0) === 0) {
    return { ok: false, message: 'The board moved. Check the current team and try again.', status: 409 };
  }
  await db.prepare(
    `INSERT INTO sampling_events (game_id, actor_type, actor_label, action, detail_json)
     VALUES (?, 'organizer', 'Organizer', 'turn_skipped', ?)`,
  ).bind(gameId, JSON.stringify({ teamId: Number(current.id), teamName: current.name, turn: turn + 1 })).run();
  return { ok: true, game: (await getGame(db, gameId)) as GameRow, skippedTeam: current };
};

/** Issues a brand-new token for a team. The old link stops working at once. */
export const regenerateTeamToken = async (
  env: { DB: D1Database; CGM_INVITATION_KEYS?: string; JWT_SECRET?: string },
  team: TeamRow,
  newToken: string,
): Promise<{ ok: boolean; hint: string; token: string }> => {
  const hash = await teamTokenHash(newToken);
  const sealed = await sealTeamToken(env, newToken);
  await env.DB.prepare(
    `UPDATE sampling_teams
        SET token_hash = ?, token_enc = ?, token_key_version = ?, token_hint = ?, status = 'active',
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
  ).bind(hash, sealed?.sealed ?? null, sealed?.keyVersion ?? null, `${newToken.slice(0, 8)}…`, Number(team.id)).run();
  return { ok: true, hint: `${newToken.slice(0, 8)}…`, token: newToken };
};

export const setTeamStatus = async (db: D1Database, team: TeamRow, status: 'active' | 'revoked'): Promise<void> => {
  await db.prepare('UPDATE sampling_teams SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(status, Number(team.id)).run();
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const csvCell = (value: unknown): string => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Results as CSV — one row per draw plus a summary header. The organizer's copy. */
export const resultsCsv = (game: GameRow, teams: TeamRow[], draws: DrawRow[]): string => {
  const names = new Map(teams.map((team) => [Number(team.id), team.name]));
  const lines: string[] = [];
  lines.push(`Sampling game,${csvCell(game.title)}`);
  lines.push(`Game ID,${game.public_id}`);
  lines.push(`Status,${SAMPLING_STATUS_LABEL[game.status] || game.status}`);
  lines.push(`Numbers,1-${game.total_numbers}`);
  lines.push(`Teams,${game.team_count}`);
  lines.push(`Drawn,${game.drawn_count}`);
  lines.push(`Remaining,${Math.max(0, Number(game.total_numbers) - Number(game.drawn_count))}`);
  lines.push(`Started,${game.started_at || ''}`);
  lines.push(`Completed,${game.completed_at || game.ended_at || ''}`);
  lines.push('');
  lines.push('Turn,Team,Number,Drawn at');
  for (const draw of draws) {
    lines.push([
      Number(draw.turn_index) + 1,
      csvCell(names.get(Number(draw.team_id)) || ''),
      Number(draw.number),
      csvCell(draw.drawn_at),
    ].join(','));
  }
  lines.push('');
  lines.push('Team,Position,Draws,Numbers');
  for (const team of teams) {
    const numbers = draws.filter((draw) => Number(draw.team_id) === Number(team.id)).map((draw) => Number(draw.number));
    lines.push([csvCell(team.name), Number(team.position), numbers.length, csvCell(numbers.join(' '))].join(','));
  }
  return lines.join('\n');
};

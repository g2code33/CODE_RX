/**
 * CODE Rx SOCIETY — Sampling (Phase 1) routes.
 *
 * Two surfaces, registered additively from `functions/class-group-routes.ts`:
 *
 *   Organizer   /api/sampling/*                 Society member bearer token
 *   Team        /api/sampling/team/<token>*     the team's own link token
 *
 * The organizer surface manages the game; the team surface plays it. A team
 * token can never reach an organizer endpoint, and the organizer endpoints never
 * hand another team's token to a team.
 */

import type { Hono } from 'hono';
import { randomToken } from '../vault';
import { requestOrigin } from '../link-address';
import { checkRateLimit } from '../rate-limit';
import { newTeamToken, teamTokenHash } from './tokens';
import {
  getEvents,
  getGame,
  getTeams,
  getDraws,
  canManage,
  createGame,
  drawNumber,
  endGame,
  gamePublicState,
  organizerBundle,
  oneRow,
  auditOrganizer,
  pauseGame,
  recordEvent,
  regenerateTeamToken,
  resumeGame,
  resultsCsv,
  samplingOrganizer,
  samplingThrottle,
  setTeamStatus,
  skipTurn,
  startGame,
  teamBundle,
  type GameRow,
  type TeamRow,
} from './service';
import { parseGameConfig } from './core';

const fail = (c: any, message: string, status = 400) =>
  c.json({ success: false, error: message }, status);
const ok = (c: any, data: unknown) => c.json({ success: true, data });

const readJson = async (c: any): Promise<Record<string, unknown>> => {
  try { return await c.req.json() as Record<string, unknown>; } catch { return {}; }
};

const gameIdFrom = (c: any): number => {
  const id = Number(c.req.param('id'));
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : 0;
};

export const registerSamplingRoutes = (app: Hono<any>) => {
  // -------------------------------------------------------------------------
  // Organizer surface
  // -------------------------------------------------------------------------

  /** The workspace home: active games and previous games, nothing else. */
  app.get('/api/sampling/games', async (c: any) => {
    const organizer = await samplingOrganizer(c);
    if (!organizer) return fail(c, 'Sign in as a Society member to open Sampling.', 401);
    if (!checkRateLimit(c, 240, 60)) return fail(c, 'Too many requests. Give it a second.', 429);

    // PHANTOM oversight may inspect every game; an organizer sees their own.
    const statement = organizer.isPhantom
      ? c.env.DB.prepare('SELECT * FROM sampling_games ORDER BY id DESC LIMIT 100')
      : c.env.DB.prepare('SELECT * FROM sampling_games WHERE owner_user_id = ? ORDER BY id DESC LIMIT 100').bind(organizer.userId);
    const rows = (await statement.all<GameRow>()).results || [];

    const games = [] as Array<ReturnType<typeof gamePublicState> & { organizer: string }>;
    for (const row of rows) {
      const [teams, draws] = await Promise.all([getTeams(c.env.DB, Number(row.id)), getDraws(c.env.DB, Number(row.id))]);
      games.push({ ...gamePublicState(row, teams, draws), organizer: row.organizer_label });
    }
    return ok(c, {
      games,
      active: games.filter((game) => ['draft', 'active', 'paused'].includes(String(game.status))),
      previous: games.filter((game) => ['completed', 'ended'].includes(String(game.status))),
      organizer: organizer.name,
      isPhantom: organizer.isPhantom,
    });
  });

  /** Create a game: validated configuration, one secure link per team. */
  app.post('/api/sampling/games', async (c: any) => {
    const organizer = await samplingOrganizer(c);
    if (!organizer) return fail(c, 'Sign in as a Society member to open Sampling.', 401);
    if (!checkRateLimit(c, 30, 3600)) return fail(c, 'That is a lot of games. Try again in a little while.', 429);

    const body = await readJson(c);
    const parsed = parseGameConfig(body);
    if (!parsed.ok) return fail(c, parsed.error, 400);

    const origin = requestOrigin(c.req.raw) || 'https://coderxsociety.pages.dev';
    let created;
    try {
      created = await createGame(c.env, {
        title: parsed.title,
        instructions: parsed.instructions,
        totalNumbers: parsed.totalNumbers,
        teamNames: parsed.teamNames,
        owner: organizer,
        publicId: randomToken().slice(0, 16),
        newToken: newTeamToken,
      });
    } catch (error: any) {
      console.error('[sampling] create failed:', error);
      return fail(c, 'The game could not be created. Please try again.', 500);
    }

    await recordEvent(c.env.DB, Number(created.game.id), 'game_created', {
      type: organizer.isPhantom ? 'phantom' : 'organizer',
      label: organizer.name,
      userId: organizer.userId,
      profileId: organizer.profileId,
    }, { totalNumbers: parsed.totalNumbers, teamCount: parsed.teamNames.length, title: parsed.title });

    const teams = await getTeams(c.env.DB, Number(created.game.id));
    await Promise.all(teams.map((team) => setTeamStatus(c.env.DB, team, 'active')));
    const bundle = await organizerBundle(c.env, created.game, origin, { canManage: true });
    // Newly generated links are shown once here as well as in the link desk.
    bundle.teams = bundle.teams.map((team) => {
      const fresh = created.teams.find((entry) => entry.id === team.id);
      return fresh ? { ...team, link: `${origin}/#sampling/team/${fresh.token}` } : team;
    });
    return ok(c, bundle);
  });

  /** The organizer's live view of one game. */
  app.get('/api/sampling/games/:id', async (c: any) => {
    const organizer = await samplingOrganizer(c);
    if (!organizer) return fail(c, 'Sign in as a Society member to open Sampling.', 401);
    if (!checkRateLimit(c, 240, 60)) return fail(c, 'Too many requests. Give it a second.', 429);
    const game = await getGame(c.env.DB, gameIdFrom(c));
    if (!game) return fail(c, 'That game could not be found.', 404);
    if (!canManage(game, organizer)) return fail(c, 'This game belongs to another organizer.', 403);
    const origin = requestOrigin(c.req.raw) || 'https://coderxsociety.pages.dev';
    return ok(c, {
      ...(await organizerBundle(c.env, game, origin, { canManage: true })),
      ownerUserId: game.owner_user_id === null ? null : Number(game.owner_user_id),
      organizerName: organizer.name,
    });
  });

  const withManagedGame = async (c: any) => {
    const organizer = await samplingOrganizer(c);
    if (!organizer) return { error: fail(c, 'Sign in as a Society member to open Sampling.', 401) };
    const game = await getGame(c.env.DB, gameIdFrom(c));
    if (!game) return { error: fail(c, 'That game could not be found.', 404) };
    if (!canManage(game, organizer)) return { error: fail(c, 'This game belongs to another organizer.', 403) };
    return { organizer, game };
  };

  const finish = async (c: any, game: GameRow, action: string, organizer: any, detail: Record<string, unknown> = {}) => {
    // PHANTOM's audit trail sees every organizer move, alongside the game's own
    // history — a skip is never a private action.
    await auditOrganizer(c, { userId: organizer.userId, profileId: organizer.profileId }, action, Number(game.id), detail);
    await recordEvent(c.env.DB, Number(game.id), action, {
      type: organizer.isPhantom ? 'phantom' : 'organizer',
      label: organizer.name,
      userId: organizer.userId,
      profileId: organizer.profileId,
    }, detail);
    const origin = requestOrigin(c.req.raw) || 'https://coderxsociety.pages.dev';
    return ok(c, await organizerBundle(c.env, game, origin, { canManage: true }));
  };

  app.post('/api/sampling/games/:id/start', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    if (!checkRateLimit(c, 120, 60)) return fail(c, 'Too many requests. Give it a second.', 429);
    const result = await startGame(c.env.DB, managed.game);
    if (!result.ok) return fail(c, result.message, result.status);
    return finish(c, result.game, 'game_started', managed.organizer, {});
  });

  app.post('/api/sampling/games/:id/pause', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const result = await pauseGame(c.env.DB, Number(managed.game.id));
    if (!result.ok) return fail(c, result.message, result.status);
    return finish(c, result.game, 'game_paused', managed.organizer, {});
  });

  app.post('/api/sampling/games/:id/resume', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const result = await resumeGame(c.env.DB, Number(managed.game.id));
    if (!result.ok) return fail(c, result.message, result.status);
    return finish(c, result.game, 'game_resumed', managed.organizer, {});
  });

  app.post('/api/sampling/games/:id/end', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const body = await readJson(c);
    if (body.confirm !== true) {
      return fail(c, 'Confirm that you want to end this game — it cannot be un-ended.', 400);
    }
    const result = await endGame(c.env.DB, Number(managed.game.id));
    if (!result.ok) return fail(c, result.message, result.status);
    return finish(c, result.game, 'game_ended', managed.organizer, { reason: String(body.reason || '').slice(0, 300) });
  });

  /** Skip the team whose turn it is. Explicit, confirmed, audited. */
  app.post('/api/sampling/games/:id/skip', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    if (!checkRateLimit(c, 60, 60)) return fail(c, 'Too many requests. Give it a second.', 429);
    const body = await readJson(c);
    if (body.confirm !== true) return fail(c, 'Confirm the skip — a skipped turn is recorded in the game history.', 400);
    const expectedTurn = Number(body.expectedTurn);
    if (!Number.isFinite(expectedTurn)) return fail(c, 'Refresh the game, then try the skip again.', 400);
    const result = await skipTurn(c.env.DB, Number(managed.game.id), expectedTurn);
    if (!result.ok) return fail(c, result.message, result.status);
    return finish(c, result.game, 'turn_skipped_confirmed', managed.organizer, {
      teamId: result.skippedTeam ? Number(result.skippedTeam.id) : null,
      teamName: result.skippedTeam?.name || '',
      reason: String(body.reason || '').slice(0, 300),
      turn: expectedTurn + 1,
    });
  });

  const teamOf = async (c: any, gameId: number) => {
    const teamId = Number(c.req.param('teamId'));
    if (!Number.isFinite(teamId) || teamId <= 0) return null;
    return oneRow<TeamRow>(c.env.DB.prepare('SELECT * FROM sampling_teams WHERE id = ? AND game_id = ?')
      .bind(Math.floor(teamId), gameId));
  };

  app.post('/api/sampling/games/:id/teams/:teamId/regenerate', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const team = await teamOf(c, Number(managed.game.id));
    if (!team) return fail(c, 'That team could not be found.', 404);
    const body = await readJson(c);
    if (body.confirm !== true) return fail(c, 'Confirm a new link — the current link stops working immediately.', 400);
    const token = newTeamToken();
    const result = await regenerateTeamToken(c.env, team, token);
    const origin = requestOrigin(c.req.raw) || 'https://coderxsociety.pages.dev';
    await recordEvent(c.env.DB, Number(managed.game.id), 'team_link_regenerated', {
      type: managed.organizer.isPhantom ? 'phantom' : 'organizer',
      label: managed.organizer.name,
      userId: managed.organizer.userId,
      profileId: managed.organizer.profileId,
    }, { teamId: Number(team.id), teamName: team.name });
    return ok(c, {
      teamId: Number(team.id),
      teamName: team.name,
      hint: result.hint,
      link: `${origin}/#sampling/team/${token}`,
      bundle: await organizerBundle(c.env, managed.game, origin, { canManage: true }),
    });
  });

  app.post('/api/sampling/games/:id/teams/:teamId/revoke', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const team = await teamOf(c, Number(managed.game.id));
    if (!team) return fail(c, 'That team could not be found.', 404);
    const body = await readJson(c);
    if (body.confirm !== true) return fail(c, 'Confirm the revoke — that team can no longer open its link.', 400);
    await setTeamStatus(c.env.DB, team, 'revoked');
    await recordEvent(c.env.DB, Number(managed.game.id), 'team_link_revoked', {
      type: managed.organizer.isPhantom ? 'phantom' : 'organizer',
      label: managed.organizer.name,
      userId: managed.organizer.userId,
      profileId: managed.organizer.profileId,
    }, { teamId: Number(team.id), teamName: team.name });
    const origin = requestOrigin(c.req.raw) || 'https://coderxsociety.pages.dev';
    return ok(c, await organizerBundle(c.env, managed.game, origin, { canManage: true }));
  });

  /** Restoring a team always issues a new link — a revoked one never comes back. */
  app.post('/api/sampling/games/:id/teams/:teamId/restore', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const team = await teamOf(c, Number(managed.game.id));
    if (!team) return fail(c, 'That team could not be found.', 404);
    const token = newTeamToken();
    await regenerateTeamToken(c.env, team, token);
    const origin = requestOrigin(c.req.raw) || 'https://coderxsociety.pages.dev';
    await recordEvent(c.env.DB, Number(managed.game.id), 'team_link_restored', {
      type: managed.organizer.isPhantom ? 'phantom' : 'organizer',
      label: managed.organizer.name,
      userId: managed.organizer.userId,
      profileId: managed.organizer.profileId,
    }, { teamId: Number(team.id), teamName: team.name });
    const fresh = await getGame(c.env.DB, Number(managed.game.id));
    return ok(c, {
      teamId: Number(team.id),
      teamName: team.name,
      link: `${origin}/#sampling/team/${token}`,
      bundle: await organizerBundle(c.env, fresh as GameRow, origin, { canManage: true }),
    });
  });

  /** Results export — the organizer's own copy of the finished game. */
  app.get('/api/sampling/games/:id/export', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const [teams, draws] = await Promise.all([
      getTeams(c.env.DB, Number(managed.game.id)),
      getDraws(c.env.DB, Number(managed.game.id)),
    ]);
    const format = String(c.req.query('format') || 'csv').toLowerCase();
    if (format === 'json') {
      return c.json({
        success: true,
        data: {
          game: gamePublicState(managed.game, teams, draws),
          teams: teams.map((team) => ({
            id: Number(team.id),
            name: team.name,
            position: Number(team.position),
            draws: draws.filter((draw) => Number(draw.team_id) === Number(team.id)).map((draw) => Number(draw.number)),
          })),
          draws: draws.map((draw) => ({
            turn: Number(draw.turn_index) + 1,
            team: teams.find((team) => Number(team.id) === Number(draw.team_id))?.name || '',
            number: Number(draw.number),
            at: draw.drawn_at,
          })),
        },
      });
    }
    const csv = resultsCsv(managed.game, teams, draws);
    const safeTitle = (managed.game.title || 'sampling-game').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'sampling-game';
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${safeTitle}-results.csv"`);
    return c.body(csv);
  });

  // -------------------------------------------------------------------------
  // Team surface — the link is the credential
  // -------------------------------------------------------------------------

  const teamFromToken = async (c: any) => {
    const raw = String(c.req.param('token') || '').trim();
    if (!raw || raw.length < 20 || raw.length > 200) return null;
    const hash = await teamTokenHash(raw);
    const team = await oneRow<TeamRow>(c.env.DB.prepare('SELECT * FROM sampling_teams WHERE token_hash = ?').bind(hash));
    if (!team) return null;
    const game = await getGame(c.env.DB, Number(team.game_id));
    if (!game) return null;
    return { team, game, token: raw };
  };

  app.get('/api/sampling/team/:token', async (c: any) => {
    if (!samplingThrottle(c, 'team-read', 240, 60)) return fail(c, 'Too many refreshes. Give it a moment.', 429);
    const found = await teamFromToken(c);
    if (!found) return fail(c, 'This team link is not valid. Ask the organizer for a new one.', 404);
    if (found.team.status === 'revoked') {
      return fail(c, 'The organizer has revoked this team link.', 403);
    }
    return ok(c, await teamBundle(c.env, found.game, found.team, found.token));
  });

  app.post('/api/sampling/team/:token/spin', async (c: any) => {
    if (!samplingThrottle(c, 'team-spin', 30, 60)) return fail(c, 'Steady — one spin at a time. Try again in a moment.', 429);
    if (!checkRateLimit(c, 30, 60)) return fail(c, 'Steady — one spin at a time. Try again in a moment.', 429);
    const found = await teamFromToken(c);
    if (!found) return fail(c, 'This team link is not valid. Ask the organizer for a new one.', 404);
    if (found.team.status === 'revoked') return fail(c, 'The organizer has revoked this team link.', 403);

    const body = await readJson(c);
    // The idempotency key makes a retry after a dropped connection return the
    // original draw instead of consuming a second one.
    const requestId = String(body.requestId || c.req.header('x-idempotency-key') || '').trim().slice(0, 120);

    const outcome = await drawNumber(c.env.DB, {
      game: found.game,
      team: found.team,
      teams: await getTeams(c.env.DB, Number(found.game.id)),
      idempotencyKey: requestId,
    });
    if (!outcome.ok) {
      const status = outcome.code === 'not_your_turn' ? 409
        : outcome.code === 'not_active' ? 423
          : outcome.code === 'revoked' ? 403
            : outcome.code === 'game_over' ? 410
              : 409;
      return c.json({ success: false, code: outcome.code, error: outcome.message }, status);
    }

    const bundle = await teamBundle(c.env, outcome.game, outcome.team, found.token);
    return ok(c, {
      ...bundle,
      draw: {
        number: Number(outcome.draw.number),
        turn: Number(outcome.draw.turn_index) + 1,
        drawnAt: outcome.draw.drawn_at,
        teamId: Number(outcome.draw.team_id),
        teamName: outcome.team.name,
      },
      replayed: outcome.replayed,
    });
  });

  // -------------------------------------------------------------------------
  // Organizer activity feed (PHANTOM oversight reads the same rows)
  // -------------------------------------------------------------------------
  app.get('/api/sampling/games/:id/history', async (c: any) => {
    const managed = await withManagedGame(c);
    if (managed.error) return managed.error;
    const events = await getEvents(c.env.DB, Number(managed.game.id), 500);
    return ok(c, {
      events: events.map((event) => ({
        id: Number(event.id),
        action: event.action,
        actor: event.actor_label,
        actorType: event.actor_type,
        detail: (() => { try { return JSON.parse(event.detail_json || '{}'); } catch { return {}; } })(),
        at: event.created_at,
      })),
    });
  });
};

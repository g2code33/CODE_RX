/**
 * CODE Rx SOCIETY — Sampling (Phase 1) database schema.
 *
 * Sampling is the multi-team, turn-based random-number drawing game. It is
 * deliberately its own module: every statement here is additive and idempotent,
 * prefixed `sampling_`, and appended to the platform schema next to the Class &
 * Group tables. Nothing existing is altered or dropped.
 *
 * The shape of the data is what makes the game fair:
 *   - one shared pool of numbers per game, enforced by
 *     `UNIQUE(game_id, number)` — the database itself refuses a repeat;
 *   - one draw per turn, enforced by `UNIQUE(game_id, turn_index)`;
 *   - the turn position lives on the game row (`current_turn`,
 *     `current_team_id`), never on a client;
 *   - team credentials are stored as a SHA-256 lookup hash plus an AES-GCM
 *     sealed copy, so the organizer can still re-display a link later while the
 *     database never holds a usable bearer token.
 */

export const SAMPLING_SCHEMA = `
CREATE TABLE IF NOT EXISTS sampling_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  instructions TEXT,
  total_numbers INTEGER NOT NULL CHECK (total_numbers BETWEEN 1 AND 2000),
  team_count INTEGER NOT NULL CHECK (team_count BETWEEN 1 AND 40),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','completed','ended')),
  current_turn INTEGER NOT NULL DEFAULT 0,
  current_team_id INTEGER,
  drawn_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  owner_user_id INTEGER,
  owner_profile_id INTEGER,
  organizer_label TEXT NOT NULL DEFAULT '',
  started_at DATETIME,
  paused_at DATETIME,
  completed_at DATETIME,
  ended_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sampling_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 1),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_enc TEXT,
  token_key_version TEXT,
  token_hint TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  draw_count INTEGER NOT NULL DEFAULT 0,
  last_draw_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(game_id) REFERENCES sampling_games(id)
);

CREATE TABLE IF NOT EXISTS sampling_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  idempotency_key TEXT,
  drawn_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(game_id) REFERENCES sampling_games(id),
  FOREIGN KEY(team_id) REFERENCES sampling_teams(id)
);

CREATE TABLE IF NOT EXISTS sampling_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('organizer','team','phantom','system')),
  actor_label TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(game_id) REFERENCES sampling_games(id)
);
`;

export const SAMPLING_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_sampling_team_position ON sampling_teams(game_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sampling_team_name ON sampling_teams(game_id, name);
CREATE INDEX IF NOT EXISTS idx_sampling_team_game ON sampling_teams(game_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sampling_draw_number ON sampling_draws(game_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sampling_draw_turn ON sampling_draws(game_id, turn_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sampling_draw_request ON sampling_draws(game_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sampling_draw_team ON sampling_draws(game_id, team_id);
CREATE INDEX IF NOT EXISTS idx_sampling_event_game ON sampling_events(game_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_sampling_game_owner ON sampling_games(owner_user_id, id DESC);
`;

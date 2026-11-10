# Sampling — Phase 1

**A real, online, turn-based number-drawing game for up to 40 teams.**
Sampling is *not* research sampling: there is no population, no sample size and no
statistics anywhere. It is a game-show board: one shared pool of numbers, teams
take one each in a fixed order, and the last number drawn closes the game.

Everything below is what shipped on this branch. Nothing in the existing platform
was rewritten to accommodate it.

---

## 1. Where it lives

Sampling is a **separate workspace**, not a tab inside the organizer dashboard.

| Address | Who | What |
| --- | --- | --- |
| `#class-groups` | organizer | The existing Class & Groups console — now with a gold **Sampling** button and a **Sampling** row in its sidebar |
| `#sampling` | organizer | The Sampling home: Create New Game, Active games, Previous games |
| `#sampling/game/<id>` | organizer | Setup result → team links → live monitor → results |
| `#sampling/team/<token>` | that team only | The team's own stage. No account, no install |

* The workspace has its own header identity (Sampling · Turn-based number drawing ·
  the signed-in organizer) and a **Back to Class & Groups** action in every screen.
* It reuses the platform's existing session (`codeRx_token`), role and audit code.
  There is no second auth system.
* Game state survives navigation and refresh: the game lives on the server, the
  address carries the game or the team, and browser Back works because every screen
  is a hash route.
* Active games cannot be deleted. The monitor offers Pause, Skip turn, End game and
  Export; a draft can only be started.

## 2. The turn engine (the central rule)

* Teams play in a fixed order — Team A → B → C → D → A … — one draw per turn.
* **The backend advances the turn.** No timer, no client-side queue.
* Only the active team may draw. The others are told to wait **and who is playing**.
* Concurrency is settled in one statement: the draw batch is conditional on the
  exact `current_turn` that was read, so two simultaneous spins cannot both win and
  the loser is told the turn already moved (never shown a wrong number).
* A failed or dropped request changes nothing. A retry carries the same idempotency
  key and returns **the original draw**, never a second one.
* The organizer may skip a turn — only after a confirmation **and** a required
  reason, never silently, always written to the game history and the platform audit.

The database backs these rules up rather than trusting the code:

```sql
UNIQUE(game_id, number)       -- a number can never be drawn twice in a game
UNIQUE(game_id, turn_index)   -- one draw per turn, whatever happens
UNIQUE(game_id, idempotency_key) WHERE idempotency_key IS NOT NULL
```

## 3. Fairness

* The number is drawn on the server from `crypto.getRandomValues`, rejecting the
  biased tail so every remaining number is equally likely.
* `Math.random()` is never the authority — not in the picker, not in the turn, not
  in the browser. (The client uses it only to fake a UUID on browsers without
  `crypto.randomUUID`; the server's own key is what matters.)
* The result is decided **before** the animation starts; the reel exists to reveal
  it, never to choose it.
* Every draw records the number, the team and the moment; the pool only ever shrinks.

## 4. Links

Each team gets its own unguessable link, plus a game link for the organizer.

* 32 bytes of CSPRNG, base64url (`spl_…`). The database stores a SHA-256 lookup
  hash plus an AES-GCM sealed copy — never a usable bearer token in the clear.
* The link desk shows each team's URL with Copy, Share (native share sheet),
  Regenerate, Revoke and Restore, plus **Copy all**. A revoked link stops working
  at once; restoring always issues a **new** link, so a leaked one never comes back.
* A team token can only read (and spin) **its own** team. It cannot reach an
  organizer endpoint, and no endpoint ever returns another team's token.
* Team reads and spins are rate limited, separately from the organizer surface.

## 5. The team screen

Phone-first, deep emerald / white / gold, built for one thumb:

* "WAIT FOR YOUR TURN" with **who is playing now**, updating on its own (polling:
  2.5 s while waiting, slower when it is not your move, paused when the tab is
  hidden). No manual refresh anywhere.
* "IT'S YOUR TURN!" with a large, prominent **SPIN**.
* The carousel tumbles, slows, lands on the server's number and glows gold with
  confetti. **Skip animation** and `prefers-reduced-motion` both cut to the number.
* Sound is available and **off by default**.
* The team sees its own numbers, the size of the pool, the turn, the board and the
  teams — never organizer controls, never another team's link.

## 6. Completion

When the pool is empty the game completes on its own: "GAME COMPLETED!", the totals,
a final breakdown by team with every number, the timestamp, **Export results**,
**Share results** and **New game**. A completed game never resets or reuses a number;
starting again means a new game.

## 7. Data

Four additive tables (`sampling_games`, `sampling_teams`, `sampling_draws`,
`sampling_events`) plus nine indexes, appended to the platform schema. Nothing
existing is altered or dropped.

Persisted per game: id, public id, title, instructions, total, team count, status
(draft / active / paused / completed / ended), turn and active team, drawn count,
owner, timestamps; per team: name, position, token hash + sealed token, status,
draw count, last draw; per draw: number, team, turn, idempotency key, moment; and
an event log for every organizer and team action (created, started, paused,
resumed, skipped with reason, link regenerated / revoked / restored, ended).

## 8. Tests

| Suite | Command | Result |
| --- | --- | --- |
| Sampling backend | `npm run test:sampling` | **157 passed, 0 failed** |
| Sampling UI & architecture | `npm run test:sampling-ui` | **111 passed, 0 failed** |
| Sampling browser journey (shipped bundle, `jsdom`) | `npm run test:sampling-browser` | **46 passed, 0 failed** |
| Class & Groups | `npm run test:cgm` · `test:cgm-ui` | 1094 · 462 passed, 0 failed |
| Client Portal | `npm run test:client-portal` · `test:client-portal-ui` | 1621 · 696 passed, 0 failed |
| Raw Delivery | `npm run test:raw-delivery` | all passed |
| Typecheck / build | `npx tsc --noEmit` · `npm run build` | clean, single-file bundle |

The browser journey boots the **shipped bundle** in one isolated window per player
and walks the whole acceptance path: Class & Groups → Sampling → setup → links →
three teams in three separate sessions → start → spin → auto-advance → pause,
resume, audited skip → play out → completion → back to Class & Groups, where the
finished game is still listed.

## 9. Screenshots

In `docs/sampling-phase-1/`:

1. `01-class-groups-sampling-button.png` — the gold Sampling button on the existing organizer console
2. `02-organizer-setup.png` — title, range, teams, instructions and the live preview
3. `03-team-links.png` — the generated links, one per team, with copy / share / revoke
4. `04-team-waiting-mobile.png` — a team's phone: "WAIT FOR YOUR TURN", who is playing
5. `05-team-my-turn-mobile.png` — "IT'S YOUR TURN!" with the prominent SPIN
6. `06-team-spin-mobile.png` — the carousel mid-draw
7. `07-team-reveal-mobile.png` — the number revealed in gold, with who plays next
8. `08-organizer-dashboard.png` — the live monitor: drawn, remaining, turn, up now, per-team cards, latest numbers
9. `09-game-completed.png` — completion, final breakdown by team and the actions

## 10. Files

```
functions/lib/sampling/core.ts       rules: config, names, turns, uniform pick, public shapes
functions/lib/sampling/tokens.ts     CSPRNG tokens, SHA-256 lookups, AES-GCM sealing
functions/lib/sampling/service.ts    the game: create, draw batch, start/pause/skip/end, payloads
functions/lib/sampling/routes.ts     /api/sampling/* (organizer) and /api/sampling/team/* (teams)
functions/lib/sampling/schema.ts     four additive tables, nine indexes
functions/class-group-routes.ts      registerSamplingRoutes(app) — one additive line
functions/lib/schema.ts              SAMPLING_SCHEMA appended to the platform schema

src/lib/sampling.ts                  client: routes, types, API, copy/share/export helpers
src/components/Sampling/SamplingWorkspace.tsx   home, link desk, monitor, results
src/components/Sampling/SamplingSetup.tsx       create a game
src/components/Sampling/SamplingTeam.tsx        the team stage, carousel and reveal
src/components/ClassGroups/ClassGroupsWorkspace.tsx  the Sampling button and sidebar row
src/index.css                        the Sampling + stage styles

scripts/sampling-tests.mjs           backend suite (real HTTP against the Worker)
scripts/sampling-ui-tests.mjs        UI & architecture suite
scripts/sampling-browser-check.mjs   end-to-end journey over the shipped bundle
```

## 11. What was deliberately not done

* No deployment — this branch is a pull request, not a release.
* No statistics, no sampling terminology, no research framing.
* No second auth system, no new global navigation entry, no change to the Student
  Portal, the organizer dashboard, PHANTOM, elections, attendance, notifications,
  the Client Portal or Raw Delivery.
* Phase 2 ideas (scheduled turns, per-round numbers, spectators) are out of scope.

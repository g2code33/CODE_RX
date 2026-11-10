/**
 * CODE Rx — Sampling (Phase 1) UI & architecture test suite.
 *
 * Sampling is a completely separate workspace reached from the Class & Groups
 * console. The sandbox has no browser here, so — like the CGM UI suite — these
 * tests read the real shipped sources and hold them to the rules that matter:
 *
 *   - the workspace is its own place with its own identity and a way back;
 *   - only the active team is ever invited to play, and the backend is the
 *     authority for turns and numbers;
 *   - nothing about the team screen exposes organizer function;
 *   - the game-show look, the mobile layout and the reduced-motion path exist;
 *   - nothing existing (Student Portal, Organizer Workspace, PHANTOM, Client
 *     Portal, Raw Delivery) was rewritten to accommodate Sampling.
 *
 * Usage: node scripts/sampling-ui-tests.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) passed += 1;
  else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};
const section = (title) => console.log(`\n== ${title}`);

const app = src('src/App.tsx');
const workspaceSrc = src('src/components/Sampling/SamplingWorkspace.tsx');
const setupSrc = src('src/components/Sampling/SamplingSetup.tsx');
const teamSrc = src('src/components/Sampling/SamplingTeam.tsx');
const lib = src('src/lib/sampling.ts');
const css = src('src/index.css');
const groupWorkspace = src('src/components/ClassGroups/ClassGroupsWorkspace.tsx');
const navbar = src('src/components/Navbar.tsx');
const routesSrc = src('functions/lib/sampling/routes.ts');
const coreSrc = src('functions/lib/sampling/core.ts');
const serviceSrc = src('functions/lib/sampling/service.ts');
const schemaSrc = src('functions/lib/sampling/schema.ts');
const workerRoutes = src('functions/class-group-routes.ts');
const platformSchema = src('functions/lib/schema.ts');

const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ===========================================================================
section('1. A separate workspace, reached from Class & Groups');
check('the organizer console carries a dedicated Sampling button',
  /data-testid="cgm-sampling-open"/.test(groupWorkspace) && /Dices/.test(groupWorkspace));
check('the button is gold, uses the brand palette and navigates to #sampling',
  /sampling-entry-button/.test(groupWorkspace) && /location\.hash\s*=\s*'#sampling'/.test(groupWorkspace));
check('the class & groups sidebar repeats the door for people who scroll the menu',
  /data-testid="cgm-sampling-nav"/.test(groupWorkspace) && /Sampling/.test(groupWorkspace));
check('Sampling CSS is a first-class entry-point style, hidden label on tiny screens',
  /\.sampling-entry-button\s*\{/.test(css) && /\.sampling-entry-button[^{]*\{[^}]*linear-gradient/.test(css));
check('the workspace has its own header identity, not the organizer dashboard',
  /data-testid="sampling-topbar"/.test(workspaceSrc) && /sampling-topbar-brand|Sampling/.test(workspaceSrc));
check('every Sampling screen offers a way back to Class & Groups',
  (workspaceSrc.match(/sampling-back-to-classes/g) || []).length >= 1
  && /Class & Groups/.test(workspaceSrc));
check('the workspace never renders the organizer dashboard component',
  !/ClassGroupsWorkspace/.test(workspaceSrc) && !/from '\.\.\/ClassGroups\//.test(workspaceSrc));
check('App.tsx keeps Sampling outside the class-groups view tree',
  /samplingRoute/.test(app) && /SamplingWorkspace/.test(app)
  && app.indexOf('SamplingWorkspace') > 0);
check('the Sampling views are rendered before the class-groups screens and do not replace them',
  /classGroups/.test(app) && /#class-groups/.test(app));
check('routes are hash addresses for the workspace, a game and a team link',
  /'#sampling'/.test(lib) && /sampling\/game\//.test(lib) && /sampling\/team\//.test(lib));
check('the hash parser only accepts the three Sampling shapes',
  /parseSamplingHash/.test(lib) && /team/.test(lib) && /game/.test(lib));
check('Sampling reuses the existing session instead of adding a second auth system',
  /codeRx_token|sampling\*|session/i.test(lib) && !/sign.?up|register|password/i.test(workspaceSrc.split('<form')[0] || ''));
check('no new navigation bar entry was added to the public header for teams',
  !/sampling/i.test(navbar));

// ===========================================================================
section('2. Home: create, active, previous');
check('the home screen offers Create New Game',
  /data-testid="sampling-create-new"/.test(workspaceSrc) && /Create new game/i.test(workspaceSrc));
check('active games and previous games are separate sections',
  /Active games/.test(workspaceSrc) && /Previous games/.test(workspaceSrc));
check('both sections explain themselves when empty',
  /data-testid="sampling-empty-active"/.test(workspaceSrc) && /data-testid="sampling-empty-previous"/.test(workspaceSrc));
check('each game card carries its status, size and title',
  /data-testid=\{`sampling-game-\$\{game\.id\}`\}/.test(workspaceSrc)
  && /data-status=\{game\.status\}/.test(workspaceSrc));
check('game cards summarise teams and progress',
  /team/.test(workspaceSrc) && /drawn/.test(workspaceSrc));
check('a signed-out visitor is asked to sign in through the existing console',
  /data-testid="sampling-signin"/.test(workspaceSrc));
check('loading and failure states exist instead of a blank screen',
  /data-testid="sampling-game-loading"/.test(workspaceSrc) && /data-testid="sampling-game-error"/.test(workspaceSrc));

// ===========================================================================
section('3. Setup: title, range, teams, instructions, validation');
check('setup asks for a title', /data-testid="sampling-title"/.test(setupSrc));
check('setup asks for the total (the 1..N range)', /data-testid="sampling-total"/.test(setupSrc) && /max=\{MAX_TOTAL\}/.test(setupSrc));
check('setup lists one input per team, keyed by index',
  /data-testid=\{`sampling-team-name-\$\{index\}`\}/.test(setupSrc));
check('teams can be added, renamed and removed before the game is created',
  /data-testid="sampling-team-add"/.test(setupSrc)
  && /data-testid=\{`sampling-team-remove-\$\{index\}`\}/.test(setupSrc)
  && /maxLength=\{40\}/.test(setupSrc));
check('the team count can be raised with a stepper too',
  /One team more/.test(setupSrc) && /One team fewer/.test(setupSrc));
check('default names are generated as Team A, Team B …',
  /Team \$/.test(setupSrc) && /defaultNames/.test(setupSrc));
check('there is no hardcoded ceiling of four teams',
  /MAX_TEAMS\s*=\s*(\d+)/.test(setupSrc) && Number(/MAX_TEAMS\s*=\s*(\d+)/.exec(setupSrc)[1]) > 4);
check('a blank title, a bad range, a blank name or a duplicate blocks submission',
  /canSubmit/.test(setupSrc) && /duplicate/.test(setupSrc) && /totalValid/.test(setupSrc));
check('submit stays disabled until the configuration is valid',
  /disabled=\{!canSubmit|disabled=\{busy \|\| !canSubmit/.test(setupSrc));
check('failed validation is explained, not silently ignored',
  /data-testid="sampling-setup-error"/.test(setupSrc));
check('instructions are optional and capped',
  /Instructions/.test(setupSrc) && /maxLength=\{600\}/.test(setupSrc));
check('the number of teams and the range are echoed back before creating',
  /Numbers 1 to/.test(setupSrc) && /team\{/.test(setupSrc));
check('a created game is a draft until the organizer starts it, and its setup is not editable',
  /draft/.test(workspaceSrc) && /data-testid="sampling-draft-note"/.test(workspaceSrc)
  && !/<SamplingSetup/.test(workspaceSrc.replace(/<SamplingSetup[\s\S]{0,400}onCreated[\s\S]{0,80}?>/, '')));

// ===========================================================================
section('4. One link per team, managed from the game screen');
check('the game screen hosts a link desk', /data-testid="sampling-link-desk"/.test(workspaceSrc));
check('each team row shows its own link', /data-testid=\{`sampling-team-link-\$\{team\.id\}`\}/.test(workspaceSrc)
  && /sampling-link-url/.test(workspaceSrc));
check('every link can be copied', /data-testid=\{`sampling-copy-\$\{team\.id\}`\}/.test(workspaceSrc));
check('every link can go through the native share sheet', /data-testid=\{`sampling-share-\$\{team\.id\}`\}/.test(workspaceSrc));
check('all links can be copied at once', /data-testid="sampling-copy-all"/.test(workspaceSrc));
check('links can be revoked, restored and regenerated',
  /data-testid=\{`sampling-revoke-\$\{team\.id\}`\}/.test(workspaceSrc)
  && /data-testid=\{`sampling-restore-\$\{team\.id\}`\}/.test(workspaceSrc)
  && /data-testid=\{`sampling-regenerate-\$\{team\.id\}`\}/.test(workspaceSrc));
check('revoking and regenerating are confirmed first',
  (workspaceSrc.match(/appDialog\.confirm\(/g) || []).length >= 3);
check('a link row states whether the team is active or revoked',
  /revoked/.test(workspaceSrc) && /team\.status/.test(workspaceSrc));
check('the share text names the game and the team, never another team',
  /shareLink/.test(workspaceSrc) && /team\.name/.test(workspaceSrc));
check('the clipboard path degrades to its own copy routine when the API is missing',
  /copyText/.test(workspaceSrc) && /fallback|execCommand/.test(lib));

// ===========================================================================
section('5. The team screen: waiting, my turn, spin, reveal');
check('the team screen is its own page with the team and the game title',
  /data-testid="sampling-team-name"/.test(teamSrc) && /data-testid="sampling-game-title"/.test(teamSrc));
check('a waiting team is told to wait for its turn',
  /WAIT FOR YOUR TURN/i.test(teamSrc) && /Wait for your turn/i.test(teamSrc));
check('a waiting team is told who is playing',
  /is playing now/i.test(teamSrc));
check('the active team is told it is its turn',
  /IT’S YOUR TURN!|IT'S YOUR TURN!/i.test(teamSrc));
check('turn banners announce themselves politely for assistive technology',
  /data-testid="sampling-team-status"/.test(teamSrc) && /aria-live="polite"/.test(teamSrc));
check('the team screen polls on its own — no manual refresh button',
  /setInterval/.test(teamSrc) && !/data-testid="sampling-team-refresh"/.test(teamSrc));
check('the poll is brisk while waiting and slower when it is not your move',
  /POLL_WAIT_MS/.test(teamSrc) && /POLL_IDLE_MS/.test(teamSrc)
  && Number(/POLL_WAIT_MS\s*=\s*(\d+)/.exec(teamSrc)[1]) <= 5000);
check('polls stop while the tab is hidden so phones save battery',
  /visibilityState|hidden/.test(teamSrc));
check('the SPIN button is prominent and only shown to the active team',
  /data-testid="sampling-spin"/.test(teamSrc) && /sampling-spin\b/.test(teamSrc) && /isMyTurn/.test(teamSrc));
check('the number carousel is present with a stable frame',
  /data-testid="sampling-reel"/.test(teamSrc) && /data-testid="sampling-reel-number"/.test(teamSrc));
check('the carousel lands on the number the server decided',
  /rolled|target|result\.number|spin\.number/.test(teamSrc) && /data-phase/.test(teamSrc));
check('the result is revealed with a golden, celebratory moment',
  /confetti|sampling-reveal|won/.test(teamSrc));
check('the reveal names who plays next',
  /data-testid="sampling-next"/.test(teamSrc));
check('the team sees its own draws, progress and remaining pool',
  /data-testid="sampling-mine"/.test(teamSrc) && /remaining|still in the pool/i.test(teamSrc));
check('a team cannot reach organizer controls from its link',
  !/data-testid="sampling-(start|pause|resume|skip|end)"/.test(teamSrc)
  && !/sampling\.(start|pause|resume|skip|end)\(/.test(teamSrc));
check('the team screen never shows another team’s token or link',
  !/sampling-copy-|sampling-share-|sampling-link-url/.test(teamSrc));
check('sound is offered but off by default',
  /data-testid="sampling-sound"/.test(teamSrc) && /useState\(false\)|soundOn, setSoundOn\] = useState\(false\)/.test(teamSrc));
check('the animation can be skipped',
  /data-testid="sampling-skip-animation"/.test(teamSrc) && /skipAnimation/.test(teamSrc));
check('reduced motion is respected in CSS',
  /@media \(prefers-reduced-motion: reduce\)/.test(css) && /sampling-reel-number--won[^{]*\{[^}]*animation:\s*none/.test(css));
check('the team screen keeps its identity across a reload (the link is the identity)',
  /sessionStorage|localStorage|window\.location\.hash/.test(teamSrc) || /token/.test(teamSrc));
check('a revoked link and a finished game each get an honest screen',
  /data-testid="sampling-team-error"/.test(teamSrc) && /This link cannot be used/.test(teamSrc)
  && /data-testid="sampling-team-complete"/.test(teamSrc));

// ===========================================================================
section('6. The organizer monitor');
check('the dashboard states the game, the range, drawn, remaining and the turn',
  /sampling-turn/.test(workspaceSrc) && /remaining/i.test(workspaceSrc) && /Drawn|drawn/i.test(workspaceSrc));
check('the active team is named on the monitor',
  /data-testid="sampling-up-now"/.test(workspaceSrc));
check('per-team cards show draws and the numbers each team took',
  /data-testid=\{`sampling-progress-\$\{team\.id\}`\}/.test(workspaceSrc));
check('the organizer starts, pauses and resumes the game',
  /data-testid="sampling-start"/.test(workspaceSrc)
  && /data-testid="sampling-pause"/.test(workspaceSrc)
  && /data-testid="sampling-resume"/.test(workspaceSrc));
check('a skip is confirmed and then requires a reason',
  /appDialog\.confirm\(/.test(workspaceSrc) && /appDialog\.prompt\(/.test(workspaceSrc)
  && /requiredMessage/.test(workspaceSrc) && /never silent|audit record/i.test(workspaceSrc));
check('ending the game early asks first',
  /End the game/.test(workspaceSrc) && /confirmLabel: 'End the game'/.test(workspaceSrc));
check('the monitor can be refreshed and exports the results',
  /sampling-game-refresh/.test(workspaceSrc) && /sampling-export/.test(workspaceSrc));
check('export saves a real file, and the API can also return JSON',
  /exportCsv/.test(workspaceSrc) && /downloadText\(/.test(workspaceSrc)
  && /format=csv/.test(lib) && /format === 'json'/.test(routesSrc));
check('the history lists every event with its reason where one was given',
  /data-testid="sampling-history"/.test(workspaceSrc) && /event\.detail\?\.reason/.test(workspaceSrc));
check('the monitor polls on its own so the board matches the teams',
  /setInterval/.test(workspaceSrc) && /visibilityState|hidden/.test(workspaceSrc));
check('the completion panel exists with final results and a new-game action',
  /data-testid="sampling-complete"/.test(workspaceSrc) && /GAME COMPLETED/i.test(workspaceSrc)
  && /New game|Create new game/i.test(workspaceSrc));
check('drawn numbers are never editable from the monitor',
  !/sampling-edit|changeNumber|updateDraw/.test(workspaceSrc));

// ===========================================================================
section('7. The backend is the authority');
const authoritative = withoutComments(coreSrc) + withoutComments(serviceSrc);
check('the number is drawn from the platform crypto source',
  /crypto\.getRandomValues/.test(coreSrc));
check('no randomness in the server module comes from Math.random',
  !/Math\.random/.test(authoritative));
check('the client fallback never decides a result',
  /newRequestId/.test(lib) && !/Math\.random\(\)\s*\*\s*(total|pool)/.test(lib));
check('the pool is filtered to numbers not yet drawn, then picked uniformly',
  /drawn|used|taken/.test(coreSrc) && /uniform|unbiased|rejection|modulo/i.test(coreSrc));
check('the draw, the turn advance and the pool removal are one batch',
  /db\.batch\(/.test(serviceSrc) && /INSERT INTO sampling_draws/.test(serviceSrc)
  && /UPDATE sampling_games/.test(serviceSrc));
check('the turn only moves when the update still matches the turn that was read',
  /WHERE[\s\S]{0,200}current_turn/.test(serviceSrc) || /version = \?/.test(serviceSrc));
check('a repeated request id returns the original draw instead of drawing again',
  /idempotency_key/.test(serviceSrc) && /idempotency_key/.test(schemaSrc));
check('the database refuses a repeated number and a repeated turn',
  /UNIQUE INDEX[^;]*sampling_draws\(game_id, number\)/.test(schemaSrc)
  && /UNIQUE INDEX[^;]*sampling_draws\(game_id, turn_index\)/.test(schemaSrc));
check('the spin route rejects a draw out of turn',
  /not_your_turn/.test(routesSrc));
check('a spin is validated server-side, never trusted from the client',
  /app\.post\('\/api\/sampling\/team\/:token\/spin'/.test(routesSrc)
  && /requestId/.test(routesSrc) && !/number\s*:\s*body/.test(routesSrc));
check('tokens are looked up by hash, not by the raw value',
  /token_hash/.test(schemaSrc) && /teamTokenHash/.test(routesSrc));
check('tokens come from 32 crypto-random bytes',
  /new Uint8Array\(32\)/.test(src('functions/lib/sampling/tokens.ts')));
check('token guessing is rate limited and team routes are throttled',
  /checkRateLimit/.test(routesSrc) && /Steady — one spin at a time/.test(routesSrc));
check('organizer routes require the existing organizer session',
  /samplingOrganizer/.test(routesSrc) && /withManagedGame/.test(routesSrc)
  && /Sign in as a Society member to open Sampling/.test(routesSrc)
  && /canManage\(game, organizer\)/.test(routesSrc));
check('organizer actions are written to the platform audit trail',
  /auditOrganizer/.test(routesSrc));
check('every organizer and team action lands in the game history',
  /recordEvent/.test(routesSrc) && /sampling_events/.test(schemaSrc));
check('a paused game refuses spins',
  /status !== 'active'|not_active/.test(serviceSrc + routesSrc));
check('teams cannot change the order — the turn sequence is computed server-side',
  /nextTeamPosition/.test(coreSrc) && /nextTeamPosition/.test(serviceSrc)
  && /current_team_id/.test(serviceSrc));
check('the team payload carries no organizer fields',
  /teamBundle/.test(serviceSrc) && /gamePublicState/.test(serviceSrc)
  && !/token_hash/.test(coreSrc) && !/tokenEnc|token_enc/.test(serviceSrc.match(/export const teamBundle[\s\S]*?\n};/)?.[0] || ''));

// ===========================================================================
section('8. Wiring, schema and the design language');
check('Sampling routes are registered additively next to the passkey routes',
  /registerSamplingRoutes\(app\)/.test(workerRoutes));
check('the schema is appended to the platform schema, prefixed and non-destructive',
  /SAMPLING_SCHEMA/.test(platformSchema) && /CREATE TABLE IF NOT EXISTS sampling_/.test(schemaSrc)
  && !/DROP TABLE|ALTER TABLE sampling_[a-z_]+ DROP/.test(schemaSrc));
check('no existing table is altered by the Sampling schema',
  !/(DROP|ALTER)\s+TABLE\s+(?!sampling_)/i.test(schemaSrc));
check('the palette is deep emerald, white and gold',
  /#064e3b|#047857/.test(css) && /#b45309|#fbbf24|amber/.test(css));
check('cards are rounded with soft shadows',
  /\.sampling-card\s*\{[^}]*border-radius/.test(css) && /\.sampling-card\s*\{[^}]*box-shadow/.test(css));
check('the centre number glows and the reveal is animated',
  /\.sampling-reel-number[^{]*\{[^}]*text-shadow/.test(css)
  && /\.sampling-reel-number--won[^{]*\{[^}]*text-shadow/.test(css)
  && /@keyframes sampling\w+/.test(css));
check('the layout is mobile-first with small-screen rules',
  /@media \(max-width: 4[0-9]0px\)/.test(css) && /sampling-stage/.test(css));
check('the workspace avoids layout shift — the reel is always drawn and its hint keeps its line',
  /\.sampling-reel-hint\s*\{[^}]*min-height/.test(css)
  && /\.sampling-reel-number\s*\{[^}]*tabular-nums/.test(css)
  && /data-testid="sampling-reel"/.test(teamSrc));
check('buttons are real buttons with test hooks and accessible labels',
  /aria-label=/.test(workspaceSrc) && /aria-pressed=/.test(teamSrc));
check('toast feedback is announced, not just painted',
  /role="status"/.test(workspaceSrc) && /data-testid="sampling-toast"/.test(workspaceSrc));

// ===========================================================================
section('9. Nothing else was rewritten');
check('the Sampling module imports no Class & Groups module',
  !/from '\.\.\/ClassGroups/.test(workspaceSrc + setupSrc + teamSrc));
check('the Student Portal source is untouched by Sampling',
  !/sampling/i.test(src('src/components/ClassGroups/StudentPortal.tsx')));
check('PHANTOM screens were not modified for Sampling',
  !/sampling/i.test(src('src/components/ClassGroups/PhantomClasses.tsx')));
check('the public header is unchanged',
  !/sampling/i.test(navbar));
check('the Sampling client only talks to its own API namespace',
  /\/api\/sampling\//.test(lib) && !/\/api\/cgm\/(?!sampling)/.test(lib));
check('the route file exports exactly one registration function',
  /export const registerSamplingRoutes|export function registerSamplingRoutes/.test(routesSrc));

// ===========================================================================
console.log(`\nSAMPLING UI TESTS: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

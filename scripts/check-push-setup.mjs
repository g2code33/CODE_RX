#!/usr/bin/env node
/**
 * Is phone notification actually switched on in production?
 *
 *   node scripts/check-push-setup.mjs                      # checks the live site
 *   node scripts/check-push-setup.mjs http://127.0.0.1:8788 # checks a preview
 *
 * Reads the public endpoint the browser itself reads. `enabled: true` means the
 * deployed server found VAPID keys and can sign a push; `enabled: false` means
 * the keys are missing (or set on a different Pages project) and every
 * notification would silently stay in-app.
 *
 * It cannot send anything — a real send needs a device that agreed to it.
 */
const base = (process.argv[2] || 'https://coderxsociety.pages.dev').replace(/\/$/, '');

const fail = [];
const warn = [];
const ok = (text) => console.log(`  \u2713 ${text}`);
const bad = (text) => { fail.push(text); console.log(`  \u2717 ${text}`); };
const note = (text) => { warn.push(text); console.log(`  ! ${text}`); };

console.log(`\nChecking ${base}\n`);

const get = async (path, asJson = true) => {
  try {
    const response = await fetch(`${base}${path}`, { headers: { Accept: asJson ? 'application/json' : '*/*' } });
    const text = await response.text();
    let json = null;
    if (asJson) { try { json = JSON.parse(text); } catch { /* not json */ } }
    return { status: response.status, headers: response.headers, text, json };
  } catch (error) {
    return { status: 0, error: String(error?.message || error) };
  }
};

// 1. The keys the server would sign with.
const key = await get('/api/cgm/student/push/public-key');
if (key.status === 0) {
  bad(`the site did not answer (${key.error})`);
} else if (key.status !== 200 || !key.json?.success) {
  bad(`the push key endpoint answered ${key.status} — the module may be disabled`);
} else if (key.json.data?.enabled !== true) {
  bad('push is NOT enabled: the server has no VAPID keys');
  console.log('      → the keys are missing, or were set on a different Pages project.');
  console.log('      → run: npm run vapid:set <PUBLIC_KEY> <PRIVATE_KEY>   then redeploy');
} else if (!/^[A-Za-z0-9_-]{80,}$/.test(String(key.json.data.publicKey || ''))) {
  bad('the server reports push enabled but the public key does not look valid');
} else {
  ok('the server has a VAPID key pair and reports push enabled');
  console.log(`      public key: ${String(key.json.data.publicKey).slice(0, 16)}…`);
}

// 2. The pieces a phone needs to install the app and receive a notification.
const manifest = await get('/manifest.webmanifest');
if (manifest.status !== 200) bad(`manifest.webmanifest answered ${manifest.status}`);
else {
  const type = manifest.headers.get('content-type') || '';
  let parsed = null;
  try { parsed = JSON.parse(manifest.text); } catch { /* reported below */ }
  if (!parsed) bad('manifest.webmanifest is served but is not valid JSON');
  else if (!/manifest\+json|application\/json/.test(type)) bad(`manifest served as "${type}"`);
  else if (parsed.display !== 'standalone') bad('manifest is not standalone — it will open in a browser tab, not as an app');
  else if (!(parsed.icons || []).some((icon) => String(icon.src || '').includes('CODE%20RX11.png'))) {
    bad('manifest has no CODE RX11.png icon — the installed app would show a blank tile');
  } else ok(`manifest is installable (${(parsed.icons || []).length} icon${(parsed.icons || []).length === 1 ? '' : 's'}, display: standalone)`);
}

const worker = await get('/sw.js', false);
if (worker.status !== 200) bad(`sw.js answered ${worker.status} — no service worker means no notifications when the app is closed`);
else if (!/addEventListener\('push'/.test(worker.text)) bad('sw.js has no push handler');
else if (!/addEventListener\('notificationclick'/.test(worker.text)) bad('sw.js has no notificationclick handler — tapping would do nothing');
else ok('the service worker can receive a push and open it on tap');

// 3. The app shell.
const shell = await get('/', false);
if (shell.status !== 200) bad(`the site root answered ${shell.status}`);
else if (!/class-groups|Class &amp; Group|Class & Group/i.test(shell.text)) note('the shell loaded but does not mention Class & Groups — check the deployed build');
else ok('the deployed shell is the build that contains Class & Groups');

console.log('');
if (fail.length) {
  console.log(`NOT READY — ${fail.length} problem${fail.length === 1 ? '' : 's'} above.`);
  process.exit(1);
}
console.log(`READY${warn.length ? ` (${warn.length} note${warn.length === 1 ? '' : 's'})` : ''}. Notifications will reach a phone that turned them on.\n`);

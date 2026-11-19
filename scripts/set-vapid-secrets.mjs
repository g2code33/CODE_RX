#!/usr/bin/env node
/**
 * Put a VAPID pair into Cloudflare Pages so phone notifications actually send.
 *
 *   node scripts/set-vapid-secrets.mjs <PUBLIC_KEY> <PRIVATE_KEY> [mailto:you@…]
 *
 * Why a script: the private key must be typed once, on the server, and never
 * live in a file, a git commit or a chat message. It is passed straight to
 * `wrangler pages secret put` on stdin, so it is not in your shell history in
 * a form you have to clean up, and not in this repo at all.
 *
 * Get the pair from `node scripts/generate-vapid-keys.mjs` — it is generated,
 * not issued. Keep the same pair forever: changing it silently unsubscribes
 * every phone that already agreed to notifications.
 *
 * PROJECT NAME: the Pages project that serves the site — the same one CI
 * deploys (`wrangler pages deploy … --project-name`). It is NOT the Workers
 * name in wrangler.toml; setting the secret on the wrong project looks like
 * success and changes nothing. Verify with `npm run vapid:status`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The Pages project, read from the one place CI already trusts: deploy.yml. */
const pagesProject = (() => {
  if (process.env.CLOUDFLARE_PAGES_PROJECT) return process.env.CLOUDFLARE_PAGES_PROJECT;
  try {
    const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
    const match = workflow.match(/pages deploy \S+ --project-name (\S+)/);
    if (match) return match[1];
  } catch { /* no workflow to read */ }
  // No guess: a wrong project name is the one way this silently does nothing.
  console.error('Could not work out the Pages project name. Set CLOUDFLARE_PAGES_PROJECT and run again.');
  process.exit(1);
})();

const [publicKey, privateKey, subject = 'mailto:coderxsociety@gmail.com'] = process.argv.slice(2);

if (!publicKey || !privateKey) {
  console.error(`
Usage: node scripts/set-vapid-secrets.mjs <PUBLIC_KEY> <PRIVATE_KEY> [SUBJECT]

  1. node scripts/generate-vapid-keys.mjs     ← prints the pair
  2. node scripts/set-vapid-secrets.mjs <paste public> <paste private>
`);
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{80,}$/.test(publicKey)) {
  console.error('The public key does not look like a base64url P-256 point (87 chars). Nothing was changed.');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{40,}$/.test(privateKey)) {
  console.error('The private key does not look like a base64url P-256 scalar (43 chars). Nothing was changed.');
  process.exit(1);
}
if (!/^(mailto:|https:\/\/)/.test(subject)) {
  console.error('The subject must be a mailto: or https:// address. Nothing was changed.');
  process.exit(1);
}

const put = (name, value) => {
  const result = spawnSync('npx', ['wrangler', 'pages', 'secret', 'put', name, '--project-name', pagesProject], {
    input: `${value}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`\nCould not set ${name}. Nothing else was changed.`);
    process.exit(result.status || 1);
  }
  console.log(`  ✓ ${name}`);
};

console.log(`\nSetting the three secrets on the Pages project "${pagesProject}"…\n`);
put('VAPID_PUBLIC_KEY', publicKey);
put('VAPID_PRIVATE_KEY', privateKey);
put('VAPID_SUBJECT', subject);
console.log(`
Done. Now:
  1. redeploy (push to main, or Cloudflare will not see the new values)
  2. npm run vapid:status      ← confirms the server can actually sign
  3. on a phone: student portal → Notifications → Turn on notifications
`);

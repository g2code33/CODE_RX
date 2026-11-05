#!/usr/bin/env node
/**
 * CODE Rx — CI test wrapper.
 *
 * GitHub's job logs live on a blob host that some sandboxes cannot reach, so a
 * red build used to say only "Process completed with exit code 1". This wrapper
 * runs a command, streams its output, and re-emits every failure line as a
 * workflow annotation — which IS reachable through the API. A failing build now
 * names the tests that failed, without downloading anything.
 *
 * Usage: node scripts/ci-run.mjs "npm run test:cgm"
 */
import { spawn } from 'node:child_process';

const command = process.argv[2];
if (!command) {
  console.error('Usage: node scripts/ci-run.mjs "<command>"');
  process.exit(2);
}

const lines = [];
const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

const capture = (chunk, isError) => {
  const text = String(chunk);
  if (isError) process.stderr.write(text);
  else process.stdout.write(text);
  for (const line of text.split('\n')) {
    if (line.trim()) lines.push(line.replace(/\u001b\[[0-9;]*m/g, ''));
  }
};

child.stdout.on('data', (chunk) => capture(chunk, false));
child.stderr.on('data', (chunk) => capture(chunk, true));

child.on('close', (code) => {
  if (code === 0) process.exit(0);

  // Everything a reader needs: the failure list, the totals, and any thrown
  // error — each as its own annotation so the summary page is enough.
  const interesting = lines.filter((line) =>
    /(^|\s)FAIL(\s|:)/.test(line)
    || /^(Failures|  - )/.test(line)
    || /TESTS:|TOTAL:|SUCCESS RATE/.test(line)
    || /Error:|ReferenceError|TypeError|SyntaxError|not defined/.test(line));
  const unique = [...new Set(interesting)].slice(0, 40);
  for (const line of unique) {
    const safe = line.replace(/%/g, '%25').replace(/\r/g, ' ').slice(0, 900);
    console.log(`::error::${safe}`);
  }
  if (!unique.length) console.log(`::error::${command} failed with exit code ${code} and printed no failure lines`);
  process.exit(code ?? 1);
});

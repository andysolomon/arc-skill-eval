// Model-check the TLA+ specs in formal/ with TLC.
//   npm run verify:formal [-- RunConsole.cfg ...]
//
// 1. Every `\* code: <file>: <text>` line in a spec must still match its file
//    (whitespace-insensitive). A miss means the modeled code changed.
// 2. Every formal/*.cfg runs through TLC and must end as its
//    `\* expect: pass` or `\* expect: <Invariant>` line says. A bug variant
//    that stops failing means the check can no longer catch that bug.
//
// TLC output goes to test-artifacts/formal/<cfg>.out. Needs Java 11+:
//   mise exec java@temurin-21 -- npm run verify:formal

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const TLA_VERSION = 'v1.7.4';
const TLA_SHA256 = '936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
const TLA_URL = `https://github.com/tlaplus/tlaplus/releases/download/${TLA_VERSION}/tla2tools.jar`;

const root = path.resolve(import.meta.dirname, '..');
const formalDir = path.join(root, 'formal');
const outDir = path.join(root, 'test-artifacts', 'formal');
const cacheDir = path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), 'arc-skill-eval');
const jarPath = path.join(cacheDir, `tla2tools-${TLA_VERSION}.jar`);

function die(message) {
  console.error(message);
  process.exit(1);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const squash = (text) => text.replace(/\s+/g, ' ');

function staleAnchors() {
  const missing = [];
  for (const spec of readdirSync(formalDir).filter((name) => name.endsWith('.tla'))) {
    const lines = readFileSync(path.join(formalDir, spec), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const match = /^\\\* code: ([^:]+): (.+)$/.exec(line);
      if (!match) return;
      const [, file, text] = match;
      const source = path.join(root, file);
      if (!existsSync(source) || !squash(readFileSync(source, 'utf8')).includes(squash(text).trim())) {
        missing.push(`formal/${spec}:${index + 1}  ${file} no longer contains: ${text}`);
      }
    });
  }
  return missing;
}

async function tlaJar() {
  if (existsSync(jarPath) && sha256(readFileSync(jarPath)) === TLA_SHA256) return jarPath;
  console.log(`Downloading tla2tools.jar ${TLA_VERSION}`);
  const response = await fetch(TLA_URL);
  if (!response.ok) die(`GET ${TLA_URL} answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== TLA_SHA256) die(`tla2tools.jar checksum is ${actual}, expected ${TLA_SHA256}`);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(`${jarPath}.part`, bytes);
  renameSync(`${jarPath}.part`, jarPath);
  return jarPath;
}

function javaBinary() {
  const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
  const probe = spawnSync(java, ['-version'], { encoding: 'utf8' });
  if (probe.status !== 0) die('No working Java found. Install Java 11+, or run: mise exec java@temurin-21 -- npm run verify:formal');
  return java;
}

function expectation(cfgText, cfg) {
  const match = /\\\*.*\bexpect: (\w+)/.exec(cfgText);
  if (!match) die(`formal/${cfg} has no "\\* expect: pass" or "\\* expect: <Invariant>" line`);
  return match[1];
}

function outcome(output) {
  if (output.includes('Model checking completed. No error has been found.')) return 'pass';
  const violated = /Error: Invariant (\w+) is violated/.exec(output);
  if (violated) return violated[1];
  if (output.includes('Error: Deadlock reached.')) return 'deadlock';
  return 'error';
}

const missing = staleAnchors();
if (missing.length > 0) {
  die(['The code a spec models has changed. Re-check the spec against it (see .claude/skills/verify-run-lifecycle/SKILL.md):', ...missing.map((line) => `  ${line}`)].join('\n'));
}

const only = process.argv.slice(2);
const configs = readdirSync(formalDir)
  .filter((name) => name.endsWith('.cfg') && (only.length === 0 || only.includes(name)))
  .sort();
if (configs.length === 0) die(`No formal/*.cfg matches ${only.join(' ')}`);

const java = javaBinary();
const jar = await tlaJar();
const width = Math.max(...configs.map((cfg) => cfg.length));
mkdirSync(outDir, { recursive: true });
const metaDir = mkdtempSync(path.join(tmpdir(), 'arc-tlc-'));
let failed = false;

for (const cfg of configs) {
  const spec = `${cfg.split('.')[0]}.tla`;
  const expected = expectation(readFileSync(path.join(formalDir, cfg), 'utf8'), cfg);
  const result = spawnSync(
    java,
    ['-XX:+UseParallelGC', '-cp', jar, 'tlc2.TLC', '-workers', '1', '-metadir', path.join(metaDir, cfg), '-config', cfg, spec],
    { cwd: formalDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const output = `${result.stdout}${result.stderr}`;
  writeFileSync(path.join(outDir, `${cfg}.out`), output);

  const actual = outcome(output);
  const states = /(\d+) distinct states found/.exec(output)?.[1] ?? '?';
  const verdict = actual === 'pass' ? `passes (${states} distinct states)` : `breaks ${actual}`;
  const want = expected === 'pass' ? 'pass' : `break ${expected}`;
  if (actual === expected) {
    console.log(`ok    ${cfg.padEnd(width)}  ${verdict}${expected === 'pass' ? '' : ', as expected'}`);
  } else {
    failed = true;
    console.log(`FAIL  ${cfg.padEnd(width)}  ${verdict}, expected it to ${want}`);
    console.log(output.slice(output.indexOf('Error:') >= 0 ? output.indexOf('Error:') : 0));
  }
}

rmSync(metaDir, { recursive: true, force: true });
console.log(`TLC output: ${path.relative(root, outDir)}/`);
process.exit(failed ? 1 : 0);

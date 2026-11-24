#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const problems = [];

function targets(pkg) {
  const found = [];
  const walk = (key, value) => {
    if (typeof value === "string") found.push([key, value]);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(`${key}[${JSON.stringify(k)}]`, v);
  };
  walk("exports", pkg.exports);
  walk("bin", typeof pkg.bin === "string" ? { [pkg.name]: pkg.bin } : pkg.bin);
  walk("main", pkg.main);
  walk("types", pkg.types);
  return found.map(([key, target]) => [key, path.posix.normalize(target)]);
}

function packageDirs() {
  const root = readJson(path.join(repo, "package.json"));
  const dirs = ["."];
  for (const pattern of root.workspaces ?? []) {
    if (pattern.endsWith("/*")) {
      const parent = pattern.slice(0, -2);
      for (const name of run("ls", [parent], repo).split("\n").filter(Boolean)) dirs.push(`${parent}/${name}`);
    } else dirs.push(pattern);
  }
  return dirs.filter((dir) => targets(readJson(path.join(repo, dir, "package.json"))).length > 0);
}

function checkShippedTargets(dir) {
  const cwd = path.join(repo, dir);
  const pkg = readJson(path.join(cwd, "package.json"));
  if (pkg.scripts?.build) run("npm", ["run", "build"], cwd);
  const [packed] = JSON.parse(run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], cwd));
  const shipped = new Set(packed.files.map((file) => path.posix.normalize(file.path)));
  for (const [key, target] of targets(pkg)) {
    if (!shipped.has(target)) {
      problems.push(
        `${pkg.name} declares ${key} = "./${target}", but after \`npm run build\` the package does not contain it.\n` +
          `    Make the build in ${path.join(dir, "package.json")} emit ${target}, add it to "files", or remove the entry.`,
      );
    }
  }
}

function checkGitInstall() {
  const pkg = readJson(path.join(repo, "package.json"));
  const sha = run("git", ["rev-parse", "HEAD"], repo).trim();
  if (run("git", ["status", "--porcelain", "--untracked-files=no"], repo).trim()) {
    console.warn(`warning: uncommitted changes are not part of a git install; checking ${sha.slice(0, 7)}`);
  }
  const consumer = mkdtempSync(path.join(tmpdir(), "arc-git-install-"));
  try {
    writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
    run("npm", ["install", "--no-audit", "--no-fund", `git+file://${repo}#${sha}`], consumer);
    const installed = path.join(consumer, "node_modules", pkg.name);
    const shipped = new Set(run("find", [".", "-type", "f"], installed).split("\n").map((f) => path.posix.normalize(f)));
    const missing = targets(pkg).filter(([, target]) => !shipped.has(target));
    for (const [key, target] of missing) {
      problems.push(
        `npm install github:<repo> gives ${pkg.name} without ${target} (${key}).\n` +
          `    npm runs "prepare", not "prepack", for git dependencies, so "prepare" must build it.`,
      );
    }
    if (missing.length > 0) return;
    const loads = Object.entries(pkg.exports ?? {})
      .filter(([, value]) => typeof value === "object" || /\.[cm]?js$/.test(value))
      .map(([subpath]) => {
        const specifier = subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;
        return [`import("${specifier}")`, "node", ["--input-type=module", "-e", `await import(${JSON.stringify(specifier)})`]];
      });
    for (const name of Object.keys(pkg.bin ?? {})) {
      loads.push([`${name} --version`, path.join(consumer, "node_modules", ".bin", name), ["--version"]]);
    }
    for (const [label, cmd, args] of loads) {
      try {
        run(cmd, args, consumer);
      } catch (error) {
        const output = String(error.stderr || error.message);
        const reason = output.split("\n").find((line) => /Error/.test(line)) ?? output.trim().split("\n")[0];
        problems.push(`\`${label}\` fails after a git install:\n    ${reason.trim()}`);
      }
    }
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
}

for (const dir of packageDirs()) checkShippedTargets(dir);
if (!process.argv.includes("--skip-git-install")) checkGitInstall();

if (problems.length > 0) {
  console.error(`Package entry points that consumers cannot load:\n\n${problems.map((p) => `  ${p}`).join("\n\n")}`);
  process.exit(1);
}
console.log("Every declared entry point ships and loads.");

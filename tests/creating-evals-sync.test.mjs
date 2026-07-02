import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// The arc-creating-evals skill exists twice on purpose:
//   skills/arc-creating-evals          — CANONICAL. Tracked, bundled with the
//                                        CLI, and used as the default
//                                        authoring skill by `create --guided`.
//   .agents/skills/arc-creating-evals  — a LOCAL mirror for the dev workflow
//                                        of this repo itself. `.agents/` is
//                                        gitignored, so the mirror only exists
//                                        on dev machines.
// Edit the canonical copy and re-copy it to the mirror. These tests fail on
// any drift so the two can never silently diverge again (they did once: the
// mirror missed newer assertion guidance while holding the only eval suite).
// On checkouts without the local mirror (fresh clones, CI) they skip.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalDir = path.join(repoRoot, "skills", "arc-creating-evals");
const mirrorDir = path.join(repoRoot, ".agents", "skills", "arc-creating-evals");

const mirrorPresent = existsSync(mirrorDir);
const skipNote = { skip: mirrorPresent ? false : "no local .agents/skills mirror (gitignored) on this checkout" };

test("arc-creating-evals canonical copy has SKILL.md and an eval suite", async () => {
  assert.ok(existsSync(path.join(canonicalDir, "SKILL.md")), "canonical SKILL.md missing");
  const evals = JSON.parse(await readFile(path.join(canonicalDir, "evals", "evals.json"), "utf8"));
  assert.equal(evals.skill_name, "arc-creating-evals");
  assert.ok(Array.isArray(evals.evals) && evals.evals.length > 0, "canonical eval suite is empty");
});

test("arc-creating-evals SKILL.md is byte-identical in both copies (canonical: skills/)", skipNote, async () => {
  const canonical = await readFile(path.join(canonicalDir, "SKILL.md"), "utf8");
  const mirror = await readFile(path.join(mirrorDir, "SKILL.md"), "utf8");
  assert.equal(
    mirror,
    canonical,
    `SKILL.md drift between canonical ${path.join("skills", "arc-creating-evals")} ` +
      `and mirror ${path.join(".agents", "skills", "arc-creating-evals")} — ` +
      "edit the canonical copy and re-copy it to the mirror.",
  );
});

test("arc-creating-evals evals.json is present and deep-equal in both copies", skipNote, async () => {
  const canonical = JSON.parse(await readFile(path.join(canonicalDir, "evals", "evals.json"), "utf8"));
  const mirror = JSON.parse(await readFile(path.join(mirrorDir, "evals", "evals.json"), "utf8"));
  assert.deepEqual(
    mirror,
    canonical,
    "evals/evals.json drift between the canonical skills/ copy and the .agents/skills mirror.",
  );
});

test("arc-creating-evals fixture trees match in both copies", skipNote, async () => {
  async function listTree(root) {
    const out = [];
    async function walk(dir, rel) {
      for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const relPath = path.join(rel, entry.name);
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), relPath);
        else out.push(relPath);
      }
    }
    await walk(root, "");
    return out;
  }

  const canonicalFiles = await listTree(path.join(canonicalDir, "evals", "files"));
  const mirrorFiles = await listTree(path.join(mirrorDir, "evals", "files"));
  assert.deepEqual(mirrorFiles, canonicalFiles, "fixture file lists differ between the two copies");

  for (const rel of canonicalFiles) {
    const a = await readFile(path.join(canonicalDir, "evals", "files", rel), "utf8");
    const b = await readFile(path.join(mirrorDir, "evals", "files", rel), "utf8");
    assert.equal(b, a, `fixture content drift: evals/files/${rel}`);
  }
});

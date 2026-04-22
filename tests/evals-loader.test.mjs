import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EvalsJsonValidationError,
  discoverEvalSkills,
  isScriptAssertion,
  readEvalsJson,
} from "../dist/evals/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.resolve(__dirname, "fixtures", "evals-skill-repo");
const ALPHA_EVALS = path.join(FIXTURE_REPO, "skills", "alpha", "evals", "evals.json");

test("readEvalsJson parses the alpha fixture", async () => {
  const file = await readEvalsJson(ALPHA_EVALS);
  assert.equal(file.skill_name, "alpha");
  assert.equal(file.evals.length, 2);

  const [first, second] = file.evals;
  assert.equal(first.id, 1);
  assert.equal(first.prompt, "Use alpha to echo the word 'ready'.");
  assert.ok(first.assertions?.length === 2);
  assert.equal(typeof first.assertions[0], "string");
  assert.ok(isScriptAssertion(first.assertions[1]));
  assert.equal(first.assertions[1].type, "regex-match");

  assert.equal(second.id, "execution-write-file");
  assert.deepEqual(second.files, ["files/empty-workspace"]);
  assert.equal(second.assertions[0].type, "file-exists");
  assert.equal(second.assertions[1].type, "regex-match");
  assert.deepEqual(second.assertions[1].target, { file: "notes.txt" });
});

test("readEvalsJson throws EvalsJsonValidationError with issue list on missing skill_name", async () => {
  const tmp = path.join(__dirname, "tmp-evals.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({ evals: [{ id: 1, prompt: "hi" }] }),
    "utf-8",
  );
  try {
    await readEvalsJson(tmp);
    assert.fail("expected EvalsJsonValidationError");
  } catch (error) {
    assert.ok(error instanceof EvalsJsonValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("skill_name")));
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
});

test("readEvalsJson flags duplicate ids", async () => {
  const tmp = path.join(__dirname, "tmp-evals-dup.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({
      skill_name: "alpha",
      evals: [
        { id: 1, prompt: "one" },
        { id: 1, prompt: "two" },
      ],
    }),
    "utf-8",
  );
  try {
    await readEvalsJson(tmp);
    assert.fail("expected EvalsJsonValidationError");
  } catch (error) {
    assert.ok(error instanceof EvalsJsonValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("duplicate id")));
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
});

test("readEvalsJson validates regex-match pattern syntax", async () => {
  const tmp = path.join(__dirname, "tmp-evals-regex.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({
      skill_name: "alpha",
      evals: [
        {
          id: 1,
          prompt: "p",
          assertions: [{ type: "regex-match", pattern: "[invalid" }],
        },
      ],
    }),
    "utf-8",
  );
  try {
    await readEvalsJson(tmp);
    assert.fail("expected EvalsJsonValidationError");
  } catch (error) {
    assert.ok(error instanceof EvalsJsonValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("valid regular expression")));
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
});

test("discoverEvalSkills finds SKILL.md + evals/evals.json adjacency", async () => {
  const skills = await discoverEvalSkills(FIXTURE_REPO);
  assert.equal(skills.length, 1);
  const [alpha] = skills;
  assert.equal(path.basename(alpha.skillDir), "alpha");
  assert.equal(alpha.relativeSkillDir, path.join("skills", "alpha"));
  assert.equal(path.basename(alpha.skillDefinitionPath), "SKILL.md");
  assert.equal(alpha.evalsJsonPath, ALPHA_EVALS);
});

test("discoverEvalSkills skips dot-prefixed dirs unless includeDotDirs is set", async () => {
  const skills = await discoverEvalSkills(FIXTURE_REPO, { includeDotDirs: false });
  assert.equal(skills.length, 1);
});

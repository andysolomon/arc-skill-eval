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

test("readEvalsJson parses explicit workspace setup and intent assertions", async () => {
  const tmp = path.join(__dirname, "tmp-evals-domain.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({
      version: "1",
      skill_name: "alpha",
      evals: [
        {
          id: "domain-case",
          description: "Uses the richer domain model.",
          prompt: "Configure this repo.",
          setup: {
            kind: "seeded",
            sources: [{ from: "files/clean-repo", to: "." }],
            mountMode: "flatten-contents",
          },
          metadata: {
            tags: ["execution"],
            difficulty: "medium",
            intent: "golden path",
            environment: {
              workspace: { kind: "seeded", writable: true },
              git: { required: false },
              network: { mode: "none" },
            },
          },
          assertions: [
            {
              id: "package-json-exists",
              kind: "workspace",
              method: "file-exists",
              path: "package.json",
              mustPass: true,
            },
            {
              id: "setup-explained",
              kind: "output",
              method: "judge",
              prompt: "The assistant explains the setup.",
            },
          ],
        },
      ],
    }),
    "utf-8",
  );

  try {
    const file = await readEvalsJson(tmp);
    assert.equal(file.version, "1");
    assert.equal(file.evals[0].setup.kind, "seeded");
    assert.equal(file.evals[0].setup.mountMode, "flatten-contents");
    assert.equal(file.evals[0].metadata.environment.network.mode, "none");
    assert.equal(file.evals[0].assertions[0].kind, "workspace");
    assert.equal(file.evals[0].assertions[1].method, "judge");
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
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

test("readEvalsJson accepts a just-bash sandbox field", async () => {
  const tmp = path.join(__dirname, "tmp-evals-sandbox.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({
      skill_name: "alpha",
      evals: [{ id: 1, prompt: "p", sandbox: "just-bash" }],
    }),
    "utf-8",
  );
  try {
    const file = await readEvalsJson(tmp);
    assert.equal(file.evals[0].sandbox, "just-bash");
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
});

test("readEvalsJson rejects an unknown sandbox value", async () => {
  const tmp = path.join(__dirname, "tmp-evals-sandbox-bad.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({
      skill_name: "alpha",
      evals: [{ id: 1, prompt: "p", sandbox: "docker" }],
    }),
    "utf-8",
  );
  try {
    await readEvalsJson(tmp);
    assert.fail("expected EvalsJsonValidationError");
  } catch (error) {
    assert.ok(error instanceof EvalsJsonValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("sandbox")));
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
});

test("readEvalsJson accepts sandboxMocks with file effects", async () => {
  const tmp = path.join(__dirname, "tmp-evals-mocks.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({
      skill_name: "alpha",
      evals: [{
        id: 1,
        prompt: "p",
        sandbox: "just-bash",
        sandboxMocks: [
          { command: "npm", stdout: "ok\n", exitCode: 0, files: [{ path: "out.txt", content: "x" }] },
        ],
      }],
    }),
    "utf-8",
  );
  try {
    const file = await readEvalsJson(tmp);
    assert.equal(file.evals[0].sandboxMocks[0].command, "npm");
    assert.equal(file.evals[0].sandboxMocks[0].files[0].path, "out.txt");
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
});

test("readEvalsJson rejects a sandboxMock missing its command", async () => {
  const tmp = path.join(__dirname, "tmp-evals-mocks-bad.json");
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(
    tmp,
    JSON.stringify({
      skill_name: "alpha",
      evals: [{ id: 1, prompt: "p", sandboxMocks: [{ stdout: "no command" }] }],
    }),
    "utf-8",
  );
  try {
    await readEvalsJson(tmp);
    assert.fail("expected EvalsJsonValidationError");
  } catch (error) {
    assert.ok(error instanceof EvalsJsonValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("sandboxMocks[0].command")));
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

test("arc-conventional-commits trigger eval uses behavior-focused setup assertion", async () => {
  const bundledPath = path.resolve(
    __dirname,
    "..",
    ".agents",
    "skills",
    "arc-conventional-commits",
    "evals",
    "evals.json",
  );
  const file = await readEvalsJson(bundledPath);
  const triggerCase = file.evals.find((c) => c.id === "trigger-explicit-named");
  assert.ok(triggerCase, "expected trigger-explicit-named case");
  const setupAssertion = triggerCase.assertions?.[0];
  assert.equal(typeof setupAssertion, "object");
  assert.equal(setupAssertion.kind, "output");
  assert.equal(setupAssertion.method, "judge");
  assert.match(setupAssertion.prompt, /performs or starts the project-specific setup/);
  assert.match(setupAssertion.prompt, /merely gives generic advice/);
  assert.match(setupAssertion.prompt, /Do not require.*phase names/i);
});

test("hello-world bundled skill evals.json parses and carries the expected cases", async () => {
  const bundledPath = path.resolve(
    __dirname,
    "..",
    "skills",
    "hello-world",
    "evals",
    "evals.json",
  );
  const file = await readEvalsJson(bundledPath);
  assert.equal(file.skill_name, "hello-world");
  assert.equal(file.evals.length, 3);
  const ids = file.evals.map((c) => String(c.id));
  assert.deepEqual(ids, ["default-world", "named-ada", "assistant-names-file"]);

  for (const evalCase of file.evals) {
    assert.ok(
      evalCase.assertions?.every((a) => typeof a !== "string"),
      `${evalCase.id} should use deterministic assertions only`,
    );
    assert.ok(
      evalCase.assertions?.some((a) => typeof a !== "string" && a.type === "regex-match" && a.target === "assistant-text"),
      `${evalCase.id} should assert that the assistant names greeting.txt deterministically`,
    );
  }

  const namedAda = file.evals.find((c) => c.id === "named-ada");
  assert.match(namedAda?.expected_output ?? "", /reply names the file/);
  assert.doesNotMatch(namedAda?.expected_output ?? "", /confirms it greeted Ada/);
});

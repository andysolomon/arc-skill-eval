#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const AGENT_IDENTITY = /noreply@anthropic\.com|@arc\.local$|cursoragent@cursor\.com|^(claude|cursor|codex|copilot|arc pi)\b/i;
const ATTRIBUTION_LINE = /^\s*(co-authored-by:|claude-session:)|generated with \[?(claude|cursor|codex)/i;

const FIX = [
  "Commits and PRs here are authored solely by Andrew Solomon, with no agent attribution.",
  "Fix the branch, then force-push it:",
  `  git rebase ${process.env.BASE_REF ?? "origin/main"} --exec 'git log -1 --format=%B | grep -viE "^(co-authored-by|claude-session):|generated with" | git commit --amend --reset-author -F -'`,
  "Fix a PR description by deleting those lines from it.",
].join("\n");

const range = process.argv[2];
if (!range) {
  console.error("usage: check-attribution.mjs <base>..<head>   (PR_BODY env: the pull request description)");
  process.exit(2);
}

const log = execFileSync("git", ["log", "--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x1e", range], { encoding: "utf8" });

const problems = [];
for (const record of log.split("\x1e")) {
  const [sha, author, committer, body] = record.replace(/^\n/, "").split("\x00");
  if (!sha) continue;
  const short = sha.slice(0, 7);
  for (const [role, identity] of [["author", author], ["committer", committer]]) {
    const [name, email] = identity.split(/ <|>$/);
    if (AGENT_IDENTITY.test(name) || AGENT_IDENTITY.test(email)) problems.push(`${short}: ${role} is ${identity}`);
  }
  for (const line of body.split("\n")) {
    if (ATTRIBUTION_LINE.test(line)) problems.push(`${short}: message has "${line.trim()}"`);
  }
}
for (const line of (process.env.PR_BODY ?? "").split(/\r?\n/)) {
  if (ATTRIBUTION_LINE.test(line)) problems.push(`PR description has "${line.trim()}"`);
}

if (problems.length > 0) {
  console.error(`Agent attribution found in ${range}:\n${problems.map((p) => `  ${p}`).join("\n")}\n\n${FIX}`);
  process.exit(1);
}
console.log(`No agent attribution in ${range}.`);

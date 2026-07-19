---
name: arc-conventional-commits
description: >
  Set up Conventional Commits with semantic-release for automated semantic
  versioning. Use this skill whenever the user mentions conventional commits,
  semantic versioning, semver, release automation, auto version bumping,
  changelog generation, commit message standards, semantic-release, or wants
  to configure automated releases. Also trigger when the user asks about
  commit message formats like "feat:", "fix:", or "BREAKING CHANGE", or wants
  to replace an existing versioning system (standard-version, changesets,
  lerna, release-please) with semantic-release. Even if the user just says
  "set up versioning" or "add release automation", this skill applies.
---

# Conventional Commits + Semantic Release

This skill sets up CI-driven automated versioning using the
[Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
specification and [semantic-release](https://github.com/semantic-release/semantic-release).

The workflow is conversational — always confirm with the user before making
destructive changes like removing existing tooling.

Follow these five phases in order.

---

## Phase 1 — Detect Existing Versioning Tools

Before installing anything, scan the repo for existing versioning infrastructure.
This prevents conflicts and gives the user a chance to cleanly migrate.

Check for these tools using Glob and Read:

| Tool | Files / Patterns |
|------|-----------------|
| semantic-release | `.releaserc`, `.releaserc.json`, `.releaserc.yml`, `.releaserc.yaml`, `release.config.js`, `release.config.cjs` |
| standard-version | `.versionrc`, `.versionrc.json`, `.versionrc.js` |
| changesets | `.changeset/` directory |
| lerna | `lerna.json` |
| release-please | `release-please-config.json`, `.release-please-manifest.json` |

Also read `package.json` and check:
- **devDependencies** for: `semantic-release`, `standard-version`, `@changesets/cli`, `@changesets/changelog-github`, `lerna`, `release-please`, `conventional-changelog-cli`, `np`, `publish-please`
- **scripts** for keys or values containing `version`, `release`, or `publish` (ignore `dev`, `start`, `build`)

**Present findings** to the user as a summary list. Example:

> I found the following versioning tools in this repo:
> - **standard-version** — `.versionrc.json`, `standard-version` in devDependencies
> - **Release script** — `"release": "standard-version"` in package.json scripts
>
> Would you like me to remove these before setting up semantic-release?

If nothing is found, tell the user the repo is clean and skip to Phase 3.

---

## Phase 2 — Remove Existing Tools (Conditional)

Only run this phase if Phase 1 found existing tooling AND the user confirmed removal.

For each detected tool:

1. **Delete config files** — remove all config files identified in Phase 1
2. **Uninstall packages** — run `npm uninstall <package>` for each detected package in devDependencies
3. **Clean up scripts** — remove version/release related scripts from `package.json`
4. **Remove directories** — delete `.changeset/` if changesets was detected

After removal, confirm what was cleaned up:

> Removed:
> - Deleted `.versionrc.json`
> - Uninstalled `standard-version`
> - Removed `"release"` script from package.json

---

## Phase 3 — Install semantic-release

### Step 1: Install core packages

```bash
npm install --save-dev semantic-release \
  @semantic-release/commit-analyzer \
  @semantic-release/release-notes-generator \
  @semantic-release/changelog \
  @semantic-release/npm \
  @semantic-release/github \
  @semantic-release/git \
  conventional-changelog-conventionalcommits
```

### Step 2: Determine the release branch

Check the repo's default branch:
```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || git branch --show-current
```

Use the result (typically `main` or `master`) as the release branch. Confirm with the user if unsure.

### Step 3: Create `.releaserc.json`

The plugin order matters — each plugin runs in sequence, and later plugins depend on earlier ones.

```json
{
  "branches": ["main"],
  "plugins": [
    ["@semantic-release/commit-analyzer", {
      "preset": "conventionalcommits"
    }],
    ["@semantic-release/release-notes-generator", {
      "preset": "conventionalcommits"
    }],
    ["@semantic-release/changelog", {
      "changelogFile": "CHANGELOG.md"
    }],
    ["@semantic-release/npm", {
      "npmPublish": false
    }],
    "@semantic-release/github",
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md", "package.json", "package-lock.json"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }]
  ]
}
```

**Adapt the config:**
- If `package.json` has `"private": true`, keep `npmPublish: false` (already the default above)
- If the package should be published to npm, set `npmPublish: true`
- Replace `"main"` in branches with the actual default branch name

### Step 4: Add release script

Add to `package.json` scripts:
```json
"release": "semantic-release"
```

### Step 5: Ask about commit enforcement

Ask the user:

> Would you like to install commitlint and husky to enforce Conventional Commits
> format on every commit? This prevents malformed commit messages from being pushed.

**If yes:**

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
npx husky init
```

Create `commitlint.config.js`:
```js
export default { extends: ['@commitlint/config-conventional'] };
```

Create the husky hook:
```bash
echo 'npx --no -- commitlint --edit $1' > .husky/commit-msg
```

If `.husky/` already exists (from a previous husky setup), do not run `npx husky init` —
just add the `commit-msg` hook file alongside any existing hooks.

### Step 6: Ask about CI integration

Ask the user:

> Would you like me to create GitHub Actions workflows for PR checks, merge gating,
> and automated releases?

**If yes**, create three workflow files. Replace `main` with the actual default branch in all three.

#### `.github/workflows/release.yml` — runs semantic-release after merge to main

```yaml
name: Release
on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'

      - name: Install dependencies
        run: npm ci

      - name: Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npx semantic-release
```

#### `.github/workflows/pr.yml` — runs checks when a PR is opened or updated

```yaml
name: PR Checks
on:
  pull_request:
    branches: [main]

jobs:
  commitlint:
    name: Validate Commits
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
      - run: npm ci
      - name: Validate commit messages
        run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
      - run: npm ci
      - run: npm run lint --if-present

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
      - run: npm ci
      - run: npm test --if-present
```

#### `.github/workflows/merge.yml` — merge gate (single status check for branch protection)

This runs the same checks as `pr.yml` but as a single job, producing one status check
name (`Merge Gate`) that can be required in GitHub branch protection settings.

```yaml
name: Merge Gate
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

jobs:
  merge-gate:
    name: Merge Gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'

      - run: npm ci

      - name: Validate commits
        run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose

      - name: Lint
        run: npm run lint --if-present

      - name: Test
        run: npm test --if-present
```

Remind the user:
- `GITHUB_TOKEN` is provided automatically by GitHub Actions
- `NPM_TOKEN` is only needed if publishing to npm — they can set it in repo Settings > Secrets
- The `Merge Gate` job name is what they'll set as a required status check in branch protection

### Step 7: Check for monorepo

If `package.json` contains a `workspaces` field or `lerna.json` exists, warn the user:

> This repo appears to be a monorepo. semantic-release has limited monorepo support
> out of the box. Consider looking into `semantic-release-monorepo` or
> `multi-semantic-release` for per-package versioning.

---

## Phase 4 — Verification

After installation:

1. **Dry run** (if the repo has commits):
   ```bash
   npx semantic-release --dry-run --no-ci
   ```
   This validates the config without publishing anything. Share the output with the user.

2. **Summary** — tell the user what was set up:
   - semantic-release with Conventional Commits preset
   - Which plugins are active
   - Whether commitlint/husky enforcement was added
   - Whether a CI workflow was created

3. **Example commits** — show the user how to use the system right away:

   ```
   fix: resolve null pointer in user lookup
   → triggers PATCH bump (e.g., 1.0.0 → 1.0.1)

   feat(auth): add OAuth2 support
   → triggers MINOR bump (e.g., 1.0.1 → 1.1.0)

   feat!: redesign the public API
   → triggers MAJOR bump (e.g., 1.1.0 → 2.0.0)

   chore: update dev dependencies
   → no version bump, appears in changelog
   ```

---

## Phase 5 — Branch Protection

Conventional commits work best when all changes flow through branches and PRs.
This phase sets up three layers of protection to prevent direct commits to main.

### Step 1: Install husky pre-commit hook

This blocks `git commit` on main from the terminal.

```bash
npm install --save-dev husky
npx husky init
```

Replace the contents of `.husky/pre-commit` with:

```sh
#!/bin/sh
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo ""
  echo "  Direct commits to $branch are not allowed."
  echo "  Create a feature branch and open a PR instead:"
  echo ""
  echo "    git checkout -b feat/your-feature"
  echo ""
  exit 1
fi
```

If `.husky/` already exists, do not run `npx husky init` — just replace the `pre-commit` file.
If a `.husky/commit-msg` hook exists (from Phase 3 Step 5), leave it in place.

### Step 2: Install Claude Code PreToolUse hook

This prevents Claude from staging or committing on main. It prompts the user for
approval so they can override if truly needed.

Create `.claude/hooks/protect-main.sh` in the target repo:

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if ! echo "$COMMAND" | grep -qE "^git (add|commit)"; then
  exit 0
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  if echo "$COMMAND" | grep -qE "^git add"; then
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "You are about to stage files on main. Create a feature branch instead."
      }
    }'
  else
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "You are about to commit directly to main. Create a feature branch instead."
      }
    }'
  fi
  exit 0
fi

exit 0
```

Make it executable:
```bash
chmod +x .claude/hooks/protect-main.sh
```

Then create or update `.claude/settings.json` to register the hook. If the file
already exists, merge the `hooks` key into the existing config — do not overwrite
other settings.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/protect-main.sh"
          }
        ]
      }
    ]
  }
}
```

### Step 3: Configure GitHub branch protection

Ask the user:

> Would you like me to set up GitHub branch protection rules on main?
> This requires admin access and enforces PRs at the server level.

**If yes**, use the GitHub CLI:

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -f "required_pull_request_reviews[dismiss_stale_reviews]=false" \
  -f "required_pull_request_reviews[require_code_owner_reviews]=false" \
  -F "required_pull_request_reviews[required_approving_review_count]=1" \
  -F "enforce_admins=true" \
  -f "restrictions=null" \
  -f "required_status_checks=null"
```

Replace `{owner}/{repo}` with the actual values from `gh repo view --json owner,name`.

If the repo has CI workflows (from Phase 3 Step 6), enable the `Merge Gate` job as a
required status check so PRs cannot merge unless all checks pass:

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -f "required_pull_request_reviews[dismiss_stale_reviews]=false" \
  -F "required_pull_request_reviews[required_approving_review_count]=1" \
  -F "enforce_admins=true" \
  -f "restrictions=null" \
  -f "required_status_checks[strict]=true" \
  -f "required_status_checks[contexts][]=Merge Gate"
```

Remind the user:
- `enforce_admins: true` means even repo admins cannot bypass the rules
- `Merge Gate` is the job name from `merge.yml` — it validates commits, runs lint, and runs tests
- They can adjust these settings later in GitHub repo Settings > Branches

---

## Quick Reference — Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

| Prefix | Version Bump | Example |
|--------|-------------|---------|
| `fix:` | PATCH (0.0.x) | `fix: prevent race condition in auth flow` |
| `feat:` | MINOR (0.x.0) | `feat(api): add pagination to /users endpoint` |
| `feat!:` | MAJOR (x.0.0) | `feat!: drop support for Node 14` |
| `BREAKING CHANGE:` footer | MAJOR (x.0.0) | Any type with `BREAKING CHANGE: <desc>` in footer |

**Valid types:** `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`

Only `feat` and `fix` trigger version bumps by default. Other types appear in the changelog but do not bump the version.

---

## Answering Spec Questions

For detailed questions about the Conventional Commits specification — scoping rules,
multi-line bodies, footer syntax, edge cases — read `references/conventional-commits-spec.md`
in this skill's directory. It contains the full v1.0.0 spec with all 16 rules and examples.

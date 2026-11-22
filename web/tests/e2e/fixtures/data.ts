/**
 * Canned daemon payloads shaped like web/daemon's real responses.
 */

export const WORKSPACE_ROOT = '~/src/skills';
export const RESOLVED_ROOT = '/home/tester/src/skills';

export const workspaceSkills = [
  {
    id: 'arc-conventional-commits',
    name: 'arc-conventional-commits',
    description: 'Write conventional commit messages.',
    path: `${RESOLVED_ROOT}/arc-conventional-commits`,
    hasEvals: true,
  },
  {
    id: 'release-please',
    name: 'release-please',
    description: 'Configure release-please.',
    path: `${RESOLVED_ROOT}/release-please`,
    hasEvals: false,
  },
];

export const workspaceResponse = {
  ok: true,
  resolvedPath: RESOLVED_ROOT,
  source: 'local',
  skills: workspaceSkills,
};

/** `GET /runs` — runs the daemon read from `<skill>/evals-runs` on disk. */
export const localhostRuns = {
  runs: [
    {
      id: 'disk-run-compare',
      skill: 'arc-conventional-commits',
      workspaceRoot: `${RESOLVED_ROOT}/arc-conventional-commits`,
      finishedAt: '2026-01-05T09:00:00.000Z',
      status: 'fail',
      compare: true,
      cost: 0.5,
      exitCode: 1,
      cases: [
        {
          id: 'feat-commit',
          prompt: 'Write a commit message for a new login form.',
          status: 'pass',
          withPassed: 2,
          withTotal: 2,
          withoutPassed: 1,
          withoutTotal: 2,
          output: 'feat(auth): add login form',
        },
        {
          id: 'breaking-change',
          prompt: 'Write a commit message for removing the v1 API.',
          status: 'fail',
          failureEvidence: 'missing BREAKING CHANGE footer',
          withPassed: 0,
          withTotal: 1,
          withoutPassed: 0,
          withoutTotal: 1,
        },
      ],
    },
    {
      id: 'disk-run-release',
      skill: 'release-please',
      workspaceRoot: `${RESOLVED_ROOT}/release-please`,
      finishedAt: '2026-01-04T09:00:00.000Z',
      status: 'pass',
      exitCode: 0,
      cases: [
        {
          id: 'configure-release',
          prompt: 'Set up release-please for this repo.',
          status: 'pass',
          output: 'Added release-please-config.json',
        },
      ],
    },
  ],
};

/** Filter `GET /runs` the way the daemon does for `?skill=`. */
export const runsForQuery = (query: URLSearchParams) => {
  const skill = query.get('skill');
  return {
    runs: skill ? localhostRuns.runs.filter((run) => run.skill === skill) : localhostRuns.runs,
  };
};

/**
 * `GET /runs/:runId/artifacts/:caseId/:kind` bodies for disk-run-compare's
 * `feat-commit` case. Every other case has no artifacts on disk (404).
 */
export const featCommitArtifacts: Record<string, string> = {
  'with_skill/grading.json': JSON.stringify({
    case_id: 'feat-commit',
    summary: { passed: 2, failed: 0, total: 2 },
    assertion_results: [
      { text: 'uses feat type', passed: true, evidence: 'subject starts with feat(auth):' },
    ],
  }),
  'without_skill/grading.json': JSON.stringify({
    case_id: 'feat-commit',
    summary: { passed: 1, failed: 1, total: 2 },
    assertion_results: [
      { text: 'uses feat type', passed: false, evidence: 'subject was "Add login form"' },
    ],
  }),
  'with_skill/timing.json': JSON.stringify({
    duration_ms: 4321,
    total_tokens: 1234,
    estimated_cost_usd: 0.0123,
  }),
  'without_skill/timing.json': JSON.stringify({
    duration_ms: 2000,
    total_tokens: 900,
    estimated_cost_usd: 0.005,
  }),
  'with_skill/assistant.md': '# Commit message\n\nfeat(auth): add login form\n- adds the form',
  'without_skill/assistant.md': 'Add login form',
  'with_skill/tool-summary.json': JSON.stringify({
    tool_calls_by_name: { bash: 3, read: 1 },
    skill_reads_by_name: { 'arc-conventional-commits': 1 },
    external_calls: [{ system: 'git', operation: 'commit', target: 'main' }],
    written_files: ['COMMIT_EDITMSG'],
    edited_files: [],
  }),
  'without_skill/tool-summary.json': JSON.stringify({
    tool_calls_by_name: { bash: 1 },
    skill_reads_by_name: {},
    external_calls: [],
    written_files: [],
    edited_files: [],
  }),
  'with_skill/context-manifest.json': JSON.stringify({
    attached_skills: [{ name: 'arc-conventional-commits', role: 'target' }],
  }),
  'without_skill/context-manifest.json': JSON.stringify({ attached_skills: [] }),
};

export const ARTIFACT_PATH = /^\/runs\/([^/]+)\/artifacts\/([^/]+)\/(.+)$/;

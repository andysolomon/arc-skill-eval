import { useEffect, useMemo, useState } from 'react';
import { useReviewData, type ReviewCase, type ReviewRun } from '@/sections/review/useReviewData';
import { useEnv } from '@/state/env';
import type { BrowseVariant } from './useBrowseData';

export type BrowseArtifactKind =
  | 'assistant.md'
  | 'grading.json'
  | 'timing.json'
  | 'trace.json'
  | 'tool-summary.json'
  | 'context-manifest.json'
  | `${BrowseVariant}/assistant.md`
  | `${BrowseVariant}/grading.json`
  | `${BrowseVariant}/timing.json`
  | `${BrowseVariant}/trace.json`
  | `${BrowseVariant}/tool-summary.json`
  | `${BrowseVariant}/context-manifest.json`;

export type ArtifactSourceEnv = 'hosted' | 'localhost';

export type ArtifactSourceState = {
  error: string | null;
  json: unknown;
  loading: boolean;
  source: ArtifactSourceEnv;
  text: string;
};

type UseArtifactSourceInput = {
  caseId: string;
  kind: BrowseArtifactKind;
  runId: string;
  workspaceRoot: string;
};

const emptyArtifact = (source: ArtifactSourceEnv): ArtifactSourceState => ({
  error: null,
  json: null,
  loading: false,
  source,
  text: '',
});

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const artifactFilename = (kind: BrowseArtifactKind) => {
  const parts = kind.split('/');
  return parts[parts.length - 1] ?? kind;
};

export const artifactKindForVariant = (
  compare: boolean,
  variant: BrowseVariant,
  filename: Exclude<BrowseArtifactKind, `${BrowseVariant}/${string}`>,
): BrowseArtifactKind => (compare ? `${variant}/${filename}` : filename) as BrowseArtifactKind;

const buildHostedGrading = (testCase: ReviewCase) => {
  const passed = testCase.status === 'pass';

  return {
    case_id: testCase.id,
    assertion_results: [
      {
        assertion: { text: testCase.prompt },
        evidence:
          testCase.failureEvidence ??
          testCase.output ??
          'Assertions passed with concrete evidence in grading.json.',
        passed,
        text: testCase.prompt,
      },
    ],
    summary: {
      failed: passed ? 0 : 1,
      pass_rate: passed ? 1 : 0,
      passed: passed ? 1 : 0,
      total: 1,
    },
  };
};

const buildHostedTiming = (run: ReviewRun, testCase: ReviewCase) => {
  const response = testCase.output ?? '';
  const totalTokens = Math.max(240, Math.round((testCase.prompt.length + response.length) / 3));

  return {
    context_window_tokens: null,
    context_window_used_percent: null,
    duration_ms: 1800,
    estimated_cost_usd: run.cost ? run.cost / Math.max(1, run.cases.length) : totalTokens * 0.000002,
    model: null,
    thinking_level: null,
    token_usage: {
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      input_tokens: Math.max(1, Math.round(testCase.prompt.length / 3)),
      output_tokens: Math.max(1, Math.round(response.length / 3)),
      total_tokens: totalTokens,
    },
    total_tokens: totalTokens,
  };
};

const buildHostedToolSummary = () => ({
  bash_command_count: 0,
  edited_files: [],
  external_call_count: 0,
  external_calls: [],
  file_touch_count: 0,
  mcp_tool_call_count: 0,
  mcp_tool_calls_by_name: {},
  skill_read_count: 0,
  skill_reads_by_name: {},
  tool_call_count: 0,
  tool_calls_by_name: {},
  tool_error_count: 0,
  tool_result_count: 0,
  written_files: [],
});

const buildHostedContextManifest = (run: ReviewRun) => ({
  active_tools: [],
  ambient: {
    context_files: false,
    extensions: false,
    prompt_templates: false,
    skills: false,
    themes: false,
  },
  attached_skills: run.skill ? [{ name: run.skill, path: run.workspaceRoot, role: 'target' }] : [],
  available_tools: [],
  mcp_servers: [],
  mcp_tools: [],
  mode: 'isolated',
  runtime: 'pi',
});

const readHostedArtifact = (
  runs: ReviewRun[],
  runId: string,
  caseId: string,
  kind: BrowseArtifactKind,
): ArtifactSourceState => {
  const run = runs.find((candidate) => candidate.id === runId);
  const testCase = run?.cases.find((candidate) => candidate.id === caseId);

  if (!run || !testCase) {
    return {
      ...emptyArtifact('hosted'),
      error: 'Artifact not found in imported runs.',
    };
  }

  const filename = artifactFilename(kind);
  const jsonArtifacts: Record<string, unknown> = {
    'context-manifest.json': buildHostedContextManifest(run),
    'grading.json': buildHostedGrading(testCase),
    'timing.json': buildHostedTiming(run, testCase),
    'tool-summary.json': buildHostedToolSummary(),
    'trace.json': {
      case_id: testCase.id,
      observations: {
        assistant: testCase.output ?? null,
      },
    },
  };
  const json = jsonArtifacts[filename];

  if (filename === 'assistant.md') {
    return {
      error: null,
      json: null,
      loading: false,
      source: 'hosted',
      text: testCase.output ?? 'assistant.md is not present in this imported run.',
    };
  }

  if (json !== undefined) {
    return {
      error: null,
      json,
      loading: false,
      source: 'hosted',
      text: JSON.stringify(json, null, 2),
    };
  }

  return {
    ...emptyArtifact('hosted'),
    error: 'Artifact kind is not available in imported runs.',
  };
};

export const getJsonRecord = (value: unknown): Record<string, unknown> | null => toRecord(value);

export const useArtifactSource = ({
  caseId,
  kind,
  runId,
  workspaceRoot,
}: UseArtifactSourceInput): ArtifactSourceState => {
  const { env } = useEnv();
  const { runs } = useReviewData();
  const source = env === 'localhost' ? 'localhost' : 'hosted';
  const hostedArtifact = useMemo(
    () => readHostedArtifact(runs, runId, caseId, kind),
    [caseId, kind, runId, runs],
  );
  const [localhostArtifact, setLocalhostArtifact] = useState<ArtifactSourceState>(
    emptyArtifact('localhost'),
  );

  useEffect(() => {
    if (source !== 'localhost') {
      return;
    }

    const controller = new AbortController();
    const artifactUrl = `http://localhost:7357/runs/${encodeURIComponent(
      runId,
    )}/artifacts/${encodeURIComponent(caseId)}/${encodeURIComponent(kind)}`;

    setLocalhostArtifact({
      ...emptyArtifact('localhost'),
      loading: true,
    });

    void fetch(artifactUrl, { signal: controller.signal })
      .then(async (response) => {
        const text = await response.text();

        if (!response.ok) {
          throw new Error(text || `Artifact request failed with ${response.status}.`);
        }

        setLocalhostArtifact({
          error: null,
          json: kind.endsWith('.json') ? tryParseJson(text) : null,
          loading: false,
          source: 'localhost',
          text,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setLocalhostArtifact({
          ...emptyArtifact('localhost'),
          error: error instanceof Error ? error.message : 'Artifact request failed.',
        });
      });

    return () => controller.abort();
  }, [caseId, kind, runId, source, workspaceRoot]);

  return source === 'localhost' ? localhostArtifact : hostedArtifact;
};

// View-model the TUI renders. The loader (load-artifacts.ts) maps real
// evals-runs/ artifacts into these shapes; the UI never touches the filesystem.

export interface Assertion {
  type: string;       // "file-exists" | "regex-match" | "json-valid" | "llm-judge" | "<kind>/<method>"
  det: boolean;       // deterministic (script) vs LLM-judged
  label: string;      // grading.json assertion_results[].text
  target: string;     // file/target the assertion checks, or ""
  passed: boolean;
  evidence: string;   // grading.json assertion_results[].evidence
  raw: string;        // the originating assertion, JSON-stringified (from evals.json)
}

export type CaseStatus = 'pass' | 'fail' | 'partial';

export interface Case {
  id: string;
  status: CaseStatus;
  prompt: string;
  expected: string;
  setup: string;
  model: string;
  judge: string;
  dur: string;
  tin: number;
  tout: number;
  cr: number;
  cw: number;
  ttot: number;
  cost: string;
  ctxWin: number;
  ctxPct: number;
  tools: [string, number][]; // tool_calls_by_name
  toolErr: number;
  skillReads: string;
  ext: number;
  mcp: number;
  withP: number;
  withT: number;
  withoutP: number;
  withoutT: number;
  delta: string;             // "" when not a --compare run
  assertions: Assertion[];
}

export interface Skill {
  id: string;
  dir: string;        // absolute skill directory — used by the `r` re-run action
  role: 'target' | 'distractor';
  model: string;
  judge: string;
  passed: number;
  total: number;
  withP: number;
  withT: number;
  withoutP: number;
  withoutT: number;
  delta: string;
  totalCost: string;
  totalTokens: number;
  avgDur: string;
  cases: Case[];
}

export interface Run {
  iteration: string;
  runId: string;
  mode: 'single' | 'compare';
  skill: string;
  extra: string;
  ctxMode: string;
  model: string;
  judge: string;
  when: string;
  pass: string;   // "2/3"
  delta: string;
  cost: string;
  exit: number;
  caseFilter: string;
}

export interface Workspace {
  skills: Skill[];
  runs: Run[];
}

export type Focus = 'skills' | 'cases' | 'assertions' | 'runs';

export interface Sel {
  skills: number;
  cases: number;
  assertions: number;
  runs: number;
}

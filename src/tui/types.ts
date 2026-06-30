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

// tool-summary.json digest, shaped for the Trace view.
export interface TraceInfo {
  callCount: number;
  errors: number;
  fileTouches: number;
  bashCount: number;
  toolCalls: [string, number][];   // tool_calls_by_name
  skillReads: [string, number][];  // skill_reads_by_name
  writtenFiles: string[];
  editedFiles: string[];
  externalCalls: { system: string; operation: string; target?: string }[];
}

// context-manifest.json, shaped for the Context view.
export interface ContextInfo {
  mode: string;
  agentDir: string;
  attachedSkills: { name: string; role: string }[];
  activeTools: string[];
  availableTools: { name: string; source: string }[];
  mcpTools: string[];
  mcpServers: string[];
  ambient: Record<string, boolean>;
}

export interface OutputFile { path: string; size: number }

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
  assistant: string;         // assistant.md (with_skill variant when compare)
  assistantWithout: string;  // without_skill assistant.md, or ""
  trace: TraceInfo;
  context: ContextInfo;
  outputs: OutputFile[];
  assertions: Assertion[];
}

export interface Skill {
  id: string;
  dir: string;        // absolute skill directory — used by the `r` re-run action
  runDir: string;     // absolute newest run dir — used to write feedback.json
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

export type CaseMode = 'overview' | 'response' | 'diff' | 'trace' | 'context' | 'raw';

export interface Sel {
  skills: number;
  cases: number;
  assertions: number;
  runs: number;
}

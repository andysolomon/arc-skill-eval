import { useCallback, useState } from 'react';
import { openDatabase, requestToPromise, transactionDone } from '@/persistence/db';
import type { FeedbackRecord } from '@/persistence/feedback';

export type ImprovePlanItem = {
  path: string;
  before: string;
  after: string;
  rationale: string;
};

export type ProposedImprovePlan = {
  planId: string;
  runId: string;
  workspaceRoot: string;
  evalsJson: unknown;
  sourceNoteIds: string[];
  items: ImprovePlanItem[];
  createdAt: string;
  updatedAt: string;
};

export type StagedImprovePlan = {
  diff: unknown;
  plan: ProposedImprovePlan;
  planId: string;
  stagingPath: string;
};

type ProposePlanInput = {
  evalsJson: unknown;
  runId: string;
  stageOnLocalhost: boolean;
  workspaceRoot: string;
};

type ProposePlanState =
  | { status: 'idle'; error: null; plan: null; staged: null }
  | { status: 'proposing'; error: null; plan: null; staged: null }
  | { status: 'proposed'; error: null; plan: ProposedImprovePlan; staged: null }
  | { status: 'staging'; error: null; plan: ProposedImprovePlan; staged: null }
  | { status: 'staged'; error: null; plan: ProposedImprovePlan; staged: StagedImprovePlan }
  | { status: 'error'; error: string; plan: ProposedImprovePlan | null; staged: StagedImprovePlan | null };

const idleState: ProposePlanState = {
  error: null,
  plan: null,
  staged: null,
  status: 'idle',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text.trim() ? (JSON.parse(text) as unknown) : {};
};

const readFeedbackNotes = async (runId: string): Promise<FeedbackRecord[]> => {
  const db = await openDatabase();
  const tx = db.transaction('feedback', 'readonly');
  const done = transactionDone(tx);
  const records = await requestToPromise<FeedbackRecord[]>(
    tx.objectStore('feedback').getAll(),
  );

  await done;
  db.close();

  return records
    .filter((record) => record.runId === runId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

const stringifySnippet = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (!value) {
    return '';
  }

  return JSON.stringify(value, null, 2);
};

const readEvalCases = (evalsJson: unknown): Record<string, unknown>[] => {
  if (!isRecord(evalsJson)) {
    return [];
  }

  const rawCases = Array.isArray(evalsJson.evals)
    ? evalsJson.evals
    : Array.isArray(evalsJson.cases)
      ? evalsJson.cases
      : [];

  return rawCases.filter(isRecord);
};

const readCaseId = (testCase: Record<string, unknown>): string | undefined => {
  const id = testCase.id ?? testCase.caseId ?? testCase.name;
  return typeof id === 'string' && id.trim() ? id : undefined;
};

const summarizeCase = (evalsJson: unknown, caseId: string | undefined): string => {
  const evalCases = readEvalCases(evalsJson);
  const matchedCase = caseId
    ? evalCases.find((testCase) => readCaseId(testCase) === caseId)
    : undefined;

  if (!matchedCase) {
    return caseId ? `No eval case with id ${caseId} was found.` : 'Run-level feedback.';
  }

  const prompt = stringifySnippet(matchedCase.prompt ?? matchedCase.input ?? matchedCase.messages);
  return prompt ? `${caseId}: ${prompt}` : stringifySnippet(matchedCase);
};

const deriveImprovePlan = ({
  evalsJson,
  notes,
  runId,
  workspaceRoot,
}: {
  evalsJson: unknown;
  notes: FeedbackRecord[];
  runId: string;
  workspaceRoot: string;
}): ProposedImprovePlan => {
  const now = new Date().toISOString();

  return {
    planId: crypto.randomUUID(),
    runId,
    workspaceRoot,
    evalsJson,
    sourceNoteIds: notes.map((note) => note.noteId),
    items: notes.map((note) => ({
      path: 'evals/evals.json',
      before: summarizeCase(evalsJson, note.caseId),
      after: note.note,
      rationale: `Feedback Note ${note.noteId} for ${note.caseId ?? 'run'}`,
    })),
    createdAt: now,
    updatedAt: now,
  };
};

const requireStagedPlan = (payload: unknown, plan: ProposedImprovePlan): StagedImprovePlan => {
  if (
    !isRecord(payload) ||
    typeof payload.planId !== 'string' ||
    typeof payload.stagingPath !== 'string'
  ) {
    throw new Error('apply plan returned an invalid response');
  }

  return {
    diff: payload.diff ?? null,
    plan,
    planId: payload.planId,
    stagingPath: payload.stagingPath,
  };
};

export const useProposePlan = () => {
  const [state, setState] = useState<ProposePlanState>(idleState);

  const proposePlan = useCallback(
    async ({ evalsJson, runId, stageOnLocalhost, workspaceRoot }: ProposePlanInput) => {
      setState({ error: null, plan: null, staged: null, status: 'proposing' });

      try {
        const notes = await readFeedbackNotes(runId);

        if (notes.length === 0) {
          throw new Error('at least one feedback note is required');
        }

        const plan = deriveImprovePlan({ evalsJson, notes, runId, workspaceRoot });

        if (!stageOnLocalhost) {
          setState({ error: null, plan, staged: null, status: 'proposed' });
          return { plan, staged: null };
        }

        setState({ error: null, plan, staged: null, status: 'staging' });

        const response = await fetch('http://localhost:7357/apply-plan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            plan,
            runId,
            skillPath: workspaceRoot,
            workspaceRoot,
          }),
        });

        if (!response.ok) {
          throw new Error(`apply plan failed with ${response.status}`);
        }

        const staged = requireStagedPlan(await readJson(response), plan);
        setState({ error: null, plan, staged, status: 'staged' });
        return { plan, staged };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'propose plan failed';
        setState({ error: message, plan: null, staged: null, status: 'error' });
        throw error;
      }
    },
    [],
  );

  const reset = useCallback(() => setState(idleState), []);

  return {
    ...state,
    proposePlan,
    reset,
  };
};

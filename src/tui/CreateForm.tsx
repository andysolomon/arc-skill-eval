// Guided eval-suite creation overlay (C key). Phases: confirm → generating →
// review → writing, with a dismissible error phase — the create --guided flow
// without leaving the TUI. Nothing is written until the author accepts the
// reviewed proposal; reject discards it. Generation/writing run through
// create-driver.ts, which shares createCommand with the CLI.

import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { COLORS } from './theme.js';
import { GLYPHS } from './caps.js';
import { generateCreateProposal, writeCreateProposal } from './create-driver.js';
import type { CreateProposal } from './create-driver.js';
import type { LlmEvalDesignerFn } from '../cli/create-command.js';
import { THINKING_LEVEL_VALUES, type ModelSelection, type ThinkingLevel } from '../contracts/types.js';

type Phase = 'confirm' | 'model' | 'generating' | 'review' | 'writing' | 'error';

const MAX_REVIEW_CASES = 8;
const MAX_RATIONALE_LINES = 3;

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const THINKING_LEVELS = new Set<string>(THINKING_LEVEL_VALUES);

/**
 * Parse `provider/model[:thinking]` with the same rules as the run CLI's
 * --model flag: the slash is required, and a `:suffix` only becomes a
 * thinking level when it names a known one. Exported for tests.
 */
export function parseModelInput(raw: string): ModelSelection {
  const trimmed = raw.trim();
  const invalid = () => new Error(`Invalid model: ${trimmed || '(empty)'}. Expected provider/model or provider/model:thinking.`);
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash === trimmed.length - 1) throw invalid();
  const provider = trimmed.slice(0, slash);
  const modelAndMaybeThinking = trimmed.slice(slash + 1);
  const colon = modelAndMaybeThinking.lastIndexOf(':');
  if (colon < 0) return { provider, id: modelAndMaybeThinking };
  const suffix = modelAndMaybeThinking.slice(colon + 1);
  if (!THINKING_LEVELS.has(suffix)) return { provider, id: modelAndMaybeThinking };
  const id = modelAndMaybeThinking.slice(0, colon);
  if (!id) throw invalid();
  return { provider, id, thinking: suffix as ThinkingLevel };
}

const modelLabel = (m: ModelSelection): string => `${m.provider}/${m.id}${m.thinking ? `:${m.thinking}` : ''}`;

export function CreateForm({ skillDir, skillName, hasSuite, onClose, designer, recentModels }: {
  skillDir: string;
  skillName: string;
  /** evals.json already exists — accepting overwrites it (createCommand --force). */
  hasSuite: boolean;
  onClose: (msg?: string) => void;
  /** Injectable designer (tests); defaults to the real LLM designer. */
  designer?: LlmEvalDesignerFn;
  /** Recent runner models — the first one prefills the model entry line. */
  recentModels?: string[];
}) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [guided, setGuided] = useState(true);
  const [proposal, setProposal] = useState<CreateProposal | null>(null);
  const [error, setError] = useState('');
  const [frame, setFrame] = useState(0);
  const [model, setModel] = useState<ModelSelection | null>(null);
  const [modelText, setModelText] = useState('');
  const [modelError, setModelError] = useState('');
  // Review-phase selection: a cursor over the proposed cases plus the ids the
  // author excluded with space — excluded cases are dropped from the write.
  const [reviewIdx, setReviewIdx] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [reviewError, setReviewError] = useState('');
  // Set when the author escapes mid-generation: the in-flight promise must
  // not call setState (or onClose) on a form that is already gone.
  const cancelled = useRef(false);

  const busy = phase === 'generating' || phase === 'writing';
  useEffect(() => {
    if (!busy) return;
    const spin = setInterval(() => setFrame((f) => f + 1), 80);
    return () => clearInterval(spin);
  }, [busy]);

  const generate = (useLlm: boolean) => {
    setGuided(useLlm);
    setPhase('generating');
    void generateCreateProposal({ skillDir, guided: useLlm, model: model ?? undefined, designer })
      .then((p) => {
        if (cancelled.current) return;
        setProposal(p);
        // Fresh proposal, fresh review state — a regenerate must not inherit
        // the previous proposal's cursor or exclusions.
        setReviewIdx(0);
        setExcluded(new Set());
        setReviewError('');
        setPhase('review');
      })
      .catch((err) => { if (!cancelled.current) { setError(errText(err)); setPhase('error'); } });
  };

  // Enter on the model line: parse, keep the entry open on bad input.
  const submitModel = (value: string) => {
    try {
      setModel(parseModelInput(value));
      setModelError('');
      setPhase('confirm');
    } catch (err) {
      setModelError(errText(err));
    }
  };

  const accept = () => {
    if (!proposal) return;
    const included = proposal.evals.evals.filter((c) => !excluded.has(String(c.id)));
    if (included.length === 0) { setReviewError('at least one case must be included'); return; }
    // Build a filtered copy — the reviewed proposal itself is never mutated.
    const toWrite: CreateProposal = excluded.size === 0
      ? proposal
      : { ...proposal, evals: { ...proposal.evals, evals: included } };
    setPhase('writing');
    void writeCreateProposal({ skillDir, proposal: toWrite, force: hasSuite })
      .then((res) => onClose(`wrote ${res.evalsJsonPath} (${res.evals.evals.length} cases)`))
      .catch((err) => { setError(errText(err)); setPhase('error'); });
  };

  useInput((input, key) => {
    if (phase === 'confirm') {
      if (input === 'g') { generate(true); return; }
      if (input === 'd') { generate(false); return; }
      if (input === 'm') {
        setModelText(model ? modelLabel(model) : (recentModels?.[0] ?? ''));
        setModelError('');
        setPhase('model');
        return;
      }
      if (key.escape) onClose();
      return;
    }
    if (phase === 'model') {
      // TextInput owns typing and enter (onSubmit); esc abandons the entry.
      if (key.escape) { setModelError(''); setPhase('confirm'); }
      return;
    }
    if (phase === 'generating') {
      if (key.escape) { cancelled.current = true; onClose('guided create cancelled — nothing written'); }
      return;
    }
    if (phase === 'review') {
      const reviewCases = proposal?.evals.evals ?? [];
      if (key.upArrow) { setReviewIdx((i) => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setReviewIdx((i) => Math.min(Math.max(0, reviewCases.length - 1), i + 1)); return; }
      if (input === ' ') {
        const id = reviewCases[reviewIdx] ? String(reviewCases[reviewIdx]!.id) : null;
        if (id != null) {
          setExcluded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
          setReviewError('');
        }
        return;
      }
      if (key.return || input === 'a') { accept(); return; }
      if (key.escape) onClose('proposal rejected — nothing written');
      return;
    }
    if (phase === 'error') {
      if (key.return || key.escape) onClose();
      return;
    }
    // writing: the write is fast and must finish atomically — no input.
  });

  const spinner = GLYPHS.spinner[frame % GLYPHS.spinner.length] ?? '.';
  const cases = proposal?.evals.evals ?? [];
  const includedCount = cases.length - excluded.size;
  // Display window follows the cursor so every case is reachable even past
  // the MAX_REVIEW_CASES cap.
  const winStart = Math.max(0, Math.min(reviewIdx - MAX_REVIEW_CASES + 1, cases.length - MAX_REVIEW_CASES));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.borderActive} paddingX={2} paddingY={1} width={72}>
      <Text color={COLORS.blue} bold>Create eval suite — {skillName}</Text>
      <Text color={COLORS.comment}>{skillDir}</Text>
      <Box height={1} />

      {phase === 'confirm' && (
        <>
          {hasSuite && <Text color={COLORS.orange}>evals/evals.json already exists — accepting a proposal overwrites it</Text>}
          <Text color={COLORS.fg}>Propose an eval suite for this skill, review it, then accept or reject.</Text>
          {model && <Text color={COLORS.fg}>model: <Text color={COLORS.cyan}>{modelLabel(model)}</Text> <Text color={COLORS.comment}>(m changes it)</Text></Text>}
          <Box height={1} />
          <Text color={COLORS.comment}>
            <Text color={COLORS.yellow} bold>g</Text> guided (LLM designer, follows arc-creating-evals) · <Text color={COLORS.yellow} bold>d</Text> deterministic starter · <Text color={COLORS.yellow} bold>m</Text> model · <Text color={COLORS.yellow} bold>esc</Text> cancel
          </Text>
        </>
      )}

      {phase === 'model' && (
        <>
          <Text color={COLORS.fg}>Designer model — provider/model[:thinking]</Text>
          <Text><Text color={COLORS.blue} bold>{'› model '}</Text><TextInput value={modelText} onChange={setModelText} onSubmit={submitModel} /></Text>
          {modelError ? <Text color={COLORS.red}>{modelError}</Text> : null}
          <Box height={1} />
          <Text color={COLORS.comment}><Text color={COLORS.yellow} bold>enter</Text> use model · <Text color={COLORS.yellow} bold>esc</Text> back</Text>
        </>
      )}

      {phase === 'generating' && (
        <>
          <Text>
            <Text color={COLORS.cyan} bold>{spinner + ' '}</Text>
            <Text color={COLORS.fg}>{guided ? 'designing eval suite with the LLM designer' : 'building deterministic starter scaffold'}{model ? ` (${modelLabel(model)})` : ''}…</Text>
          </Text>
          <Text color={COLORS.comment}>nothing is written until you accept the reviewed proposal</Text>
          <Box height={1} />
          <Text color={COLORS.comment}><Text color={COLORS.yellow} bold>esc</Text> cancel</Text>
        </>
      )}

      {phase === 'review' && proposal && (
        <>
          <Text color={COLORS.blue} bold>Proposal <Text color={COLORS.green}>({cases.length} cases)</Text>{proposal.fixtureInputs.length > 0 ? <Text color={COLORS.comment}> · {proposal.fixtureInputs.length} fixture inputs</Text> : null}</Text>
          {proposal.rationale.slice(0, MAX_RATIONALE_LINES).map((r, i) => (
            <Text key={i} color={COLORS.dim} wrap="truncate">{GLYPHS.bullet} {r}</Text>
          ))}
          <Box flexDirection="column" marginY={1}>
            {winStart > 0 && <Text color={COLORS.dim}>…{winStart} above</Text>}
            {cases.slice(winStart, winStart + MAX_REVIEW_CASES).map((c, i) => {
              const idx = winStart + i;
              const sel = idx === reviewIdx;
              const off = excluded.has(String(c.id));
              return (
                <Text key={String(c.id)} wrap="truncate">
                  <Text color={sel ? COLORS.blue : COLORS.comment} bold={sel}>{sel ? '› ' : '  '}</Text>
                  <Text color={off ? COLORS.dim : COLORS.green}>{off ? GLYPHS.fail : GLYPHS.pass} </Text>
                  <Text color={off ? COLORS.dim : COLORS.fg} bold={sel}>{String(c.id)}</Text>
                  <Text color={COLORS.comment}>  {(c.assertions ?? []).length} assertions{c.description ? ` — ${c.description}` : ''}</Text>
                </Text>
              );
            })}
            {cases.length > winStart + MAX_REVIEW_CASES && <Text color={COLORS.dim}>…and {cases.length - winStart - MAX_REVIEW_CASES} more</Text>}
          </Box>
          {reviewError ? <Text color={COLORS.red}>{reviewError}</Text> : null}
          <Text color={COLORS.comment}>
            <Text color={COLORS.yellow} bold>↑↓</Text> case · <Text color={COLORS.yellow} bold>space</Text> toggle · <Text color={COLORS.yellow} bold>enter</Text> accept & write ({includedCount}/{cases.length} cases){hasSuite ? ' (overwrites)' : ''} · <Text color={COLORS.yellow} bold>esc</Text> reject
          </Text>
        </>
      )}

      {phase === 'writing' && (
        <Text>
          <Text color={COLORS.cyan} bold>{spinner + ' '}</Text>
          <Text color={COLORS.fg}>writing evals/evals.json…</Text>
        </Text>
      )}

      {phase === 'error' && (
        <>
          <Text color={COLORS.red}>✗ {error}</Text>
          <Box height={1} />
          <Text color={COLORS.comment}><Text color={COLORS.yellow} bold>esc</Text> close</Text>
        </>
      )}
    </Box>
  );
}

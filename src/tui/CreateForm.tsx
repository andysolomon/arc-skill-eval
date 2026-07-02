// Guided eval-suite creation overlay (C key). Phases: confirm → generating →
// review → writing, with a dismissible error phase — the create --guided flow
// without leaving the TUI. Nothing is written until the author accepts the
// reviewed proposal; reject discards it. Generation/writing run through
// create-driver.ts, which shares createCommand with the CLI.

import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { COLORS } from './theme.js';
import { GLYPHS } from './caps.js';
import { generateCreateProposal, writeCreateProposal } from './create-driver.js';
import type { CreateProposal } from './create-driver.js';
import type { LlmEvalDesignerFn } from '../cli/create-command.js';

type Phase = 'confirm' | 'generating' | 'review' | 'writing' | 'error';

const MAX_REVIEW_CASES = 8;
const MAX_RATIONALE_LINES = 3;

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function CreateForm({ skillDir, skillName, hasSuite, onClose, designer }: {
  skillDir: string;
  skillName: string;
  /** evals.json already exists — accepting overwrites it (createCommand --force). */
  hasSuite: boolean;
  onClose: (msg?: string) => void;
  /** Injectable designer (tests); defaults to the real LLM designer. */
  designer?: LlmEvalDesignerFn;
}) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [guided, setGuided] = useState(true);
  const [proposal, setProposal] = useState<CreateProposal | null>(null);
  const [error, setError] = useState('');
  const [frame, setFrame] = useState(0);
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
    void generateCreateProposal({ skillDir, guided: useLlm, designer })
      .then((p) => { if (!cancelled.current) { setProposal(p); setPhase('review'); } })
      .catch((err) => { if (!cancelled.current) { setError(errText(err)); setPhase('error'); } });
  };

  const accept = () => {
    if (!proposal) return;
    setPhase('writing');
    void writeCreateProposal({ skillDir, proposal, force: hasSuite })
      .then((res) => onClose(`wrote ${res.evalsJsonPath} (${res.evals.evals.length} cases)`))
      .catch((err) => { setError(errText(err)); setPhase('error'); });
  };

  useInput((input, key) => {
    if (phase === 'confirm') {
      if (input === 'g') { generate(true); return; }
      if (input === 'd') { generate(false); return; }
      if (key.escape) onClose();
      return;
    }
    if (phase === 'generating') {
      if (key.escape) { cancelled.current = true; onClose('guided create cancelled — nothing written'); }
      return;
    }
    if (phase === 'review') {
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

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.borderActive} paddingX={2} paddingY={1} width={72}>
      <Text color={COLORS.blue} bold>Create eval suite — {skillName}</Text>
      <Text color={COLORS.comment}>{skillDir}</Text>
      <Box height={1} />

      {phase === 'confirm' && (
        <>
          {hasSuite && <Text color={COLORS.orange}>evals/evals.json already exists — accepting a proposal overwrites it</Text>}
          <Text color={COLORS.fg}>Propose an eval suite for this skill, review it, then accept or reject.</Text>
          <Box height={1} />
          <Text color={COLORS.comment}>
            <Text color={COLORS.yellow} bold>g</Text> guided (LLM designer, follows arc-creating-evals) · <Text color={COLORS.yellow} bold>d</Text> deterministic starter · <Text color={COLORS.yellow} bold>esc</Text> cancel
          </Text>
        </>
      )}

      {phase === 'generating' && (
        <>
          <Text>
            <Text color={COLORS.cyan} bold>{spinner + ' '}</Text>
            <Text color={COLORS.fg}>{guided ? 'designing eval suite with the LLM designer…' : 'building deterministic starter scaffold…'}</Text>
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
            {cases.slice(0, MAX_REVIEW_CASES).map((c) => (
              <Text key={String(c.id)} wrap="truncate">
                <Text color={COLORS.fg}>{String(c.id)}</Text>
                <Text color={COLORS.comment}>  {(c.assertions ?? []).length} assertions{c.description ? ` — ${c.description}` : ''}</Text>
              </Text>
            ))}
            {cases.length > MAX_REVIEW_CASES && <Text color={COLORS.dim}>…and {cases.length - MAX_REVIEW_CASES} more</Text>}
          </Box>
          <Text color={COLORS.comment}>
            <Text color={COLORS.yellow} bold>enter</Text> accept & write{hasSuite ? ' (overwrites)' : ''} · <Text color={COLORS.yellow} bold>esc</Text> reject
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

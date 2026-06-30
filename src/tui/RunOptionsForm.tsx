// Structured run-options overlay for `o`. Avoids making users remember raw
// CLI flags while still showing the generated command fragment.

import { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { COLORS } from './theme.js';

interface RunOptionsFormProps {
  skillName: string;
  caseId: string | null;
  recentJudgeModels: string[];
  recentRunnerModels: string[];
  onRun: (req: { compare: boolean; extraArgs: string }) => void;
  onClose: () => void;
}

type Field = 'judge' | 'judgeCustom' | 'runner' | 'runnerCustom' | 'iteration' | 'context' | 'compare' | 'extraSkill' | 'advanced';
const FIELDS: Field[] = ['judge', 'judgeCustom', 'runner', 'runnerCustom', 'iteration', 'context', 'compare', 'extraSkill', 'advanced'];
const CONTEXT_MODES = ['isolated', 'ambient'] as const;

function uniq(values: string[]): string[] {
  return [...new Set(values.filter((v) => v && v !== '—'))];
}

function quote(v: string): string {
  if (!v) return '';
  return /\s/.test(v) ? JSON.stringify(v) : v;
}

function modelChoices(recent: string[]): string[] {
  return ['default', ...uniq(recent).slice(0, 5), 'custom…'];
}

function choiceValue(choice: string, custom: string): string {
  if (choice === 'default') return '';
  if (choice === 'custom…') return custom.trim();
  return choice;
}

export function RunOptionsForm({ skillName, caseId, recentJudgeModels, recentRunnerModels, onRun, onClose }: RunOptionsFormProps) {
  const judgeChoices = useMemo(() => modelChoices(recentJudgeModels), [recentJudgeModels]);
  const runnerChoices = useMemo(() => modelChoices(recentRunnerModels), [recentRunnerModels]);
  const [field, setField] = useState(0);
  const [judgeIdx, setJudgeIdx] = useState(Math.min(1, judgeChoices.length - 1));
  const [runnerIdx, setRunnerIdx] = useState(0);
  const [judgeCustom, setJudgeCustom] = useState('');
  const [runnerCustom, setRunnerCustom] = useState('');
  const [iteration, setIteration] = useState('');
  const [contextIdx, setContextIdx] = useState(0);
  const [compare, setCompare] = useState(false);
  const [extraSkill, setExtraSkill] = useState('');
  const [advanced, setAdvanced] = useState('');

  const current = FIELDS[field]!;
  const generated = useMemo(() => {
    const parts: string[] = [];
    const judge = choiceValue(judgeChoices[judgeIdx] ?? 'default', judgeCustom);
    const runner = choiceValue(runnerChoices[runnerIdx] ?? 'default', runnerCustom);
    if (judge) parts.push('--judge-model', quote(judge));
    if (runner) parts.push('--model', quote(runner));
    if (iteration.trim()) parts.push('--iteration', quote(iteration.trim()));
    if (CONTEXT_MODES[contextIdx] !== 'isolated') parts.push('--context-mode', CONTEXT_MODES[contextIdx]!);
    if (extraSkill.trim()) parts.push('--extra-skill', quote(extraSkill.trim()));
    if (advanced.trim()) parts.push(advanced.trim());
    return parts.join(' ');
  }, [advanced, contextIdx, extraSkill, iteration, judgeChoices, judgeCustom, judgeIdx, runnerChoices, runnerCustom, runnerIdx]);

  const run = () => onRun({ compare, extraArgs: generated });
  const move = (delta: number) => setField((f) => (f + delta + FIELDS.length) % FIELDS.length);
  const cycle = (delta: number) => {
    if (current === 'judge') setJudgeIdx((i) => (i + delta + judgeChoices.length) % judgeChoices.length);
    else if (current === 'runner') setRunnerIdx((i) => (i + delta + runnerChoices.length) % runnerChoices.length);
    else if (current === 'context') setContextIdx((i) => (i + delta + CONTEXT_MODES.length) % CONTEXT_MODES.length);
    else if (current === 'compare') setCompare((v) => !v);
  };

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.return) { run(); return; }
    if (key.tab) { move(key.shift ? -1 : 1); return; }
    if (key.upArrow) { move(-1); return; }
    if (key.downArrow) { move(1); return; }
    if (key.leftArrow) { cycle(-1); return; }
    if (key.rightArrow) { cycle(1); return; }
    if (input === ' ') { cycle(1); return; }
  });

  const row = (id: Field, label: string, value: string, hint = '') => {
    const active = current === id;
    return (
      <Text key={id}>
        <Text color={active ? COLORS.blue : COLORS.comment} bold={active}>{active ? '› ' : '  '}{label.padEnd(14)}</Text>
        <Text color={active ? COLORS.fg : COLORS.fgDark}>{value || 'default'}</Text>
        {hint ? <Text color={COLORS.dim}>{'  ' + hint}</Text> : null}
      </Text>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.borderActive} paddingX={2} paddingY={1} width={76}>
      <Text color={COLORS.blue} bold>Run options</Text>
      <Text color={COLORS.comment}>{`./skills/${skillName}${caseId ? ` · case ${caseId}` : ''}`}</Text>
      <Box height={1} />
      {row('judge', 'judge model', judgeChoices[judgeIdx] ?? 'default', '←/→ choose')}
      {current === 'judgeCustom' ? (
        <Text><Text color={COLORS.blue} bold>› custom judge </Text><TextInput value={judgeCustom} onChange={setJudgeCustom} /></Text>
      ) : row('judgeCustom', 'custom judge', judgeCustom, judgeChoices[judgeIdx] === 'custom…' ? 'used by judge model' : '')}
      {row('runner', 'runner model', runnerChoices[runnerIdx] ?? 'default', '←/→ choose')}
      {current === 'runnerCustom' ? (
        <Text><Text color={COLORS.blue} bold>› custom runner</Text><Text> </Text><TextInput value={runnerCustom} onChange={setRunnerCustom} /></Text>
      ) : row('runnerCustom', 'custom runner', runnerCustom, runnerChoices[runnerIdx] === 'custom…' ? 'used by runner model' : '')}
      {current === 'iteration' ? (
        <Text><Text color={COLORS.blue} bold>› iteration    </Text><TextInput value={iteration} onChange={setIteration} /></Text>
      ) : row('iteration', 'iteration', iteration)}
      {row('context', 'context mode', CONTEXT_MODES[contextIdx]!, '←/→ choose')}
      {row('compare', 'compare', compare ? '[x]' : '[ ]', 'space toggles')}
      {current === 'extraSkill' ? (
        <Text><Text color={COLORS.blue} bold>› extra skill  </Text><TextInput value={extraSkill} onChange={setExtraSkill} /></Text>
      ) : row('extraSkill', 'extra skill', extraSkill)}
      {current === 'advanced' ? (
        <Text><Text color={COLORS.blue} bold>› advanced     </Text><TextInput value={advanced} onChange={setAdvanced} /></Text>
      ) : row('advanced', 'advanced', advanced, 'raw supported flags')}
      <Box height={1} />
      <Text color={COLORS.comment}>command preview</Text>
      <Text color={COLORS.fgDark}>{`arc-skill-eval run ${skillName}${caseId ? ` --case ${caseId}` : ''}${compare ? ' --compare' : ''}${generated ? ` ${generated}` : ''}`}</Text>
      <Box height={1} />
      <Text color={COLORS.comment}><Text color={COLORS.yellow} bold>enter</Text> run · <Text color={COLORS.yellow} bold>tab/↑↓</Text> field · <Text color={COLORS.yellow} bold>←→/space</Text> choose · <Text color={COLORS.yellow} bold>esc</Text> cancel</Text>
    </Box>
  );
}

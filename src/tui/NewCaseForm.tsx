// New-eval-case form overlay. Three fields, tab to move, enter to save, esc to
// cancel. Uses ink-text-input (npm i ink-text-input) for cursor + editing.
// The actual write is done by appendEvalCase in new-case.ts.

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { COLORS } from './theme.js';
import { appendEvalCase } from './new-case.js';

const FIELDS = ['case id', 'prompt', 'expected output'] as const;

export function NewCaseForm({ skillDir, skillName, onClose }: { skillDir: string; skillName: string; onClose: (msg?: string) => void }) {
  const [field, setField] = useState(0);
  const [vals, setVals] = useState(['', '', '']);
  const [saving, setSaving] = useState(false);

  const setVal = (i: number, v: string) => setVals((prev) => prev.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await appendEvalCase({ skillDir, id: vals[0]!, prompt: vals[1]!, expected: vals[2]! });
      onClose(`appended ${res.caseId} → evals.json (${res.total} cases) · edit for assertions`);
    } catch (err) {
      onClose(`could not write evals.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  useInput((_input, key) => {
    if (saving) return;
    if (key.escape) { onClose(); return; }
    if (key.tab) { setField((f) => (f + (key.shift ? FIELDS.length - 1 : 1)) % FIELDS.length); return; }
    if (key.return) { if (field < FIELDS.length - 1) setField((f) => f + 1); else void save(); }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.borderActive} paddingX={2} paddingY={1} width={62}>
      <Text color={COLORS.blue} bold>New eval case</Text>
      <Text color={COLORS.comment}>{`appends to ./skills/${skillName}/evals/evals.json`}</Text>
      <Box height={1} />
      {FIELDS.map((label, i) => (
        <Box key={label} flexDirection="column" marginBottom={1}>
          <Text color={field === i ? COLORS.blue : COLORS.comment} bold={field === i}>{label}</Text>
          <Box borderStyle="round" borderColor={field === i ? COLORS.borderActive : COLORS.border} paddingX={1}>
            {field === i
              ? <TextInput value={vals[i]!} onChange={(v) => setVal(i, v)} />
              : <Text color={vals[i] ? COLORS.fg : COLORS.dim}>{vals[i] || ' '}</Text>}
          </Box>
        </Box>
      ))}
      <Text color={COLORS.comment}>
        <Text color={COLORS.yellow} bold>tab</Text> next · <Text color={COLORS.yellow} bold>enter</Text> {field < 2 ? 'next' : 'save'} · <Text color={COLORS.yellow} bold>esc</Text> cancel
      </Text>
    </Box>
  );
}

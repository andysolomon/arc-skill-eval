// New-eval-case form overlay. Step 1: three case fields (tab to move, enter
// to advance). Step 2: assertion builder — add typed assertions (script-first
// per arc-creating-evals Phase 4), each validated inline before it joins the
// list; enter saves the case. Esc cancels the overlay at any point.
// The actual write is done by appendEvalCase in new-case.ts.

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { COLORS } from './theme.js';
import {
  appendEvalCase,
  validateAuthoredAssertion,
  ASSERTION_BUDGET,
  type AuthoredAssertion,
} from './new-case.js';

const CASE_FIELDS = ['case id', 'prompt', 'expected output'] as const;

type AssertionKind = AuthoredAssertion['type'];

const ASSERTION_TYPES: Array<{ kind: AssertionKind; key: string; label: string; hint: string }> = [
  { kind: 'file-exists', key: '1', label: 'file-exists', hint: 'a file the skill must create' },
  { kind: 'regex-match', key: '2', label: 'regex-match', hint: 'pattern in assistant text or a file' },
  { kind: 'json-valid', key: '3', label: 'json-valid', hint: 'a file that must parse as JSON' },
  { kind: 'judge', key: '4', label: 'judge (LLM)', hint: 'a behavior claim graded by the judge' },
];

/** Per-type input fields shown while editing one assertion. */
const TYPE_FIELDS: Record<AssertionKind, Array<{ name: string; label: string }>> = {
  'file-exists': [{ name: 'path', label: 'path (workspace-relative)' }],
  'json-valid': [{ name: 'path', label: 'path (workspace-relative)' }],
  'regex-match': [
    { name: 'pattern', label: 'pattern (JS regex, no slashes)' },
    { name: 'flags', label: 'flags (optional, e.g. mi)' },
    { name: 'file', label: 'target file (empty = assistant-text)' },
  ],
  judge: [{ name: 'text', label: 'claim (action verbs + proper nouns, evidence-checkable)' }],
};

function buildAssertion(kind: AssertionKind, values: Record<string, string>): AuthoredAssertion {
  switch (kind) {
    case 'file-exists':
      return { type: 'file-exists', path: values.path ?? '' };
    case 'json-valid':
      return { type: 'json-valid', path: values.path ?? '' };
    case 'regex-match':
      return {
        type: 'regex-match',
        pattern: values.pattern ?? '',
        flags: values.flags || undefined,
        target: values.file?.trim() ? { file: values.file } : 'assistant-text',
      };
    case 'judge':
      return { type: 'judge', text: values.text ?? '' };
  }
}

export function summarizeAssertion(assertion: AuthoredAssertion): string {
  switch (assertion.type) {
    case 'file-exists':
      return `file-exists ${assertion.path}`;
    case 'json-valid':
      return `json-valid ${assertion.path}`;
    case 'regex-match':
      return `regex /${assertion.pattern}/${assertion.flags ?? ''} in ${
        assertion.target === 'assistant-text' ? 'assistant-text' : assertion.target.file
      }`;
    case 'judge':
      return `judge: ${assertion.text}`;
  }
}

type Mode = 'fields' | 'assertions' | 'pick-type' | 'edit' | 'saved';

export function NewCaseForm({ skillDir, skillName, onClose, onDryRun }: {
  skillDir: string;
  skillName: string;
  onClose: (msg?: string) => void;
  /** Offered after a successful save: launch a run scoped to the new case. */
  onDryRun?: (caseId: string, msg: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('fields');
  const [field, setField] = useState(0);
  const [vals, setVals] = useState(['', '', '']);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ caseId: string; msg: string } | null>(null);

  const [assertions, setAssertions] = useState<AuthoredAssertion[]>([]);
  const [selected, setSelected] = useState(0);
  const [editKind, setEditKind] = useState<AssertionKind>('file-exists');
  const [editField, setEditField] = useState(0);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);

  const setVal = (i: number, v: string) => setVals((prev) => prev.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await appendEvalCase({ skillDir, id: vals[0]!, prompt: vals[1]!, expected: vals[2]!, assertions });
      const msg = res.assertionCount > 0
        ? `appended ${res.caseId} → evals.json (${res.total} cases, ${res.assertionCount} assertions)`
        : `appended ${res.caseId} → evals.json (${res.total} cases) · edit for assertions`;
      if (onDryRun) {
        // Offer the arc-creating-evals Phase 5 dry-run while context is fresh.
        setSaving(false);
        setSaved({ caseId: res.caseId, msg });
        setMode('saved');
      } else {
        onClose(msg);
      }
    } catch (err) {
      onClose(`could not write evals.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const commitEdit = () => {
    const assertion = buildAssertion(editKind, editVals);
    const problem = validateAuthoredAssertion(assertion);
    if (problem) {
      setEditError(problem);
      return;
    }
    setAssertions((prev) => [...prev, assertion]);
    setSelected(assertions.length);
    setEditError(null);
    setMode('assertions');
  };

  useInput((input, key) => {
    if (saving) return;
    if (mode === 'saved') {
      // The case is already on disk — every exit path reports the save.
      if (input === 'r' && saved) { onDryRun?.(saved.caseId, saved.msg); return; }
      if (key.return || key.escape) { onClose(saved?.msg); return; }
      return;
    }
    if (key.escape) {
      // Esc backs out one layer; from the top layers it cancels the form.
      if (mode === 'edit') { setEditError(null); setMode('pick-type'); return; }
      if (mode === 'pick-type') { setMode('assertions'); return; }
      onClose();
      return;
    }

    if (mode === 'fields') {
      if (key.tab) { setField((f) => (f + (key.shift ? CASE_FIELDS.length - 1 : 1)) % CASE_FIELDS.length); return; }
      if (key.return) {
        if (field < CASE_FIELDS.length - 1) setField((f) => f + 1);
        else setMode('assertions');
      }
      return;
    }

    if (mode === 'assertions') {
      if (input === 'a') { setMode('pick-type'); return; }
      if ((input === 'd' || key.delete) && assertions.length > 0) {
        setAssertions((prev) => prev.filter((_, i) => i !== selected));
        setSelected((s) => Math.max(0, Math.min(s, assertions.length - 2)));
        return;
      }
      if (input === 'b') { setMode('fields'); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(assertions.length - 1, s + 1)); return; }
      if (key.return) { void save(); }
      return;
    }

    if (mode === 'pick-type') {
      const picked = ASSERTION_TYPES.find((t) => t.key === input);
      if (picked) {
        setEditKind(picked.kind);
        setEditField(0);
        setEditVals({});
        setEditError(null);
        setMode('edit');
      }
      return;
    }

    if (mode === 'edit') {
      const fields = TYPE_FIELDS[editKind];
      if (key.tab) { setEditField((f) => (f + (key.shift ? fields.length - 1 : 1)) % fields.length); return; }
      if (key.return) {
        if (editField < fields.length - 1) setEditField((f) => f + 1);
        else commitEdit();
      }
    }
  });

  const count = assertions.length;
  const countColor = count === 0 ? COLORS.dim : count < ASSERTION_BUDGET.min || count > ASSERTION_BUDGET.max ? COLORS.yellow : COLORS.green;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.borderActive} paddingX={2} paddingY={1} width={72}>
      <Text color={COLORS.blue} bold>New eval case</Text>
      <Text color={COLORS.comment}>{`appends to ./skills/${skillName}/evals/evals.json`}</Text>
      <Box height={1} />

      {mode === 'fields' && (
        <>
          {CASE_FIELDS.map((label, i) => (
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
            <Text color={COLORS.yellow} bold>tab</Text> next · <Text color={COLORS.yellow} bold>enter</Text> {field < 2 ? 'next' : 'assertions →'} · <Text color={COLORS.yellow} bold>esc</Text> cancel
          </Text>
        </>
      )}

      {mode === 'assertions' && (
        <>
          <Text color={COLORS.blue} bold>
            Assertions <Text color={countColor}>({count})</Text>
            <Text color={COLORS.comment}> · {ASSERTION_BUDGET.min}–{ASSERTION_BUDGET.max} recommended, script-first</Text>
          </Text>
          <Box flexDirection="column" marginY={1}>
            {assertions.length === 0
              ? <Text color={COLORS.dim}>none yet — saving now writes a placeholder the case fails on until authored</Text>
              : assertions.map((assertion, i) => (
                  <Text key={i} color={i === selected ? COLORS.fg : COLORS.comment}>
                    {i === selected ? '› ' : '  '}{summarizeAssertion(assertion)}
                  </Text>
                ))}
          </Box>
          <Text color={COLORS.comment}>
            <Text color={COLORS.yellow} bold>a</Text> add · <Text color={COLORS.yellow} bold>d</Text> delete · <Text color={COLORS.yellow} bold>↑↓</Text> select · <Text color={COLORS.yellow} bold>b</Text> back · <Text color={COLORS.yellow} bold>enter</Text> save case · <Text color={COLORS.yellow} bold>esc</Text> cancel
          </Text>
        </>
      )}

      {mode === 'pick-type' && (
        <>
          <Text color={COLORS.blue} bold>Assertion type</Text>
          <Box flexDirection="column" marginY={1}>
            {ASSERTION_TYPES.map((t) => (
              <Text key={t.kind}>
                <Text color={COLORS.yellow} bold>{t.key}</Text>
                <Text color={COLORS.fg}> {t.label}</Text>
                <Text color={COLORS.comment}> — {t.hint}</Text>
              </Text>
            ))}
          </Box>
          <Text color={COLORS.comment}><Text color={COLORS.yellow} bold>esc</Text> back</Text>
        </>
      )}

      {mode === 'saved' && saved && (
        <>
          <Text color={COLORS.green} bold>✓ {saved.msg}</Text>
          <Box height={1} />
          <Text color={COLORS.comment}>Dry-run this case now to validate its assertions against a real run while the context is fresh (arc-creating-evals Phase 5).</Text>
          <Box height={1} />
          <Text color={COLORS.comment}>
            <Text color={COLORS.yellow} bold>r</Text> dry-run {saved.caseId} · <Text color={COLORS.yellow} bold>enter</Text> close
          </Text>
        </>
      )}

      {mode === 'edit' && (
        <>
          <Text color={COLORS.blue} bold>{ASSERTION_TYPES.find((t) => t.kind === editKind)!.label}</Text>
          <Box height={1} />
          {TYPE_FIELDS[editKind].map((f, i) => (
            <Box key={f.name} flexDirection="column" marginBottom={1}>
              <Text color={editField === i ? COLORS.blue : COLORS.comment} bold={editField === i}>{f.label}</Text>
              <Box borderStyle="round" borderColor={editField === i ? COLORS.borderActive : COLORS.border} paddingX={1}>
                {editField === i
                  ? <TextInput value={editVals[f.name] ?? ''} onChange={(v) => setEditVals((prev) => ({ ...prev, [f.name]: v }))} />
                  : <Text color={editVals[f.name] ? COLORS.fg : COLORS.dim}>{editVals[f.name] || ' '}</Text>}
              </Box>
            </Box>
          ))}
          {editError && <Text color={COLORS.red}>✗ {editError}</Text>}
          <Text color={COLORS.comment}>
            <Text color={COLORS.yellow} bold>tab</Text> next · <Text color={COLORS.yellow} bold>enter</Text> {editField < TYPE_FIELDS[editKind].length - 1 ? 'next' : 'add'} · <Text color={COLORS.yellow} bold>esc</Text> back
          </Text>
        </>
      )}
    </Box>
  );
}

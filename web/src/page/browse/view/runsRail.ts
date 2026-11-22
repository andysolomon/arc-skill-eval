import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { countStatus, type Run } from '../domain';
import { Message } from '../message';
import { panelHeader, selectableRow } from './selectableRow';

// VIEW

const runGlyph = (run: Run): Readonly<{ glyph: string; color: string }> => {
  if (Option.contains(run.maybeStatus, 'fail') || Array.some(run.cases, (testCase) => testCase.status === 'fail')) {
    return { glyph: '✗', color: 'var(--tt-red)' };
  }
  if (Option.contains(run.maybeStatus, 'timeout') || Array.some(run.cases, (testCase) => testCase.status === 'timeout')) {
    return { glyph: '◐', color: 'var(--tt-orange)' };
  }
  return { glyph: '✓', color: 'var(--tt-green)' };
};

const runRow = (run: Run, isSelected: boolean, h: HtmlBuilder<Message>): Html => {
  const status = runGlyph(run);
  return selectableRow(
    {
      key: run.id,
      label: `select run ${run.id}`,
      title: `${run.skill} · ${run.finishedAt}`,
      isSelected,
      onSelect: Message.SelectedRun({ runId: run.id }),
      glyph: status.glyph,
      glyphColor: status.color,
      textColor: isSelected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
      trailing: [
        h.span(
          [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11 }))],
          [run.compare ? '⇄' : `${countStatus(run.cases, 'pass')}/${run.cases.length}`],
        ),
      ],
    },
    h,
  );
};

export const runsRail = (runs: ReadonlyArray<Run>, selectedRunId: string, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [
      h.AriaLabel('Runs Rail'),
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flex: 'none',
          flexDirection: 'column',
          maxHeight: '40%',
          minWidth: 0,
          overflow: 'hidden',
        }),
      ),
    ],
    [
      panelHeader('Runs', String(runs.length), h),
      h.div(
        [h.Style(sx({ overflow: 'auto' }))],
        Array.map(runs, (run) => runRow(run, run.id === selectedRunId, h)),
      ),
    ],
  );

import { Array } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { countStatus, type Case, type CaseStatus } from '../domain';
import { Message } from '../message';
import { panelHeader, selectableRow } from './selectableRow';

// VIEW

const statusGlyph: Record<CaseStatus, string> = { pass: '✓', fail: '✗', partial: '◐', timeout: '◌' };

const statusColor: Record<CaseStatus, string> = {
  pass: 'var(--tt-green)',
  fail: 'var(--tt-red)',
  partial: 'var(--tt-orange)',
  timeout: 'var(--tt-comment)',
};

const caseRow = (testCase: Case, isSelected: boolean, h: HtmlBuilder<Message>): Html =>
  selectableRow(
    {
      key: testCase.id,
      label: `select case ${testCase.id}`,
      title: testCase.prompt,
      isSelected,
      onSelect: Message.SelectedCase({ caseId: testCase.id }),
      glyph: statusGlyph[testCase.status],
      glyphColor: statusColor[testCase.status],
      textColor: isSelected ? 'var(--tt-fg)' : testCase.status === 'fail' ? 'var(--tt-red)' : 'var(--tt-fg-dark)',
      trailing: [],
    },
    h,
  );

export const caseList = (cases: ReadonlyArray<Case>, selectedCaseId: string, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.AriaLabel('Case List'),
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
        }),
      ),
    ],
    [
      panelHeader('Cases', `${countStatus(cases, 'pass')}/${cases.length}`, h),
      h.div(
        [h.Style(sx({ overflow: 'auto' }))],
        Array.map(cases, (testCase) => caseRow(testCase, testCase.id === selectedCaseId, h)),
      ),
    ],
  );

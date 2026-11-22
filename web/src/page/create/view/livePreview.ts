import { Array } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { assembleEvalsJson, type Draft, type EvalsAssertion, type EvalsCase } from '../domain';
import type { Message } from '../message';

const punctStyle = { color: 'var(--tt-comment)' } as const;
const keyStyle = { color: 'var(--tt-yellow)' } as const;

const punct = (content: string, h: HtmlBuilder<Message>): Html => h.span([h.Style(sx(punctStyle))], [content]);

const key = (name: string, h: HtmlBuilder<Message>): Html => h.span([h.Style(sx(keyStyle))], [`"${name}"`]);

const line = (indent: number, children: ReadonlyArray<Html>, h: HtmlBuilder<Message>, wrap = false): Html =>
  h.div(
    indent === 0 && !wrap
      ? []
      : [h.Style(sx({ paddingLeft: `${indent}ch` }, wrap ? { whiteSpace: 'pre-wrap' } : undefined))],
    children,
  );

const formatObjectAssertion = (assertion: Readonly<Record<string, string>>): string =>
  `{ ${Array.join(
    Array.map(Object.entries(assertion), ([field, value]) => `"${field}": "${value || '…'}"`),
    ', ',
  )} }`;

const assertionLine = (assertion: EvalsAssertion, isLast: boolean, h: HtmlBuilder<Message>): Html => {
  const isJudge = typeof assertion === 'string';
  const content = typeof assertion === 'string' ? `"${assertion || '…'}"` : formatObjectAssertion(assertion);
  return line(
    8,
    [
      h.span([h.Style(sx({ color: isJudge ? 'var(--tt-magenta)' : 'var(--tt-cyan)' }))], [content]),
      punct(isLast ? '' : ',', h),
    ],
    h,
    true,
  );
};

const caseLines = (rowId: string, testCase: EvalsCase, isLast: boolean, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    rowId,
    [],
    [
      line(4, [punct('{', h)], h),
      line(6, [key('id', h), punct(': ', h), h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"', testCase.id, '"']), punct(',', h)], h),
      line(
        6,
        [
          key('prompt', h),
          punct(': ', h),
          h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], ['"', testCase.prompt || '…', '"']),
          punct(',', h),
        ],
        h,
        true,
      ),
      line(6, [key('assertions', h), punct(': [', h)], h),
      ...Array.map(testCase.assertions, (assertion, index) =>
        assertionLine(assertion, index === testCase.assertions.length - 1, h),
      ),
      line(6, [punct(']', h)], h),
      line(4, [punct(isLast ? '}' : '},', h)], h),
    ],
  );

export const livePreview = (draft: Draft, h: HtmlBuilder<Message>): Html => {
  const evalsJson = assembleEvalsJson(draft);
  return h.aside(
    [
      h.AriaLabel('Live evals json preview'),
      h.DataAttribute('testid', 'create-live-preview'),
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          borderLeft: '1px solid var(--tt-border)',
          display: 'flex',
          flex: 'none',
          flexDirection: 'column',
          minHeight: 0,
          width: 344,
        }),
      ),
    ],
    [
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              borderBottom: '1px solid var(--tt-border)',
              display: 'flex',
              fontSize: 12,
              gap: 8,
              padding: '8px 14px',
            }),
          ),
        ],
        [
          h.span([h.Style(sx({ color: 'var(--tt-fg-dark)', fontWeight: 700 }))], ['evals/evals.json']),
          h.span([h.Style(sx({ flex: 1 }))]),
          h.span([
            h.AriaHidden(true),
            h.Style(sx({ background: 'var(--tt-green)', borderRadius: '50%', height: 6, width: 6 })),
          ]),
          h.span([h.AriaLabel('live preview'), h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11 }))], ['live']),
        ],
      ),
      h.div(
        [h.Style(sx({ flex: 1, fontSize: 12, lineHeight: 1.7, overflow: 'auto', padding: '14px 16px' }))],
        [
          line(0, [punct('{', h)], h),
          line(
            2,
            [
              key('skill_name', h),
              punct(': ', h),
              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['"', evalsJson.skill_name, '"']),
              punct(',', h),
            ],
            h,
          ),
          line(2, [key('evals', h), punct(': [', h)], h),
          ...Array.map(Array.zip(draft.behaviors, evalsJson.evals), ([row, testCase], index) =>
            caseLines(row.id, testCase, index === evalsJson.evals.length - 1, h),
          ),
          line(2, [punct(']', h)], h),
          line(0, [punct('}', h)], h),
        ],
      ),
    ],
  );
};

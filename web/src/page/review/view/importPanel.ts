import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import type { ImportCheck, Inspection } from '../domain';
import { Message } from '../message';
import type { Model } from '../model';

const ACCEPTED_FILES = ['evals.json', 'grading.json', 'benchmark.json', 'timing.json', 'feedback.json'];

const chipStyle = (isAccent: boolean) =>
  sx({
    border: '1px solid var(--tt-border)',
    borderRadius: 5,
    color: isAccent ? 'var(--tt-cyan)' : 'var(--tt-fg-dark)',
    fontSize: 11,
    padding: '3px 8px',
  });

const checkRow = (item: ImportCheck, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    item.label,
    [h.Style(sx({ display: 'flex', fontSize: 12, gap: 8, padding: '1px 0' }))],
    [
      h.span(
        [h.Style(sx({ color: item.ok ? 'var(--tt-green)' : 'var(--tt-red)', flex: 'none', width: 12 }))],
        [item.ok ? '✓' : '✗'],
      ),
      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [item.label]),
    ],
  );

const advisoryRow = (item: ImportCheck, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    `advisory-${item.label}`,
    [h.Style(sx({ display: 'flex', fontSize: 12, gap: 8, padding: '1px 0' }))],
    [
      h.span(
        [h.Style(sx({ color: item.ok ? 'var(--tt-green)' : 'var(--tt-comment)', flex: 'none', width: 12 }))],
        [item.ok ? '✓' : '○'],
      ),
      h.span(
        [h.Style(sx({ color: 'var(--tt-comment)' }))],
        [`${item.label} `, h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['· Recommended'])],
      ),
    ],
  );

const inspectionResult = (inspection: Inspection, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.AriaLabel('import inspection result'),
      h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 7, padding: '10px 12px' })),
    ],
    [
      ...Array.map(inspection.checks, (item) => checkRow(item, h)),
      ...Array.map(inspection.advisories, (item) => advisoryRow(item, h)),
      inspection.ok
        ? h.div(
            [h.Style(sx({ color: 'var(--tt-green)', fontSize: 12, fontWeight: 700, marginTop: 8 }))],
            [`✓ ${inspection.kind}`],
          )
        : h.empty,
      inspection.ok && inspection.summary !== ''
        ? h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, marginTop: 2 }))], [inspection.summary])
        : h.empty,
      inspection.error !== ''
        ? h.div(
            [h.Role('alert'), h.Style(sx({ color: 'var(--tt-red)', fontSize: 12, marginTop: 8 }))],
            [`✗ ${inspection.error}`],
          )
        : h.empty,
    ],
  );

const filePicker = (h: HtmlBuilder<Message>): Html =>
  h.label(
    [
      h.AllowDrop(),
      h.OnDropFiles((files) => Message.DroppedImportFiles({ files })),
      h.Style(
        sx({
          alignItems: 'center',
          border: '1px dashed var(--tt-border)',
          borderRadius: 7,
          color: 'var(--tt-fg-dark)',
          cursor: 'pointer',
          display: 'flex',
          fontSize: 12.5,
          gap: 8,
          height: 34,
          justifyContent: 'center',
        }),
      ),
    ],
    [
      '⇱ Choose JSON file',
      h.input([
        h.Accept('application/json,.json'),
        h.OnFileChange((files) => Message.SelectedImportFiles({ files })),
        h.Type('file'),
        h.Style(sx({ display: 'none' })),
      ]),
    ],
  );

const pasteBox = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.textarea([
    h.AriaLabel('paste arc-skill-eval json'),
    h.OnInput((value) => Message.UpdatedPasteText({ value })),
    h.Placeholder('Or paste arc-skill-eval JSON'),
    h.Spellcheck(false),
    h.Value(model.pasteText),
    h.Style(
      sx({
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 6,
        color: 'var(--tt-fg)',
        fontFamily: 'inherit',
        fontSize: 12,
        height: 80,
        marginTop: 8,
        outline: 'none',
        padding: 8,
        resize: 'none',
        width: '100%',
      }),
    ),
  ]);

const actions = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ display: 'flex', gap: 8, marginBottom: 10 }))],
    [
      h.button(
        [
          h.OnClick(Message.ClickedInspectJson()),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: 'transparent',
              border: '1px solid var(--tt-border-active)',
              borderRadius: 6,
              color: 'var(--tt-blue)',
              cursor: 'pointer',
              display: 'flex',
              flex: 1,
              fontSize: 12.5,
              fontWeight: 700,
              height: 32,
              justifyContent: 'center',
            }),
          ),
        ],
        ['Inspect JSON'],
      ),
      h.button(
        [
          h.OnClick(Message.ClickedLoadSample()),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: 'transparent',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg-dark)',
              cursor: 'pointer',
              display: 'flex',
              fontSize: 12.5,
              height: 32,
              justifyContent: 'center',
              padding: '0 12px',
            }),
          ),
        ],
        ['Load sample'],
      ),
    ],
  );

export const importPanel = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '14px 16px' }))],
    [
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 9 }))],
        [
          h.span(
            [
              h.DataAttribute('testid', 'review-empty-state-kicker'),
              h.Style(sx({ color: 'var(--tt-cyan)', fontSize: 13, fontWeight: 700 })),
            ],
            ['Import run JSON'],
          ),
          h.span(
            [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))],
            ['The hosted app cannot run models. Import JSON produced by arc-skill-eval to review its results.'],
          ),
        ],
      ),
      h.div(
        [
          h.AriaLabel('accepted import files'),
          h.Style(sx({ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 })),
        ],
        Array.map(ACCEPTED_FILES, (label, index) => h.keyed('span')(label, [h.Style(chipStyle(index === 0))], [label])),
      ),
      h.div(
        [h.Style(sx({ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: 14 }))],
        [
          h.div([h.Style(sx({ flex: 1, minWidth: 280 }))], [filePicker(h), pasteBox(model, h)]),
          h.div(
            [h.Style(sx({ flex: 'none', width: 300 }))],
            [
              actions(h),
              Option.match(model.maybeInspection, {
                onNone: () => h.empty,
                onSome: (inspection) => inspectionResult(inspection, h),
              }),
            ],
          ),
        ],
      ),
    ],
  );

import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { Message } from '../message';

const commandLine = (command: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
      h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], [command]),
    ],
  );

const sectionLink = (label: string, message: Message, h: HtmlBuilder<Message>): Html =>
  h.a([h.Href('#'), h.OnClick(message, { defaultAction: 'Prevent' })], [label]);

export const emptyStateView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 10,
          maxWidth: 560,
          padding: '24px 26px',
        }),
      ),
    ],
    [
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 10 }))],
        [
          h.span(
            [
              h.DataAttribute('testid', 'run-empty-state-kicker'),
              h.Style(
                sx({
                  border: '1px solid var(--tt-cyan)',
                  borderRadius: 5,
                  color: 'var(--tt-cyan)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                }),
              ),
            ],
            ['Localhost only'],
          ),
          h.span(
            [h.Style(sx({ color: 'var(--tt-fg)', fontSize: 17, fontWeight: 700 }))],
            ['Run evals on your machine'],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 13, lineHeight: 1.65, marginBottom: 16 }))],
        ['A run calls a model and needs your API keys. Install the CLI and run it on your machine:'],
      ),
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.9,
              marginBottom: 16,
              padding: '12px 14px',
            }),
          ),
        ],
        [commandLine('npm i -g arc-skill-eval', h), commandLine('arc-skill-eval run ./skills/my-skill --compare', h)],
      ),
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6 }))],
        [
          'On the hosted site, you can ',
          sectionLink('import and review run JSON', Message.ClickedReviewLink(), h),
          ' or read the ',
          sectionLink('evaluation guide', Message.ClickedLearnLink(), h),
          '.',
        ],
      ),
    ],
  );

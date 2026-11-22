import type { Html, HtmlBuilder } from 'foldkit/html';

import type { EnvName } from '@/app/domain';
import { sx } from '@/ui/sx';

import { Message } from '../message';

// VIEW

const commandLine = (command: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.span([h.Style(sx({ color: 'var(--tt-green)' }))], ['$ ']),
      h.span([h.Style(sx({ color: 'var(--tt-fg)' }))], [command]),
    ],
  );

const localCommands = (h: HtmlBuilder<Message>): Html =>
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
    [commandLine('arc-skill-eval run ./skills/my-skill --compare', h), commandLine('arc-skill-eval browse', h)],
  );

/** No run to show: hosted points to importing in Review, localhost to running an eval. */
export const emptyState = (env: EnvName, h: HtmlBuilder<Message>): Html => {
  const isHosted = env === 'hosted';
  return h.section(
    [
      h.DataAttribute('screen-label', `browse (${env})`),
      h.DataAttribute('testid', 'browse-empty-state'),
      h.Style(
        sx({
          alignItems: 'center',
          display: 'flex',
          flex: 1,
          justifyContent: 'center',
          minHeight: 0,
          padding: 40,
        }),
      ),
    ],
    [
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
                  h.DataAttribute('testid', 'browse-empty-state-kicker'),
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
                [isHosted ? 'Hosted mode' : 'Localhost'],
              ),
              h.span(
                [h.Style(sx({ color: 'var(--tt-fg)', fontSize: 17, fontWeight: 700 }))],
                [isHosted ? 'Import a run to browse results' : 'No local run artifacts found'],
              ),
            ],
          ),
          h.div(
            [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 13, lineHeight: 1.65, marginBottom: 16 }))],
            isHosted
              ? ['Browse shows run artifacts that you import in Review.']
              : [
                  'Browse reads run artifacts from ',
                  h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['./evals-runs']),
                  '. Create them by running an eval locally:',
                ],
          ),
          isHosted ? h.empty : localCommands(h),
          h.div(
            [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6 }))],
            [
              isHosted ? 'To add a run, ' : 'To inspect a JSON artifact, ',
              h.a(
                [h.Href('#'), h.OnClick(Message.ClickedImportInReview(), { defaultAction: 'Prevent' })],
                ['import run JSON in Review'],
              ),
              '.',
            ],
          ),
        ],
      ),
    ],
  );
};

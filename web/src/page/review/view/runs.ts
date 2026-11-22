import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import type { ReviewRun } from '../domain';
import { Message } from '../message';
import { activationKey, passCount, rateColor } from './shared';

const formatFinishedAt = (value: string, maybeNowMillis: Option.Option<number>): string =>
  Option.match(maybeNowMillis, {
    onNone: () => value,
    onSome: (nowMillis) => {
      const deltaMs = nowMillis - new Date(value).getTime();
      if (Number.isNaN(deltaMs)) {
        return value;
      }
      const minutes = Math.max(1, Math.round(deltaMs / 60000));
      if (minutes < 60) {
        return `${minutes}m ago`;
      }
      const hours = Math.round(minutes / 60);
      if (hours < 48) {
        return `${hours}h ago`;
      }
      return `${Math.round(hours / 24)}d ago`;
    },
  });

const isRunOk = (run: ReviewRun): boolean =>
  Option.getOrElse(run.maybeExitCode, () => (Option.contains(run.maybeStatus, 'fail') ? 1 : 0)) === 0;

const runRow = (
  run: ReviewRun,
  isSelected: boolean,
  maybeNowMillis: Option.Option<number>,
  h: HtmlBuilder<Message>,
): Html => {
  const passed = passCount(run);
  const total = run.cases.length;
  const isOk = isRunOk(run);

  return h.keyed('div')(
    run.id,
    [
      h.AriaLabel(`select run ${run.id}`),
      h.AriaPressed(String(isSelected)),
      h.OnClick(Message.SelectedRun({ runId: run.id })),
      h.OnKeyDownPreventDefault(activationKey(Message.SelectedRun({ runId: run.id }))),
      h.Role('button'),
      h.Tabindex(0),
      h.Title(run.finishedAt),
      h.Style(
        sx({
          background: isSelected ? 'var(--tt-selection)' : 'transparent',
          borderLeft: `2px solid ${isSelected ? 'var(--tt-blue)' : 'transparent'}`,
          cursor: 'pointer',
          padding: '8px 12px',
        }),
      ),
    ],
    [
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 7 }))],
        [
          h.span([
            h.AriaHidden(true),
            h.Style(
              sx({
                background: isOk ? 'var(--tt-green)' : 'var(--tt-red)',
                borderRadius: '50%',
                height: 7,
                width: 7,
              }),
            ),
          ]),
          h.span(
            [
              h.Style(
                sx({
                  color: 'var(--tt-yellow)',
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }),
              ),
            ],
            [run.id],
          ),
        ],
      ),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 11,
              marginTop: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }),
          ),
        ],
        [`${run.skill} · ${formatFinishedAt(run.finishedAt, maybeNowMillis)}`],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', fontSize: 12, gap: 10, marginTop: 4 }))],
        [
          h.span([h.Style(sx({ color: rateColor(passed, total) }))], [`${passed}/${total}`]),
          Option.match(run.maybeCost, {
            onNone: () => h.empty,
            onSome: (cost) => h.span([h.Style(sx({ color: 'var(--tt-green)' }))], [`$${cost.toFixed(2)}`]),
          }),
          Option.match(run.maybeExitCode, {
            onNone: () => h.empty,
            onSome: (exitCode) =>
              h.span(
                [h.Style(sx({ color: isOk ? 'var(--tt-green)' : 'var(--tt-red)' }))],
                [`exit ${exitCode}`],
              ),
          }),
        ],
      ),
    ],
  );
};

export const runsRail = (
  runs: ReadonlyArray<ReviewRun>,
  selectedRunId: string,
  maybeNowMillis: Option.Option<number>,
  h: HtmlBuilder<Message>,
): Html =>
  h.aside(
    [
      h.AriaLabel('Review runs'),
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flex: 'none',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          width: 250,
        }),
      ),
    ],
    [
      h.div(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              borderBottom: '1px solid var(--tt-border)',
              color: 'var(--tt-fg-dark)',
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 12px',
            }),
          ),
        ],
        ['runs'],
      ),
      h.div(
        [h.Style(sx({ overflow: 'auto', padding: '6px 0' }))],
        Array.map(runs, (run) => runRow(run, run.id === selectedRunId, maybeNowMillis, h)),
      ),
    ],
  );

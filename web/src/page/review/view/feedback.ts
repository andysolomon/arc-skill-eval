import { Array, Option, Order, pipe } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { EnvName } from '@/app/domain';
import { sx } from '@/ui/sx';

import type { FeedbackNote, ImprovePlanSummary, ReviewRun } from '../domain';
import { Message } from '../message';
import type { Model } from '../model';
import { runNotesNewestFirst } from '../plan';
import { improvePanel } from './improve';

const newestPlanFirst = Order.flip(Order.mapInput(Order.String, (plan: ImprovePlanSummary) => plan.createdAt));

const noteCard = (note: FeedbackNote, h: HtmlBuilder<Message>): Html =>
  h.keyed('article')(
    note.noteId,
    [
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          borderLeft: '2px solid var(--tt-yellow)',
          borderRadius: 6,
          marginTop: 8,
          padding: '8px 10px',
        }),
      ),
    ],
    [
      h.header(
        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8 }))],
        [
          h.span(
            [
              h.Style(
                sx({
                  color: 'var(--tt-comment)',
                  flex: '1 1 auto',
                  fontSize: 11,
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                }),
              ),
            ],
            [Option.getOrElse(note.maybeCaseId, () => 'run')],
          ),
          h.button(
            [
              h.AriaLabel(`remove feedback ${note.noteId}`),
              h.OnClick(Message.ClickedRemoveFeedback({ noteId: note.noteId })),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'transparent',
                  border: 0,
                  color: 'var(--tt-comment)',
                  cursor: 'pointer',
                  fontSize: 15,
                  lineHeight: 1,
                  padding: 0,
                }),
              ),
            ],
            ['×'],
          ),
        ],
      ),
      h.p(
        [h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, lineHeight: 1.45, margin: '4px 0 0' }))],
        [note.note],
      ),
    ],
  );

const feedbackSection = (
  model: Model,
  notes: ReadonlyArray<FeedbackNote>,
  h: HtmlBuilder<Message>,
): Html => {
  const canRecord = model.note.trim() !== '';

  return h.section(
    [
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flex: 'none',
          flexDirection: 'column',
          overflow: 'hidden',
        }),
      ),
    ],
    [
      h.header(
        [
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              borderBottom: '1px solid var(--tt-border)',
              fontSize: 12,
              padding: '6px 12px',
            }),
          ),
        ],
        [
          h.h2(
            [
              h.Style(
                sx({ color: 'var(--tt-fg-dark)', display: 'inline', fontSize: 12, fontWeight: 700, margin: 0 }),
              ),
            ],
            ['feedback.json'],
          ),
          h.span(
            [h.Style(sx({ color: 'var(--tt-comment)' }))],
            [`: ${Option.getOrElse(model.maybeSelectedCaseId, () => 'run')}`],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ padding: 12 }))],
        [
          h.textarea([
            h.AriaLabel('feedback note'),
            h.OnInput((value) => Message.UpdatedNote({ value })),
            h.Placeholder('note what to change: prompt, assertion, fixture, adjacent-negative…'),
            h.Value(model.note),
            h.Style(
              sx({
                background: 'var(--tt-bg-dark)',
                border: '1px solid var(--tt-border)',
                borderRadius: 6,
                color: 'var(--tt-fg)',
                fontSize: 13,
                height: 88,
                lineHeight: 1.45,
                outline: 'none',
                padding: 9,
                resize: 'none',
                width: '100%',
              }),
            ),
          ]),
          h.button(
            [
              h.Disabled(!canRecord),
              h.OnClick(Message.ClickedRecordFeedback()),
              h.Type('button'),
              h.Style(
                sx({
                  alignItems: 'center',
                  background: 'transparent',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 6,
                  color: 'var(--tt-yellow)',
                  cursor: canRecord ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  fontSize: 13,
                  height: 34,
                  justifyContent: 'center',
                  marginTop: 8,
                  opacity: canRecord ? 1 : 0.6,
                  width: '100%',
                }),
              ),
            ],
            ['record feedback'],
          ),
          ...Array.map(notes, (note) => noteCard(note, h)),
        ],
      ),
    ],
  );
};

export const feedbackAside = (
  model: Model,
  run: ReviewRun,
  env: EnvName,
  h: HtmlBuilder<Message>,
): Html => {
  const notes = runNotesNewestFirst(model.feedback, run.id);
  const improvePlans = pipe(
    model.improvePlans,
    Array.filter((plan) => plan.runId === run.id),
    Array.sort(newestPlanFirst),
  );

  return h.aside(
    [
      h.AriaLabel('Feedback and proposed changes'),
      h.Style(sx({ display: 'flex', flex: 'none', flexDirection: 'column', gap: 12, minHeight: 0, width: 360 })),
    ],
    [
      feedbackSection(model, notes, h),
      improvePanel({ env, improve: model.improve, feedbackCount: notes.length, improvePlans }, h),
    ],
  );
};

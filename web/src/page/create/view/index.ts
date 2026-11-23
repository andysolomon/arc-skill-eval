import { Array, Option } from 'effect';
import { Submodel } from 'foldkit';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { AppContext } from '@/app/context';
import { sx } from '@/ui/sx';

import { railSteps, stepAt, stepIndex } from '../domain';
import { Message } from '../message';
import type { Model } from '../model';
import { generateBanner, hostedBanner } from './banner';
import { livePreview } from './livePreview';
import { stepAssertions } from './stepAssertions';
import { stepBehaviors } from './stepBehaviors';
import { stepPrompts } from './stepPrompts';
import { stepReview } from './stepReview';

const rail = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [
      h.AriaLabel('Create wizard steps'),
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          borderRight: '1px solid var(--tt-border)',
          display: 'flex',
          flex: 'none',
          flexDirection: 'column',
          width: 214,
        }),
      ),
    ],
    [
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 11,
              letterSpacing: '.08em',
              padding: '13px 16px 7px',
              textTransform: 'uppercase',
            }),
          ),
        ],
        ['Create an eval suite'],
      ),
      h.nav(
        [h.Style(sx({ flex: 1, overflow: 'auto', padding: '0 8px 8px' }))],
        Array.map(railSteps, (railStep) => {
          const isActive = railStep.id === model.step;
          return h.keyed('button')(
            railStep.id,
            [
              ...(isActive ? [h.AriaCurrent('step')] : []),
              h.OnClick(Message.ClickedStep({ step: railStep.id })),
              h.Type('button'),
              h.Style(
                sx({
                  alignItems: 'center',
                  background: isActive ? 'var(--tt-selection)' : 'transparent',
                  border: 0,
                  borderLeft: `2px solid ${isActive ? 'var(--tt-blue)' : 'transparent'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 10,
                  margin: '1px 0',
                  padding: '9px 9px',
                  textAlign: 'left',
                  width: '100%',
                }),
              ),
            ],
            [
              h.span(
                [
                  h.Style(
                    sx({
                      color: isActive ? 'var(--tt-blue)' : 'var(--tt-dim)',
                      flex: 'none',
                      fontSize: 11,
                      fontWeight: 700,
                      width: 16,
                    }),
                  ),
                ],
                [railStep.num],
              ),
              h.span(
                [h.Style(sx({ color: isActive ? 'var(--tt-fg)' : 'var(--tt-fg-dark)', fontSize: 12.5 }))],
                [railStep.label],
              ),
            ],
          );
        }),
      ),
      h.div(
        [
          h.Style(
            sx({
              borderTop: '1px solid var(--tt-border)',
              color: 'var(--tt-comment)',
              fontSize: 11,
              lineHeight: 1.65,
              padding: '12px 16px',
            }),
          ),
        ],
        ['Complete each step to define cases and write evals/evals.json.'],
      ),
    ],
  );

const activeStep = (model: Model, context: AppContext, h: HtmlBuilder<Message>): Html => {
  if (model.step === 'behaviors') {
    return stepBehaviors(model, context.env, h);
  }
  if (model.step === 'prompts') {
    return stepPrompts(model, context.env, h);
  }
  if (model.step === 'assertions') {
    return stepAssertions(model, context.env, h);
  }
  return stepReview(model, context.env, h);
};

const navigation = (model: Model, h: HtmlBuilder<Message>): Html => {
  const index = stepIndex(model.step);
  return h.footer(
    [
      h.AriaLabel('Create wizard navigation'),
      h.Style(
        sx({
          alignItems: 'center',
          borderTop: '1px solid var(--tt-border)',
          display: 'flex',
          flex: 'none',
          gap: 10,
          padding: '12px 32px',
        }),
      ),
    ],
    [
      Option.isSome(stepAt(index - 1))
        ? h.button(
            [
              h.OnClick(Message.ClickedBack()),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'transparent',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 7,
                  color: 'var(--tt-fg-dark)',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: '8px 15px',
                }),
              ),
            ],
            ['← back'],
          )
        : h.empty,
      h.span([h.Style(sx({ flex: 1 }))]),
      Option.isSome(stepAt(index + 1))
        ? h.button(
            [
              h.OnClick(Message.ClickedNext()),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'transparent',
                  border: '1px solid var(--tt-border-active)',
                  borderRadius: 7,
                  color: 'var(--tt-blue)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '8px 18px',
                }),
              ),
            ],
            ['next →'],
          )
        : h.empty,
    ],
  );
};

export const view = Submodel.defineView<Model, Message, AppContext>((model, context, h) =>
  h.main(
    [
      h.Class('app-main'),
      h.DataAttribute('screen-label', `create (${context.env})`),
      h.DataAttribute('testid', 'create-app'),
      h.Style(sx({ display: 'flex', minHeight: 0, minWidth: 0, padding: 0 })),
    ],
    [
      rail(model, h),
      h.section(
        [
          h.AriaLabel('Create wizard step'),
          h.DataAttribute('env', context.env),
          h.Style(sx({ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, minWidth: 0 })),
        ],
        [
          h.div(
            [h.Style(sx({ flex: 1, minHeight: 0, overflow: 'auto', padding: '26px 32px' }))],
            [
              h.div(
                [h.Style(sx({ maxWidth: 700 }))],
                [
                  context.env === 'localhost' ? generateBanner(model, context.workspace.skills, h) : hostedBanner(h),
                  activeStep(model, context, h),
                ],
              ),
            ],
          ),
          navigation(model, h),
        ],
      ),
      livePreview(model.draft, h),
    ],
  ),
);

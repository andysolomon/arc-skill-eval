import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { EnvName } from '@/app/domain';
import { sx } from '@/ui/sx';

import { Apply, Proposal, isImproveInFlight, type Improve, type ImprovePlanSummary, type ProposedPlan, type StagedPlan } from '../domain';
import { Message } from '../message';

const panelStyle = sx({
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
});

const headerStyle = sx({
  background: 'var(--tt-bg-dark)',
  borderBottom: '1px solid var(--tt-border)',
  color: 'var(--tt-fg-dark)',
  fontSize: 12,
  fontWeight: 700,
  padding: '6px 12px',
});

const introStyle = sx({ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6 });

const proposedPlan = (proposal: Proposal): Option.Option<ProposedPlan> =>
  Proposal.match(proposal, {
    Idle: () => Option.none(),
    Deriving: () => Option.none(),
    Derived: ({ plan }) => Option.some(plan),
    Staging: ({ plan }) => Option.some(plan),
    Staged: ({ plan }) => Option.some(plan),
    Failed: () => Option.none(),
  });

const planList = (
  plans: ReadonlyArray<ImprovePlanSummary>,
  hasPlan: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(plans, {
    onEmpty: () => h.empty,
    onNonEmpty: (nonEmptyPlans) =>
      h.div(
        [h.Style(sx({ marginTop: hasPlan ? 0 : 10 }))],
        Array.map(nonEmptyPlans, (plan) =>
          h.keyed('div')(
            plan.planId,
            [
              h.Style(
                sx({ color: 'var(--tt-comment)', fontSize: 11, overflowWrap: 'anywhere', padding: '2px 0' }),
              ),
            ],
            [`${plan.status} · ${plan.planId}`],
          ),
        ),
      ),
  });

const planItems = (plan: ProposedPlan, label: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaLabel(label)],
    Array.map(plan.items, (item) =>
      h.div(
        [h.Style(sx({ marginBottom: 12 }))],
        [
          h.div(
            [
              h.Style(
                sx({
                  color: 'var(--tt-magenta)',
                  fontSize: 11,
                  fontWeight: 700,
                  marginBottom: 3,
                  overflowWrap: 'anywhere',
                }),
              ),
            ],
            [item.path],
          ),
          h.div(
            [h.Style(sx({ fontSize: 12.5, whiteSpace: 'pre-wrap' }))],
            [
              h.span([h.Style(sx({ color: 'var(--tt-red)' }))], [`- ${item.before}`]),
              h.br([]),
              h.span([h.Style(sx({ color: 'var(--tt-green)' }))], [`+ ${item.after}`]),
            ],
          ),
          h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, marginTop: 3 }))], [item.rationale]),
        ],
      ),
    ),
  );

const statusLine = (color: string, content: string, h: HtmlBuilder<Message>): Html =>
  h.div([h.Role('status'), h.Style(sx({ color, fontSize: 12.5, marginTop: 10 }))], [content]);

const alertLine = (error: string, h: HtmlBuilder<Message>): Html =>
  h.div([h.Role('alert'), h.Style(sx({ color: 'var(--tt-red)', fontSize: 12.5, marginTop: 10 }))], [`✗ ${error}`]);

const proposeButton = (
  config: Readonly<{ canPropose: boolean; label: string; title: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.footer(
    [h.Style(sx({ borderTop: '1px solid var(--tt-border)', display: 'flex', gap: 8, padding: '10px 12px' }))],
    [
      h.button(
        [
          h.Disabled(!config.canPropose),
          h.OnClick(Message.ClickedProposePlan()),
          h.Title(config.title),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: 'transparent',
              border: '1px solid var(--tt-magenta)',
              borderRadius: 6,
              color: 'var(--tt-magenta)',
              cursor: config.canPropose ? 'pointer' : 'not-allowed',
              display: 'flex',
              flex: 1,
              fontSize: 13,
              height: 34,
              justifyContent: 'center',
              opacity: config.canPropose ? 1 : 0.6,
            }),
          ),
        ],
        [config.label],
      ),
    ],
  );

type PanelConfig = Readonly<{
  improve: Improve;
  feedbackCount: number;
  improvePlans: ReadonlyArray<ImprovePlanSummary>;
}>;

// HOSTED

const hostedPanel = (config: PanelConfig, h: HtmlBuilder<Message>): Html => {
  const { improve } = config;
  const maybePlan = proposedPlan(improve.proposal);
  const isDeriving = improve.proposal._tag === 'Deriving';
  const canPropose = config.feedbackCount > 0 && !isDeriving;

  return h.section(
    [h.AriaLabel('Download changes proposed from feedback'), h.DataAttribute('env', 'hosted'), h.Style(panelStyle)],
    [
      h.header([h.Style(headerStyle)], ['Download a change plan']),
      h.div(
        [h.Style(sx({ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }))],
        [
          Option.isNone(maybePlan)
            ? h.div(
                [h.Style(introStyle)],
                [
                  'Use review notes and failed assertions to propose changes to prompts, assertions, fixtures, or adjacent-negative cases. The hosted app downloads the plan as JSON and does not write files.',
                ],
              )
            : h.empty,
          planList(config.improvePlans, Option.isSome(maybePlan), h),
          Option.match(maybePlan, {
            onNone: () => h.empty,
            onSome: (plan) => planItems(plan, 'Downloaded change plan', h),
          }),
          improve.download._tag === 'Started' ? statusLine('var(--tt-green)', '✓ Change plan download started', h) : h.empty,
          improve.proposal._tag === 'Failed' ? alertLine(improve.proposal.error, h) : h.empty,
        ],
      ),
      proposeButton(
        {
          canPropose,
          label: isDeriving ? 'Preparing change plan…' : 'Download change plan',
          title: canPropose ? 'Download change plan' : 'Add feedback to download a change plan',
        },
        h,
      ),
    ],
  );
};

// LOCALHOST

const stagedSection = (staged: StagedPlan, isInFlight: boolean, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.AriaLabel('Staged change plan'),
      h.Style(
        sx({
          border: '1px solid var(--tt-green)',
          borderRadius: 7,
          display: 'grid',
          gap: 10,
          marginTop: 12,
          padding: 10,
        }),
      ),
    ],
    [
      h.span(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, overflowWrap: 'anywhere' }))],
        [`staged ${staged.planId} at ${staged.stagingPath}`],
      ),
      h.pre(
        [
          h.AriaReadonly(true),
          h.Style(
            sx({
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg-dark)',
              fontSize: 12,
              margin: 0,
              maxHeight: 220,
              overflow: 'auto',
              padding: 10,
              whiteSpace: 'pre-wrap',
            }),
          ),
        ],
        [JSON.stringify(staged.diff, null, 2) ?? ''],
      ),
      h.div(
        [h.Style(sx({ display: 'flex', gap: 8, justifyContent: 'flex-end' }))],
        [
          h.button(
            [
              h.Disabled(isInFlight),
              h.OnClick(Message.ClickedApplyChanges()),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))',
                  border: '1px solid var(--tt-green)',
                  borderRadius: 6,
                  color: 'var(--tt-green)',
                  cursor: isInFlight ? 'wait' : 'pointer',
                  fontWeight: 700,
                  padding: '6px 13px',
                }),
              ),
            ],
            ['Apply changes'],
          ),
          h.button(
            [
              h.Disabled(isInFlight),
              h.OnClick(Message.ClickedDiscardPlan()),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'transparent',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 6,
                  color: 'var(--tt-fg-dark)',
                  cursor: isInFlight ? 'wait' : 'pointer',
                  padding: '6px 13px',
                }),
              ),
            ],
            ['Discard plan'],
          ),
        ],
      ),
    ],
  );

const applyStatus = (apply: Apply, h: HtmlBuilder<Message>): Html =>
  Apply.match(apply, {
    Idle: () => h.empty,
    Committing: () => h.empty,
    Cancelling: () => h.empty,
    Failed: () => h.empty,
    Committed: ({ result }) =>
      statusLine(
        'var(--tt-green)',
        `✓ Applied changes${Option.match(result.maybePath, { onNone: () => '', onSome: (path) => ` to ${path}` })}`,
        h,
      ),
    Cancelled: () => statusLine('var(--tt-comment)', 'Discarded change plan', h),
  });

const localError = (improve: Improve): Option.Option<string> =>
  improve.proposal._tag === 'Failed'
    ? Option.some(improve.proposal.error)
    : improve.apply._tag === 'Failed'
      ? Option.some(improve.apply.error)
      : Option.none();

const localhostPanel = (config: PanelConfig, h: HtmlBuilder<Message>): Html => {
  const { improve } = config;
  const maybePlan = proposedPlan(improve.proposal);
  const isInFlight = isImproveInFlight(improve);
  const canPropose = config.feedbackCount > 0 && !isInFlight;

  return h.section(
    [h.AriaLabel('Propose changes from local feedback'), h.Style(panelStyle)],
    [
      h.header([h.Style(headerStyle)], ['Propose changes from feedback']),
      h.div(
        [h.Style(sx({ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }))],
        [
          Option.isNone(maybePlan)
            ? h.div(
                [h.Style(introStyle)],
                [
                  'The daemon turns your notes into a feedback file and runs ',
                  h.span([h.Style(sx({ color: 'var(--tt-yellow)' }))], ['arc-skill-eval improve --apply']),
                  ' on a copy of evals/evals.json. Review the result, then apply it to the skill.',
                ],
              )
            : h.empty,
          planList(config.improvePlans, Option.isSome(maybePlan), h),
          Option.match(maybePlan, {
            onNone: () => h.empty,
            onSome: (plan) => planItems(plan, 'Proposed change plan', h),
          }),
          Option.match(improve.maybeStagedPlan, {
            onNone: () => h.empty,
            onSome: (staged) => stagedSection(staged, isInFlight, h),
          }),
          applyStatus(improve.apply, h),
          Option.match(localError(improve), { onNone: () => h.empty, onSome: (error) => alertLine(error, h) }),
        ],
      ),
      proposeButton(
        {
          canPropose,
          label: isInFlight ? 'Proposing changes…' : 'Propose changes',
          title: canPropose ? 'Propose changes from feedback' : 'Add feedback to propose changes',
        },
        h,
      ),
    ],
  );
};

export const improvePanel = (config: PanelConfig & Readonly<{ env: EnvName }>, h: HtmlBuilder<Message>): Html =>
  config.env === 'localhost' ? localhostPanel(config, h) : hostedPanel(config, h);

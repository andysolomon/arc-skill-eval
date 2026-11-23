/** Localhost: the left-hand "Configure run" panel of flag rows and the run button. */

import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { AppContext, WorkspaceSkill } from '@/app/context';
import { sx } from '@/ui/sx';

import {
  ALL_CASES,
  DEFAULT_MODEL,
  compareOptions,
  contextModeOptions,
  findSelectedSkill,
  hasNoEvals,
  iterationOptions,
  models,
  sandboxOptions,
  type FieldName,
} from '../composer';
import { RunState } from '../lifecycle';
import { Message } from '../message';
import { SuiteCases, type Model } from '../model';
import { spinnerGlyph } from './glyph';

// LABELS

const caseOptionsFor = (model: Model): ReadonlyArray<string> =>
  SuiteCases.match(model.suiteCases, {
    NotLoaded: () => [ALL_CASES],
    Loading: () => [ALL_CASES],
    Loaded: ({ caseIds }) => [ALL_CASES, ...caseIds],
    Failed: () => [ALL_CASES],
  });

const suiteNote = (model: Model): Option.Option<string> =>
  SuiteCases.match(model.suiteCases, {
    NotLoaded: () => Option.some('Choose a skill to list its cases.'),
    Loading: () => Option.some('Reading evals/evals.json…'),
    Loaded: ({ caseIds }) =>
      Array.isReadonlyArrayEmpty(caseIds) ? Option.some('evals/evals.json has no cases.') : Option.none(),
    Failed: ({ error }) => Option.some(error),
  });

const caseLabel = (option: string): string => (option === ALL_CASES ? '* (all cases)' : option);

/** "default" names the model the daemon reported, when it did. */
const modelLabel =
  (maybeDefault: Option.Option<string>) =>
  (option: string): string =>
    option === DEFAULT_MODEL
      ? Option.match(maybeDefault, { onNone: () => 'default', onSome: (model) => `default (${model})` })
      : option;

// FLAG ROW

type FlagRowConfig = Readonly<{
  field: FieldName;
  label: string;
  value: string;
  valueColor: string;
  isOpen: boolean;
}>;

const flagRow = (config: FlagRowConfig, content: ReadonlyArray<Html>, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.button(
        [
          h.AriaExpanded(config.isOpen),
          h.OnClick(Message.ClickedFlagRow({ field: config.field })),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: config.isOpen ? 'var(--tt-bg-hi)' : 'transparent',
              border: 0,
              cursor: 'pointer',
              display: 'flex',
              fontSize: 13,
              gap: 12,
              justifyContent: 'space-between',
              padding: '8px 14px',
              textAlign: 'left',
              width: '100%',
            }),
          ),
        ],
        [
          h.span([h.Style(sx({ color: 'var(--tt-comment)', flex: 'none' }))], [config.label]),
          h.span(
            [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8, minWidth: 0 }))],
            [
              h.span(
                [
                  h.Style(
                    sx({
                      color: config.valueColor,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }),
                  ),
                ],
                [config.value],
              ),
              h.span(
                [
                  h.AriaHidden(true),
                  h.Style(
                    sx({ color: config.isOpen ? 'var(--tt-blue)' : 'var(--tt-dim)', flex: 'none', fontSize: 10 }),
                  ),
                ],
                [config.isOpen ? '▴' : '▾'],
              ),
            ],
          ),
        ],
      ),
      config.isOpen
        ? h.div(
            [
              h.Style(
                sx({
                  background: 'var(--tt-bg-dark)',
                  borderBottom: '1px solid var(--tt-border)',
                  borderTop: '1px solid var(--tt-border)',
                  padding: '5px',
                }),
              ),
            ],
            content,
          )
        : h.empty,
    ],
  );

const checkMark = (isSelected: boolean, h: HtmlBuilder<Message>): Html =>
  h.span([h.AriaHidden(true), h.Style(sx({ color: 'var(--tt-green)', flex: 'none', width: 11 }))], [
    isSelected ? '✓' : '',
  ]);

const optionList = <Value extends string | number>(
  config: Readonly<{
    value: Value;
    valueColor: string;
    options: ReadonlyArray<Value>;
    onSelect: (option: Value) => Message;
    label?: (option: Value) => string;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Style(sx({ display: 'grid' }))],
    Array.map(config.options, (option) => {
      const isSelected = option === config.value;
      return h.keyed('button')(
        String(option),
        [
          h.OnClick(config.onSelect(option)),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: isSelected ? 'var(--tt-selection)' : 'transparent',
              border: 0,
              borderRadius: 6,
              color: isSelected ? config.valueColor : 'var(--tt-fg-dark)',
              cursor: 'pointer',
              display: 'flex',
              fontSize: 13,
              gap: 8,
              padding: '7px 10px',
              textAlign: 'left',
              width: '100%',
            }),
          ),
        ],
        [
          checkMark(isSelected, h),
          h.span([h.Style(sx({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }))], [
            config.label === undefined ? String(option) : config.label(option),
          ]),
        ],
      );
    }),
  );

// SKILL ROW

const skillButton = (skill: WorkspaceSkill, isSelected: boolean, h: HtmlBuilder<Message>): Html =>
  h.keyed('button')(
    skill.id,
    [
      h.OnClick(Message.SelectedSkill({ workspaceRoot: Option.getOrElse(skill.path, () => '') })),
      ...Option.match(skill.path, { onNone: () => [], onSome: (path) => [h.Title(path)] }),
      h.Type('button'),
      h.Style(
        sx({
          alignItems: 'center',
          background: isSelected ? 'var(--tt-selection)' : 'transparent',
          border: 0,
          borderRadius: 6,
          cursor: 'pointer',
          display: 'flex',
          fontSize: 13,
          gap: 8,
          padding: '6px 10px',
          textAlign: 'left',
          width: '100%',
        }),
      ),
    ],
    [
      checkMark(isSelected, h),
      h.span(
        [
          h.Style(
            sx({
              color: isSelected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }),
          ),
        ],
        [skill.id],
      ),
      skill.hasEvals
        ? h.span([h.Style(sx({ color: 'var(--tt-green)', flex: 'none', fontSize: 11 }))], ['evals'])
        : h.span([h.Style(sx({ color: 'var(--tt-dim)', flex: 'none', fontSize: 11 }))], ['no evals']),
    ],
  );

const skillList = (model: Model, context: AppContext, h: HtmlBuilder<Message>): Html =>
  Array.match(context.workspace.skills, {
    onEmpty: () =>
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.5, padding: '6px 10px' }))],
        [
          'No skills found in this workspace. Choose a directory that contains skills from the ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['workspace']),
          ' menu in the header.',
        ],
      ),
    onNonEmpty: (skills) =>
      h.div(
        [h.Style(sx({ display: 'grid', marginBottom: 4 }))],
        [
          h.div(
            [
              h.Style(
                sx({
                  color: 'var(--tt-comment)',
                  fontSize: 10.5,
                  letterSpacing: '.06em',
                  padding: '3px 10px',
                  textTransform: 'uppercase',
                }),
              ),
            ],
            [`Skills in ${context.workspace.root}`],
          ),
          h.div(
            [h.Style(sx({ display: 'grid', maxHeight: 260, overflowY: 'auto' }))],
            Array.map(skills, (skill) =>
              skillButton(skill, Option.contains(skill.path, model.composer.workspaceRoot), h),
            ),
          ),
        ],
      ),
  });

const lastRun = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          borderTop: '1px solid var(--tt-border)',
          color: 'var(--tt-fg-dark)',
          fontSize: 12,
          marginTop: 4,
          overflowWrap: 'anywhere',
          padding: '6px 10px 2px',
        }),
      ),
    ],
    [`Last run: ${Option.getOrElse(model.maybeLastRunId, () => 'None')}`],
  );

// EXTRA SKILLS

const inputStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  borderRadius: 6,
  color: 'var(--tt-fg)',
  fontSize: 12.5,
  outline: 'none',
  padding: '7px 10px',
  width: '100%',
} as const;

const extraSkillEditor = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ display: 'grid', gap: 8, padding: 5 }))],
    [
      h.input([
        h.AriaLabel('Extra skill path'),
        h.OnInput((value) => Message.UpdatedExtraSkillDraft({ value })),
        h.OnKeyDownPreventDefault((key) =>
          key === 'Enter' ? Option.some(Message.PressedExtraSkillEnter()) : Option.none(),
        ),
        h.Placeholder('./path/to/extra-skill'),
        h.Value(model.extraSkillDraft),
        h.Style(sx(inputStyle)),
      ]),
      h.button(
        [
          h.OnClick(Message.ClickedAddExtraSkill()),
          h.Type('button'),
          h.Style(
            sx({
              background: 'transparent',
              border: '1px dashed var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg-dark)',
              cursor: 'pointer',
              fontSize: 12.5,
              padding: '7px 10px',
            }),
          ),
        ],
        ['＋ Add comparison skill'],
      ),
      ...Array.map(model.composer.extraSkill, (extraSkill) =>
        h.keyed('button')(
          extraSkill,
          [
            h.OnClick(Message.ClickedRemoveExtraSkill({ extraSkill })),
            h.Title('Remove comparison skill'),
            h.Type('button'),
            h.Style(
              sx({
                alignItems: 'center',
                background: 'var(--tt-selection)',
                border: 0,
                borderRadius: 6,
                color: 'var(--tt-fg)',
                cursor: 'pointer',
                display: 'flex',
                fontSize: 12.5,
                gap: 8,
                justifyContent: 'space-between',
                padding: '7px 10px',
              }),
            ),
          ],
          [
            h.span([h.Style(sx({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }))], [extraSkill]),
            h.span([h.AriaHidden(true), h.Style(sx({ color: 'var(--tt-comment)' }))], ['×']),
          ],
        ),
      ),
    ],
  );

// RUN BUTTON

type RunButtonLook = Readonly<{ label: string; title: string; style: Readonly<Record<string, string>> }>;

const resetLook: RunButtonLook = {
  label: '↻ Reset run',
  title: 'Reset run',
  style: { background: 'var(--tt-bg-dark)', border: '1px solid var(--tt-border)', color: 'var(--tt-fg-dark)' },
};

const runButtonLook = (model: Model, isBlocked: boolean): RunButtonLook =>
  RunState.match(model.run, {
    Starting: () => runningLook(model),
    Streaming: () => runningLook(model),
    Done: () => resetLook,
    Failed: () => resetLook,
    Idle: () =>
      isBlocked
        ? {
            label: '▶ Create evals first',
            title: 'This skill has no evals/evals.json',
            style: { background: 'transparent', border: '1px solid var(--tt-border)', color: 'var(--tt-dim)' },
          }
        : {
            label: `▶ Run${model.composer.compare === 'on' ? ' with comparison' : ''}`,
            title: 'Start run',
            style: {
              background: 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))',
              border: '1px solid var(--tt-green)',
              color: 'var(--tt-green)',
            },
          },
  });

const runningLook = (model: Model): RunButtonLook => ({
  label: `${spinnerGlyph(model.spinnerFrame)} Running… select to cancel`,
  title: 'Cancel run',
  style: { background: 'var(--tt-bg-dark)', border: '1px solid var(--tt-border)', color: 'var(--tt-cyan)' },
});

const runButton = (model: Model, noEvals: boolean, h: HtmlBuilder<Message>): Html => {
  const isDisabled = model.run._tag === 'Idle' && noEvals;
  const look = runButtonLook(model, noEvals);
  return h.div(
    [h.Style(sx({ borderTop: '1px solid var(--tt-border)', padding: '12px 14px' }))],
    [
      h.button(
        [
          h.Disabled(isDisabled),
          h.OnClick(Message.ClickedRunButton()),
          h.Title(look.title),
          h.Type('button'),
          h.Style(
            sx(
              {
                alignItems: 'center',
                borderRadius: 7,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                fontWeight: 700,
                gap: 8,
                height: 40,
                justifyContent: 'center',
                width: '100%',
              },
              look.style,
            ),
          ),
        ],
        [look.label],
      ),
    ],
  );
};

// COMPOSER

export const composerView = (model: Model, context: AppContext, h: HtmlBuilder<Message>): Html => {
  const { composer } = model;
  const maybeSelectedSkill = findSelectedSkill(context.workspace.skills, composer);
  const noEvals = hasNoEvals(maybeSelectedSkill);
  const isOpen = (field: FieldName): boolean => Option.contains(model.maybeOpenField, field);
  const skillLabel = Option.match(maybeSelectedSkill, {
    onSome: (skill) => skill.id,
    onNone: () => (composer.workspaceRoot === '' ? 'Choose a skill…' : composer.workspaceRoot),
  });
  const hasExtraSkills = Array.isReadonlyArrayNonEmpty(composer.extraSkill);
  const daemon = context.workspace.daemon;
  const maybeDefaultModel = daemon._tag === 'Online' ? daemon.maybeModel : Option.none<string>();
  // With the judge on "default", the library grades with the model that ran the case.
  const maybeDefaultJudge = composer.model === DEFAULT_MODEL ? maybeDefaultModel : Option.some(composer.model);

  return h.aside(
    [
      h.AriaLabel('Configure local run'),
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flex: 'none',
          flexDirection: 'column',
          overflow: 'hidden',
          width: 392,
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
              padding: '7px 14px',
            }),
          ),
        ],
        ['Configure run'],
      ),
      h.div(
        [h.Style(sx({ flex: 1, overflow: 'auto', padding: '6px 0' }))],
        [
          flagRow(
            {
              field: 'skill',
              label: 'Skill',
              value: skillLabel,
              valueColor: composer.workspaceRoot === '' ? 'var(--tt-comment)' : 'var(--tt-fg)',
              isOpen: isOpen('skill'),
            },
            [skillList(model, context, h), lastRun(model, h)],
            h,
          ),
          flagRow(
            {
              field: 'case',
              label: 'Cases (--case)',
              value: caseLabel(composer.case),
              valueColor: 'var(--tt-fg-dark)',
              isOpen: isOpen('case'),
            },
            [
              optionList(
                {
                  value: composer.case,
                  valueColor: 'var(--tt-fg-dark)',
                  options: caseOptionsFor(model),
                  onSelect: (value) => Message.SelectedCase({ value }),
                  label: caseLabel,
                },
                h,
              ),
              Option.match(suiteNote(model), {
                onNone: () => h.empty,
                onSome: (note) =>
                  h.div([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, padding: '4px 10px' }))], [note]),
              }),
            ],
            h,
          ),
          flagRow(
            {
              field: 'model',
              label: 'Run model (--model)',
              value: modelLabel(maybeDefaultModel)(composer.model),
              valueColor: 'var(--tt-blue)',
              isOpen: isOpen('model'),
            },
            [
              optionList(
                {
                  value: composer.model,
                  valueColor: 'var(--tt-blue)',
                  options: models,
                  onSelect: (value) => Message.SelectedModel({ value }),
                  label: modelLabel(maybeDefaultModel),
                },
                h,
              ),
            ],
            h,
          ),
          flagRow(
            {
              field: 'judgeModel',
              label: 'Judge model (--judge-model)',
              value: modelLabel(maybeDefaultJudge)(composer.judgeModel),
              valueColor: 'var(--tt-magenta)',
              isOpen: isOpen('judgeModel'),
            },
            [
              optionList(
                {
                  value: composer.judgeModel,
                  valueColor: 'var(--tt-magenta)',
                  options: models,
                  onSelect: (value) => Message.SelectedJudgeModel({ value }),
                  label: modelLabel(maybeDefaultJudge),
                },
                h,
              ),
            ],
            h,
          ),
          flagRow(
            {
              field: 'compare',
              label: 'Comparison (--compare)',
              value: composer.compare,
              valueColor: composer.compare === 'off' ? 'var(--tt-comment)' : 'var(--tt-green)',
              isOpen: isOpen('compare'),
            },
            [
              optionList(
                {
                  value: composer.compare,
                  valueColor: 'var(--tt-green)',
                  options: compareOptions,
                  onSelect: (value) => Message.SelectedCompare({ value }),
                },
                h,
              ),
            ],
            h,
          ),
          flagRow(
            {
              field: 'extraSkill',
              label: 'Additional skills (--extra-skill)',
              value: hasExtraSkills ? composer.extraSkill.join(', ') : 'None',
              valueColor: hasExtraSkills ? 'var(--tt-fg-dark)' : 'var(--tt-comment)',
              isOpen: isOpen('extraSkill'),
            },
            [extraSkillEditor(model, h)],
            h,
          ),
          flagRow(
            {
              field: 'iteration',
              label: 'Iterations (--iteration)',
              value: String(composer.iteration),
              valueColor: 'var(--tt-yellow)',
              isOpen: isOpen('iteration'),
            },
            [
              optionList(
                {
                  value: composer.iteration,
                  valueColor: 'var(--tt-yellow)',
                  options: iterationOptions,
                  onSelect: (value) => Message.SelectedIteration({ value }),
                },
                h,
              ),
            ],
            h,
          ),
          flagRow(
            {
              field: 'contextMode',
              label: 'Context (--context-mode)',
              value: composer.contextMode,
              valueColor: 'var(--tt-teal)',
              isOpen: isOpen('contextMode'),
            },
            [
              optionList(
                {
                  value: composer.contextMode,
                  valueColor: 'var(--tt-teal)',
                  options: contextModeOptions,
                  onSelect: (value) => Message.SelectedContextMode({ value }),
                },
                h,
              ),
            ],
            h,
          ),
          flagRow(
            {
              field: 'sandbox',
              label: 'Sandbox (--sandbox)',
              value: composer.sandbox,
              valueColor: composer.sandbox === 'none' ? 'var(--tt-fg-dark)' : 'var(--tt-teal)',
              isOpen: isOpen('sandbox'),
            },
            [
              optionList(
                {
                  value: composer.sandbox,
                  valueColor: 'var(--tt-teal)',
                  options: sandboxOptions,
                  onSelect: (value) => Message.SelectedSandbox({ value }),
                },
                h,
              ),
            ],
            h,
          ),
        ],
      ),
      runButton(model, noEvals, h),
    ],
  );
};

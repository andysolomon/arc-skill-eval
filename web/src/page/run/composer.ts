/**
 * The run composer's flags: what the user configures before a run, the
 * choices each flag row offers, and the CLI command they assemble into.
 */

import { Array, Option, Schema } from 'effect';

import type { WorkspaceSkill } from '@/app/context';

// FLAGS

export const CompareMode = Schema.Literals(['off', 'with', 'on']);
export type CompareMode = typeof CompareMode.Type;

export const ContextMode = Schema.Literals(['isolated', 'ambient']);
export type ContextMode = typeof ContextMode.Type;

export const SandboxMode = Schema.Literals(['none', 'just-bash']);
export type SandboxMode = typeof SandboxMode.Type;

/** Everything POSTed to the daemon's `/runs`; field names match its body. */
export const Composer = Schema.Struct({
  workspaceRoot: Schema.String,
  case: Schema.String,
  model: Schema.String,
  judgeModel: Schema.String,
  compare: CompareMode,
  extraSkill: Schema.Array(Schema.String),
  iteration: Schema.Number,
  contextMode: ContextMode,
  sandbox: SandboxMode,
});
export type Composer = typeof Composer.Type;

export const FieldName = Schema.Literals([
  'skill',
  'case',
  'model',
  'judgeModel',
  'compare',
  'extraSkill',
  'iteration',
  'contextMode',
  'sandbox',
]);
export type FieldName = typeof FieldName.Type;

// OPTIONS

export const models: ReadonlyArray<string> = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'openai/gpt-5',
  'openai/gpt-5-mini',
];

export const caseOptions: ReadonlyArray<string> = ['*', 'all', 'case-pass', 'case-fail'];
export const compareOptions: ReadonlyArray<CompareMode> = ['off', 'with', 'on'];
export const contextModeOptions: ReadonlyArray<ContextMode> = ['isolated', 'ambient'];
export const sandboxOptions: ReadonlyArray<SandboxMode> = ['none', 'just-bash'];
export const iterationOptions: ReadonlyArray<number> = [1, 2, 3, 4, 5];

export const defaultComposer: Composer = {
  workspaceRoot: '',
  case: '*',
  model: 'anthropic/claude-sonnet-4',
  judgeModel: 'anthropic/claude-sonnet-4',
  compare: 'off',
  extraSkill: [],
  iteration: 1,
  contextMode: 'isolated',
  sandbox: 'none',
};

// SKILL

/** The workspace skill whose directory is the run target, if it came from the list. */
export const findSelectedSkill = (
  skills: ReadonlyArray<WorkspaceSkill>,
  composer: Composer,
): Option.Option<WorkspaceSkill> =>
  Array.findFirst(skills, (skill) => Option.contains(skill.path, composer.workspaceRoot));

/**
 * A skill picked from the list with no evals/evals.json can't be run. Manual
 * paths (no selected skill) fall through to the daemon, which rejects them too.
 */
export const hasNoEvals = (maybeSelectedSkill: Option.Option<WorkspaceSkill>): boolean =>
  Option.match(maybeSelectedSkill, { onNone: () => false, onSome: (skill) => !skill.hasEvals });

// COMMAND PREVIEW

export const commandFlags = (composer: Composer): ReadonlyArray<string> => [
  ...(composer.case === '*' ? [] : [`--case ${composer.case}`]),
  `--model ${composer.model}`,
  `--judge-model ${composer.judgeModel}`,
  ...(composer.compare === 'off' ? [] : ['--compare']),
  ...Array.map(composer.extraSkill, (extraSkill) => `--extra-skill ${extraSkill}`),
  ...(composer.iteration === 1 ? [] : [`--iteration ${composer.iteration}`]),
  ...(composer.contextMode === 'isolated' ? [] : [`--context-mode ${composer.contextMode}`]),
  ...(composer.sandbox === 'none' ? [] : [`--sandbox ${composer.sandbox}`]),
];

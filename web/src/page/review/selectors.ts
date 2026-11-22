/** Values derived from the Model and AppContext, shared by update and view. */

import { Array, Option, pipe } from 'effect';

import type { AppContext } from '@/app/context';

import type { ReviewRun } from './domain';
import type { Model } from './model';

/**
 * On localhost, review both the runs the daemon reads from disk and any run
 * imported through the import panel (deduped by id). Hosted has no daemon,
 * so it reviews imported runs only.
 */
export const allRuns = (model: Model, context: AppContext): ReadonlyArray<ReviewRun> => {
  if (context.env !== 'localhost') {
    return model.importedRuns;
  }
  const localIds = Array.map(model.localRuns, (run) => run.id);
  return [...model.localRuns, ...Array.filter(model.importedRuns, (run) => !Array.contains(localIds, run.id))];
};

/** Skills offered by the picker: workspace order first, then any other skill with runs. */
export const skillIds = (model: Model, context: AppContext): ReadonlyArray<string> => {
  const importedSkillIds = Array.dedupe(Array.map(model.importedRuns, (run) => run.skill));
  const availableSkillIds =
    context.env === 'localhost' ? Array.dedupe([...model.localSkillIds, ...importedSkillIds]) : importedSkillIds;
  const ordered = pipe(
    context.workspace.skills,
    Array.map((skill) => skill.id),
    Array.filter((skillId) => Array.contains(availableSkillIds, skillId)),
    Array.dedupe,
  );
  return [...ordered, ...Array.filter(availableSkillIds, (skillId) => !Array.contains(ordered, skillId))];
};

export const runsForSkill = (
  runs: ReadonlyArray<ReviewRun>,
  maybeSkillId: Option.Option<string>,
): ReadonlyArray<ReviewRun> =>
  Option.match(maybeSkillId, {
    onNone: () => runs,
    onSome: (skillId) => Array.filter(runs, (run) => run.skill === skillId),
  });

export const visibleRuns = (model: Model, context: AppContext): ReadonlyArray<ReviewRun> =>
  runsForSkill(allRuns(model, context), model.maybeSelectedSkillId);

export const selectedRun = (model: Model, context: AppContext): Option.Option<ReviewRun> =>
  Option.flatMap(model.maybeSelectedRunId, (runId) =>
    Array.findFirst(visibleRuns(model, context), (run) => run.id === runId),
  );

/** Localhost with runs from the daemon shows a picker header instead of the import panel. */
export const showsLocalHeader = (model: Model, context: AppContext): boolean =>
  context.env === 'localhost' && Array.isReadonlyArrayNonEmpty(model.localSkillIds);

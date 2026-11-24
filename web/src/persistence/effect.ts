import { Effect } from 'effect';

import { getPrefs, setPrefs, type PreferencesPatch, type PreferencesRecord } from './preferences';

export const loadPreferences: Effect.Effect<PreferencesRecord, unknown> = Effect.tryPromise(() => getPrefs());

export const savePreferences = (patch: PreferencesPatch): Effect.Effect<void> =>
  Effect.tryPromise(() => setPrefs(stripUndefined(patch))).pipe(Effect.ignore);

const stripUndefined = (patch: PreferencesPatch): PreferencesPatch =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as PreferencesPatch;

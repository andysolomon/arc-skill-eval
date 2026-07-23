import { getPrefs, setPrefs } from '@/persistence/preferences';

/**
 * Last-run persistence helpers. The former WorkspacePicker component (a manual
 * workspace-root text box + "Pick workspace" button) was removed once the skill
 * pick-list and the header `dir` chip became the ways to choose a run target;
 * these helpers remain because useRunDaemon persists the last run id here.
 */

export const readLastRunIdPreference = async (): Promise<string | undefined> => {
  const prefs = await getPrefs();
  return prefs.lastRunId;
};

export const writeLastRunIdPreference = async (lastRunId: string): Promise<void> => {
  await setPrefs({ lastRunId });
};

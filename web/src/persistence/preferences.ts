import type { SectionName, ThemeName } from '@/types';
import { openDatabase, requestToPromise, transactionDone } from './db';
import { PREFERENCES_SCHEMA_VERSION } from './migrations';

export type EnvName = 'hosted' | 'localhost';

export type PreferencesRecord = {
  id: 'singleton';
  theme: ThemeName;
  section: SectionName;
  env: EnvName;
  workspaceFavorites: string[];
  schemaVersion: number;
  updatedAt: string;
  lastRunId?: string;
};

export type PreferencesPatch = Partial<
  Pick<PreferencesRecord, 'theme' | 'section' | 'env' | 'lastRunId' | 'workspaceFavorites'>
>;

const preferenceEvents = new EventTarget();

const readDefaultEnv = (): EnvName => {
  if (typeof document === 'undefined') {
    return 'hosted';
  }

  const env = document.documentElement.dataset.env;
  return env === 'localhost' || env === 'hosted' ? env : 'hosted';
};

const defaultPrefs = (): PreferencesRecord => ({
  id: 'singleton',
  theme: 'tokyonight',
  section: 'run',
  env: readDefaultEnv(),
  workspaceFavorites: [],
  schemaVersion: PREFERENCES_SCHEMA_VERSION,
  updatedAt: new Date().toISOString(),
});

const normalizePrefs = (record?: Partial<PreferencesRecord>): PreferencesRecord => ({
  ...defaultPrefs(),
  ...record,
  id: 'singleton',
  workspaceFavorites: record?.workspaceFavorites ?? [],
  schemaVersion: record?.schemaVersion ?? PREFERENCES_SCHEMA_VERSION,
  updatedAt: record?.updatedAt ?? new Date().toISOString(),
});

export const getPrefs = async (): Promise<PreferencesRecord> => {
  const db = await openDatabase();
  const tx = db.transaction('preferences', 'readonly');
  const done = transactionDone(tx);
  const record = await requestToPromise<PreferencesRecord | undefined>(
    tx.objectStore('preferences').get('singleton'),
  );
  await done;
  db.close();

  return normalizePrefs(record);
};

export const setPrefs = async (partial: PreferencesPatch): Promise<PreferencesRecord> => {
  const db = await openDatabase();
  const tx = db.transaction('preferences', 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore('preferences');
  const existing = await requestToPromise<PreferencesRecord | undefined>(
    store.get('singleton'),
  );
  const next = normalizePrefs({
    ...existing,
    ...partial,
    updatedAt: new Date().toISOString(),
  });

  await requestToPromise(store.put(next));
  await done;
  db.close();
  preferenceEvents.dispatchEvent(new CustomEvent<PreferencesRecord>('change', { detail: next }));

  return next;
};

export const subscribePrefs = (cb: (prefs: PreferencesRecord) => void): (() => void) => {
  const listener = (event: Event) => cb((event as CustomEvent<PreferencesRecord>).detail);

  preferenceEvents.addEventListener('change', listener);
  return () => preferenceEvents.removeEventListener('change', listener);
};

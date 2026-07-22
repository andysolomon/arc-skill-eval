import type { PreferencesRecord } from './preferences';

export type RecordMigration = (tx: IDBTransaction) => Promise<void>;

export const PREFERENCES_SCHEMA_VERSION = 1;

const requestToPromise = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const migrations: Record<number, RecordMigration> = {
  2: async () => {
    // Reserved for the first record-shape migration.
  },
};

export const migrate = async (
  from: number,
  to: number,
  tx: IDBTransaction,
): Promise<void> => {
  for (let version = from + 1; version <= to; version += 1) {
    await migrations[version]?.(tx);
  }

  const store = tx.objectStore('preferences');
  const existing = await requestToPromise<PreferencesRecord | undefined>(
    store.get('singleton'),
  );
  const now = new Date().toISOString();

  await requestToPromise(
    store.put({
      id: 'singleton',
      theme: 'tokyonight',
      section: 'run',
      env: 'hosted',
      workspaceFavorites: [],
      ...existing,
      schemaVersion: to,
      updatedAt: now,
    } satisfies PreferencesRecord),
  );
};

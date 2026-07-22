import { migrate, PREFERENCES_SCHEMA_VERSION } from './migrations';

export const IDB_NAME = 'arc-skill-eval-web';
export const IDB_SCHEMA_VERSION = 1;

export const STORE_NAMES = [
  'preferences',
  'feedback',
  'improvePlans',
  'learnProgress',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

const resetEvents = new EventTarget();

export const requestToPromise = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

export const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });

const createStores = (db: IDBDatabase, oldVersion: number) => {
  if (oldVersion >= 1) {
    return;
  }

  const preferences = db.createObjectStore('preferences', { keyPath: 'id' });

  const feedback = db.createObjectStore('feedback', { keyPath: 'noteId' });
  feedback.createIndex('byRunId', 'runId', { unique: false });
  feedback.createIndex('byRunCase', ['runId', 'caseId'], { unique: false });

  const improvePlans = db.createObjectStore('improvePlans', { keyPath: 'planId' });
  improvePlans.createIndex('byRunId', 'runId', { unique: false });

  const learnProgress = db.createObjectStore('learnProgress', { keyPath: 'chapterId' });
  learnProgress.createIndex('byChapterId', 'chapterId', { unique: true });

  void preferences;
};

const readPreferencesSchemaVersion = async (db: IDBDatabase): Promise<number> => {
  const tx = db.transaction('preferences', 'readonly');
  const done = transactionDone(tx);
  const record = await requestToPromise<{ schemaVersion?: number } | undefined>(
    tx.objectStore('preferences').get('singleton'),
  );
  await done;

  return record?.schemaVersion ?? 0;
};

const runRecordMigrations = async (db: IDBDatabase) => {
  const fromVersion = await readPreferencesSchemaVersion(db);

  if (fromVersion >= PREFERENCES_SCHEMA_VERSION) {
    return;
  }

  const tx = db.transaction(STORE_NAMES, 'readwrite');
  const done = transactionDone(tx);
  await migrate(fromVersion, PREFERENCES_SCHEMA_VERSION, tx);
  await done;
};

export const openDatabase = (
  name = IDB_NAME,
  version = IDB_SCHEMA_VERSION,
): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      createStores(request.result, request.oldVersion);
    };
    request.onsuccess = async () => {
      const db = request.result;

      try {
        await runRecordMigrations(db);
        resolve(db);
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });

export const clearAll = async (): Promise<void> => {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  const done = transactionDone(tx);

  STORE_NAMES.forEach((storeName) => {
    tx.objectStore(storeName).clear();
  });

  await done;
  db.close();
};

export const resetHostedData = async (): Promise<void> => {
  await clearAll();
  resetEvents.dispatchEvent(new Event('reset'));
};

export const subscribeHostedDataReset = (cb: () => void): (() => void) => {
  const listener = () => cb();

  resetEvents.addEventListener('reset', listener);
  return () => resetEvents.removeEventListener('reset', listener);
};

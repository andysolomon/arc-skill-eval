import { openDatabase, requestToPromise, transactionDone } from './db';

export type ImprovePlanStatus = 'staged' | 'committed' | 'cancelled';

export type ImprovePlanRecord = {
  planId: string;
  runId: string;
  diff: string;
  status: ImprovePlanStatus;
  createdAt: string;
};

export type ImprovePlanInput = Omit<ImprovePlanRecord, 'planId' | 'createdAt'> &
  Partial<Pick<ImprovePlanRecord, 'planId' | 'createdAt'>>;

export const putImprovePlan = async (
  input: ImprovePlanInput,
): Promise<ImprovePlanRecord> => {
  const db = await openDatabase();
  const tx = db.transaction('improvePlans', 'readwrite');
  const done = transactionDone(tx);
  const record: ImprovePlanRecord = {
    planId: input.planId ?? crypto.randomUUID(),
    runId: input.runId,
    diff: input.diff,
    status: input.status,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  await requestToPromise(tx.objectStore('improvePlans').put(record));
  await done;
  db.close();

  return record;
};

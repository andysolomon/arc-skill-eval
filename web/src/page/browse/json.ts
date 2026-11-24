import { Array, Option } from 'effect';

export type UnknownRecord = Readonly<Record<string, unknown>>;

export const jsonRecord = (value: unknown): Option.Option<UnknownRecord> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? Option.some(value as UnknownRecord) : Option.none();

export const field = (maybeRecord: Option.Option<UnknownRecord>, key: string): unknown =>
  Option.match(maybeRecord, { onNone: () => undefined, onSome: (record) => record[key] });

export const maybeString = (value: unknown): Option.Option<string> =>
  typeof value === 'string' ? Option.some(value) : Option.none();

export const finiteNumber = (value: unknown): Option.Option<number> =>
  typeof value === 'number' && Number.isFinite(value) ? Option.some(value) : Option.none();

export const unknownList = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : []);

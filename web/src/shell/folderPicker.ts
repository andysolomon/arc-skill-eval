/**
 * Interactive, daemon-backed directory picker. Unlike a browser
 * `webkitdirectory` upload (which only exposes the picked folder's name, never
 * an absolute path), this navigates the real filesystem through the daemon's
 * `GET /fs` endpoint and yields a real absolute path: a reference, not an
 * upload.
 */

import { Array, Effect, Option, Schema } from 'effect';
import { Command, Submodel, type Update } from 'foldkit';
import type { Html, HtmlBuilder } from 'foldkit/html';
import { defineMessageUnion } from 'foldkit/message';
import { modifyFields } from 'foldkit/struct';

import { color, radius, text } from '@/design/tokens';
import { DAEMON_URL } from '@/shell/daemon';
import { sx } from '@/ui/sx';

// MODEL

export const FsEntry = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  type: Schema.Literals(['dir', 'file']),
  isSkill: Schema.Boolean,
  hasEvalsRuns: Schema.Boolean,
});
export type FsEntry = typeof FsEntry.Type;

export const Listing = Schema.Struct({
  path: Schema.String,
  maybeParent: Schema.Option(Schema.String),
  entries: Schema.Array(FsEntry),
});
export type Listing = typeof Listing.Type;

export const Model = Schema.Struct({
  maybeListing: Schema.Option(Listing),
  isLoading: Schema.Boolean,
  maybeNotice: Schema.Option(Schema.String),
});
export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({
  ClickedBackToSaved: {},
  ClickedUp: {},
  ClickedDirectory: { path: Schema.String },
  ClickedSelectDirectory: {},
  CompletedLoadListing: {
    maybeListing: Schema.Option(Listing),
    maybeNotice: Schema.Option(Schema.String),
  },
});
export type Message = typeof Message.Type;

export const OutMessage = defineMessageUnion({
  RequestedExit: {},
  SelectedDirectory: { path: Schema.String },
});
export type OutMessage = typeof OutMessage.Type;

// COMMAND

const WireListing = Schema.Struct({
  ok: Schema.Boolean,
  path: Schema.optional(Schema.String),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  entries: Schema.optional(Schema.Array(FsEntry)),
  error: Schema.optional(Schema.String),
});
type WireListing = typeof WireListing.Type;

const MAX_ANCESTOR_STEPS = 64;
const DAEMON_OFFLINE_NOTICE = 'daemon offline. Start it with npm run dev';

const readListing = (maybePath: Option.Option<string>) =>
  Effect.tryPromise(async (signal) => {
    const url = Option.match(maybePath, {
      onNone: () => `${DAEMON_URL}/fs`,
      onSome: (path) => `${DAEMON_URL}/fs?path=${encodeURIComponent(path)}`,
    });
    const response = await fetch(url, { signal });
    return (await response.json()) as unknown;
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(WireListing)));

const toListing = (wire: WireListing): Listing => ({
  path: wire.path ?? '',
  maybeParent: Option.fromNullishOr(wire.parent),
  entries: wire.entries ?? [],
});

const findReadableAncestor = (
  maybeAncestor: Option.Option<string>,
  stepsLeft: number,
): Effect.Effect<Option.Option<WireListing>, unknown> =>
  Option.match(maybeAncestor, {
    onNone: () => Effect.succeed(Option.none()),
    onSome: (ancestor) =>
      stepsLeft <= 0
        ? Effect.succeed(Option.none())
        : readListing(Option.some(ancestor)).pipe(
            Effect.flatMap((wire) =>
              wire.ok
                ? Effect.succeed(Option.some(wire))
                : findReadableAncestor(Option.fromNullishOr(wire.parent), stepsLeft - 1),
            ),
          ),
  });

const LoadListing = Command.define('LoadListing', {
  args: { maybePath: Schema.Option(Schema.String), hasListing: Schema.Boolean },
  messages: [Message.CompletedLoadListing],
  interrupt: true,
  execute: ({ maybePath, hasListing }) =>
    Effect.gen(function* () {
      const wire = yield* readListing(maybePath);
      if (wire.ok) {
        return Message.CompletedLoadListing({
          maybeListing: Option.some(toListing(wire)),
          maybeNotice: Option.none(),
        });
      }

      const failure = wire.error ?? 'could not read that directory';
      if (hasListing) {
        return Message.CompletedLoadListing({
          maybeListing: Option.none(),
          maybeNotice: Option.some(`✗ ${failure}`),
        });
      }

      const maybeAncestor = yield* findReadableAncestor(
        Option.fromNullishOr(wire.parent),
        MAX_ANCESTOR_STEPS,
      );
      const maybeFallback = Option.isSome(maybeAncestor)
        ? maybeAncestor
        : yield* readListing(Option.none()).pipe(
            Effect.map((home) => (home.ok ? Option.some(home) : Option.none())),
          );

      return Option.match(maybeFallback, {
        onNone: () =>
          Message.CompletedLoadListing({
            maybeListing: Option.none(),
            maybeNotice: Option.some(`✗ ${failure}`),
          }),
        onSome: (fallback) =>
          Message.CompletedLoadListing({
            maybeListing: Option.some(toListing(fallback)),
            maybeNotice: Option.some(`✗ ${failure}. Showing ${fallback.path ?? ''}`),
          }),
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          Message.CompletedLoadListing({
            maybeListing: Option.none(),
            maybeNotice: Option.some(DAEMON_OFFLINE_NOTICE),
          }),
        ),
      ),
    ),
});

// INIT

export const init = (maybeInitialPath: Option.Option<string>): Update.Return<Model, Message> => ({
  model: { maybeListing: Option.none(), isLoading: true, maybeNotice: Option.none() },
  commands: [LoadListing({ maybePath: maybeInitialPath, hasListing: false })],
});

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>;

const startLoading = (model: Model, path: string): UpdateReturn => ({
  model: modifyFields(model, { isLoading: () => true }),
  commands: [LoadListing({ maybePath: Option.some(path), hasListing: Option.isSome(model.maybeListing) })],
});

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedBackToSaved: () => ({ model, outMessage: OutMessage.RequestedExit() }),
    ClickedUp: () =>
      Option.match(Option.flatMap(model.maybeListing, (listing) => listing.maybeParent), {
        onNone: () => ({ model }),
        onSome: (parent) => startLoading(model, parent),
      }),
    ClickedDirectory: ({ path }) => startLoading(model, path),
    ClickedSelectDirectory: () =>
      Option.match(model.maybeListing, {
        onNone: () => ({ model }),
        onSome: (listing) => ({ model, outMessage: OutMessage.SelectedDirectory({ path: listing.path }) }),
      }),
    CompletedLoadListing: ({ maybeListing, maybeNotice }) => ({
      model: modifyFields(model, {
        isLoading: () => false,
        maybeNotice: () => maybeNotice,
        maybeListing: (current) => (Option.isSome(maybeListing) ? maybeListing : current),
      }),
    }),
  });

// VIEW

const rowBase = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  borderRadius: radius.md,
  cursor: 'pointer',
  display: 'flex',
  gap: 7,
  padding: '5px 8px',
  textAlign: 'left',
  width: '100%',
} as const;

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

const directoryRow = (entry: FsEntry, h: HtmlBuilder<Message>): Html =>
  h.keyed('button')(
    entry.path,
    [
      h.Class('folder-picker-row'),
      h.OnClick(Message.ClickedDirectory({ path: entry.path })),
      h.Title(entry.path),
      h.Type('button'),
      h.Style(sx(rowBase)),
    ],
    [
      h.span([h.AriaHidden(true), h.Style(sx({ color: color.dim, flex: 'none' }))], ['└']),
      h.span(
        [h.Style(sx({ color: color.teal, flex: 1, fontSize: text.sm }, ellipsis))],
        [`${entry.name}/`],
      ),
      entry.isSkill
        ? h.span([h.Style(sx({ color: color.green, flex: 'none', fontSize: text['2xs'] }))], ['skill'])
        : h.empty,
      entry.hasEvalsRuns
        ? h.span([h.Style(sx({ color: color.cyan, flex: 'none', fontSize: text['2xs'] }))], ['runs'])
        : h.empty,
      h.span(
        [h.AriaHidden(true), h.Style(sx({ color: color.dim, flex: 'none', fontSize: text['3xs'] }))],
        ['›'],
      ),
    ],
  );

const fileRow = (entry: FsEntry, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    entry.path,
    [h.Title(entry.name), h.Style(sx(rowBase, { cursor: 'default' }))],
    [
      h.span([h.AriaHidden(true), h.Style(sx({ color: color.dim, flex: 'none' }))], ['·']),
      h.span([h.Style(sx({ color: color.comment, flex: 1, fontSize: text.sm }, ellipsis))], [entry.name]),
    ],
  );

const statusLine = (content: string, tone: string, h: HtmlBuilder<Message>): Html =>
  h.div([h.Style(sx({ color: tone, fontSize: tone === color.red ? text.xs : text.sm, padding: '6px 8px' }))], [
    content,
  ]);

export const view = Submodel.defineView<Model, Message>((model, h) => {
  const entries = Option.match(model.maybeListing, { onNone: () => [], onSome: (listing) => listing.entries });
  const directories = Array.filter(entries, (entry) => entry.type === 'dir');
  const files = Array.filter(entries, (entry) => entry.type === 'file');
  const maybeParent = Option.flatMap(model.maybeListing, (listing) => listing.maybeParent);
  const hasParent = Option.isSome(maybeParent);
  const hasListing = Option.isSome(model.maybeListing);
  const currentPath = Option.match(model.maybeListing, { onNone: () => '…', onSome: (listing) => listing.path });

  return h.div(
    [h.DataAttribute('testid', 'folder-picker')],
    [
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              borderBottom: `1px solid ${color.border}`,
              display: 'flex',
              gap: 8,
              padding: '7px 12px',
            }),
          ),
        ],
        [
          h.button(
            [
              h.AriaLabel('Back to saved directories'),
              h.OnClick(Message.ClickedBackToSaved()),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'transparent',
                  border: 0,
                  color: color.comment,
                  cursor: 'pointer',
                  fontSize: text.sm,
                  padding: 0,
                }),
              ),
            ],
            ['← Saved directories'],
          ),
          h.span([h.Style(sx({ color: color.dim, fontSize: text['2xs'] }))], ['Choose a working directory']),
        ],
      ),
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8, padding: '7px 12px 3px' }))],
        [
          h.button(
            [
              h.AriaLabel('parent directory'),
              h.Disabled(!hasParent),
              h.OnClick(Message.ClickedUp()),
              h.Type('button'),
              h.Style(
                sx({
                  background: 'transparent',
                  border: `1px solid ${color.border}`,
                  borderRadius: radius.sm,
                  color: hasParent ? color.fgDark : color.dim,
                  cursor: hasParent ? 'pointer' : 'not-allowed',
                  flex: 'none',
                  fontSize: text.sm,
                  padding: '1px 7px',
                }),
              ),
            ],
            ['↑ up'],
          ),
          h.span(
            [
              h.Title(currentPath),
              h.Style(
                sx(
                  { color: color.teal, direction: 'rtl', fontSize: text.xs, textAlign: 'left' },
                  ellipsis,
                ),
              ),
            ],
            [currentPath],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ maxHeight: 220, overflow: 'auto', padding: '2px 5px 5px' }))],
        [
          model.isLoading ? statusLine('reading…', color.comment, h) : h.empty,
          Option.match(model.maybeNotice, {
            onNone: () => h.empty,
            onSome: (notice) => statusLine(notice, color.red, h),
          }),
          !model.isLoading && hasListing && Array.isReadonlyArrayEmpty(entries)
            ? statusLine('This directory is empty', color.comment, h)
            : h.empty,
          ...Array.map(directories, (entry) => directoryRow(entry, h)),
          ...Array.map(files, (entry) => fileRow(entry, h)),
        ],
      ),
      h.div(
        [h.Style(sx({ borderTop: `1px solid ${color.border}`, padding: '8px 12px' }))],
        [
          h.button(
            [
              h.Disabled(!hasListing),
              h.OnClick(Message.ClickedSelectDirectory()),
              h.Type('button'),
              h.Style(
                sx({
                  alignItems: 'center',
                  background: hasListing
                    ? 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))'
                    : 'transparent',
                  border: `1px solid ${hasListing ? color.green : color.border}`,
                  borderRadius: radius.lg,
                  color: hasListing ? color.green : color.dim,
                  cursor: hasListing ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  fontSize: text.ui,
                  fontWeight: 700,
                  height: 34,
                  justifyContent: 'center',
                  width: '100%',
                }),
              ),
            ],
            ['Select this directory →'],
          ),
        ],
      ),
    ],
  );
});

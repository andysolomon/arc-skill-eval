/**
 * Working directory chip (localhost mode). Owns the chosen workspace root,
 * saved favorites, and the daemon's resolution of the root into skills.
 * Pages read it through `toSnapshot` (see app/context.ts).
 */

import { Array, Effect, Option, Schema, Stream } from 'effect';
import { Command, Dom, Submodel, Subscription, Update } from 'foldkit';
import type { Html, HtmlBuilder } from 'foldkit/html';
import { defineMessageUnion } from 'foldkit/message';
import { defineTaggedUnion } from 'foldkit/schema';
import { modifyFields } from 'foldkit/struct';

import { WorkspaceSkill, WorkspaceStatus, type WorkspaceSnapshot } from '@/app/context';
import { savePreferences } from '@/persistence/effect';
import { DAEMON_URL } from '@/shell/daemon';
import * as FolderPicker from '@/shell/folderPicker';
import { sx } from '@/ui/sx';

// MODEL

export const Resolution = Schema.Struct({
  skills: Schema.Array(WorkspaceSkill),
  status: WorkspaceStatus,
  maybeResolvedPath: Schema.Option(Schema.String),
  maybeSource: Schema.Option(Schema.Literals(['local', 'github'])),
  maybeError: Schema.Option(Schema.String),
});
export type Resolution = typeof Resolution.Type;

export const Dropdown = defineTaggedUnion({
  Closed: {},
  Home: {},
  Browse: { picker: FolderPicker.Model },
});
export type Dropdown = typeof Dropdown.Type;

export const Model = Schema.Struct({
  root: Schema.String,
  favorites: Schema.Array(Schema.String),
  resolution: Resolution,
  dropdown: Dropdown,
  reference: Schema.String,
});
export type Model = typeof Model.Type;

const sampleSkill = (id: string, role: 'target' | 'distractor', hasEvals: boolean): WorkspaceSkill => ({
  id,
  role: Option.some(role),
  name: Option.none(),
  description: Option.none(),
  path: Option.none(),
  hasEvals,
});

/** Fallback shown when the daemon is not running (hosted, or `npm run dev:web-only`). */
export const sampleSkills: ReadonlyArray<WorkspaceSkill> = [
  sampleSkill('arc-conventional-commits', 'target', true),
  sampleSkill('arc-creating-evals', 'target', true),
  sampleSkill('release-please', 'distractor', false),
];

const offlineResolution = (skills: ReadonlyArray<WorkspaceSkill>): Resolution => ({
  skills,
  status: 'offline',
  maybeResolvedPath: Option.none(),
  maybeSource: Option.none(),
  maybeError: Option.none(),
});

export const toSnapshot = (model: Model): WorkspaceSnapshot => ({ root: model.root, ...model.resolution });

// MESSAGE

export const Message = defineMessageUnion({
  ClickedChip: {},
  ClickedBackdrop: {},
  PressedEscape: {},
  ClickedFavorite: { path: Schema.String },
  UpdatedReference: { value: Schema.String },
  PressedReferenceKey: { key: Schema.String },
  ClickedChooseFolder: {},
  GotFolderPickerMessage: { message: FolderPicker.Message },
  SucceededFetchWorkspace: { resolution: Resolution },
  FailedFetchWorkspace: {},
  CompletedPruneFavorites: { kept: Schema.Array(Schema.String) },
  CompletedSavePreferences: {},
});
export type Message = typeof Message.Type;

// COMMAND

const WireSkill = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.Unknown),
  description: Schema.optional(Schema.Unknown),
  path: Schema.optional(Schema.Unknown),
  hasEvals: Schema.optional(Schema.Unknown),
});

const WireWorkspace = Schema.Struct({
  ok: Schema.optional(Schema.Unknown),
  skills: Schema.optional(Schema.Array(Schema.Unknown)),
  resolvedPath: Schema.optional(Schema.Unknown),
  source: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
});

const maybeString = (value: unknown): Option.Option<string> =>
  typeof value === 'string' ? Option.some(value) : Option.none();

const toSkill = (value: unknown): Option.Option<WorkspaceSkill> =>
  Schema.decodeUnknownOption(WireSkill)(value).pipe(
    Option.map((wire) => ({
      id: wire.id,
      role: Option.none(),
      name: maybeString(wire.name),
      description: maybeString(wire.description),
      path: maybeString(wire.path),
      hasEvals: wire.hasEvals === true,
    })),
  );

const FetchWorkspace = Command.define('FetchWorkspace', {
  args: { root: Schema.String },
  messages: [Message.SucceededFetchWorkspace, Message.FailedFetchWorkspace],
  interrupt: true,
  execute: ({ root }) =>
    Effect.tryPromise(async (signal) => {
      const response = await fetch(`${DAEMON_URL}/workspace?root=${encodeURIComponent(root)}`, { signal });
      if (!response.ok) {
        throw new Error(`workspace lookup failed with ${response.status}`);
      }
      return (await response.json()) as unknown;
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(WireWorkspace)),
      Effect.map((payload) => {
        const failed = payload.ok === false;
        return Message.SucceededFetchWorkspace({
          resolution: {
            skills: failed ? [] : Array.getSomes(Array.map(payload.skills ?? [], toSkill)),
            status: 'live',
            maybeResolvedPath: maybeString(payload.resolvedPath),
            maybeSource: Option.some(payload.source === 'github' ? 'github' : 'local'),
            maybeError: failed
              ? Option.some(typeof payload.error === 'string' ? payload.error : 'directory not found')
              : maybeString(payload.error),
          },
        });
      }),
      Effect.catch(() => Effect.succeed(Message.FailedFetchWorkspace())),
    ),
});

/**
 * Drop favorites that no longer resolve to a real directory. A favorite the
 * daemon cannot be asked about (offline) is kept: we can't verify it.
 */
const PruneFavorites = Command.define('PruneFavorites', {
  args: { favorites: Schema.Array(Schema.String) },
  messages: [Message.CompletedPruneFavorites],
  execute: ({ favorites }) =>
    Effect.forEach(
      favorites,
      (favorite) =>
        Effect.tryPromise(async (signal) => {
          const response = await fetch(`${DAEMON_URL}/fs?path=${encodeURIComponent(favorite)}`, { signal });
          const data = (await response.json()) as { ok?: unknown };
          return data.ok === true;
        }).pipe(
          Effect.catch(() => Effect.succeed(true)),
          Effect.map((exists) => ({ favorite, exists })),
        ),
      { concurrency: 'unbounded' },
    ).pipe(
      Effect.map((results) =>
        Message.CompletedPruneFavorites({
          kept: Array.getSomes(
            Array.map(results, ({ favorite, exists }) => (exists ? Option.some(favorite) : Option.none())),
          ),
        }),
      ),
    ),
});

const SaveWorkspacePreferences = Command.define('SaveWorkspacePreferences', {
  args: {
    workspaceRoot: Schema.optional(Schema.String),
    workspaceFavorites: Schema.optional(Schema.Array(Schema.String)),
  },
  messages: [Message.CompletedSavePreferences],
  execute: ({ workspaceRoot, workspaceFavorites }) =>
    savePreferences({
      workspaceRoot,
      workspaceFavorites: workspaceFavorites === undefined ? undefined : [...workspaceFavorites],
    }).pipe(Effect.as(Message.CompletedSavePreferences())),
});

// INIT

export const init = (root: string, favorites: ReadonlyArray<string>): Update.Return<Model, Message> => {
  const resolve = resolveRoot(root);
  return {
    model: {
      root,
      favorites,
      resolution: resolve.resolution,
      dropdown: Dropdown.Closed(),
      reference: '',
    },
    commands: [
      ...resolve.commands,
      ...(Array.isReadonlyArrayNonEmpty(favorites) ? [PruneFavorites({ favorites })] : []),
    ],
  };
};

// UPDATE

type UpdateReturn = Update.Return<Model, Message>;

const resolveRoot = (
  root: string,
  current: Resolution = offlineResolution(sampleSkills),
): { resolution: Resolution; commands: ReadonlyArray<ReturnType<typeof FetchWorkspace>> } =>
  root === ''
    ? { resolution: offlineResolution([]), commands: [] }
    : {
        resolution: modifyFields(current, { status: () => 'loading' as const }),
        commands: [FetchWorkspace({ root })],
      };

/** Switch to a saved directory (does not change favorites). */
const chooseRoot = (model: Model, root: string): UpdateReturn => {
  const resolve = resolveRoot(root, model.resolution);
  return {
    model: modifyFields(model, {
      root: () => root,
      resolution: () => resolve.resolution,
      dropdown: () => Dropdown.Closed(),
    }),
    commands: [...resolve.commands, SaveWorkspacePreferences({ workspaceRoot: root })],
  };
};

/** Switch to a new reference and remember it as a favorite. */
const pickRoot = (model: Model, root: string): UpdateReturn => {
  const resolve = resolveRoot(root, model.resolution);
  const favorites = Array.contains(model.favorites, root) ? model.favorites : [root, ...model.favorites];
  return {
    model: modifyFields(model, {
      root: () => root,
      favorites: () => favorites,
      resolution: () => resolve.resolution,
      dropdown: () => Dropdown.Closed(),
    }),
    commands: [...resolve.commands, SaveWorkspacePreferences({ workspaceRoot: root, workspaceFavorites: favorites })],
  };
};

const close = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { dropdown: () => Dropdown.Closed() }),
});

const initialPickerPath = (model: Model): Option.Option<string> =>
  Option.orElse(model.resolution.maybeResolvedPath, () =>
    model.root.startsWith('~') || model.root.startsWith('/') ? Option.some(model.root) : Option.none(),
  );

const foldFolderPickerOutMessage = FolderPicker.OutMessage.match<Update.Step<Model, Message>>({
  RequestedExit: () => (model) => ({ model: modifyFields(model, { dropdown: () => Dropdown.Home() }) }),
  SelectedDirectory:
    ({ path }) =>
    (model) =>
      pickRoot(model, path),
});

const foldFolderPicker = Update.foldChild({
  update: FolderPicker.update,
  read: (model: Model) =>
    Dropdown.match(model.dropdown, {
      Browse: ({ picker }) => Option.some(picker),
      Closed: () => Option.none(),
      Home: () => Option.none(),
    }),
  write: (model: Model, nextPicker: FolderPicker.Model): Model =>
    modifyFields(model, { dropdown: () => Dropdown.Browse({ picker: nextPicker }) }),
  toParentMessage: (message: FolderPicker.Message) => Message.GotFolderPickerMessage({ message }),
  foldOutMessage: foldFolderPickerOutMessage,
});

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedChip: () =>
      Dropdown.match(model.dropdown, {
        Closed: () => ({ model: modifyFields(model, { dropdown: () => Dropdown.Home() }) }),
        Home: () => close(model),
        Browse: () => close(model),
      }),
    ClickedBackdrop: () => close(model),
    PressedEscape: () => close(model),
    ClickedFavorite: ({ path }) => chooseRoot(model, path),
    UpdatedReference: ({ value }) => ({ model: modifyFields(model, { reference: () => value }) }),
    PressedReferenceKey: ({ key }) => {
      const next = model.reference.trim();
      if (key !== 'Enter' || next === '') {
        return { model };
      }
      const picked = pickRoot(model, next);
      return { ...picked, model: modifyFields(picked.model, { reference: () => '' }) };
    },
    ClickedChooseFolder: () => {
      const pickerInit = FolderPicker.init(initialPickerPath(model));
      return {
        model: modifyFields(model, { dropdown: () => Dropdown.Browse({ picker: pickerInit.model }) }),
        commands: Command.mapMessages(pickerInit.commands, (message) => Message.GotFolderPickerMessage({ message })),
      };
    },
    GotFolderPickerMessage: ({ message }) => foldFolderPicker(model, message),
    SucceededFetchWorkspace: ({ resolution }) => ({ model: modifyFields(model, { resolution: () => resolution }) }),
    FailedFetchWorkspace: () => ({ model: modifyFields(model, { resolution: () => offlineResolution(sampleSkills) }) }),
    CompletedPruneFavorites: ({ kept }) =>
      kept.length === model.favorites.length
        ? { model }
        : {
            model: modifyFields(model, { favorites: () => kept }),
            commands: [SaveWorkspacePreferences({ workspaceFavorites: kept })],
          },
    CompletedSavePreferences: () => ({ model }),
  });

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  escapeToClose: entry(
    { isOpen: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isOpen: model.dropdown._tag !== 'Closed' }),
      dependenciesToStream: ({ isOpen }) =>
        isOpen
          ? Dom.streamFromEventFilterMap({
              target: window,
              type: 'keydown',
              filterMapEvent: (event: KeyboardEvent) =>
                event.key === 'Escape' ? Option.some(Message.PressedEscape()) : Option.none(),
            })
          : Stream.empty,
    },
  ),
}));

// VIEW

const kickerStyle = {
  color: 'var(--tt-comment)',
  fontSize: 10.5,
  letterSpacing: '.06em',
  padding: '7px 12px 3px',
  textTransform: 'uppercase',
} as const;

const favoriteRow = (path: string, isActive: boolean, h: HtmlBuilder<Message>): Html =>
  h.keyed('button')(
    path,
    [
      h.OnClick(Message.ClickedFavorite({ path })),
      h.Type('button'),
      h.Style(
        sx({
          alignItems: 'center',
          background: isActive ? 'var(--tt-selection)' : 'transparent',
          border: 0,
          borderRadius: 6,
          cursor: 'pointer',
          display: 'flex',
          fontSize: 12.5,
          gap: 8,
          padding: '7px 9px',
          textAlign: 'left',
          width: '100%',
        }),
      ),
    ],
    [
      h.span([h.Style(sx({ color: 'var(--tt-green)', flex: 'none', width: 11 }))], [isActive ? '✓' : '']),
      h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], [path]),
    ],
  );

const skillColor = (skill: WorkspaceSkill): string =>
  skill.hasEvals
    ? 'var(--tt-green)'
    : Option.contains(skill.role, 'distractor')
      ? 'var(--tt-comment)'
      : 'var(--tt-fg-dark)';

const skillTitle = (skill: WorkspaceSkill): string =>
  skill.hasEvals
    ? `${skill.id}: has an eval suite`
    : Option.getOrElse(Option.filter(skill.description, (d) => d !== ''), () => `${skill.id}: no eval suite`);

const skillRow = (skill: WorkspaceSkill, h: HtmlBuilder<Message>): Html =>
  h.keyed('div')(
    skill.id,
    [h.Title(skillTitle(skill)), h.Style(sx({ color: skillColor(skill), fontSize: 12, padding: '1px 0' }))],
    [h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], ['└ ']), `${skill.id}/`],
  );

const dim = (content: string, h: HtmlBuilder<Message>): Html =>
  h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], [content]);

const skillsPanel = (model: Model, h: HtmlBuilder<Message>): Html => {
  const { resolution } = model;
  return h.div(
    [h.Style(sx({ borderTop: '1px solid var(--tt-border)', padding: '7px 12px' }))],
    [
      h.div(
        [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11, marginBottom: 5 }))],
        [
          'Skills in this directory',
          resolution.status === 'loading' ? dim(' · Scanning…', h) : h.empty,
          resolution.status === 'offline' ? dim(' · Sample data; daemon offline', h) : h.empty,
          resolution.status === 'live' && Option.contains(resolution.maybeSource, 'github')
            ? dim(' · Cloned from GitHub', h)
            : h.empty,
        ],
      ),
      Option.match(resolution.maybeError, {
        onNone: () =>
          Array.isReadonlyArrayEmpty(resolution.skills) && resolution.status === 'live'
            ? h.div(
                [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, padding: '1px 0' }))],
                ['No skills found in this directory'],
              )
            : h.empty,
        onSome: (error) =>
          h.div([h.Style(sx({ color: 'var(--tt-red)', fontSize: 11.5, padding: '1px 0' }))], [`✗ ${error}`]),
      }),
      ...Array.map(resolution.skills, (skill) => skillRow(skill, h)),
      resolution.status === 'live'
        ? Option.match(resolution.maybeResolvedPath, {
            onNone: () => h.empty,
            onSome: (resolvedPath) =>
              h.div(
                [
                  h.Style(
                    sx({
                      color: 'var(--tt-dim)',
                      fontSize: 10.5,
                      marginTop: 5,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }),
                  ),
                ],
                [resolvedPath],
              ),
          })
        : h.empty,
    ],
  );
};

const homeView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.div(
    [
      h.Style(
        sx({
          borderBottom: '1px solid var(--tt-border)',
          color: 'var(--tt-comment)',
          fontSize: 11,
          lineHeight: 1.5,
          padding: '7px 12px',
        }),
      ),
    ],
    ['Choose the directory that contains your skills. arc-skill-eval scans its subdirectories.'],
  ),
  h.div([h.Style(sx(kickerStyle))], ['Saved directories']),
  h.div(
    [h.Style(sx({ padding: '0 5px 4px' }))],
    Array.map(model.favorites, (path) => favoriteRow(path, path === model.root, h)),
  ),
  h.div(
    [h.Style(sx({ padding: '0 10px 8px' }))],
    [
      h.div(
        [
          h.Style(
            sx({
              alignItems: 'center',
              border: '1px dashed var(--tt-border)',
              borderRadius: 6,
              display: 'flex',
              gap: 7,
              height: 32,
              padding: '0 9px',
            }),
          ),
        ],
        [
          h.span([h.AriaHidden(true), h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12 }))], ['⇱']),
          h.input([
            h.AriaLabel('Enter a folder path or GitHub repository URL'),
            h.OnInput((value) => Message.UpdatedReference({ value })),
            h.OnKeyDown((key) => Message.PressedReferenceKey({ key })),
            h.Placeholder('~/path or github.com/owner/repo…'),
            h.Spellcheck(false),
            h.Value(model.reference),
            h.Style(
              sx({
                background: 'transparent',
                border: 0,
                color: 'var(--tt-fg)',
                flex: 1,
                fontSize: 12,
                minWidth: 0,
                outline: 'none',
              }),
            ),
          ]),
        ],
      ),
      h.button(
        [
          h.AriaLabel('Choose a folder'),
          h.OnClick(Message.ClickedChooseFolder()),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: 'transparent',
              border: '1px dashed var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg-dark)',
              cursor: 'pointer',
              display: 'flex',
              fontSize: 12,
              gap: 7,
              height: 30,
              justifyContent: 'center',
              marginTop: 6,
              width: '100%',
            }),
          ),
        ],
        ['⇱ Choose a folder…'],
      ),
    ],
  ),
  skillsPanel(model, h),
];

const dropdownView = (model: Model, content: ReadonlyArray<Html>, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.div([
    h.AriaHidden(true),
    h.OnClick(Message.ClickedBackdrop()),
    h.Style(sx({ inset: 0, position: 'fixed', zIndex: 65 })),
  ]),
  h.div(
    [
      h.DataAttribute('testid', 'workspace-dropdown'),
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border-active)',
          borderRadius: 8,
          left: 0,
          maxHeight: 'calc(100vh - 64px)',
          overflowX: 'hidden',
          overflowY: 'auto',
          position: 'absolute',
          top: 36,
          width: 288,
          zIndex: 70,
        }),
      ),
    ],
    content,
  ),
];

export const view = Submodel.defineView<Model, Message>((model, h) => {
  const isOpen = model.dropdown._tag !== 'Closed';
  const chipTitle = Option.match(model.resolution.maybeError, {
    onNone: () => model.root,
    onSome: (error) => `${model.root}: ${error}`,
  });

  return h.div(
    [h.Style(sx({ flex: 'none', position: 'relative' }))],
    [
      h.button(
        [
          h.DataAttribute('testid', 'workspace-chip'),
          h.OnClick(Message.ClickedChip()),
          h.Title('Choose working directory'),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: 'transparent',
              border: '1px solid var(--tt-border)',
              borderRadius: 7,
              cursor: 'pointer',
              display: 'inline-flex',
              gap: 7,
              height: 30,
              padding: '0 11px',
              whiteSpace: 'nowrap',
            }),
          ),
        ],
        [
          h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 11 }))], ['workspace']),
          h.span(
            [
              h.Title(chipTitle),
              h.Style(
                sx({
                  color: Option.isSome(model.resolution.maybeError) ? 'var(--tt-red)' : 'var(--tt-teal)',
                  fontSize: 12.5,
                }),
              ),
            ],
            [model.root],
          ),
          h.span(
            [h.AriaHidden(true), h.Style(sx({ color: 'var(--tt-dim)', fontSize: 10 }))],
            [isOpen ? '▴' : '▾'],
          ),
        ],
      ),
      ...Dropdown.match(model.dropdown, {
        Closed: () => [],
        Home: () => dropdownView(model, homeView(model, h), h),
        Browse: ({ picker }) =>
          dropdownView(
            model,
            [
              h.submodel({
                slotId: 'folder-picker',
                model: picker,
                view: FolderPicker.view,
                toParentMessage: (message) => Message.GotFolderPickerMessage({ message }),
              }),
            ],
            h,
          ),
      }),
    ],
  );
});

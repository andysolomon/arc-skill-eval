# web/ — agent notes

The web app is a [Foldkit](https://foldkit.dev) program (Effect 4.1, Elm
architecture). Read [`FOLDKIT.md`](./FOLDKIT.md) before writing code here; it
is Foldkit's own conventions file (replace it whole on a Foldkit upgrade, see
its "After a Foldkit upgrade" section). The repo-wide rules in
[`../AGENTS.md`](../AGENTS.md) (E2E-first testing) also apply.

`FOLDKIT.md` asks about vendoring the Foldkit repo as a subtree. We decided
not to: reference examples ship inside the `create-foldkit-app` npm package
(`npm pack create-foldkit-app` → `dist/templates/examples/`).

subtree_prompted: true

## Layout

```
src/
  entry.ts          boots the runtime (only file that calls Runtime.run)
  main.ts           Flags (saved preferences, loaded before first render) + init
  model.ts          root Model: theme, env, section, workspace, active page
  message.ts        root Message
  update.ts         root update; folds the workspace and the active page
  view.ts           header, section nav, status bar, page slot
  subscription.ts   section hotkeys (1-5) + lifted child subscriptions
  command.ts        shell Commands (document attributes, prefs, copy, reset)
  app/domain.ts     ThemeName / EnvName / SectionName schemas, sections list
  app/context.ts    AppContext + PageOutMessage — the page contract types
  shell/            workspace chip + daemon folder picker (Submodels)
  page/<section>/   one Submodel per section: run, browse, create, review, learn
  ui/sx.ts          inline-style helper (numbers → px like React)
  ui/primitives.ts  shared view helpers: kicker, column, skillPicker
  design/tokens.ts  typed CSS custom-property references (--tt-*)
  persistence/      IndexedDB stores (plain TS) + persistence/effect.ts wrappers
```

## Page contract

Each `src/page/<section>/index.ts` must export:

| export | type |
| --- | --- |
| `Model` | Schema |
| `Message` | `defineMessageUnion` result |
| `init` | `(context: AppContext) => Update.Return<Model, Message>` |
| `update` | `(model, message, context: AppContext) => Update.ReturnWithOutMessage<Model, Message, PageOutMessage>` |
| `contextChanged` | `(model, context: AppContext) => Update.Return<Model, Message>` — called when env, theme or workspace changes while the page is active |
| `view` | `Submodel.defineView<Model, Message, AppContext>(...)` |
| `subscriptions` | `Subscription.make<Model, Message>()(...)` — **entry keys must be prefixed with the section name** (`runDaemonSocket`, not `socket`): the root aggregates every page's subscriptions and keys must be unique |

Only the active section's page is alive; switching sections re-runs `init`
(the React app unmounted inactive sections the same way). Anything that must
survive a section switch is persisted (IndexedDB via `persistence/`).

Pages talk to the shell only through `PageOutMessage` (in `app/context.ts`),
e.g. `RequestedSection` for "go to review" buttons. If a page needs another
shell capability, add a variant there and handle it in `update.ts`.

## Conventions specific to this app

- Visuals are inline styles ported from the React app: write
  `h.Style(sx({ ... }))` with the same values the React `style={{...}}` had.
  `sx` converts numbers to px exactly like React did.
- Keep every `data-testid` from the React version; the Playwright suite in
  `tests/e2e/` locates elements by them. Write `h.DataAttribute('testid', ...)`.
- Booleans in ARIA attributes take strings: `h.AriaPressed(String(isOn))`.
- Daemon calls (localhost mode) go through Commands using `DAEMON_URL` from
  `shell/daemon.ts`; every Command catches its errors into a `Failed*` /
  `Completed*` Message.
- `exactOptionalPropertyTypes` is off (the persistence layer predates it).
- Effect 4 differences that bite: `Array.filterMap` takes a `Result`-returning
  function (use `Array.getSomes(Array.map(...))` for Option), and use
  `Array.isReadonlyArrayEmpty` / `isReadonlyArrayNonEmpty` on readonly arrays.

## Checks

```
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run test:e2e -- --trace off
```

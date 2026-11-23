# arc-skill-eval web app

The web app for arc-skill-eval, written in [Foldkit](https://foldkit.dev) and
Effect. It has two modes:

- **Hosted** runs in the browser alone. You import run JSON, review it, write
  feedback notes and draft eval suites. Everything is stored in the browser
  (IndexedDB).
- **Localhost** talks to a small daemon on your machine. The daemon reads the
  skills in a folder you choose, runs their eval suites, writes
  `evals/evals.json` and applies review feedback with `improve --apply`.

Agent and contributor notes are in [`AGENTS.md`](./AGENTS.md).

## Run the web app

Install dependencies once, from the repository root:

```sh
npm ci
```

Then start the app on its own (hosted mode works, localhost mode reports the
daemon as offline):

```sh
npm --prefix web run dev:web-only
```

## Run localhost mode

The daemon runs evals with the arc-skill-eval library built into the
repository's `dist/`, so build it first:

```sh
npm run build
npm --prefix web run dev
```

`npm run dev` starts the daemon on port 7357 and the vite dev server
together. Open the app, switch the header to **localhost** and choose a
workspace folder. To start the daemon alone, run `npm --prefix web run daemon`.

The daemon listens on 127.0.0.1 and answers only this web app: requests from
other websites, requests addressed to another host name, and paths outside the
folders you open in the app are refused. Runs use your Pi settings
(`~/.pi/agent`), the same as `arc-skill-eval run`. To allow another web origin,
such as a preview deployment, list it in `ARC_SKILL_EVAL_DAEMON_ORIGINS`
(comma separated).

## Run the tests

```sh
npm --prefix web run typecheck
npm --prefix web run test:e2e
```

The end-to-end suite builds the app and starts its own daemon on port 7358.
That daemon runs cases on the library's replay runtime instead of a model
(`ARC_SKILL_EVAL_DAEMON_REPLAY`), so the localhost specs run, cancel, write and
improve real suites without provider keys. Each run leaves screenshots, JSON
records of what the daemon did, and a `manifest.json` with their hashes in
`web/test-artifacts/e2e/`.

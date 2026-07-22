# ARC Skill Eval Web

## Local Daemon

The workspace-picker companion daemon lives in `web/daemon` and listens on port
`7357` by default. Start it from the repository root with:

```sh
npm --prefix web run daemon
```

The daemon exposes `/health`, `/runs`, `/generate-evals`, `/apply-plan`, run
WebSocket streams, and artifact reads for localhost workspace flows.

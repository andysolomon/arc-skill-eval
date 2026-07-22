import { WebSocketServer } from "ws";
import { getRun, subscribeToRun } from "./state.mjs";

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function subscribe(socket, runId) {
  const run = getRun(runId);
  if (!run) {
    sendJson(socket, {
      type: "error",
      message: `Unknown run ${runId}`,
    });
    socket.close(1008, "Unknown run");
    return;
  }

  sendJson(socket, {
    type: "run.snapshot",
    run,
  });

  for (const event of run.progress) {
    sendJson(socket, event);
  }

  const unsubscribe = subscribeToRun(runId, (event) => {
    sendJson(socket, event);
  });

  socket.on("close", unsubscribe);
  socket.on("error", unsubscribe);
}

export function createRunWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/runs\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      socket.destroy();
      return;
    }

    const runId = decodeURIComponent(match[1]);
    wss.handleUpgrade(request, socket, head, (ws) => {
      subscribe(ws, runId);
    });
  });

  return wss;
}

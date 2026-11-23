import { WebSocketServer } from "ws";
import { refusalReason } from "./access.mjs";
import { getRun, snapshotFrame, subscribeToRun } from "./state.mjs";

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

/**
 * Send the run so far (one `run.snapshot` frame, then the terminal frame if
 * the run already ended), then every later frame as it happens.
 */
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

  sendJson(socket, snapshotFrame(run));
  if (run.terminalFrame) {
    sendJson(socket, run.terminalFrame);
  }

  const unsubscribe = subscribeToRun(runId, (frame) => {
    sendJson(socket, frame);
  });

  socket.on("close", unsubscribe);
  socket.on("error", unsubscribe);
}

export function createRunWebSocketServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    // Browsers send Origin on WebSocket handshakes; apply the same checks as HTTP.
    if (refusalReason(request.headers)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }

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

/**
 * Who may talk to the daemon.
 *
 * The daemon listens on 127.0.0.1 and can read and write files in the
 * workspaces the user opens, so it only answers the arc-skill-eval web app.
 * Three checks run on every HTTP request and WebSocket upgrade:
 *
 * 1. The Host header must name localhost or 127.0.0.1. A DNS rebinding page
 *    reaches 127.0.0.1 under its own host name, so it fails here.
 * 2. When the browser sends an Origin header, it must be the production web
 *    app or a page served from localhost (the vite dev and preview servers).
 *    Extra origins can be listed in ARC_SKILL_EVAL_DAEMON_ORIGINS, separated
 *    by commas.
 * 3. A request without an Origin header that a browser marks as cross-site
 *    (Sec-Fetch-Site) is refused. Browsers omit Origin on some cross-site GET
 *    requests, such as an image tag pointing at the daemon.
 *
 * Requests with neither header come from local programs (curl, scripts),
 * which can already read the user's files directly.
 */

export const PRODUCTION_ORIGIN = "https://arc-skill-eval.vercel.app";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const extraOrigins = new Set(
  (process.env.ARC_SKILL_EVAL_DAEMON_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export function isAllowedOrigin(origin) {
  if (origin === PRODUCTION_ORIGIN || extraOrigins.has(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedHost(host) {
  if (typeof host !== "string" || host === "") {
    return false;
  }

  try {
    return LOCAL_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

/** Returns null when the request may proceed, or the reason to refuse it. */
export function refusalReason(headers) {
  if (!isAllowedHost(headers.host)) {
    return "The daemon only answers requests addressed to localhost or 127.0.0.1.";
  }

  const origin = headers.origin;
  if (typeof origin === "string") {
    return isAllowedOrigin(origin) ? null : `The daemon does not answer pages from ${origin}.`;
  }

  const fetchSite = headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "none" && fetchSite !== "same-origin") {
    return "The daemon does not answer cross-site requests without an Origin header.";
  }

  return null;
}

/** CORS headers for an allowed origin; none for requests without one. */
export function corsHeaders(headers) {
  const origin = headers.origin;
  if (typeof origin !== "string" || !isAllowedOrigin(origin)) {
    return {};
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type",
    // Chrome asks before a public https page may call a loopback address.
    "access-control-allow-private-network": "true",
    vary: "Origin",
  };
}

import type { Page, Route } from '@playwright/test';

/**
 * In-page mock of the localhost daemon (web/daemon, port 7357).
 *
 * Every request the app makes to the daemon is intercepted with `page.route`.
 * A test registers only the endpoints its flow needs; anything else is refused
 * the same way an offline daemon would refuse it (connection refused), so tests
 * never depend on a real daemon or a real model call.
 */

// The app built for the suite talks to port 7358 (see playwright.config.ts);
// a deployed app (PLAYWRIGHT_BASE_URL) talks to the default port 7357.
const DAEMON_URL = /^http:\/\/(localhost|127\.0\.0\.1):(7357|7358)\//;

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export type DaemonRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
};

export type DaemonReply = {
  status?: number;
  json?: unknown;
  text?: string;
};

export type DaemonHandler = (request: DaemonRequest) => DaemonReply | Promise<DaemonReply>;

type Registration = {
  method: string;
  path: string | RegExp;
  handler: DaemonHandler;
};

const parseBody = (raw: string | null): unknown => {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

export class DaemonMock {
  /** Every daemon request the page made (preflights excluded), in order. */
  readonly requests: DaemonRequest[] = [];

  private readonly registrations: Registration[] = [];

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    await this.page.route(DAEMON_URL, (route) => this.handle(route));
  }

  /**
   * Register a handler. Later registrations win over earlier ones for the same
   * method + path, so a test can override a default mid-flow.
   */
  on(method: string, path: string | RegExp, reply: DaemonHandler | DaemonReply): this {
    const handler: DaemonHandler = typeof reply === 'function' ? reply : () => reply;
    this.registrations.unshift({ method: method.toUpperCase(), path, handler });
    return this;
  }

  requestsTo(method: string, path: string | RegExp): DaemonRequest[] {
    return this.requests.filter(
      (request) => request.method === method.toUpperCase() && matches(path, request.path),
    );
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const registration = this.registrations.find(
      (candidate) => candidate.method === method && matches(candidate.path, url.pathname),
    );

    if (!registration) {
      await route.abort('connectionrefused');
      return;
    }

    const daemonRequest: DaemonRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      body: parseBody(request.postData()),
    };
    this.requests.push(daemonRequest);

    const reply = await registration.handler(daemonRequest);
    const body = reply.text ?? JSON.stringify(reply.json ?? {});

    await route.fulfill({
      status: reply.status ?? 200,
      headers: {
        ...corsHeaders,
        'content-type': reply.text !== undefined ? 'text/plain' : 'application/json',
      },
      body,
    });
  }
}

const matches = (path: string | RegExp, pathname: string) =>
  typeof path === 'string' ? path === pathname : path.test(pathname);

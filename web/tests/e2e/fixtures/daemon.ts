import type { Page, Route } from '@playwright/test';
import { E2E_DAEMON_PORT } from './local';

const DEFAULT_DAEMON_PORT = 7357;
const DAEMON_URL = new RegExp(`^http://(localhost|127\\.0\\.0\\.1):(${DEFAULT_DAEMON_PORT}|${E2E_DAEMON_PORT})/`);

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
  readonly requests: DaemonRequest[] = [];

  private readonly registrations: Registration[] = [];

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    await this.page.route(DAEMON_URL, (route) => this.handle(route));
  }

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

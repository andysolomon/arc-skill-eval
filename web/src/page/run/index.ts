/**
 * Run section: hosted mode explains the CLI; localhost mode composes a run's
 * flags, POSTs it to the daemon, streams its progress over a WebSocket and
 * shows the benchmark. Implements the page contract in web/AGENTS.md.
 */

export { Model } from './model';
export { Message } from './message';
export { init, update, contextChanged } from './update';
export { subscriptions } from './subscription';
export { view } from './view/page';

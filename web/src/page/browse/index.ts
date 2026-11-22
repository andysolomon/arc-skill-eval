/**
 * Browse section: run results imported in Review (hosted) or read from disk
 * by the daemon (localhost), with a runs rail, a case list and a five-tab
 * case detail. Implements the page contract documented in web/AGENTS.md.
 */

export { Model } from './model';
export { Message } from './message';
export { init, update, contextChanged } from './update';
export { subscriptions } from './subscription';
export { view } from './view';

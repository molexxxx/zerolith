/**
 * @zerolith/state: signals with a memory, over the core alone. A signal
 * kept in storage and in step across tabs, undo and redo for a signal,
 * signals that follow another after a quiet spell or at most so often, and
 * a selector that tells each row whether it is the selected one. The public
 * surface is assembled here.
 */
export type { StoredOptions } from "./stored.js";
export { stored } from "./stored.js";

export type { History, HistoryOptions } from "./history.js";
export { history } from "./history.js";

export { debounced, throttled } from "./timing.js";

export { selector } from "./selector.js";

export type { Next, SetStore, Snapshot, Store } from "./store.js";
export { Reconciled, reconcile, snapshot, store } from "./store.js";

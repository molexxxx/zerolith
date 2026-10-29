/**
 * @zerolith/a11y: the accessibility primitives every component library
 * rebuilds, as functions over the DOM. The public surface is assembled here.
 */
export type { FocusOrigin, FocusOriginMonitor, FocusTrapOptions, RovingOptions } from "./focus.js";
export { focusOrigin, focusTrap, focusables, rovingTabindex } from "./focus.js";

export type { Announcer, Politeness } from "./announce.js";
export { createAnnouncer, visuallyHidden } from "./announce.js";

export { forcedColors, mediaQuery, reducedMotion } from "./media.js";

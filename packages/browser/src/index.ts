/**
 * @zerolith/browser: the page as signals. Whether it is online and visible
 * and the window's size are one signal each for the page; an element's
 * size and whether it is in view are one per element, kept by observers
 * that go with the enclosing owner.
 */
export type { Size } from "./size.js";
export { size } from "./size.js";
export type { InViewOptions } from "./inview.js";
export { inView } from "./inview.js";
export { online, visible, windowSize } from "./page.js";

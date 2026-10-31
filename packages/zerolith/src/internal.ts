/**
 * zerolith/internal: the hooks build tools and the dev tools use, the
 * template prepare pass and its scanner, the scope marker of scoped
 * styles, and the dev tools hook. Applications never need them. This entry
 * is not covered by the API freeze and may change in any version, together
 * with `@zerolith/vite`, the command line, and `@zerolith/devtools`, which
 * are released with it.
 */
export type { PartSpec, PreparedPart, Scanned } from "./template.js";
export { prepared, scan } from "./template.js";

export { SCOPE_MARKER } from "./css.js";

export type { DevtoolsEvent, DevtoolsHook, NodeSnapshot, RootSnapshot } from "./devtools.js";
export { internal as devtoolsInternal, saveRestore as devtoolsSaveRestore } from "./devtools.js";

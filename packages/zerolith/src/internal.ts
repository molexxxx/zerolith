/**
 * zerolith/internal: what the packages released with zerolith share with
 * it, and applications never import: the template prepare pass and its
 * scanner, the scope marker of scoped styles, the dev tools hook, and the
 * version. `@zerolith/vite`, `@zerolith/devtools`, and the command line
 * require the zerolith of their own version, declare it exactly, and stop
 * with `package_version_mismatch` when they meet another, so this entry
 * changes together with them and never under an installed application.
 */
export type { PartSpec, PreparedPart, Scanned } from "./template.js";
export { prepared, scan } from "./template.js";

export { SCOPE_MARKER } from "./css.js";

export type { DevtoolsEvent, DevtoolsHook, NodeSnapshot, RootSnapshot } from "./devtools.js";
export { internal as devtoolsInternal, saveRestore as devtoolsSaveRestore } from "./devtools.js";

export { version } from "./version.js";

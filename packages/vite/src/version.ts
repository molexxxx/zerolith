/**
 * The plugin and the core share `zerolith/internal`, which can change with
 * every version, so the plugin requires the zerolith it was released with.
 */
import { DIAGNOSTIC_URL } from "zerolith";
import { version as installed } from "zerolith/internal";

/** The version of this package, which the version script keeps equal to its manifest's. */
export const version: string = "0.1.0-alpha.4";

/** Throws `package_version_mismatch` when the installed zerolith is not the plugin's own version. */
export function checkCoreVersion(own: string = version, core: string = installed): void
{
    if (core !== own)
    {
        throw new Error(`zerolith: package_version_mismatch: @zerolith/vite ${own} requires zerolith ${own}, and zerolith ${core} is installed. Install one version of both, with npm install @zerolith/vite@${core} or npm install zerolith@${own}. ${DIAGNOSTIC_URL}package_version_mismatch`);
    }
}

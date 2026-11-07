// Copies the script zerolith build wrote to dist/feedback-widget.js, a name
// that stays the same from one build to the next.
import { copyFileSync, readdirSync } from "node:fs";

const scripts = readdirSync("dist/assets")
    .filter((name) => name.endsWith(".js"));
const [script, ...others] = scripts;
if (script === undefined || others.length > 0)
{
    throw new Error(`dist/assets holds ${scripts.length} scripts, not one`);
}
copyFileSync(`dist/assets/${script}`, "dist/feedback-widget.js");

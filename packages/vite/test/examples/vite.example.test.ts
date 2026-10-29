// Executed examples for the Vite guide.
import { parseSync } from "vite";
import { describe, expect, it } from "vitest";
import { type ModuleParser, transformModule } from "@zerolith/vite";

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

function region(text: string, name: string): string
{
    const lines = text.split("\n");
    return lines.slice(lines.indexOf(`// #region ${name}`) + 1, lines.indexOf(`// #endregion ${name}`)).join("\n");
}

const before = `
// #region before
import { Counter } from "./counter.js";

export function App()
{
    return Counter();
}
// #endregion before
`;

const after = `
// #region after
import * as __zl$ from "@zerolith/vite/runtime"; var App = __zl$.component(import.meta.hot, "App", App$); import { Counter } from "./counter.js";

function App$()
{
    return Counter();
}
export { App };
if (import.meta.hot) { import.meta.hot.dispose(__zl$.save); import.meta.hot.accept(__zl$.accept); }
// #endregion after
`;

describe("vite guide", () =>
{
    it("rewrites a component module", () =>
    {
        expect(transformModule(region(before, "before"), "/src/app.js", parse)?.code).toBe(region(after, "after"));
    });
});

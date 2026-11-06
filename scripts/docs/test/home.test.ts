import { describe, expect, it } from "vitest";
import { speedLine } from "../home.ts";

describe("home page", () =>
{
    const rows = [
        { name: "vanilla", entry: "vanillajs", version: "hand-written", score: 1 },
        { name: "solid", entry: "solid", version: "1.9.3", score: 1.13 },
        { name: "zerolith", entry: "zerolith", version: "1.0.0", score: 1.15 },
        { name: "lit", entry: "lit", version: "3.3.1", score: 1.2 }
    ];

    it("names the release the benchmark run measured, which can trail the site's own version", () =>
    {
        expect(speedLine({ date: "2026-11-05", rows })).toBe("zerolith 1.0.0 on js-framework-benchmark next to hand-written JavaScript and 2 frameworks, measured on 2026-11-05. Lower is faster. These are this project's runs, not the official results.");
    });

    it("names no release when the run has no zerolith row", () =>
    {
        expect(speedLine({ date: "2026-11-05", rows: rows.filter((row) => row.name !== "zerolith") })).toBe("zerolith on js-framework-benchmark next to hand-written JavaScript and 2 frameworks, measured on 2026-11-05. Lower is faster. These are this project's runs, not the official results.");
    });
});

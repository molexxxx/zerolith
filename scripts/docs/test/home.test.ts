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
        expect(speedLine({ date: "2026-11-05", rows })).toBe("zerolith 1.0.0 scores 1.15 on js-framework-benchmark, where hand-written JavaScript scores 1.00, so it takes about 15 percent longer. It ran next to two other frameworks on 2026-11-05. These are this project's runs, not the official results.");
    });

    it("names no release when the run has no zerolith row", () =>
    {
        expect(speedLine({ date: "2026-11-05", rows: rows.filter((row) => row.name !== "zerolith") })).toBe("zerolith on js-framework-benchmark, next to hand-written JavaScript and two other frameworks, measured on 2026-11-05. These are this project's runs, not the official results.");
    });

    it("names the frameworks that print the same score as zerolith as a tie", () =>
    {
        const tied = [
            { name: "vanilla", entry: "vanillajs", version: "hand-written", score: 1 },
            { name: "solid", entry: "solid", version: "1.9.3", score: 1.104 },
            { name: "zerolith", entry: "zerolith", version: "1.0.0", score: 1.096 },
            { name: "lit", entry: "lit", version: "3.3.1", score: 1.101 },
            { name: "vue", entry: "vue", version: "3.5.0", score: 1.3 }
        ];
        expect(speedLine({ date: "2026-11-05", rows: tied })).toBe("zerolith 1.0.0 scores 1.10 on js-framework-benchmark, where hand-written JavaScript scores 1.00, so it takes about 10 percent longer. It ran next to three other frameworks on 2026-11-05 and ties with solid and lit. These are this project's runs, not the official results.");
    });
});

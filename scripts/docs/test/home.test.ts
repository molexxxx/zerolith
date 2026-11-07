import { describe, expect, it } from "vitest";
import { speedHeading, speedLine } from "../home.ts";

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

    it("names the frameworks that print the same score as zerolith as a tie", () =>
    {
        const tied = [
            { name: "vanilla", entry: "vanillajs", version: "hand-written", score: 1 },
            { name: "solid", entry: "solid", version: "1.9.3", score: 1.104 },
            { name: "zerolith", entry: "zerolith", version: "1.0.0", score: 1.096 },
            { name: "lit", entry: "lit", version: "3.3.1", score: 1.101 },
            { name: "vue", entry: "vue", version: "3.5.0", score: 1.3 }
        ];
        expect(speedLine({ date: "2026-11-05", rows: tied })).toBe("zerolith 1.0.0 on js-framework-benchmark next to hand-written JavaScript and 3 frameworks, measured on 2026-11-05. Lower is faster. zerolith ties with solid and lit at 1.10. These are this project's runs, not the official results.");
    });

    it("words the speed heading from the score the bars print, so the two never disagree", () =>
    {
        const at = (score: number) => speedHeading({ date: "2026-11-05", rows: rows.map((row) => (row.name === "zerolith" ? { ...row, score } : row)) });
        expect(at(1.1015)).toBe("About 10 percent slower than hand-written JavaScript");
        expect(at(1.1)).toBe("About 10 percent slower than hand-written JavaScript");
        expect(at(1.146)).toBe("About 15 percent slower than hand-written JavaScript");
        expect(at(1.004)).toBe("As fast as hand-written JavaScript");
        expect(at(0.98)).toBe("As fast as hand-written JavaScript");
        expect(speedHeading({ date: "2026-11-05", rows: rows.filter((row) => row.name !== "zerolith") })).toBe("Benchmark scores");
    });
});

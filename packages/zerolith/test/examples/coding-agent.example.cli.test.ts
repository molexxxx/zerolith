// Executed checks for the coding agent tutorial's check and fix steps: a
// project from `zerolith new` with the agent's page passes `zerolith lint`,
// and the frozen total the check step shows fails it with the output that
// step prints.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { zerolithBinary } from "../../../../scripts/zerolith.ts";

const page = fileURLToPath(new URL("../fixtures/coding-agent/app/src/components/tip.ts", import.meta.url));
const checkStep = readFileSync(new URL("../../../../docs/learn/coding-agent/check.md", import.meta.url), "utf8");
const live = "${computed(() => total.get().toFixed(2))}";
const frozen = "${total.get().toFixed(2)}";

let binary: string;
let work: string;
let project: string;

/** Runs `zerolith lint` over the project, with the colors off. */
function lint(): { status: number | null; stdout: string }
{
    const result = spawnSync(binary, ["lint", project], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
    return { status: result.status, stdout: result.stdout };
}

/** The lines of the check step's fenced block that opens with `fence`. */
function block(fence: string): string[]
{
    const start = checkStep.indexOf(`${fence}\n`);
    if (start === -1)
    {
        throw new Error(`check.md has no ${fence} block`);
    }
    const body = checkStep.slice(start + fence.length + 1);
    return body.slice(0, body.indexOf("\n```")).split("\n");
}

beforeAll(() =>
{
    const found = zerolithBinary();
    if (found === undefined)
    {
        throw new Error("No zerolith binary: run cargo build, or set ZEROLITH_BINARY_PATH");
    }
    binary = resolve(found);
    work = mkdtempSync(join(tmpdir(), "zl-agent-"));
    const made = spawnSync(binary, ["new", "tip-calculator", "--template", "ts", "--yes", "--no-install"], { cwd: work, encoding: "utf8" });
    if (made.status !== 0)
    {
        throw new Error(`zerolith new failed: ${made.error?.message ?? made.stderr}`);
    }
    project = join(work, "tip-calculator");
    copyFileSync(page, join(project, "src", "components", "tip.ts"));
});

afterAll(() =>
{
    rmSync(work, { recursive: true, force: true });
});

it("runs zerolith lint in the starter's check", () =>
{
    const scripts = JSON.parse(readFileSync(join(project, "package.json"), "utf8")).scripts as Record<string, string>;
    expect(scripts["check"]).toContain("npm run lint");
    expect(scripts["lint"]).toBe("oxlint && zerolith lint");
});

it("passes zerolith lint with the page the agent writes", () =>
{
    const { status, stdout } = lint();
    expect(stdout).toContain("no problems found");
    expect(status).toBe(0);
});

it("fails zerolith lint on the frozen total with the output the check step shows", () =>
{
    const source = readFileSync(page, "utf8");
    expect(source.split(live)).toHaveLength(2);
    writeFileSync(join(project, "src", "components", "tip.ts"), source.replace(live, frozen));
    const { status, stdout } = lint();
    expect(status).toBe(1);
    const printed = stdout.split("\n").map((line) => line.trimEnd());
    for (const line of block("```text wide").map((text) => text.trimEnd()).filter(Boolean))
    {
        expect(printed).toContain(line);
    }
    for (const shown of [frozen, live])
    {
        expect(checkStep).toContain(["```html", `<p>Total: ${shown}</p>`, "```"].join("\n"));
    }
});

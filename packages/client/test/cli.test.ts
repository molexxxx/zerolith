import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.ts";

const fixture = fileURLToPath(new URL("./fixtures/notes.openapi.json", import.meta.url));

afterEach(() =>
{
    vi.restoreAllMocks();
});

describe("zerolith-client", () =>
{
    it("writes the module for a document", async () =>
    {
        const folder = await mkdtemp(join(tmpdir(), "zerolith-client-"));
        const out = join(folder, "api.ts");
        expect(await main([fixture, "--out", out, "--name", "Notes"])).toBe(0);
        const code = await readFile(out, "utf8");
        expect(code).toContain("export interface Notes\n{");
        expect(code).toContain("satisfies RouteTable<Notes>;");
        await rm(folder, { recursive: true, force: true });
    });

    it("prints to standard output without --out", async () =>
    {
        const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        expect(await main([fixture])).toBe(0);
        expect(String(stdout.mock.calls[0]?.[0])).toContain("export interface Api");
    });

    it("reports usage errors with exit code 2", async () =>
    {
        const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        expect(await main([])).toBe(2);
        expect(await main(["--bogus"])).toBe(2);
        expect(await main([fixture, "--out"])).toBe(2);
        expect(await main([fixture, "extra"])).toBe(2);
        expect(stderr).toHaveBeenCalledTimes(4);
        expect(String(stderr.mock.calls[1]?.[0])).toContain("unknown option --bogus");
    });
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * zerolith-client and zerolith-i18n each carry the check that node started
 * them, since the two packages share no code; this keeps the copies the same.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));

/** A command line's source from its entry check to the end, where the check runs `main`. */
async function entryCheck(file: string): Promise<string>
{
    const source = await readFile(join(root, file), "utf8");
    const start = source.indexOf("/** True when node started this module");
    expect(start, file).toBeGreaterThan(-1);
    return source.slice(start);
}

describe("the command lines' entry check", () =>
{
    it("is the same in each package that has a command line", async () =>
    {
        expect(await entryCheck("packages/i18n/src/cli.ts")).toBe(await entryCheck("packages/client/src/cli.ts"));
    });
});

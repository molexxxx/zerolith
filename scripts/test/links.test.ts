import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapLinks } from "../docs/links.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Every Markdown file in the repository, as GitHub and npm show them. */
function tracked(): string[]
{
    return execFileSync("git", ["ls-files", "-z", "*.md"], { cwd: root, encoding: "utf8" }).split("\0").filter((file) => file !== "");
}

describe("the repository's Markdown", () =>
{
    it("links only to files that exist and to full addresses", async () =>
    {
        const broken: string[] = [];
        for (const file of tracked())
        {
            mapLinks(await readFile(join(root, file), "utf8"), (target) =>
            {
                if (target.startsWith("/"))
                {
                    broken.push(`${file}: ${target} is root-relative, which GitHub and npm resolve against their own sites`);
                }
                else if (!/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith("#"))
                {
                    const path = decodeURI(target.split("#")[0] ?? "");
                    if (!existsSync(join(root, dirname(file), path)))
                    {
                        broken.push(`${file}: ${target} does not exist`);
                    }
                }
                return target;
            });
        }
        expect(broken).toEqual([]);
    });
});

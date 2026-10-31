import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { referencesFolder, relink, skillReferences } from "../skills/generate.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** The front matter of a SKILL.md as plain key and value pairs. */
function frontMatter(text: string): Map<string, string>
{
    const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    return new Map(block.split("\n").filter((line) => /^[a-z-]+:/.test(line)).map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
}

describe("the zerolith Agent Skill", () =>
{
    it("has references that match the guides they are generated from", async () =>
    {
        const expected = await skillReferences(root);
        const written = (await readdir(join(root, referencesFolder))).toSorted();
        expect(written).toEqual([...expected.keys()].map((path) => path.slice(referencesFolder.length + 1)).toSorted());
        for (const [path, content] of expected)
        {
            expect(await readFile(join(root, path), "utf8"), `${path} is stale; run npm run skills`).toBe(content);
        }
    });

    it("follows the Agent Skills format", async () =>
    {
        for (const name of await readdir(join(root, "skills")))
        {
            const text = await readFile(join(root, "skills", name, "SKILL.md"), "utf8");
            const fields = frontMatter(text);
            expect(fields.get("name")).toBe(name);
            expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(name.length).toBeLessThanOrEqual(64);
            const description = fields.get("description") ?? "";
            expect(description.length).toBeGreaterThan(0);
            expect(description.length).toBeLessThanOrEqual(1024);
            expect(text.split("\n").length).toBeLessThan(500);
            for (const link of text.matchAll(/\]\((references\/[^)#]+)/g))
            {
                await expect(readFile(join(root, "skills", name, link[1] ?? ""), "utf8")).resolves.toBeTypeOf("string");
            }
        }
    });

    it("points guide links at sibling references and other links at the docs site", () =>
    {
        const guides = new Set(["index.md", "signals.md"]);
        expect(relink("See [signals](signals.md#effects), [start](index.md), [codes](https://molexxxx.github.io/zerolith/e/), [the tutorial](../learn/state.md), and [forms](forms.md).", guides))
            .toBe("See [signals](signals.md#effects), [start](introduction.md), [codes](https://molexxxx.github.io/zerolith/e/), [the tutorial](https://molexxxx.github.io/zerolith/learn/state/), and [forms](https://molexxxx.github.io/zerolith/guide/forms/).");
        expect(relink("```md\n[kept](/guide/signals/)\n```", guides)).toBe("```md\n[kept](/guide/signals/)\n```");
        expect(() => relink("[old](/guide/signals/)", guides)).toThrow(/resolves on the docs site only/);
    });
});

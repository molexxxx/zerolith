import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Holds the repository's prose to the code it describes, so a doc that falls
 * behind fails the build instead of waiting for a reader to notice: the
 * roadmap names the version the packages carry and the version the benchmark
 * entry pins, every import in a Markdown code sample names an export its
 * module has, and the text follows the style rules in AGENTS.md.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Tracked files matching the pathspecs, as GitHub and npm show them. */
function tracked(...pathspecs: string[]): string[]
{
    return execFileSync("git", ["ls-files", "-z", ...pathspecs], { cwd: root, encoding: "utf8" }).split("\0").filter((file) => file !== "");
}

async function text(file: string): Promise<string>
{
    return readFile(join(root, file), "utf8");
}

/** The fenced code blocks of a Markdown file. */
function codeBlocks(markdown: string): string[]
{
    return [...markdown.matchAll(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm)].map((match) => match[2] ?? "");
}

/** Every export of each public entry, read from the API reports `npm run api` writes. */
async function exportsByEntry(): Promise<Map<string, Set<string>>>
{
    const entries = new Map<string, Set<string>>();
    for (const file of tracked("api/*.api.md"))
    {
        const report = await text(file);
        const entry = /^# (\S+)/.exec(report)?.[1];
        if (entry === undefined)
        {
            throw new Error(`${file} has no heading naming its entry`);
        }
        const names = [...report.matchAll(/^(?:async )?(?:function|interface|type|const|class|namespace) ([A-Za-z_$][\w$]*)/gm)].map((match) => match[1] ?? "");
        entries.set(entry, new Set(names));
    }
    return entries;
}

const britishSpellings = [
    "colour", "behaviour", "centre", "catalogue", "organise", "recognise", "normalise", "serialise", "analyse", "artefact",
    "programme", "defence", "licence", "travelled", "labelled", "modelled", "cancelled", "cancelling", "judgement",
    "acknowledgement", "whilst", "grey", "optimise", "initialise", "favour", "honour", "neighbour"
];

describe("the repository's prose", () =>
{
    it("names in the roadmap the version the packages carry and the version the benchmark entry pins", async () =>
    {
        const roadmap = await text("docs/ROADMAP.md");
        const version = (JSON.parse(await text("package.json")) as { version: string }).version;
        const stands = roadmap.slice(roadmap.indexOf("## Where it stands"), roadmap.indexOf("## Next"));
        expect(/^`([^`]+)` was published on /m.exec(stands)?.[1], "the opening line of Where it stands").toBe(version);
        const entry = JSON.parse(await text("benchmarks/js-framework-benchmark/package.json")) as { dependencies: Record<string, string> };
        const pinned = entry.dependencies["zerolith"];
        expect(/pinned to `([^`]+)`/.exec(roadmap)?.[1], "the benchmark entry's pin in Next").toBe(pinned);
        expect(/The entry pins (\S+?),/.exec(await text("benchmarks/js-framework-benchmark/README.md"))?.[1]).toBe(pinned);
    });

    it("imports in its code samples only what each module exports", async () =>
    {
        const entries = await exportsByEntry();
        const missing: string[] = [];
        for (const file of tracked("*.md", ":!CHANGELOG.md", ":!api/"))
        {
            for (const block of codeBlocks(await text(file)))
            {
                for (const match of block.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']((?:@zerolith\/[^"']+)|zerolith(?:\/[^"']+)?)["']/g))
                {
                    const entry = match[2] ?? "";
                    const names = entries.get(entry);
                    if (names === undefined)
                    {
                        missing.push(`${file}: ${entry} has no API report`);
                        continue;
                    }
                    for (const specifier of (match[1] ?? "").split(","))
                    {
                        const name = specifier.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0] ?? "";
                        if (name !== "" && !names.has(name))
                        {
                            missing.push(`${file}: ${entry} does not export ${name}`);
                        }
                    }
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it("keeps to American spelling, regular dashes, and Markdown without horizontal rules", async () =>
    {
        const found: string[] = [];
        const spelling = new RegExp(`\\b(${britishSpellings.join("|")})s?\\b`, "i");
        for (const file of tracked("*.md", "*.ts", "*.tsx", "*.js", "*.mjs", "*.rs", "*.json", "*.css", "*.html", "*.yml", "*.toml", ":!package-lock.json", ":!**/package-lock.json"))
        {
            const lines = (await text(file)).split("\n");
            const body = file.endsWith(".md") && lines[0] === "---" ? lines.indexOf("---", 1) + 1 : 0;
            let fence = "";
            for (const [index, line] of lines.entries())
            {
                const where = `${file}:${index + 1}`;
                if (line.includes("—"))
                {
                    found.push(`${where}: em dash`);
                }
                const word = spelling.exec(line.replace(/\bcancelled\(\)/g, ""))?.[1];
                if (word !== undefined)
                {
                    found.push(`${where}: ${word}`);
                }
                if (!file.endsWith(".md") || index < body)
                {
                    continue;
                }
                const opener = /^(`{3,}|~{3,})/.exec(line)?.[1];
                if (opener !== undefined && (fence === "" || line.trim() === fence))
                {
                    fence = fence === "" ? opener : "";
                }
                else if (fence === "" && /^ {0,3}([-*_])( *\1){2,} *$/.test(line))
                {
                    found.push(`${where}: horizontal rule`);
                }
            }
        }
        expect(found).toEqual([]);
    });
});

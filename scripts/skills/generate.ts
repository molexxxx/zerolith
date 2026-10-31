/**
 * The generated part of the zerolith Agent Skill: one reference file per
 * guide, with its examples expanded and its links pointed at the other
 * references or the docs site, and one file with every diagnostic code. The
 * guides stay the single source; `npm run skills` writes these files and a
 * test fails while they differ from what it would write.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { diagnosticCatalog } from "zerolith";
import { includeExamples } from "../docs/examples.ts";

/** Where the docs site lives, for links a reference cannot resolve locally. */
export const docsUrl = "https://molexxxx.github.io/zerolith/";

/** The folder of the skill's generated references, relative to the repository. */
export const referencesFolder = "skills/zerolith/references";

/** The reference file a guide becomes: the introduction is `introduction.md`, every other guide keeps its name. */
export function referenceName(guide: string): string
{
    return guide === "index.md" ? "introduction.md" : guide;
}

/** Points a guide's root-relative links at sibling references, or at the docs site when no reference holds the target. */
export function relink(markdown: string, guides: ReadonlySet<string>): string
{
    let fenced = false;
    return markdown
        .split("\n")
        .map((line) =>
        {
            if (line.trimStart().startsWith("```"))
            {
                fenced = !fenced;
                return line;
            }
            if (fenced)
            {
                return line;
            }
            return line.replace(/\]\(\/([^)\s]*)\)/g, (_, target: string) =>
            {
                const match = /^guide\/(?:([a-z0-9-]+)\/)?(#.*)?$/.exec(target);
                if (match !== null)
                {
                    const guide = `${match[1] ?? "index"}.md`;
                    if (guides.has(guide))
                    {
                        return `](${referenceName(guide)}${match[2] ?? ""})`;
                    }
                }
                return `](${docsUrl}${target})`;
            });
        })
        .join("\n");
}

/** Every generated reference file, by its path relative to the repository. */
export async function skillReferences(root: string): Promise<Map<string, string>>
{
    const folder = join(root, "docs", "guide");
    const names = (await readdir(folder)).filter((name) => name.endsWith(".md")).toSorted();
    const guides = new Set(names);
    const files = new Map<string, string>();
    for (const name of names)
    {
        const source = await readFile(join(folder, name), "utf8");
        const body = source.replace(/^---\n[\s\S]*?\n---\n+/, "");
        const expanded = await includeExamples(body, `docs/guide/${name}`, root);
        const header = `<!-- Generated from docs/guide/${name} by npm run skills. Edit the guide, then regenerate. -->`;
        files.set(`${referencesFolder}/${referenceName(name)}`, `${header}\n\n${relink(expanded, guides).trim()}\n`);
    }
    const codes = Object.keys(diagnosticCatalog).toSorted();
    const diagnostics = [
        "<!-- Generated from the runtime's diagnostic catalog by npm run skills. -->",
        "",
        "# Diagnostic codes",
        "",
        `Every error and warning zerolith reports carries one of these codes and a link to ${docsUrl}e/<code>/. Apply the fix the code names; never silence it.`
    ];
    for (const code of codes)
    {
        const entry = diagnosticCatalog[code as keyof typeof diagnosticCatalog];
        diagnostics.push("", `## ${code}`, "", `Cause: ${entry?.cause ?? ""}`, "", `Fix: ${entry?.fix ?? ""}`);
    }
    files.set(`${referencesFolder}/diagnostic-codes.md`, diagnostics.join("\n") + "\n");
    return files;
}

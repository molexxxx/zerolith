import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { changelogSection, checkVersion, releaseNotes, withCrateVersion, withFirstPartyRanges, withPackageVersion, withSourceVersion } from "../release.ts";

const root = new URL("../../", import.meta.url);

function read(path: string): Promise<string>
{
    return readFile(new URL(path, root), "utf8");
}

interface Manifest
{
    name: string;
    version: string;
    workspaces?: string[];
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
}

async function manifests(): Promise<{ root: Manifest; workspaces: Manifest[]; platforms: Manifest[] }>
{
    const top = JSON.parse(await read("package.json")) as Manifest;
    const workspaces = await Promise.all((top.workspaces ?? []).map(async (workspace) => JSON.parse(await read(`${workspace}/package.json`)) as Manifest));
    const names = await readdir(new URL("packages/cli/platforms/", root));
    const platforms = await Promise.all(names.map(async (name) => JSON.parse(await read(`packages/cli/platforms/${name}/package.json`)) as Manifest));
    return { root: top, workspaces, platforms };
}

describe("the release helpers", () =>
{
    it("accepts full semantic versions only", () =>
    {
        expect(checkVersion("0.1.0-alpha.2")).toBe("0.1.0-alpha.2");
        expect(checkVersion("1.4.0")).toBe("1.4.0");
        expect(() => checkVersion("1.4")).toThrow(/not a semantic version/);
        expect(() => checkVersion("v1.4.0")).toThrow(/not a semantic version/);
    });

    it("sets the version and the first-party ranges, keeping the formatting", () =>
    {
        const text = "{\n    \"name\": \"@zerolith/otel\",\n    \"version\": \"0.1.0-alpha.1\",\n    \"bin\": {\n        \"zerolith\": \"dist/bin.js\"\n    },\n    \"peerDependencies\": {\n        \"@opentelemetry/api\": \">=1.9.0 <2.0.0\",\n        \"@zerolith/router\": \"^0.1.0-alpha.1\",\n        \"zerolith\": \"^0.1.0-alpha.1\"\n    },\n    \"peerDependenciesMeta\": {\n        \"@zerolith/router\": { \"optional\": true }\n    }\n}\n";
        const next = withFirstPartyRanges(withPackageVersion(text, "0.1.0-alpha.2"), "0.1.0-alpha.2");
        expect(next).toBe(text.replaceAll("0.1.0-alpha.1", "0.1.0-alpha.2"));
        expect(() => withPackageVersion("{}\n", "1.0.0")).toThrow(/no top-level version/);
        expect(withFirstPartyRanges("\"zerolith\": \"0.1.0-alpha.1\",\n\"@zerolith/router\": \"^0.1.0-alpha.1\"", "0.1.0-alpha.2")).toBe("\"zerolith\": \"0.1.0-alpha.2\",\n\"@zerolith/router\": \"^0.1.0-alpha.2\"");
    });

    it("sets the version constant of a package's sources", () =>
    {
        const text = "/** The version. */\nexport const version: string = \"0.1.0-alpha.1\";\n";
        expect(withSourceVersion(text, "0.1.0-alpha.2")).toBe(text.replace("0.1.0-alpha.1", "0.1.0-alpha.2"));
        expect(() => withSourceVersion("export const other = 1;\n", "1.0.0")).toThrow(/no version constant/);
    });

    it("sets the crate version", () =>
    {
        expect(withCrateVersion("[workspace.package]\nversion = \"0.1.0-alpha.1\"\nedition = \"2024\"\n", "0.1.0-alpha.2")).toBe("[workspace.package]\nversion = \"0.1.0-alpha.2\"\nedition = \"2024\"\n");
    });

    it("extracts a version's changelog section, subsections included", () =>
    {
        const changelog = "# Changelog\n\n## Unreleased\n\n- next\n\n## 0.1.0-alpha.2 (2026-10-30)\n\n### Breaking changes\n\n- one\n\n## 0.1.0-alpha.1 (2026-10-29)\n\n- first\n";
        expect(changelogSection(changelog, "0.1.0-alpha.2")).toBe("### Breaking changes\n\n- one");
        expect(changelogSection(changelog, "0.1.0-alpha.1")).toBe("- first");
        expect(changelogSection(changelog, "0.1.0-alpha.3")).toBeUndefined();
        expect(releaseNotes(changelog, "0.1.0-alpha.1")).toContain("npx @zerolith/cli@0.1.0-alpha.1 new my-app");
        expect(() => releaseNotes(changelog, "0.1.0-alpha.3")).toThrow(/no section for 0\.1\.0-alpha\.3/);
    });
});

describe("the repository", () =>
{
    it("gives every package, platform package, and the crate the root version", async () =>
    {
        const { root: top, workspaces, platforms } = await manifests();
        for (const manifest of [...workspaces, ...platforms])
        {
            expect(manifest.version, manifest.name).toBe(top.version);
        }
        expect(/^version = "([^"]+)"/m.exec(await read("Cargo.toml"))?.[1]).toBe(top.version);
        for (const workspace of top.workspaces ?? [])
        {
            const source = await read(`${workspace}/src/version.ts`).catch(() => undefined);
            if (source !== undefined)
            {
                expect(/^export const version: string = "([^"]+)";$/m.exec(source)?.[1], workspace).toBe(top.version);
            }
        }
    });

    it("points every first-party range at that version, exactly where a package uses zerolith/internal", async () =>
    {
        const { root: top, workspaces } = await manifests();
        for (const [index, manifest] of workspaces.entries())
        {
            const folder = new URL(`${top.workspaces?.[index] ?? ""}/src/`, root);
            const files = (await readdir(folder, { recursive: true })).filter((file) => file.endsWith(".ts"));
            const texts = await Promise.all(files.map((file) => readFile(new URL(file.replaceAll("\\", "/"), folder), "utf8")));
            const internal = texts.some((text) => text.includes("from \"zerolith/internal\""));
            for (const ranges of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies])
            {
                for (const [name, range] of Object.entries(ranges ?? {}))
                {
                    if (name === "zerolith" || name.startsWith("@zerolith/"))
                    {
                        expect(range, `${manifest.name} -> ${name}`).toBe(internal && name === "zerolith" ? top.version : `^${top.version}`);
                    }
                }
            }
        }
    });

    it("has a changelog section for that version", async () =>
    {
        const { root: top } = await manifests();
        expect(changelogSection(await read("CHANGELOG.md"), top.version)).toBeTruthy();
    });

    it("publishes every package and builds every platform in the release workflow", async () =>
    {
        const { workspaces, platforms } = await manifests();
        const workflow = await read(".github/workflows/release.yml");
        const libraries = /libraries="([^"]+)"/.exec(workflow)?.[1]?.split(" ") ?? [];
        const published = /platforms="([^"]+)"/.exec(workflow)?.[1]?.split(" ") ?? [];
        const built = [...workflow.matchAll(/- \{ name: ([a-z0-9-]+), runner:/g)].map((match) => match[1]);
        expect(libraries[0]).toBe("zerolith");
        expect(libraries.toSorted()).toEqual(workspaces.map((manifest) => manifest.name).filter((name) => name !== "@zerolith/cli").toSorted());
        expect(published.toSorted()).toEqual(platforms.map((manifest) => manifest.name).toSorted());
        expect(built.map((name) => `@zerolith/cli-${name}`).toSorted()).toEqual(platforms.map((manifest) => manifest.name).toSorted());
    });
});

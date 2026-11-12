import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { builtVersion, changelogSection, checkVersion, releaseNotes, withCrateVersion, withFirstPartyRanges, withPackageVersion, withSourceVersion } from "../release.ts";

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

    it("reads the version a built version.js exports", () =>
    {
        expect(builtVersion("/** The version. */\nexport const version = \"0.1.0-alpha.6\";\n//# sourceMappingURL=version.js.map\n")).toBe("0.1.0-alpha.6");
        expect(builtVersion("export const other = 1;\n")).toBeUndefined();
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

    it("orders the release so a failure leaves nothing half published and a rerun completes it", async () =>
    {
        const workflow = await read(".github/workflows/release.yml");
        expect(workflow.slice(workflow.indexOf("\n  crate-check:\n"))).toContain("\n    needs: npm\n");
        expect(workflow.slice(workflow.indexOf("\n  crate:\n"))).toContain("\n    needs: [npm, crate-check]\n");
        const npm = workflow.slice(workflow.indexOf("\n  pack:\n"), workflow.indexOf("\n  docs:\n"));
        expect(npm.indexOf("name: Canary version")).toBeLessThan(npm.indexOf("name: Built versions"));
        expect(npm.indexOf("name: Built versions")).toBeLessThan(npm.indexOf("name: Publish"));
        expect(npm).toContain("is on the registry already");
        expect(npm).toContain("a real run skips it");
        expect(npm).toContain("name: Tag version");
    });

    it("installs and checks in a job with no publishing credential, and publishes from one that runs no dependency's code", async () =>
    {
        const workflow = await read(".github/workflows/release.yml");
        const pack = workflow.slice(workflow.indexOf("\n  pack:\n"), workflow.indexOf("\n  npm:\n"));
        const npm = workflow.slice(workflow.indexOf("\n  npm:\n"), workflow.indexOf("\n  docs:\n"));
        expect(pack).toContain("run: npm ci\n");
        expect(pack).toContain("run: npm run check\n");
        expect(pack).not.toMatch(/id-token|secrets\./);
        expect(npm).toContain("id-token: write");
        expect(npm.match(/npm ci[^\n]*/g)).toEqual(["npm ci --prefix .github/npm --no-audit --no-fund --ignore-scripts"]);
        expect(npm).not.toMatch(/npx |npm run |npm install|npm exec|playwright|cache: npm|--workspace/);
        expect(workflow).toContain("name: packed-${{ github.run_id }}");
        const check = workflow.slice(workflow.indexOf("\n  crate-check:\n"), workflow.indexOf("\n  crate:\n"));
        const crate = workflow.slice(workflow.indexOf("\n  crate:\n"));
        expect(check).toContain("cargo test --locked");
        expect(check).toContain("cargo package --package zerolith --locked");
        expect(check).not.toMatch(/id-token|secrets\.|crates-io-auth-action/);
        expect(crate).toContain("id-token: write");
        expect(crate).not.toMatch(/cargo (?:build|test|clippy|package|check|run)/);
        expect(workflow).toContain("(needs.crate-check.result == 'success' || needs.crate-check.result == 'skipped') && (needs.crate.result == 'success' || needs.crate.result == 'skipped')");
        expect(crate.match(/cargo publish[^\n]*/g)).toEqual(["cargo publish --package zerolith --locked --no-verify --dry-run", "cargo publish --package zerolith --locked --no-verify"]);
    });

    it("runs every check of npm run check in CI", async () =>
    {
        const manifest = JSON.parse(await read("package.json")) as { scripts: Record<string, string> };
        const ci = await read(".github/workflows/ci.yml");
        const chained = [...(manifest.scripts["check"] ?? "").matchAll(/npm run ([a-z:]+)/g)].map((match) => match[1] ?? "");
        for (const script of chained)
        {
            expect(ci.includes(`npm run ${script}`), script).toBe(true);
        }
    });
});

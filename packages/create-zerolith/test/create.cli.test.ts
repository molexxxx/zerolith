import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { binary } from "../../cli/test/helpers.ts";

/**
 * `create-zerolith` against the built binary: the launcher runs the
 * command line's launcher, which runs the binary ZEROLITH_BINARY_PATH
 * names, so a project is written as `npm create zerolith` writes one.
 * Lives under this repository's target folder.
 */

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const built = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const root = join(repository, "target", `create-cli-${process.pid}`);

interface Written
{
    name: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}

/** The environment a package manager whose user agent is `agent` runs the command in. The variable that names the one running these tests is left out whatever its case, since Windows holds one variable under either spelling and the test runner hands it on in capitals. */
function environment(agent: string): NodeJS.ProcessEnv
{
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env))
    {
        if (key.toLowerCase() !== "npm_config_user_agent")
        {
            env[key] = value;
        }
    }
    env["npm_config_user_agent"] = agent;
    env["ZEROLITH_BINARY_PATH"] = resolve(binary());
    env["NO_COLOR"] = "1";
    return env;
}

/** Runs the built launcher in the scratch folder, as the package manager named in `agent` would, and returns its exit code and what it printed. */
function create(args: string[], agent: string = "npm/1.0.0 node/v1.0.0 linux x64"): { status: number | null; output: string }
{
    const env = environment(agent);
    const result = spawnSync(process.execPath, [built, ...args], { cwd: root, env, encoding: "utf8", windowsHide: true });
    if (result.error !== undefined)
    {
        throw result.error;
    }
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

beforeEach(() =>
{
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
});

afterAll(() =>
{
    rmSync(root, { recursive: true, force: true });
});

describe("create-zerolith with the built command line", () =>
{
    it("writes the starter zerolith new writes, on the command line's own version", () =>
    {
        const { status, output } = create(["my-app", "--template", "ts", "--yes", "--no-install"]);
        expect(output).toMatch(/wrote\s+\d+ files to my-app/);
        expect(status).toBe(0);
        const written = JSON.parse(readFileSync(join(root, "my-app", "package.json"), "utf8")) as Written;
        const { version } = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")) as { version: string };
        expect(written.name).toBe("my-app");
        expect(written.dependencies["zerolith"]).toBe(version);
        expect(written.devDependencies["@zerolith/cli"]).toBe(version);
        expect(existsSync(join(root, "my-app", "src"))).toBe(true);
    });

    it("has the project installed by the package manager that ran it", () =>
    {
        const { status, output } = create(["my-app", "--yes", "--no-install"], "pnpm/1.0.0 npm/? node/v1.0.0 linux x64");
        expect(status).toBe(0);
        expect(output).toMatch(/^\s+pnpm install$/m);
        expect(output).not.toMatch(/^\s+npm install$/m);
    });

    it("passes on what zerolith new refuses, with its exit code, and writes nothing", () =>
    {
        const { status, output } = create(["my-app", "--template", "nope"]);
        expect(status).toBe(2);
        expect(output).toContain("invalid value 'nope' for '--template <TEMPLATE>'");
        expect(existsSync(join(root, "my-app"))).toBe(false);
    });
});

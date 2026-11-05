import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const workflowUrl = new URL("../../.github/workflows/release.yml", import.meta.url);

/** Stands in for npm, curl, node, and sleep: npm has never published @zerolith/state or @zerolith/browser, accepts the token only when WHOAMI is yes, refuses to create a package when CREATE is no, and the registry answers FORMS_STATUS for @zerolith/forms, with curl failing as it does when no registry answers. */
const STUBS = `
npm()
{
  case "$1" in
    view)
      case "$3" in
        dist.tarball) echo "https://registry.example/tarball.tgz"; return 0 ;;
        dist-tags.latest) echo "0.1.0-alpha.10"; return 0 ;;
      esac
      return 1
      ;;
    whoami) [ "\${WHOAMI:-no}" = "yes" ] && return 0; return 1 ;;
    publish)
      if [ "$2" = "--workspace" ]; then
        case "$3" in
          @zerolith/state|@zerolith/browser) [ "\${CREATE:-yes}" = "no" ] && { echo "npm error code E403" >&2; return 1; } ;;
        esac
        echo "PUBLISHED $3"
      else
        echo "PUBLISHED @zerolith/cli-\${PWD##*/}"
      fi
      return 0
      ;;
    dist-tag) echo "TAGGED $3"; return 0 ;;
  esac
  echo "unexpected npm $*" >&2
  return 2
}
curl()
{
  for argument in "$@"; do last="$argument"; done
  case "$last" in
    *%2Fstate|*%2Fbrowser) printf 404 ;;
    *%2Fforms) printf '%s' "\${FORMS_STATUS:-200}"; [ "\${FORMS_STATUS:-200}" = "000" ] && return 7 ;;
    *) printf 200 ;;
  esac
}
node()
{
  if [ "$1" = "-p" ]; then echo 2.0.0-alpha.1; fi
}
sleep()
{
  :
}
`;

interface Run
{
    code: number | null;
    output: string;
    published: string[];
    tagged: string[];
}

let workflow = "";
let folder = "";

/** The Publish step's script, with its YAML indentation removed. */
function publishScript(): string
{
    const lines = workflow.split("\n");
    const start = lines.indexOf("      - name: Publish");
    const run = lines.indexOf("        run: |", start);
    const body: string[] = [];
    for (const line of lines.slice(run + 1))
    {
        if (line.startsWith("      - name:"))
        {
            break;
        }
        body.push(line.slice(10));
    }
    return body.join("\n");
}

/** Runs the publish script under bash with the stubs and `env`, in a folder that holds the platform binaries it lists. */
function publish(env: Record<string, string>): Run
{
    writeFileSync(join(folder, "run.sh"), STUBS + publishScript());
    const done = spawnSync("bash", ["run.sh"], {
        cwd: folder,
        env: { ...process.env, INPUT_PACKAGE: "", INPUT_TAG: "", DRY_RUN: "false", REF_NAME: "main", CANARY: "", WHOAMI: "no", CREATE: "yes", FORMS_STATUS: "200", ...env },
        encoding: "utf8"
    });
    const output = `${done.stdout}${done.stderr}`;
    const lines = output.split("\n");
    return {
        code: done.status,
        output,
        published: lines.filter((line) => line.startsWith("PUBLISHED ")).map((line) => line.slice("PUBLISHED ".length).trim()),
        tagged: lines.filter((line) => line.startsWith("TAGGED ")).map((line) => line.slice("TAGGED ".length).trim())
    };
}

const unpublished = ["@zerolith/state", "@zerolith/browser"];

/** Every package an "all" release publishes, in the workflow's own order. */
function everything(): string[]
{
    const libraries = /libraries="([^"]+)"/.exec(workflow)?.[1]?.split(" ") ?? [];
    const platforms = /platforms="([^"]+)"/.exec(workflow)?.[1]?.split(" ") ?? [];
    return [...libraries, ...platforms, "@zerolith/cli"];
}

/** The order a release publishes in: the names npm has never published first, then the rest in the workflow's order. */
function releaseOrder(): string[]
{
    return [...everything().filter((name) => unpublished.includes(name)), ...everything().filter((name) => !unpublished.includes(name))];
}

beforeAll(async () =>
{
    workflow = (await readFile(workflowUrl, "utf8")).replaceAll("\r\n", "\n");
    folder = mkdtempSync(join(tmpdir(), "zerolith-publish-"));
    for (const platform of /platforms="([^"]+)"/.exec(workflow)?.[1]?.split(" ") ?? [])
    {
        const directory = join(folder, "packages", "cli", "platforms", platform.replace("@zerolith/cli-", ""));
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, "zerolith"), "");
    }
});

afterAll(() =>
{
    rmSync(folder, { recursive: true, force: true });
});

describe("the release workflow's publish step with names npm has never published", () =>
{
    it("leaves them out of a canary, which publishes every other package and moves no tag", () =>
    {
        const run = publish({ CANARY: "true" });
        expect(run.code).toBe(0);
        expect(run.published).toEqual(everything().filter((name) => !unpublished.includes(name)));
        expect(run.tagged).toEqual([]);
        expect(run.output).toContain("npm has never published @zerolith/state, so the canary leaves it out");
    });

    it("publishes nothing in a release when npm does not accept the token, naming the new packages", () =>
    {
        const run = publish({ INPUT_PACKAGE: "all", INPUT_TAG: "alpha" });
        expect(run.code).toBe(1);
        expect(run.published).toEqual([]);
        expect(run.output).toContain("npm has never published @zerolith/state @zerolith/browser, trusted publishing cannot publish a new name");
    });

    it("publishes the new names first and then every other package when npm accepts the token, moving latest while no stable version exists", () =>
    {
        const run = publish({ INPUT_PACKAGE: "all", INPUT_TAG: "alpha", WHOAMI: "yes" });
        expect(run.code).toBe(0);
        expect(run.published).toEqual(releaseOrder());
        expect(run.tagged).toEqual(releaseOrder().map((name) => `${name}@2.0.0-alpha.1`));
    });

    it("publishes nothing else when npm accepts the token but refuses to create a new name", () =>
    {
        const run = publish({ INPUT_PACKAGE: "all", INPUT_TAG: "alpha", WHOAMI: "yes", CREATE: "no" });
        expect(run.code).not.toBe(0);
        expect(run.published).toEqual([]);
    });

    it("publishes nothing when the registry cannot say whether a package exists", () =>
    {
        const run = publish({ INPUT_PACKAGE: "all", INPUT_TAG: "alpha", WHOAMI: "yes", FORMS_STATUS: "000" });
        expect(run.code).toBe(1);
        expect(run.published).toEqual([]);
        expect(run.output).toContain("the registry answered 000 for @zerolith/forms, so nothing was published");
    });
});

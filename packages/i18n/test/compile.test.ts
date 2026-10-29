import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileIndex, compileMessages, messageNames } from "@zerolith/i18n/compile";
import { main } from "../src/cli.ts";

let folder: string;

beforeAll(async () =>
{
    folder = await mkdtemp(join(tmpdir(), "zerolith-i18n-"));
});

afterAll(async () =>
{
    await rm(folder, { recursive: true, force: true });
});

let counter = 0;

function compile(catalog: Record<string, string>): string
{
    return compileMessages("en", catalog).code;
}

async function load(locale: string, catalog: Record<string, string>): Promise<Record<string, (args?: Record<string, unknown>) => string>>
{
    const file = join(folder, `${locale}-${counter++}.js`);
    await writeFile(file, compileMessages(locale, catalog, { language: "js" }).code);
    return (await import(pathToFileURL(file).href)) as Record<string, (args?: Record<string, unknown>) => string>;
}

describe("compileMessages", () =>
{
    it("compiles text, placeholders, escapes, literals, and markup", async () =>
    {
        const m = await load("en", {
            hello: "Hello, {$name}!",
            braces: "Use \\{ and \\} and a \\\\ backslash",
            literal: "Literal {|quoted \\| text|} and {plain}",
            markup: "Press {#b}{$key}{/b} now {#img /}",
            "kebab-key": "{$count} items",
            empty: ""
        });
        expect(m["hello"]?.({ name: "Ada" })).toBe("Hello, Ada!");
        expect(m["braces"]?.()).toBe("Use { and } and a \\ backslash");
        expect(m["literal"]?.()).toBe("Literal quoted | text and plain");
        expect(m["markup"]?.({ key: "Enter" })).toBe("Press Enter now ");
        expect(m["kebabKey"]?.({ count: 3 })).toBe("3 items");
        expect(m["empty"]?.()).toBe("");
    });

    it("formats numbers, currencies, percents, offsets, and dates through Intl", async () =>
    {
        const m = await load("de", {
            amount: "{$n :number minimumFractionDigits=2}",
            grouped: "{$n :integer useGrouping=never}",
            price: "{$p :currency currency=EUR}",
            share: "{$s :percent}",
            next: "{$i :offset add=1}",
            day: "{$d :date length=long timeZone=UTC}",
            moment: "{$d :datetime dateLength=short timePrecision=second timeZone=UTC hour12=false}",
            clock: "{$d :time timeZone=UTC hour12=false}"
        });
        expect(m["amount"]?.({ n: 1234.5 })).toBe("1.234,50");
        expect(m["grouped"]?.({ n: 1234.5 })).toBe("1235");
        expect(m["price"]?.({ p: 9.9 })).toBe("9,90 €");
        expect(m["share"]?.({ s: 0.25 })).toBe("25 %");
        expect(m["next"]?.({ i: 41 })).toBe("42");
        const date = Date.UTC(2026, 9, 28, 13, 5, 9);
        expect(m["day"]?.({ d: date })).toBe("28. Oktober 2026");
        expect(m["moment"]?.({ d: date })).toBe("28.10.26, 13:05:09");
        expect(m["clock"]?.({ d: date })).toBe("13:05");
    });

    it("selects variants by exact value, plural category, and string, across several selectors", async () =>
    {
        const m = await load("en", {
            notes: ".input {$count :number}\n.match $count\n0 {{No notes}}\none {{One note}}\n* {{{$count} notes}}",
            place: ".match {$n :integer select=ordinal}\none {{{$n}st}}\ntwo {{{$n}nd}}\nfew {{{$n}rd}}\n* {{{$n}th}}",
            greeting: ".input {$gender :string}\n.match $gender\nfemale {{She arrived}}\nmale {{He arrived}}\n* {{They arrived}}",
            both: ".input {$files :number}\n.input {$folders :number}\n.match $files $folders\n0 0 {{Nothing}}\n0 * {{Only folders}}\none one {{A file and a folder}}\n* * {{{$files} files, {$folders} folders}}",
            local: ".local $n = {$count :number minimumFractionDigits=1}\n{{Total: {$n}}}",
            exact: ".match {$n :number select=exact}\n1 {{exactly one}}\n* {{not one}}"
        });
        expect(m["notes"]?.({ count: 0 })).toBe("No notes");
        expect(m["notes"]?.({ count: 1 })).toBe("One note");
        expect(m["notes"]?.({ count: 7 })).toBe("7 notes");
        expect([1, 2, 3, 4, 11, 22].map((n) => m["place"]?.({ n }))).toEqual(["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
        expect(m["greeting"]?.({ gender: "female" })).toBe("She arrived");
        expect(m["greeting"]?.({ gender: "other" })).toBe("They arrived");
        expect(m["both"]?.({ files: 0, folders: 0 })).toBe("Nothing");
        expect(m["both"]?.({ files: 0, folders: 3 })).toBe("Only folders");
        expect(m["both"]?.({ files: 1, folders: 1 })).toBe("A file and a folder");
        expect(m["both"]?.({ files: 2, folders: 1 })).toBe("2 files, 1 folders");
        expect(m["local"]?.({ count: 2 })).toBe("Total: 2.0");
        expect(m["exact"]?.({ n: 1 })).toBe("exactly one");
        expect(m["exact"]?.({ n: 2 })).toBe("not one");
    });

    it("types the arguments from the placeholders in TypeScript output", () =>
    {
        const { code, names } = compileMessages("en", { report: ".input {$count :number}\n.match $count\n* {{{$count} by {$author} on {$when :date}}}", title: "Title" });
        expect(names).toEqual(["report", "title"]);
        expect(code).toContain("export function report(args: { author: string | number; count: number; when: Date | number }): string");
        expect(code).toContain("export function title(): string");
        expect(code).toContain("export const locale: string = \"en\";");
        expect(code).toContain("function number(value: any, options: any): any");
        const js = compileMessages("en", { title: "Title" }, { language: "js" }).code;
        expect(js).toContain("// @ts-check");
        expect(js).toContain("export function title()");
        expect(js).not.toContain(": string");
    });

    it("rejects what it cannot compile with the message's key in the error", () =>
    {
        expect(() => compile({ bad: "{$x :shout}" })).toThrow(/message "bad": unknown function :shout/);
        expect(() => compile({ bad: ".match {$n :number}\none {{one}}" })).toThrow(/variant whose keys are all \*/);
        expect(() => compile({ bad: ".input {$n :number}\n.input {$n :number}\n{{x}}" })).toThrow(/declared twice/);
        expect(() => compile({ bad: "{$d :date} and {$d :number}" })).toThrow(/used both as date and as number/);
        expect(() => compile({ bad: "a } b" })).toThrow(/lone \}/);
        expect(() => compile({ bad: "{$p :currency}" })).toThrow(/needs a currency option/);
        expect(() => compile({ "a-b": "x", "a b": "y" })).toThrow(/both become aB/);
        expect(messageNames({ "save-note": "", other: "" })).toEqual(["saveNote", "other"]);
    });

    it("writes an index with one lazy loader per locale", () =>
    {
        const index = compileIndex(["en", "de"]);
        expect(index).toContain("export const locales: readonly string[] = [\"en\",\"de\"];");
        expect(index).toContain("\"de\": () => import(\"./de.ts\")");
        expect(compileIndex(["en"], { language: "js" })).toContain("import(\"./en.js\")");
    });
});

describe("zerolith-i18n", () =>
{
    it("compiles a folder of catalogs, reports missing keys, and fails under --strict", async () =>
    {
        const input = join(folder, "catalogs");
        await rm(input, { recursive: true, force: true });
        await writeFile(join(folder, "en.json"), JSON.stringify({ hello: "Hello {$name}", bye: "Bye" }));
        await writeFile(join(folder, "de.json"), JSON.stringify({ hello: "Hallo {$name}" }));
        const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        const out = join(folder, "out");
        expect(await main([folder, "--out", out, "--js"])).toBe(0);
        expect(String(stderr.mock.calls[0]?.[0])).toBe("zerolith-i18n: de lacks bye\n");
        expect(String(stdout.mock.calls[0]?.[0])).toContain("2 locale(s), 2 message(s)");
        expect(await readFile(join(out, "index.js"), "utf8")).toContain("\"de\": () => import(\"./de.js\")");
        const de = (await import(pathToFileURL(join(out, "de.js")).href)) as { hello: (args: { name: string }) => string };
        expect(de.hello({ name: "Ada" })).toBe("Hallo Ada");
        expect(await main([folder, "--out", out, "--strict"])).toBe(1);
        expect(await main([])).toBe(2);
        expect(await main([folder, "--bogus"])).toBe(2);
        vi.restoreAllMocks();
    });
});

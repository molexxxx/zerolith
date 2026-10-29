#!/usr/bin/env node
/**
 * `zerolith-i18n <folder> [--out <folder>] [--js] [--strict]`: compiles
 * every `<locale>.json` catalog in a folder into `<locale>.ts` (or `.js`)
 * plus an index module, and reports keys that some locales lack.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { type Catalog, compileIndex, compileMessages, messageNames } from "./compile.js";

const USAGE = "usage: zerolith-i18n <folder> [--out <folder>] [--js] [--strict]\n";

interface Arguments
{
    folder: string | undefined;
    out: string | undefined;
    javascript: boolean;
    strict: boolean;
}

function parse(argv: readonly string[]): Arguments
{
    const parsed: Arguments = { folder: undefined, out: undefined, javascript: false, strict: false };
    for (let index = 0; index < argv.length; index++)
    {
        const argument = argv[index] ?? "";
        if (argument === "--out")
        {
            const value = argv[index + 1];
            if (value === undefined)
            {
                throw new Error("--out needs a value");
            }
            parsed.out = value;
            index++;
        }
        else if (argument === "--js")
        {
            parsed.javascript = true;
        }
        else if (argument === "--strict")
        {
            parsed.strict = true;
        }
        else if (argument.startsWith("--"))
        {
            throw new Error(`unknown option ${argument}`);
        }
        else if (parsed.folder === undefined)
        {
            parsed.folder = argument;
        }
        else
        {
            throw new Error(`unexpected argument ${argument}`);
        }
    }
    return parsed;
}

/** Runs the command with the given arguments and returns the exit code. */
export async function main(argv: readonly string[]): Promise<number>
{
    let parsed: Arguments;
    try
    {
        parsed = parse(argv);
    }
    catch (error)
    {
        process.stderr.write(`zerolith-i18n: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
        return 2;
    }
    if (parsed.folder === undefined)
    {
        process.stderr.write(USAGE);
        return 2;
    }
    const files = (await readdir(parsed.folder)).filter((name) => name.endsWith(".json")).toSorted();
    if (files.length === 0)
    {
        process.stderr.write(`zerolith-i18n: no .json catalogs in ${parsed.folder}\n`);
        return 1;
    }
    const out = parsed.out ?? parsed.folder;
    await mkdir(out, { recursive: true });
    const language = parsed.javascript ? "js" : "ts";
    const folder = parsed.folder;
    const catalogs = new Map<string, Catalog>(await Promise.all(files.map(async (file): Promise<[string, Catalog]> => [basename(file, ".json"), JSON.parse(await readFile(join(folder, file), "utf8")) as Catalog])));
    const all = new Set<string>();
    for (const catalog of catalogs.values())
    {
        for (const name of messageNames(catalog))
        {
            all.add(name);
        }
    }
    let missing = 0;
    const writes: Promise<void>[] = [];
    for (const [locale, catalog] of catalogs)
    {
        const present = new Set(messageNames(catalog));
        for (const name of all)
        {
            if (!present.has(name))
            {
                missing++;
                process.stderr.write(`zerolith-i18n: ${locale} lacks ${name}\n`);
            }
        }
        const compiled = compileMessages(locale, catalog, { language, source: `${locale}.json` });
        writes.push(writeFile(join(out, `${locale}.${language}`), compiled.code));
    }
    writes.push(writeFile(join(out, `index.${language}`), compileIndex([...catalogs.keys()], { language })));
    await Promise.all(writes);
    process.stdout.write(`zerolith-i18n: ${catalogs.size} locale(s), ${all.size} message(s), written to ${out}\n`);
    return missing > 0 && parsed.strict ? 1 : 0;
}

if (process.argv[1] !== undefined && /zerolith-i18n|[\\/]cli\.js$/.test(process.argv[1]))
{
    process.exitCode = await main(process.argv.slice(2));
}

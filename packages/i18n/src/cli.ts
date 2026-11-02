#!/usr/bin/env node
/**
 * `zerolith-i18n <folder> [--out <folder>] [--js] [--strict]`: compiles
 * every `<locale>.json` catalog in a folder into `<locale>.ts` (or `.js`)
 * plus an index module, and reports keys that some locales lack.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { realpathSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { type Catalog, compileIndex, compileMessages, messageNames } from "./compile.js";

const USAGE = "usage: zerolith-i18n <folder> [--out <folder>] [--js] [--strict]\n";

/** The locale a catalog's file name gives, refusing a name that is not a BCP 47 language tag, such as `en_US.json`. */
function localeOf(file: string): string
{
    const locale = basename(file, ".json");
    try
    {
        Intl.getCanonicalLocales(locale);
    }
    catch
    {
        throw new Error(`${locale} is not a language tag; name the file as en.json or pt-BR.json`);
    }
    return locale;
}

/** A catalog's messages, refusing a file that is not a JSON object of strings. */
function catalogOf(text: string): Catalog
{
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    {
        throw new Error("a catalog is a JSON object of messages");
    }
    for (const [key, value] of Object.entries(parsed))
    {
        if (typeof value !== "string")
        {
            throw new Error(`the message "${key}" is not a string`);
        }
    }
    return parsed as Catalog;
}

/** Reports why a catalog cannot be compiled, naming its file, and gives the exit code; nothing has been written. */
function failure(file: string, error: unknown): number
{
    const message = error instanceof Error ? error.message.replace(/^zerolith\/i18n: /, "") : String(error);
    process.stderr.write(`zerolith-i18n: ${file}: ${message}\n`);
    return 1;
}

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
    const language = parsed.javascript ? "js" : "ts";
    const folder = parsed.folder;
    const read = await Promise.all(files.map(async (file) =>
    {
        try
        {
            return { file, locale: localeOf(file), catalog: catalogOf(await readFile(join(folder, file), "utf8")) };
        }
        catch (error)
        {
            return { file, error };
        }
    }));
    const unreadable = read.find((entry) => "error" in entry);
    if (unreadable !== undefined)
    {
        return failure(unreadable.file, unreadable.error);
    }
    const catalogs = new Map<string, Catalog>(read.map((entry) => [entry.locale ?? "", entry.catalog ?? {}]));
    const all = new Set<string>();
    for (const catalog of catalogs.values())
    {
        for (const name of messageNames(catalog))
        {
            all.add(name);
        }
    }
    let missing = 0;
    const modules = new Map<string, string>();
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
        try
        {
            modules.set(`${locale}.${language}`, compileMessages(locale, catalog, { language, source: `${locale}.json` }).code);
        }
        catch (error)
        {
            return failure(`${locale}.json`, error);
        }
    }
    modules.set(`index.${language}`, compileIndex([...catalogs.keys()], { language }));
    await mkdir(out, { recursive: true });
    await Promise.all([...modules].map(([name, code]) => writeFile(join(out, name), code)));
    process.stdout.write(`zerolith-i18n: ${catalogs.size} locale(s), ${all.size} message(s), written to ${out}\n`);
    return missing > 0 && parsed.strict ? 1 : 0;
}

/** True when node started this module, directly or through the bin link npm installs, which it resolves the way node resolves its entry. */
function started(): boolean
{
    const entry = process.argv[1];
    try
    {
        return entry !== undefined && pathToFileURL(realpathSync(entry)).href === import.meta.url;
    }
    catch
    {
        return false;
    }
}

if (started())
{
    process.exitCode = await main(process.argv.slice(2));
}

#!/usr/bin/env node
/**
 * `zerolith-client <openapi.json> [--out <file.ts>]`: writes the contract
 * module for an OpenAPI document to a file, or to standard output.
 */
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { type OpenApiDocument, generateClient } from "./generate.js";

const USAGE = "usage: zerolith-client <openapi.json> [--out <file.ts>] [--name <Api>]\n";

interface Arguments
{
    input: string | undefined;
    out: string | undefined;
    name: string | undefined;
}

function parse(argv: readonly string[]): Arguments
{
    const parsed: Arguments = { input: undefined, out: undefined, name: undefined };
    for (let index = 0; index < argv.length; index++)
    {
        const argument = argv[index] ?? "";
        if (argument === "--out" || argument === "--name")
        {
            const value = argv[index + 1];
            if (value === undefined)
            {
                throw new Error(`${argument} needs a value`);
            }
            parsed[argument === "--out" ? "out" : "name"] = value;
            index++;
        }
        else if (argument.startsWith("--"))
        {
            throw new Error(`unknown option ${argument}`);
        }
        else if (parsed.input === undefined)
        {
            parsed.input = argument;
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
        process.stderr.write(`zerolith-client: ${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
        return 2;
    }
    if (parsed.input === undefined)
    {
        process.stderr.write(USAGE);
        return 2;
    }
    const document = JSON.parse(await readFile(parsed.input, "utf8")) as OpenApiDocument;
    const code = generateClient(document, parsed.name === undefined ? {} : { apiName: parsed.name });
    if (parsed.out === undefined)
    {
        process.stdout.write(code);
    }
    else
    {
        await writeFile(parsed.out, code);
    }
    return 0;
}

if (process.argv[1] !== undefined && /zerolith-client|[\\/]cli\.js$/.test(process.argv[1]))
{
    process.exitCode = await main(process.argv.slice(2));
}

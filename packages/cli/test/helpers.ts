import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { zerolithBinary } from "../../../scripts/zerolith.ts";

/**
 * What the command-line tests share: the built binary, a server started on
 * a free port and read until its banner is complete, a free port for a
 * backend, and whether a process still runs.
 */

/** The built binary, or a failure that says how to get one. */
export function binary(): string
{
    const found = zerolithBinary();
    if (found === undefined)
    {
        throw new Error("No zerolith binary: run cargo build, or set ZEROLITH_BINARY_PATH");
    }
    return found;
}

/** A started server: its origin, its process, and its output so far. */
export interface Started
{
    origin: string;
    child: ChildProcess;
    output: () => string;
}

/** Starts a zerolith server on a free port and resolves once its banner is complete, so every row of it can be checked; rejects when the process exits first. */
export function startServer(args: string[]): Promise<Started>
{
    return new Promise((resolve, reject) =>
    {
        const child = spawn(binary(), [...args, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        const read = (chunk: Buffer): void =>
        {
            output += chunk.toString();
            const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];
            if (origin !== undefined && output.includes("Press Ctrl+C to stop."))
            {
                resolve({ origin, child, output: () => output });
            }
        };
        child.stdout?.on("data", read);
        child.stderr?.on("data", read);
        child.on("exit", (code) => reject(new Error(`zerolith exited with ${String(code)}: ${output}`)));
    });
}

/** The first of the ports `freePort` gives, and how many there are: all below the ports a system gives to a process that asks for any free one, which start at 32768 on Linux and at 49152 on Windows and macOS. */
const FIRST_PORT = 20000;
const PORTS = 10000;

/** Where the next call of `freePort` starts looking, from a place of its own in each test file, so files that run side by side seldom try the same port and no two calls give the same one. */
let next = Math.floor(Math.random() * PORTS);

/** Whether this process can listen on `port` right now. */
function listens(port: number): Promise<boolean>
{
    return new Promise((resolve) =>
    {
        const server = createServer();
        server.on("error", () => resolve(false));
        server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
}

/**
 * A port nothing listens on right now, for a backend a test starts later
 * or expects to be down. It is none of the ports a system gives to a
 * process that asks for any free one, as every server these tests start
 * does: a port found by binding port 0 and letting it go went to another
 * file's server before this file's backend had it, so a proxy to a backend
 * that was down answered 200, and the backend then could not listen.
 */
export async function freePort(): Promise<number>
{
    for (let tries = 0; tries < PORTS; tries++)
    {
        const port = FIRST_PORT + next++ % PORTS;
        if (await listens(port))
        {
            return port;
        }
    }
    throw new Error(`no port from ${FIRST_PORT} to ${FIRST_PORT + PORTS - 1} is free`);
}

/** Whether a process runs, by sending it no signal. */
export function alive(pid: number): boolean
{
    try
    {
        process.kill(pid, 0);
        return true;
    }
    catch
    {
        return false;
    }
}

/** Waits until the process is gone, for up to ten seconds, and says whether it is. */
export async function gone(pid: number): Promise<boolean>
{
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline)
    {
        if (!alive(pid))
        {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return !alive(pid);
}

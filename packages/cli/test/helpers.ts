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

/** A port nothing listens on right now, found by binding one and letting it go. */
export function freePort(): Promise<number>
{
    return new Promise((resolve, reject) =>
    {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () =>
        {
            const address = server.address();
            const port = typeof address === "object" && address !== null ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
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

// The live activity stream. Every open dashboard holds one server-sent events
// response, and each new activity is written to all of them.
import type { Activity } from "../shared/model.ts";

/** The open streams and the way to reach them. */
export interface Events
{
    /** A `text/event-stream` response that stays open until `signal` aborts. */
    stream(signal: AbortSignal): Response;
    /** Writes one activity to every open stream. */
    send(activity: Activity): void;
}

export function createEvents(): Events
{
    const encoder = new TextEncoder();
    const open = new Set<ReadableStreamDefaultController<Uint8Array>>();
    return {
        stream(signal)
        {
            let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
            const close = (): void =>
            {
                if (controller !== undefined && open.delete(controller))
                {
                    controller.close();
                }
            };
            const body = new ReadableStream<Uint8Array>({
                start(started)
                {
                    controller = started;
                    open.add(started);
                    started.enqueue(encoder.encode(": connected\n\n"));
                },
                cancel()
                {
                    if (controller !== undefined)
                    {
                        open.delete(controller);
                    }
                }
            });
            signal.addEventListener("abort", close);
            return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
        },
        send(activity)
        {
            const message = encoder.encode(`data: ${JSON.stringify(activity)}\n\n`);
            for (const controller of open)
            {
                controller.enqueue(message);
            }
        }
    };
}

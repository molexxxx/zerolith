// Executed examples for the client guide: the message port transport.
import { describe, expect, it } from "vitest";
import { createClient } from "@zerolith/client";
import { portTransport, servePort } from "@zerolith/client/port";
import { type Api, routes } from "../fixtures/notes.api.ts";

describe("client guide: message port", () =>
{
    it("runs the handler on one side of a channel and the client on the other", async () =>
    {
        // #region port
        const { port1, port2 } = new MessageChannel();

        // Where the handler runs, such as the Electron main process:
        servePort(port2, (request) =>
        {
            const id = new URL(request.url).pathname.split("/").at(-1);
            return Response.json({ id, title: "From main", tags: [], visibility: "private" });
        });

        // Where the page runs, with port1 handed over through the preload script:
        const api = createClient<Api>(routes, {
            baseUrl: "app://notes",
            transport: portTransport(port1)
        });
        const note = await api.call("getNote", { params: { id: "7" } });
        // #endregion port
        expect(note).toMatchObject({ id: "7", title: "From main" });
        port1.close();
        port2.close();
    });
});

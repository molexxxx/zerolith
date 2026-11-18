/*
 * A typed client from @zerolith/client. In an app, zerolith-client
 * reads the server's OpenAPI document and writes the routes table
 * below, with a type for every call to be checked against. Here the
 * table is written by hand, and a transport answers each request in
 * the page in place of a server.
 *
 * Try: type in the search box, and the query calls again as the
 * signal it reads changes, aborting a request it no longer needs.
 * Add a note with no title: the server's problem comes back as a
 * ProblemError, its field's message under the box. The console logs
 * every request the client sends.
 */
import { computed, css, each, html, render, signal } from "zerolith";
import { ProblemError, createClient } from "@zerolith/client";

/** What zerolith-client writes: each operation's method and path. */
const routes = {
    listNotes: { method: "get", path: "/notes" },
    createNote: { method: "post", path: "/notes" },
    deleteNote: { method: "delete", path: "/notes/{id}" }
};

const saved = [
    { id: 1, title: "Book the venue" },
    { id: 2, title: "Send the invitations" },
    { id: 3, title: "Order the cake" }
];
let nextId = 4;

/** An RFC 9457 problem, as the server answers a request it refuses. */
function problem(status, title, fields)
{
    return new Response(JSON.stringify({ status, title, fields }), {
        status,
        headers: { "content-type": "application/problem+json" }
    });
}

/** Waits as the network would, until the client aborts the request. */
function latency(request, line)
{
    return new Promise((resolve, reject) =>
    {
        const aborted = () =>
        {
            clearTimeout(timer);
            console.log(`${line}, aborted`);
            reject(request.signal.reason);
        };
        const timer = setTimeout(() =>
        {
            request.signal.removeEventListener("abort", aborted);
            resolve();
        }, 300);
        request.signal.addEventListener("abort", aborted, { once: true });
    });
}

/** The server, in the page: a transport turns a Request into a Response. */
async function server(request)
{
    const url = new URL(request.url);
    const line = `${request.method} ${url.pathname}${url.search}`;
    console.log(line);
    await latency(request, line);
    if (request.method === "GET" && url.pathname === "/notes")
    {
        const words = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        return Response.json(saved.filter((note) =>
            note.title.toLowerCase().includes(words)));
    }
    if (request.method === "POST" && url.pathname === "/notes")
    {
        const { title } = await request.json();
        if (typeof title !== "string" || title.trim() === "")
        {
            return problem(422, "The note was not saved.", {
                title: ["Write a title."]
            });
        }
        const note = { id: nextId++, title: title.trim() };
        saved.push(note);
        return Response.json(note, { status: 201 });
    }
    const id = Number(/^\/notes\/(\d+)$/.exec(url.pathname)?.[1]);
    const at = saved.findIndex((note) => note.id === id);
    if (request.method === "DELETE" && at !== -1)
    {
        saved.splice(at, 1);
        return new Response(null, { status: 204 });
    }
    return problem(404, "No such note.");
}

const api = createClient(routes, {
    baseUrl: "https://notes.example",
    transport: server
});

const search = signal("");
const notes = api.query("listNotes", () => ({ query: { q: search.get() } }));
const shown = computed(() => notes.get() ?? []);
const loading = computed(() => notes.status.get() === "pending");
const status = computed(() =>
{
    const count = shown.get().length;
    return loading.get() ? "loading" : `${count} note${count === 1 ? "" : "s"}`;
});
const message = signal("");

async function add(event)
{
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("title");
    try
    {
        await api.call("createNote", { body: { title: field.value } });
        message.set("");
        field.value = "";
        notes.reload();
    }
    catch (error)
    {
        if (!(error instanceof ProblemError))
        {
            throw error;
        }
        const { fields, title } = error.problem;
        message.set(fields?.title?.[0] ?? title ?? "");
    }
}

async function remove(id)
{
    await api.call("deleteNote", { params: { id } });
    notes.reload();
}

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 460px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    ul {
        margin: 0;
        padding: 0;
        border-top: 2px solid var(--line);
        list-style: none;
    }
    li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 2px solid var(--line);
    }
    form { display: flex; flex-wrap: wrap; gap: 8px; }
    input[name="title"] { flex: 1; min-width: 0; }
    .error { flex-basis: 100%; margin: 0; color: var(--danger); }
    .status { margin: 0; color: var(--muted); font-family: var(--font-mono); }
`;

render(html`
    <section class=${panel}>
        <input type="search" aria-label="Search notes" placeholder="Search"
            @input=${(event) => search.set(event.currentTarget.value)}>
        <ul>${each(shown, (note) => note.id, (note) => html`
            <li>
                <span>${computed(() => note.get().title)}</span>
                <button @click=${() => remove(note.get().id)}>Delete</button>
            </li>`)}</ul>
        <p class="status">${status}</p>
        <form @submit=${add}>
            <input name="title" aria-label="Title" placeholder="A new note"
                autocomplete="off">
            <button class="primary">Add</button>
            <p class="error" role="alert">${message}</p>
        </form>
    </section>`, "#app");

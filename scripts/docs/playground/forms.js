/*
 * Forms: a native form sent with @zerolith/forms. The schema runs in the
 * browser before anything is sent, and the server's answer comes back as
 * a problem whose fields land next to the inputs they are about.
 *
 * Try: submit a one-letter name, then "ada", which the stand-in server
 * says is taken, then a name of your own.
 */
import { html, render, signal, when } from "zerolith";
import { createForm } from "@zerolith/forms";

/** A Standard Schema written by hand; zod or valibot plug in the same way. */
const schema = {
    "~standard": {
        version: 1,
        vendor: "playground",
        validate(value)
        {
            const name = String(value.name ?? "").trim();
            if (name.length < 2)
            {
                const message = "Use at least two letters.";
                return { issues: [{ message, path: ["name"] }] };
            }
            return { value: { name } };
        }
    }
};

/** A stand-in for the server, which answers as a real API would. */
async function send({ data })
{
    await new Promise((resolve) => setTimeout(resolve, 400));
    const name = String(data.get("name")).trim();
    if (name.toLowerCase() === "ada")
    {
        const problem = { title: "Taken", status: 409, fields: {
            name: ["That name is taken. Try another."]
        } };
        const headers = { "content-type": "application/problem+json" };
        return Response.json(problem, { status: 409, headers });
    }
    return Response.json({ name }, { status: 201 });
}

const welcomed = signal("");
const form = createForm({
    schema,
    send,
    reset: true,
    onSuccess: ({ result }) => welcomed.set(result.name)
});
const name = form.field("name");

render(html`
    <form method="post" action="/signup" @submit=${form.submit}>
        <label>Username
            <input name="name" autocomplete="off"
                aria-invalid=${name.invalid} aria-describedby="name-error">
        </label>
        <output id="name-error">${name.error}</output>
        <button ?disabled=${form.pending}>Sign up</button>
    </form>
    ${when(welcomed, () => html`<p>Welcome aboard, ${welcomed}.</p>`)}`,
    "#app");

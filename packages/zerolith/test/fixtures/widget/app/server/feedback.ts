// An example backend for the contract in openapi.json, which any page may
// post to: a function from a Request to a Response.
import type { Feedback, Problem } from "../src/api.ts";

const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": "content-type"
};

/** A problem details response, readable from a page on any origin. */
function problem(
    details: Problem & { status: number },
    headers: Record<string, string> = {}
): Response
{
    return Response.json(details, {
        status: details.status,
        headers: {
            ...cors, ...headers, "content-type": "application/problem+json"
        }
    });
}

/** The length of a string in characters, as JSON Schema counts them. */
function length(text: string): number
{
    return [...text].length;
}

/** A message for each member of the body that the contract refuses. */
function invalid(body: Record<string, unknown>): Record<string, string[]>
{
    const { helpful, page, comment } = body;
    const fields: Record<string, string[]> = {};
    if (typeof helpful !== "boolean")
    {
        fields["helpful"] = ["Say whether the page helped: true or false."];
    }
    if (typeof page !== "string" || page === "" || length(page) > 2000)
    {
        fields["page"] = ["Name the page in 1 to 2000 characters."];
    }
    if (comment !== undefined
        && (typeof comment !== "string" || length(comment) > 1000))
    {
        fields["comment"] = ["Keep the comment to 1000 characters."];
    }
    return fields;
}

/**
 * Answers POST /feedback as the contract says, handing each valid piece of
 * feedback to `save`, and the preflight request a browser sends first from
 * a page on another origin.
 */
export function feedbackHandler(
    save: (feedback: Feedback) => void
): (request: Request) => Promise<Response>
{
    return async (request) =>
    {
        if (new URL(request.url).pathname !== "/feedback")
        {
            return problem({ status: 404, title: "Not found" });
        }
        if (request.method === "OPTIONS")
        {
            return new Response(null, { status: 204, headers: cors });
        }
        if (request.method !== "POST")
        {
            const allow = { allow: "POST, OPTIONS" };
            return problem({ status: 405, title: "Use POST" }, allow);
        }
        const body: unknown = await request.json().catch(() => undefined);
        if (typeof body !== "object" || body === null || Array.isArray(body))
        {
            return problem({ status: 400, title: "Send a JSON object" });
        }
        const fields = invalid(body as Record<string, unknown>);
        if (Object.keys(fields).length > 0)
        {
            const title = "The feedback is not valid";
            return problem({ status: 400, title, fields });
        }
        const { helpful, page, comment } = body as Feedback;
        save(comment === undefined
            ? { helpful, page }
            : { helpful, page, comment });
        const id = crypto.randomUUID();
        return Response.json({ id }, { status: 201, headers: cors });
    };
}

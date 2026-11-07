// The sign-up endpoint, as a function from Request to Response.
import { problemResponse, validateForm } from "@zerolith/forms";
import { type Account, signUpSchema } from "../src/schema.ts";

/** The accounts, by email address in lowercase, kept while the server runs. */
const accounts = new Map<string, Account>([
    ["ada@example.com",
        { id: 1, name: "Ada Lovelace", email: "ada@example.com", plan: "plus" }]
]);

/**
 * Answers POST /api/sign-ups: 201 with the new account, or a problem
 * document whose fields say what to change. Every other request gets 404.
 */
export async function answer(request: Request): Promise<Response>
{
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || pathname !== "/api/sign-ups")
    {
        return problemResponse({ title: "Not Found", status: 404 });
    }
    const data = await request.formData().catch(() => undefined);
    if (data === undefined)
    {
        return problemResponse({
            title: "Unsupported Media Type",
            status: 415,
            detail: "Send the form's fields URL-encoded."
        });
    }
    const validation = await validateForm(signUpSchema, data);
    if (validation.problem !== undefined)
    {
        return problemResponse(validation.problem);
    }
    const { name, email, plan } = validation.value;
    const key = email.toLowerCase();
    if (accounts.has(key))
    {
        return problemResponse({
            type: "about:blank",
            title: "Conflict",
            status: 409,
            fields: { email: ["This email address already has an account."] }
        });
    }
    const account: Account = { id: accounts.size + 1, name, email, plan };
    accounts.set(key, account);
    return Response.json(account, { status: 201 });
}

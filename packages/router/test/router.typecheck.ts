// What the router's types accept and refuse; `tsc` is the test, so a line marked ts-expect-error must fail to compile and every other line must pass.
import { type Match, type RouteParams, type DataOf, createRouter, defineRoutes, lazy, route } from "@zerolith/router";
import { html } from "zerolith";

const routes = defineRoutes({
    home: route({ path: "/", view: () => html`<p>home</p>` }),
    release: route({
        path: "/releases/:tag",
        load: ({ params }) => Promise.resolve({ name: `Release ${params.tag}` }),
        view: ({ data, params }) => html`<p>${data.name} ${params.tag}</p>`
    }),
    files: route({ path: "/files/*rest", view: ({ params }) => html`<p>${params.rest}</p>` }),
    later: route({ path: "/later", view: lazy(() => Promise.resolve(() => html`<p>later</p>`)) })
});

const router = createRouter(routes, { window: null });

/** Narrowing a match by its name types its params and data. */
export function describeMatch(): string
{
    const current = router.current.get();
    if (current === undefined)
    {
        return "nothing";
    }
    if (current.name === "release")
    {
        const tag: string = current.params.tag;
        const name: string = current.data.name;
        return `${tag} ${name}`;
    }
    if (current.name === "files")
    {
        const rest: string = current.params.rest;
        const nothing: undefined = current.data;
        return `${rest} ${String(nothing)}`;
    }
    if (current.name === "later")
    {
        const unknownData: unknown = current.data;
        return String(unknownData);
    }
    const home: undefined = current.data;
    return String(home);
}

/** A bare match keeps the untyped shape. */
export function describeAny(match: Match): string
{
    const name: string = match.name;
    const value: unknown = match.data;
    const param: string | undefined = match.params["id"];
    return `${name} ${String(value)} ${String(param)}`;
}

export type ReleaseParams = RouteParams<(typeof routes)["release"]>;
export type ReleaseData = DataOf<(typeof routes)["release"]>;
export const release: ReleaseParams = { tag: "v1" };
export const data: ReleaseData = { name: "Release v1" };

export function refused(): unknown[]
{
    const current = router.current.get();
    const seen: unknown[] = [];
    if (current?.name === "release")
    {
        seen.push(
            // @ts-expect-error a release has no rest parameter
            current.params.rest,
            // @ts-expect-error the data has no version field
            current.data.version
        );
    }
    if (current?.name === "home")
    {
        seen.push(
            // @ts-expect-error a route without a loader has undefined data
            current.data.name
        );
    }
    seen.push(
        // @ts-expect-error the name is not in the table
        router.href("nowhere")
    );
    return seen;
}

/**
 * The server side of the problem document: writing a `Problem` as a
 * WinterTC `Response` with the problem details media type.
 */
import { PROBLEM_MEDIA_TYPE, type Problem } from "zerolith";

/**
 * Writes a problem as a `Response` with the problem details media type.
 * The status comes from `init`, or the problem, or defaults to 400.
 */
export function problemResponse(problem: Problem, init: ResponseInit = {}): Response
{
    const status = init.status ?? problem.status ?? 400;
    const headers = new Headers(init.headers);
    headers.set("content-type", `${PROBLEM_MEDIA_TYPE}; charset=utf-8`);
    const body: Problem = { ...problem, status };
    return new Response(JSON.stringify(body), { ...init, status, headers });
}

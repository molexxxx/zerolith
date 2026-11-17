/**
 * Weighs what `npm audit --json` reports against the exceptions
 * `.github/audit-exceptions.json` lists. An advisory fails the check unless
 * an exception names it for the package it was filed against; an exception
 * fails once its review day has passed, so none outlives a look at whether
 * a fix has shipped; and an exception for an advisory the report no longer
 * holds fails too, so it leaves the file with the fix. `scripts/audit.ts`
 * runs the check in CI.
 */

/** An advisory the report names: its GitHub advisory id, or its URL when it has none, and the package it was filed against. */
export interface Advisory
{
    readonly id: string;
    readonly package: string;
    readonly title: string;
}

/** An advisory let through: why it cannot reach a user, and the day, as YYYY-MM-DD, by which it is looked at again. */
export interface Exception
{
    readonly advisory: string;
    readonly package: string;
    readonly reason: string;
    readonly review: string;
}

/** What the check found: each failure as a sentence, and the advisories it let through. */
export interface Verdict
{
    readonly failures: readonly string[];
    readonly excused: readonly Advisory[];
}

const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/;
const GHSA_ID = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = ["advisory", "package", "reason", "review"];

/**
 * The advisories in a report, each once: the objects in a vulnerability's
 * `via`, where a package that only depends on a vulnerable one lists that
 * package's name instead. A report npm could not make, which holds an
 * `error`, throws its summary.
 */
export function advisoriesOf(report: unknown): Advisory[]
{
    if (typeof report !== "object" || report === null)
    {
        throw new Error("npm audit gave no report");
    }
    const { error, vulnerabilities } = report as { error?: { summary?: unknown }; vulnerabilities?: unknown };
    if (error !== undefined)
    {
        throw new Error(`npm audit failed: ${typeof error.summary === "string" ? error.summary : JSON.stringify(error)}`);
    }
    if (typeof vulnerabilities !== "object" || vulnerabilities === null)
    {
        throw new Error("npm audit's report holds no vulnerabilities");
    }
    const found = new Map<string, Advisory>();
    for (const [name, entry] of Object.entries(vulnerabilities))
    {
        const via = (entry as { via?: unknown } | null)?.via;
        if (!Array.isArray(via))
        {
            throw new Error(`npm audit's entry for ${name} names nothing it comes from`);
        }
        for (const item of via)
        {
            if (typeof item !== "object" || item === null)
            {
                continue;
            }
            const { url, source, title, name: filed } = item as { url?: unknown; source?: unknown; title?: unknown; name?: unknown };
            const link = typeof url === "string" ? url : `npm advisory ${String(source)}`;
            const id = GHSA.exec(link)?.[0] ?? link;
            found.set(id, { id, package: typeof filed === "string" ? filed : name, title: typeof title === "string" ? title : "" });
        }
    }
    return [...found.values()];
}

/** The exceptions a file holds, each checked for a GitHub advisory id, its package, a reason, and a real review day, with no other key and no advisory twice. */
export function checkExceptions(value: unknown, file: string): Exception[]
{
    const list = (value as { exceptions?: unknown } | null)?.exceptions;
    if (typeof value !== "object" || value === null || Object.keys(value).some((key) => key !== "exceptions") || !Array.isArray(list))
    {
        throw new Error(`${file} is not an object holding a list of exceptions`);
    }
    const seen = new Set<string>();
    return list.map((entry: unknown, index) =>
    {
        const where = `${file}, exception ${index + 1}`;
        if (typeof entry !== "object" || entry === null || Object.keys(entry).length !== KEYS.length || !KEYS.every((key) => Object.hasOwn(entry, key)))
        {
            throw new Error(`${where} must hold exactly ${KEYS.join(", ")}`);
        }
        const { advisory, package: name, reason, review } = entry as Record<string, unknown>;
        if (typeof advisory !== "string" || !GHSA_ID.test(advisory))
        {
            throw new Error(`${where}: ${JSON.stringify(advisory)} is not a GitHub advisory id`);
        }
        if (seen.has(advisory))
        {
            throw new Error(`${where}: ${advisory} is excepted twice`);
        }
        seen.add(advisory);
        if (typeof name !== "string" || name === "")
        {
            throw new Error(`${where}: names no package`);
        }
        if (typeof reason !== "string" || reason.trim().length < 40)
        {
            throw new Error(`${where}: gives no reason why ${advisory} cannot reach a user`);
        }
        if (typeof review !== "string" || !DAY.test(review) || Number.isNaN(Date.parse(review)) || new Date(review).toISOString().slice(0, 10) !== review)
        {
            throw new Error(`${where}: ${JSON.stringify(review)} is not a day as YYYY-MM-DD`);
        }
        return { advisory, package: name, reason, review };
    });
}

/** Weighs a report's advisories against the exceptions on `today`, a day as YYYY-MM-DD in UTC. */
export function verdict(advisories: readonly Advisory[], exceptions: readonly Exception[], today: string): Verdict
{
    const failures: string[] = [];
    const excused: Advisory[] = [];
    for (const advisory of advisories)
    {
        const exception = exceptions.find((one) => one.advisory === advisory.id);
        if (exception === undefined)
        {
            failures.push(`${advisory.id} in ${advisory.package}${advisory.title === "" ? "" : `: ${advisory.title}`}`);
        }
        else if (exception.package !== advisory.package)
        {
            failures.push(`${advisory.id} is filed against ${advisory.package}, and its exception names ${exception.package}`);
        }
        else
        {
            excused.push(advisory);
        }
    }
    for (const exception of exceptions)
    {
        if (today > exception.review)
        {
            failures.push(`the exception for ${exception.advisory} in ${exception.package} was due for review on ${exception.review}: move to a release that fixes it, or check again and set a new day`);
        }
        if (!advisories.some((advisory) => advisory.id === exception.advisory))
        {
            failures.push(`${exception.advisory} is no longer reported: take its exception out of .github/audit-exceptions.json`);
        }
    }
    return { failures, excused };
}

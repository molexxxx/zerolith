/**
 * Numbers read from a script's options and environment variables, written
 * as plain decimals. Anything else throws, so a typo cannot quietly change
 * what a check checks.
 */

/** A whole number above 0, such as a count of iterations or workers. */
export function wholeNumber(name: string, text: string): number
{
    const value = Number(text);
    if (!/^\d+$/.test(text) || value < 1)
    {
        throw new Error(`${name} takes a whole number above 0; ${JSON.stringify(text)} is not one`);
    }
    return value;
}

/** A percentage of 0 or more, such as a threshold. */
export function percentage(name: string, text: string): number
{
    if (!/^\d+(\.\d+)?$/.test(text))
    {
        throw new Error(`${name} takes a percentage, 0 or more; ${JSON.stringify(text)} is not one`);
    }
    return Number(text);
}

/** A port to listen on, 0 asking for a free one. */
export function port(name: string, text: string): number
{
    const value = Number(text);
    if (!/^\d+$/.test(text) || value > 65535)
    {
        throw new Error(`${name} takes a port from 0 to 65535; ${JSON.stringify(text)} is not one`);
    }
    return value;
}

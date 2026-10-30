/**
 * Syntax coloring for the docs site's code blocks, done when the site is
 * built. The brand allows three colors in code, so the tokens are keywords,
 * strings, comments, and everything else: the same split for TypeScript,
 * JavaScript, JSX, HTML, CSS, JSON, and shell sessions.
 */

export type TokenKind = "plain" | "keyword" | "string" | "comment";

export interface Token
{
    kind: TokenKind;
    text: string;
}

const scriptKeywords = new Set([
    "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "declare", "default",
    "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "get", "if", "implements",
    "import", "in", "infer", "instanceof", "interface", "is", "keyof", "let", "namespace", "new", "null", "of", "override",
    "private", "protected", "public", "readonly", "return", "satisfies", "set", "static", "super", "switch", "this", "throw",
    "true", "try", "type", "typeof", "var", "void", "while", "yield"
]);

/** Words that are keywords only where a statement or declaration can start them, not as names. */
const contextual = new Set(["as", "async", "declare", "from", "get", "infer", "is", "keyof", "namespace", "of", "satisfies", "set", "type"]);

/** A slash after one of these starts a regular expression; after anything else, including the `<` of a JSX closing tag, it does not. */
const regexPrecedes = /[(,=:[!&|?{;+\-*%~^]$/;

function push(tokens: Token[], kind: TokenKind, text: string): void
{
    if (text === "")
    {
        return;
    }
    const last = tokens.at(-1);
    if (last !== undefined && last.kind === kind)
    {
        last.text += text;
        return;
    }
    tokens.push({ kind, text });
}

/** The index just past the string literal that opens at `start`. */
function quoted(code: string, start: number): number
{
    const quote = code[start];
    let index = start + 1;
    while (index < code.length && code[index] !== quote && code[index] !== "\n")
    {
        index += code[index] === "\\" ? 2 : 1;
    }
    return Math.min(index + 1, code.length);
}

function lastSignificant(tokens: Token[]): string
{
    for (let index = tokens.length - 1; index >= 0; index--)
    {
        const token = tokens[index];
        if (token === undefined || token.kind === "comment")
        {
            continue;
        }
        const text = token.text.trimEnd();
        if (text !== "")
        {
            return token.kind === "keyword" ? "(" : text;
        }
    }
    return "(";
}

/** Splits script source into tokens, following template literals into their `${}` expressions. */
export function tokenizeScript(code: string): Token[]
{
    const tokens: Token[] = [];
    let index = 0;
    const templates: number[] = [];
    let depth = 0;
    while (index < code.length)
    {
        const character = code[index] ?? "";
        const next = code[index + 1] ?? "";
        if (character === "/" && next === "/")
        {
            const end = code.indexOf("\n", index);
            const stop = end === -1 ? code.length : end;
            push(tokens, "comment", code.slice(index, stop));
            index = stop;
        }
        else if (character === "/" && next === "*")
        {
            const end = code.indexOf("*/", index + 2);
            const stop = end === -1 ? code.length : end + 2;
            push(tokens, "comment", code.slice(index, stop));
            index = stop;
        }
        else if (character === "\"" || character === "'")
        {
            const stop = quoted(code, index);
            push(tokens, "string", code.slice(index, stop));
            index = stop;
        }
        else if (character === "`" || (character === "}" && templates.at(-1) === depth))
        {
            if (character === "}")
            {
                templates.pop();
            }
            let stop = index + 1;
            while (stop < code.length && code[stop] !== "`" && !(code[stop] === "$" && code[stop + 1] === "{"))
            {
                stop += code[stop] === "\\" ? 2 : 1;
            }
            if (code[stop] === "$")
            {
                push(tokens, "string", code.slice(index, stop + 2));
                templates.push(depth);
                index = stop + 2;
            }
            else
            {
                push(tokens, "string", code.slice(index, stop + 1));
                index = stop + 1;
            }
        }
        else if (character === "/" && regexPrecedes.test(lastSignificant(tokens)))
        {
            let stop = index + 1;
            let inClass = false;
            while (stop < code.length && code[stop] !== "\n" && (inClass || code[stop] !== "/"))
            {
                if (code[stop] === "[")
                {
                    inClass = true;
                }
                else if (code[stop] === "]")
                {
                    inClass = false;
                }
                stop += code[stop] === "\\" ? 2 : 1;
            }
            stop += 1;
            while (/[a-z]/.test(code[stop] ?? ""))
            {
                stop += 1;
            }
            push(tokens, "string", code.slice(index, stop));
            index = stop;
        }
        else if (/[A-Za-z_$]/.test(character))
        {
            let stop = index + 1;
            while (/[\w$]/.test(code[stop] ?? ""))
            {
                stop += 1;
            }
            const word = code.slice(index, stop);
            const before = code[index - 1] ?? "";
            const after = code.slice(stop).match(/^\s*(.)/)?.[1] ?? "";
            const member = before === "." || (after === ":" && !["case", "default"].includes(word)) || (after === "=" && code[stop] !== " " && contextual.has(word));
            const keyword = scriptKeywords.has(word) && !member && !(contextual.has(word) && /^\s*[,)}\]=;]/.test(code.slice(stop)));
            push(tokens, keyword ? "keyword" : "plain", word);
            index = stop;
        }
        else
        {
            if (character === "{")
            {
                depth += 1;
            }
            else if (character === "}")
            {
                depth -= 1;
            }
            push(tokens, "plain", character);
            index += 1;
        }
    }
    return tokens;
}

function tokenizeMarkup(code: string): Token[]
{
    const tokens: Token[] = [];
    let index = 0;
    while (index < code.length)
    {
        if (code.startsWith("<!--", index))
        {
            const end = code.indexOf("-->", index);
            const stop = end === -1 ? code.length : end + 3;
            push(tokens, "comment", code.slice(index, stop));
            index = stop;
            continue;
        }
        const tag = /^<\/?([A-Za-z][\w:-]*)/.exec(code.slice(index));
        if (tag !== null)
        {
            const opener = tag[0].length - (tag[1] ?? "").length;
            push(tokens, "plain", code.slice(index, index + opener));
            push(tokens, "keyword", tag[1] ?? "");
            index += tag[0].length;
            while (index < code.length && code[index] !== ">")
            {
                const character = code[index] ?? "";
                if (character === "\"" || character === "'")
                {
                    const end = code.indexOf(character, index + 1);
                    const stop = end === -1 ? code.length : end + 1;
                    push(tokens, "string", code.slice(index, stop));
                    index = stop;
                }
                else
                {
                    push(tokens, "plain", character);
                    index += 1;
                }
            }
            continue;
        }
        push(tokens, "plain", code[index] ?? "");
        index += 1;
    }
    return tokens;
}

function tokenizeStyles(code: string): Token[]
{
    const tokens: Token[] = [];
    let index = 0;
    while (index < code.length)
    {
        const character = code[index] ?? "";
        if (code.startsWith("/*", index))
        {
            const end = code.indexOf("*/", index + 2);
            const stop = end === -1 ? code.length : end + 2;
            push(tokens, "comment", code.slice(index, stop));
            index = stop;
        }
        else if (character === "\"" || character === "'")
        {
            const stop = quoted(code, index);
            push(tokens, "string", code.slice(index, stop));
            index = stop;
        }
        else if (character === "@" || code.startsWith("!important", index))
        {
            const match = /^[@!][\w-]+/.exec(code.slice(index));
            const word = match?.[0] ?? character;
            push(tokens, "keyword", word);
            index += word.length;
        }
        else
        {
            push(tokens, "plain", character);
            index += 1;
        }
    }
    return tokens;
}

function tokenizeShell(code: string): Token[]
{
    const tokens: Token[] = [];
    for (const [number, line] of code.split("\n").entries())
    {
        if (number > 0)
        {
            push(tokens, "plain", "\n");
        }
        const comment = /(^|\s)#.*$/.exec(line);
        const command = comment === null ? line : line.slice(0, comment.index + (comment[1] ?? "").length);
        const first = /^(\s*)([^\s#]+)/.exec(command);
        let rest = command;
        if (first !== null)
        {
            push(tokens, "plain", first[1] ?? "");
            push(tokens, "keyword", first[2] ?? "");
            rest = command.slice(first[0].length);
        }
        for (const part of rest.split(/("[^"]*"|'[^']*')/))
        {
            push(tokens, part.startsWith("\"") || part.startsWith("'") ? "string" : "plain", part);
        }
        if (comment !== null)
        {
            push(tokens, "comment", line.slice(comment.index + (comment[1] ?? "").length));
        }
    }
    return tokens;
}

function tokenizeData(code: string): Token[]
{
    const tokens: Token[] = [];
    for (const part of code.split(/("(?:[^"\\]|\\.)*")/))
    {
        if (part.startsWith("\""))
        {
            push(tokens, "string", part);
        }
        else
        {
            for (const word of part.split(/\b(true|false|null)\b/))
            {
                push(tokens, ["true", "false", "null"].includes(word) ? "keyword" : "plain", word);
            }
        }
    }
    return tokens;
}

/** The tokens of a code block in the given fence language; an unknown language is one plain token. */
export function tokenize(code: string, language: string): Token[]
{
    switch (language)
    {
        case "ts":
        case "tsx":
        case "js":
        case "jsx":
        case "mjs":
        case "typescript":
        case "javascript":
            return tokenizeScript(code);
        case "html":
        case "xml":
        case "svg":
            return tokenizeMarkup(code);
        case "css":
            return tokenizeStyles(code);
        case "sh":
        case "shell":
        case "bash":
        case "console":
            return tokenizeShell(code);
        case "json":
            return tokenizeData(code);
        default:
            return [{ kind: "plain", text: code }];
    }
}

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

/** Escapes code for HTML, quotes included, so markup inside an example is never read as the page's own attributes. */
function escapeHtml(text: string): string
{
    return text.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

const classes: Record<TokenKind, string> = { plain: "", keyword: "k", string: "s", comment: "c" };

/** A code block's HTML, with keywords, strings, and comments wrapped in spans the stylesheet colors. */
export function highlight(code: string, language: string): string
{
    return tokenize(code, language)
        .map((token) => (token.kind === "plain" ? escapeHtml(token.text) : `<span class="${classes[token.kind]}">${escapeHtml(token.text)}</span>`))
        .join("");
}

/** The identifiers a script uses outside its strings and comments, including those inside `${}` expressions. */
export function identifiers(code: string): Set<string>
{
    const found = new Set<string>();
    for (const token of tokenizeScript(code))
    {
        if (token.kind === "plain")
        {
            for (const match of token.text.matchAll(/[A-Za-z_$][\w$]*/g))
            {
                found.add(match[0]);
            }
        }
    }
    return found;
}

/**
 * Syntax coloring for the docs site's code blocks and the playground's
 * editor. Code sits on basalt in both themes, and its roles come from the
 * brand's code tokens: keywords, bindings, tags, attributes, literals,
 * strings, and comments. A template tagged `html` is read as markup, so its
 * tags and attributes are colored and its `${}` bindings and binding
 * prefixes stand out as the live parts; a `css` template is read as styles;
 * JSX in `.tsx` and `.jsx` is read the same way as an `html` template.
 */

/** `text` is the text content of markup: drawn like `plain`, but never read as identifiers. */
export type TokenKind = "plain" | "text" | "keyword" | "string" | "comment" | "binding" | "tag" | "attribute" | "literal";

export interface Token
{
    kind: TokenKind;
    text: string;
}

const scriptKeywords = new Set([
    "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "declare", "default",
    "delete", "do", "else", "enum", "export", "extends", "finally", "for", "from", "function", "get", "if", "implements",
    "import", "in", "infer", "instanceof", "interface", "is", "keyof", "let", "namespace", "new", "of", "override",
    "private", "protected", "public", "readonly", "return", "satisfies", "set", "static", "super", "switch", "this", "throw",
    "try", "type", "typeof", "var", "void", "while", "yield"
]);

const literals = new Set(["true", "false", "null", "undefined"]);

/** Words that are keywords only where a statement or declaration can start them, not as names. */
const contextual = new Set(["as", "async", "declare", "from", "get", "infer", "is", "keyof", "namespace", "of", "satisfies", "set", "type"]);

/** A slash after one of these starts a regular expression; after anything else, including the `<` of a JSX closing tag, it does not. */
const regexPrecedes = /[(,=:[!&|?{;+\-*%~^]$/;

/** A `<` after one of these opens a JSX element; after a name it is a comparison or a type argument. */
const jsxPrecedes = /(?:[(,=:[!&|?{;]|=>)$/;

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

/** What the static text of a template is read as, and where a markup or style reading stands between its parts. */
interface Template
{
    kind: "html" | "css" | "text";
    /** The brace depth of the code around the template when its current `${}` opened. */
    depth: number;
    markup: MarkupState;
    styles: StyleState;
}

interface MarkupState
{
    /** Inside a start or end tag, between its name and its `>`. */
    inTag: boolean;
    /** The quote of an attribute value still open, or an empty string. */
    quote: string;
}

interface StyleState
{
    /** How many blocks are open; a name before a colon inside a block is a property. */
    blocks: number;
}

/** Colors markup: tag names, attribute names with their binding prefixes, and quoted values. The state carries over the `${}` parts of a template. */
function markup(text: string, state: MarkupState, tokens: Token[]): void
{
    let index = 0;
    while (index < text.length)
    {
        if (state.quote !== "")
        {
            const end = text.indexOf(state.quote, index);
            if (end === -1)
            {
                push(tokens, "string", text.slice(index));
                return;
            }
            push(tokens, "string", text.slice(index, end + 1));
            state.quote = "";
            index = end + 1;
            continue;
        }
        const character = text[index] ?? "";
        if (state.inTag)
        {
            if (character === ">")
            {
                push(tokens, "plain", ">");
                state.inTag = false;
                index += 1;
                continue;
            }
            if (character === "\"" || character === "'")
            {
                push(tokens, "string", character);
                state.quote = character;
                index += 1;
                continue;
            }
            const name = /^([@.?]?)([A-Za-z_:][\w:.-]*)/.exec(text.slice(index));
            if (name !== null)
            {
                push(tokens, "binding", name[1] ?? "");
                push(tokens, "attribute", name[2] ?? "");
                index += name[0].length;
                continue;
            }
            push(tokens, "plain", character);
            index += 1;
            continue;
        }
        if (text.startsWith("<!--", index))
        {
            const end = text.indexOf("-->", index);
            const stop = end === -1 ? text.length : end + 3;
            push(tokens, "comment", text.slice(index, stop));
            index = stop;
            continue;
        }
        const tag = /^<\/?([A-Za-z][\w:-]*)/.exec(text.slice(index));
        if (tag !== null)
        {
            push(tokens, "plain", tag[0].slice(0, tag[0].length - (tag[1] ?? "").length));
            push(tokens, "tag", tag[1] ?? "");
            state.inTag = true;
            index += tag[0].length;
            continue;
        }
        const next = text.indexOf("<", index + 1);
        const stop = next === -1 ? text.length : next;
        push(tokens, "text", text.slice(index, stop));
        index = stop;
    }
}

/** Colors styles: at-rules, selectors, property names, quoted values, numbers, and comments. The state carries over the `${}` parts of a template. */
function styles(text: string, state: StyleState, tokens: Token[]): void
{
    let index = 0;
    while (index < text.length)
    {
        const character = text[index] ?? "";
        const rest = text.slice(index);
        if (rest.startsWith("/*"))
        {
            const end = text.indexOf("*/", index + 2);
            const stop = end === -1 ? text.length : end + 2;
            push(tokens, "comment", text.slice(index, stop));
            index = stop;
        }
        else if (character === "\"" || character === "'")
        {
            const stop = quoted(text, index);
            push(tokens, "string", text.slice(index, stop));
            index = stop;
        }
        else if (character === "@" || rest.startsWith("!important"))
        {
            const word = /^[@!][\w-]+/.exec(rest)?.[0] ?? character;
            push(tokens, "keyword", word);
            index += word.length;
        }
        else if (character === "{" || character === "}")
        {
            state.blocks = Math.max(0, state.blocks + (character === "{" ? 1 : -1));
            push(tokens, "plain", character);
            index += 1;
        }
        else if (state.blocks > 0 && /^-*[A-Za-z][\w-]*\s*:(?!:)/.test(rest) && /(^|[;{\s])$/.test(text.slice(0, index)))
        {
            const name = /^-*[A-Za-z][\w-]*/.exec(rest)?.[0] ?? character;
            push(tokens, "attribute", name);
            index += name.length;
        }
        else if (/[\d.]/.test(character) && /^\.?\d/.test(rest) && !/[\w-]$/.test(text.slice(0, index)))
        {
            const number = /^\d*\.?\d+(?:[a-z]+|%)?/i.exec(rest)?.[0] ?? character;
            push(tokens, "literal", number);
            index += number.length;
        }
        else if (state.blocks === 0 && /[A-Za-z:.#*[]/.test(character))
        {
            const selector = /^[^{,;]+/.exec(rest)?.[0] ?? character;
            push(tokens, "tag", selector.trimEnd());
            push(tokens, "plain", selector.slice(selector.trimEnd().length));
            index += selector.length;
        }
        else
        {
            push(tokens, "plain", character);
            index += 1;
        }
    }
}

/** The index of the `}` that closes the `{` at `start`, skipping strings, template text, and comments. */
function closingBrace(code: string, start: number): number
{
    let depth = 0;
    let index = start;
    while (index < code.length)
    {
        const character = code[index] ?? "";
        if (character === "\"" || character === "'")
        {
            index = quoted(code, index);
            continue;
        }
        if (character === "`")
        {
            index += 1;
            while (index < code.length && code[index] !== "`")
            {
                index += code[index] === "\\" ? 2 : 1;
            }
        }
        else if (code.startsWith("//", index))
        {
            const end = code.indexOf("\n", index);
            index = end === -1 ? code.length : end;
            continue;
        }
        else if (character === "{")
        {
            depth += 1;
        }
        else if (character === "}")
        {
            depth -= 1;
            if (depth === 0)
            {
                return index;
            }
        }
        index += 1;
    }
    return code.length;
}

/** Colors a JSX `{expression}`: the braces as a binding and the expression as script. Returns the index past the closing brace. */
function jsxExpression(code: string, start: number, tokens: Token[]): number
{
    const end = closingBrace(code, start);
    push(tokens, "binding", "{");
    for (const token of tokenizeScript(code.slice(start + 1, end), true))
    {
        push(tokens, token.kind, token.text);
    }
    push(tokens, "binding", code.slice(end, end + 1));
    return end + 1;
}

/** Colors one JSX element with its attributes and children, as an `html` template is colored. Returns the index past it. */
function jsxElement(code: string, start: number, tokens: Token[]): number
{
    const head = /^<([A-Za-z][\w.:-]*)?/.exec(code.slice(start))?.[0] ?? "<";
    push(tokens, "plain", "<");
    push(tokens, "tag", head.slice(1));
    let index = start + head.length;
    while (index < code.length)
    {
        const character = code[index] ?? "";
        if (code.startsWith("/>", index))
        {
            push(tokens, "plain", "/>");
            return index + 2;
        }
        if (character === ">")
        {
            push(tokens, "plain", ">");
            index += 1;
            break;
        }
        if (character === "{")
        {
            index = jsxExpression(code, index, tokens);
            continue;
        }
        if (character === "\"" || character === "'")
        {
            const end = code.indexOf(character, index + 1);
            const stop = end === -1 ? code.length : end + 1;
            push(tokens, "string", code.slice(index, stop));
            index = stop;
            continue;
        }
        const name = /^(?:(on|prop|bool):)?([A-Za-z_][\w-]*)/.exec(code.slice(index));
        if (name !== null)
        {
            push(tokens, "binding", name[1] === undefined ? "" : `${name[1]}:`);
            push(tokens, "attribute", name[2] ?? "");
            index += name[0].length;
            continue;
        }
        push(tokens, "plain", character);
        index += 1;
    }
    while (index < code.length)
    {
        if (code.startsWith("</", index))
        {
            const close = /^<\/([A-Za-z][\w.:-]*)?\s*>/.exec(code.slice(index));
            if (close === null)
            {
                push(tokens, "plain", "</");
                return index + 2;
            }
            push(tokens, "plain", "</");
            push(tokens, "tag", close[1] ?? "");
            push(tokens, "plain", close[0].slice(2 + (close[1] ?? "").length));
            return index + close[0].length;
        }
        const character = code[index] ?? "";
        if (character === "<")
        {
            index = jsxElement(code, index, tokens);
            continue;
        }
        if (character === "{")
        {
            index = jsxExpression(code, index, tokens);
            continue;
        }
        let stop = index;
        while (stop < code.length && code[stop] !== "<" && code[stop] !== "{")
        {
            stop += 1;
        }
        push(tokens, "text", code.slice(index, stop));
        index = stop;
    }
    return index;
}

/** Colors the static text of a template up to its end or its next `${`, and returns the index where that is. */
function templateText(code: string, start: number, template: Template, tokens: Token[]): number
{
    let stop = start;
    while (stop < code.length && code[stop] !== "`" && !(code[stop] === "$" && code[stop + 1] === "{"))
    {
        stop += code[stop] === "\\" ? 2 : 1;
    }
    const text = code.slice(start, stop);
    if (template.kind === "html")
    {
        markup(text, template.markup, tokens);
    }
    else if (template.kind === "css")
    {
        styles(text, template.styles, tokens);
    }
    else
    {
        push(tokens, "string", text);
    }
    return stop;
}

/** Splits script source into tokens, following template literals into their `${}` expressions and, with `jsx`, JSX into its elements. */
export function tokenizeScript(code: string, jsx = false): Token[]
{
    const tokens: Token[] = [];
    let index = 0;
    const templates: Template[] = [];
    let depth = 0;
    while (index < code.length)
    {
        const character = code[index] ?? "";
        const next = code[index + 1] ?? "";
        const open = templates.at(-1);
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
        else if (character === "`" || (character === "}" && open !== undefined && open.depth === depth))
        {
            let template: Template;
            if (character === "`")
            {
                const tag = tokens.at(-1)?.text ?? "";
                const kind = tag.endsWith("html") && /^\W?html$/.test(tag.slice(-5)) ? "html" : tag.endsWith("css") && /^\W?css$/.test(tag.slice(-4)) ? "css" : "text";
                template = { kind, depth, markup: { inTag: false, quote: "" }, styles: { blocks: 0 } };
                push(tokens, "string", "`");
            }
            else
            {
                template = templates.pop() ?? { kind: "text", depth, markup: { inTag: false, quote: "" }, styles: { blocks: 0 } };
                push(tokens, template.kind === "text" ? "string" : "binding", "}");
            }
            const stop = templateText(code, index + 1, template, tokens);
            if (code[stop] === "$")
            {
                push(tokens, template.kind === "text" ? "string" : "binding", "${");
                template.depth = depth;
                templates.push(template);
                index = stop + 2;
            }
            else
            {
                push(tokens, "string", code.slice(stop, stop + 1));
                index = stop + 1;
            }
        }
        else if (jsx && character === "<" && /[A-Za-z>]/.test(next) && jsxPrecedes.test(lastSignificant(tokens)))
        {
            index = jsxElement(code, index, tokens);
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
        else if (/\d/.test(character) && !/[\w$]/.test(code[index - 1] ?? ""))
        {
            const number = /^(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)n?/.exec(code.slice(index))?.[0] ?? character;
            push(tokens, "literal", number);
            index += number.length;
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
            push(tokens, literals.has(word) && !member ? "literal" : keyword ? "keyword" : "plain", word);
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
    const parts = code.split(/("(?:[^"\\]|\\.)*")/);
    for (const [index, part] of parts.entries())
    {
        if (part.startsWith("\""))
        {
            push(tokens, /^\s*:/.test(parts[index + 1] ?? "") ? "attribute" : "string", part);
            continue;
        }
        for (const word of part.split(/\b(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/))
        {
            push(tokens, /^(true|false|null|-?\d)/.test(word) ? "literal" : "plain", word);
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
        case "js":
        case "mjs":
        case "typescript":
        case "javascript":
            return tokenizeScript(code);
        case "tsx":
        case "jsx":
            return tokenizeScript(code, true);
        case "html":
        case "xml":
        case "svg":
        {
            const tokens: Token[] = [];
            markup(code, { inTag: false, quote: "" }, tokens);
            return tokens;
        }
        case "css":
        {
            const tokens: Token[] = [];
            styles(code, { blocks: 0 }, tokens);
            return tokens;
        }
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

const classes: Record<TokenKind, string> = { plain: "", text: "", keyword: "k", string: "s", comment: "c", binding: "b", tag: "t", attribute: "a", literal: "n" };

/** A code block's HTML, with every colored token wrapped in a span whose class names its role. */
export function highlight(code: string, language: string): string
{
    return tokenize(code, language)
        .map((token) => (classes[token.kind] === "" ? escapeHtml(token.text) : `<span class="${classes[token.kind]}">${escapeHtml(token.text)}</span>`))
        .join("");
}

/** The identifiers a script uses outside its strings and comments, including those inside `${}` expressions and JSX tags. */
export function identifiers(code: string): Set<string>
{
    const found = new Set<string>();
    for (const token of tokenizeScript(code, true))
    {
        if (token.kind === "plain" || token.kind === "tag")
        {
            for (const match of token.text.matchAll(/[A-Za-z_$][\w$]*/g))
            {
                found.add(match[0]);
            }
        }
    }
    return found;
}

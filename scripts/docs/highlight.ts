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
export type TokenKind = "plain" | "text" | "keyword" | "string" | "comment" | "binding" | "tag" | "attribute" | "literal" | "function" | "type" | "signal";

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
export function escapeHtml(text: string): string
{
    return text.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

const classes: Record<TokenKind, string> = {
    plain: "", text: "", keyword: "k", string: "s", comment: "c", binding: "b", tag: "t", attribute: "a", literal: "n", function: "f", type: "y", signal: "g"
};

/** What a name is in a block of code. */
type Role = "type" | "function" | "signal";

const primitives = new Set(["string", "number", "boolean", "bigint", "symbol", "object", "unknown", "never", "any"]);

/** After a name: a call, a tagged template, or a call with type arguments. */
const called = /^(?:\s*\(|`|\s*<[\w\s,.[\]|&"']*(?:<[\w\s,.[\]|&"']*>)?[\w\s,.[\]|&"']*>\s*\()/;

/** After a name: an arrow function or a function expression assigned to it. */
const assignedFunction = /^\s*=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>|^\s*=\s*(?:async\s+)?function\b/;

/** After a name: a signal, a computed value, or a resource assigned to it. */
const assignedSignal = /^\s*=\s*(?:signal|computed|resource)\s*[<(]/;

/** After a name: a read or a write of it as a signal, or of a resource's own signals. */
const signalUse = /^\.(?:get|set)\s*\(|^\.(?:status|pending|error)\.get\s*\(|^\.reload\s*\(/;

/** After a name: an array type, or type arguments that do not start a call. */
const typeAfter = /^\[\]|^<[\w\s,.[\]|&"'{}:;?]*>(?!\s*\()/;

/** A name in capitals, such as `ORBIT`, which reads as a constant. */
const constant = /^[A-Z][A-Z\d_]+$/;

/** Keywords that make the name after them a type. */
const typeKeywords = new Set(["interface", "type", "class", "enum", "extends", "implements", "as", "new", "keyof"]);

/** The keyword a name directly follows, with nothing but whitespace between. */
function keywordBefore(tokens: Token[], index: number, lead: string): string
{
    return /^\s*$/.test(lead) && tokens[index - 1]?.kind === "keyword" ? (tokens[index - 1]?.text ?? "") : "";
}

/**
 * Whether the colon at `colon` annotates a type rather than following an
 * object's key: it comes after a closing parenthesis, as a return type does,
 * or sits in a parameter list, a block, or an interface's body, which in
 * this code open on their own line or after `)` or `=>`.
 */
function annotates(code: string, colon: number): boolean
{
    if (code.slice(0, colon).trimEnd().endsWith(")"))
    {
        return true;
    }
    let depth = 0;
    for (let index = colon - 1; index >= 0; index--)
    {
        const character = code[index] ?? "";
        if (")]}".includes(character))
        {
            depth += 1;
        }
        else if ("([{".includes(character))
        {
            if (depth > 0)
            {
                depth -= 1;
                continue;
            }
            if (character !== "{")
            {
                return character === "(";
            }
            const lead = /[^\S\n]*$/.exec(code.slice(0, index))?.index ?? index;
            const before = code.slice(0, lead);
            return before === "" || /(?:\n|\)|=>|\b(?:else|try|finally|do))$/.test(before);
        }
    }
    return true;
}

/**
 * Colors the names in script code by what each one is in the block, so a
 * name looks the same at its import, its declaration, and every use. A name
 * created with `signal`, `computed`, or `resource`, or read with `get` and
 * `set`, is a signal; one called, declared as a function, or used as a JSX
 * tag is a function; one with a type's evidence, such as a `type` import, an
 * annotation, or type arguments, is a type; and any other capitalized name,
 * such as a component or a class passed by reference, is a function too. A
 * method call such as `.get()` is a function, and a name in capitals is a
 * constant.
 */
function refine(tokens: Token[]): Token[]
{
    const code = tokens.map((token) => token.text).join("");
    const evidence = new Map<string, Set<Role>>();
    const note = (word: string, role: Role): void =>
    {
        const found = evidence.get(word) ?? new Set<Role>();
        found.add(role);
        evidence.set(word, found);
    };
    for (const match of code.matchAll(/\bimport\s+type\s*\{([^}]*)\}/g))
    {
        for (const name of (match[1] ?? "").split(","))
        {
            note(name.trim().split(/\s+as\s+/).at(-1) ?? "", "type");
        }
    }
    let offset = 0;
    for (const [index, token] of tokens.entries())
    {
        if (token.kind === "tag" && /^[A-Z]/.test(token.text))
        {
            note(token.text, "function");
        }
        else if (token.kind === "plain")
        {
            for (const match of token.text.matchAll(/[A-Za-z_$][\w$]*/g))
            {
                const start = offset + (match.index ?? 0);
                const word = match[0];
                const after = code.slice(start + word.length);
                const keyword = keywordBefore(tokens, index, token.text.slice(0, match.index));
                const before = code.slice(0, start).trimEnd();
                if ((code[start - 1] === "." && code[start - 2] !== ".") || /^\s*:(?!:)/.test(after))
                {
                    continue;
                }
                if (assignedSignal.test(after) || signalUse.test(after))
                {
                    note(word, "signal");
                }
                else if (typeKeywords.has(keyword) || typeAfter.test(after) || /[<|&]$/.test(before)
                    || (before.endsWith(":") && annotates(code, before.length - 1)))
                {
                    note(word, "type");
                }
                else if (called.test(after) || assignedFunction.test(after) || keyword === "function")
                {
                    note(word, "function");
                }
            }
        }
        offset += token.text.length;
    }
    const roleOf = (word: string): Role | undefined =>
    {
        const found = evidence.get(word);
        if (found?.has("signal") === true)
        {
            return "signal";
        }
        if (found?.has("function") === true)
        {
            return "function";
        }
        if (found?.has("type") === true)
        {
            return "type";
        }
        return /^[A-Z]/.test(word) && !constant.test(word) ? "function" : undefined;
    };
    const refined: Token[] = [];
    offset = 0;
    for (const token of tokens)
    {
        if (token.kind === "tag" && /^[A-Z]/.test(token.text))
        {
            push(refined, "function", token.text);
        }
        else if (token.kind !== "plain")
        {
            refined.push({ ...token });
        }
        else
        {
            let last = 0;
            for (const match of token.text.matchAll(/[A-Za-z_$][\w$]*/g))
            {
                const at = match.index ?? 0;
                const start = offset + at;
                const word = match[0];
                const after = code.slice(start + word.length);
                const member = code[start - 1] === "." && code[start - 2] !== ".";
                const key = /^\s*:(?!:)/.test(after);
                const before = code.slice(0, start).trimEnd().at(-1) ?? "";
                let kind: TokenKind = "plain";
                if (member)
                {
                    kind = called.test(after) ? "function" : "plain";
                }
                else if (!key)
                {
                    kind = roleOf(word) ?? (constant.test(word) ? "literal" : primitives.has(word) && /[:<|&,]/.test(before) ? "type" : "plain");
                }
                push(refined, "plain", token.text.slice(last, at));
                push(refined, kind, word);
                last = at + word.length;
            }
            push(refined, "plain", token.text.slice(last));
        }
        offset += token.text.length;
    }
    return refined;
}

const scripts = new Set(["ts", "tsx", "js", "jsx", "mjs", "typescript", "javascript"]);

/** A code block's HTML, with every colored token wrapped in a span whose class names its role. */
export function highlight(code: string, language: string): string
{
    const tokens = tokenize(code, language);
    return (scripts.has(language) ? refine(tokens) : tokens)
        .map((token) => (classes[token.kind] === "" ? escapeHtml(token.text) : `<span class="${classes[token.kind]}">${escapeHtml(token.text)}</span>`))
        .join("");
}

/**
 * The identifiers a script uses outside its strings and comments, including
 * those inside `${}` expressions and JSX tags. A property name after a dot is
 * not one, since it never names a binding; a spread such as `...rest` is.
 */
export function identifiers(code: string): Set<string>
{
    const found = new Set<string>();
    let tail = "";
    for (const token of tokenizeScript(code, true))
    {
        if (token.kind === "plain" || token.kind === "tag")
        {
            for (const match of token.text.matchAll(/[A-Za-z_$][\w$]*/g))
            {
                const preceding = (tail + token.text.slice(0, match.index)).slice(-2);
                if (!preceding.endsWith(".") || preceding === "..")
                {
                    found.add(match[0]);
                }
            }
        }
        tail = (tail + token.text).slice(-2);
    }
    return found;
}

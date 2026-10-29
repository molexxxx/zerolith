/**
 * The message compiler: MessageFormat 2 catalogs in, one module per locale
 * out, with a plain function per message whose arguments are typed from
 * the placeholders. Formatting and plural selection call `Intl` in the
 * generated module, so no message runtime is shipped. The subset
 * implemented is the one catalogs use: text and placeholders, quoted and
 * unquoted literals, `.input` and `.local` declarations, `.match` with
 * numeric and string selectors, and the default functions `:string`,
 * `:number`, `:integer`, `:percent`, `:currency`, `:offset`, `:date`,
 * `:time`, and `:datetime`. Markup is accepted and formats to nothing.
 */

/** A catalog: message key to MessageFormat 2 source. */
export type Catalog = Readonly<Record<string, string>>;

/** Options for `compileMessages`. */
export interface CompileOptions
{
    /** `ts` emits TypeScript (the default); `js` emits JavaScript with JSDoc types for buildless projects. */
    language?: "ts" | "js";
    /** Named in the generated header. */
    source?: string;
}

/** The result of compiling one catalog. */
export interface CompiledCatalog
{
    code: string;
    /** The message keys as function names, in source order. */
    names: string[];
}

type ArgumentType = "number" | "date" | "string";

interface Literal
{
    kind: "literal";
    value: string;
}

interface Variable
{
    kind: "variable";
    name: string;
}

interface Expression
{
    operand: Literal | Variable | undefined;
    fn: string | undefined;
    options: Record<string, Literal | Variable>;
}

type Part = string | Expression;

interface Variant
{
    keys: string[];
    pattern: Part[];
}

interface Message
{
    declarations: Map<string, { expression: Expression; local: boolean }>;
    pattern: Part[] | undefined;
    selectors: Expression[];
    variants: Variant[];
}

class Parser
{
    private index = 0;
    private readonly text: string;
    private readonly key: string;

    constructor(text: string, key: string)
    {
        this.text = text;
        this.key = key;
    }

    private fail(message: string): never
    {
        throw new Error(`zerolith/i18n: message "${this.key}": ${message} at offset ${this.index}`);
    }

    private peek(offset = 0): string
    {
        return this.text.charAt(this.index + offset);
    }

    private skipSpace(): void
    {
        while (/[ \t\r\n　]/.test(this.peek()))
        {
            this.index++;
        }
    }

    private expect(token: string): void
    {
        if (!this.text.startsWith(token, this.index))
        {
            this.fail(`expected ${JSON.stringify(token)}`);
        }
        this.index += token.length;
    }

    private name(): string
    {
        const match = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(this.text.slice(this.index));
        if (match === null)
        {
            this.fail("expected a name");
        }
        this.index += match[0].length;
        return match[0];
    }

    private literal(): Literal
    {
        if (this.peek() === "|")
        {
            this.index++;
            let value = "";
            while (this.index < this.text.length && this.peek() !== "|")
            {
                if (this.peek() === "\\")
                {
                    value += this.peek(1);
                    this.index += 2;
                }
                else
                {
                    value += this.peek();
                    this.index++;
                }
            }
            this.expect("|");
            return { kind: "literal", value };
        }
        const match = /^[A-Za-z0-9_.+:@%-]+/.exec(this.text.slice(this.index));
        if (match === null)
        {
            this.fail("expected a literal");
        }
        this.index += match[0].length;
        return { kind: "literal", value: match[0] };
    }

    private variable(): Variable
    {
        this.expect("$");
        return { kind: "variable", name: this.name() };
    }

    /** Parses the inside of `{ ... }` after the opening brace. */
    private expression(): Expression | undefined
    {
        this.skipSpace();
        if (this.peek() === "#" || this.peek() === "/")
        {
            while (this.index < this.text.length && this.peek() !== "}")
            {
                this.index++;
            }
            this.expect("}");
            return undefined;
        }
        let operand: Literal | Variable | undefined;
        if (this.peek() === "$")
        {
            operand = this.variable();
        }
        else if (this.peek() !== ":")
        {
            operand = this.literal();
        }
        this.skipSpace();
        let fn: string | undefined;
        const options: Record<string, Literal | Variable> = {};
        if (this.peek() === ":")
        {
            this.index++;
            fn = this.name();
            this.skipSpace();
            while (this.peek() !== "}" && this.peek() !== "@" && this.index < this.text.length)
            {
                const option = this.name();
                this.skipSpace();
                this.expect("=");
                this.skipSpace();
                options[option] = this.peek() === "$" ? this.variable() : this.literal();
                this.skipSpace();
            }
        }
        while (this.peek() === "@")
        {
            this.index++;
            this.name();
            this.skipSpace();
            if (this.peek() === "=")
            {
                this.index++;
                this.skipSpace();
                if (this.peek() === "$")
                {
                    this.variable();
                }
                else
                {
                    this.literal();
                }
                this.skipSpace();
            }
        }
        this.expect("}");
        if (operand === undefined && fn === undefined)
        {
            this.fail("an expression needs an operand or a function");
        }
        return { operand, fn, options };
    }

    /** Parses pattern text up to `end` (`}}` for quoted patterns, the end of input for simple ones). */
    private pattern(quoted: boolean): Part[]
    {
        const parts: Part[] = [];
        let text = "";
        while (this.index < this.text.length)
        {
            const char = this.peek();
            if (quoted && char === "}" && this.peek(1) === "}")
            {
                break;
            }
            if (char === "\\")
            {
                const next = this.peek(1);
                if (next !== "{" && next !== "}" && next !== "\\" && next !== "|")
                {
                    this.fail("only \\{ \\} \\\\ and \\| can be escaped");
                }
                text += next;
                this.index += 2;
            }
            else if (char === "{")
            {
                if (text !== "")
                {
                    parts.push(text);
                    text = "";
                }
                this.index++;
                const expression = this.expression();
                if (expression !== undefined)
                {
                    parts.push(expression);
                }
            }
            else if (char === "}")
            {
                this.fail("a lone } must be escaped as \\}");
            }
            else
            {
                text += char;
                this.index++;
            }
        }
        if (text !== "")
        {
            parts.push(text);
        }
        return parts;
    }

    private quotedPattern(): Part[]
    {
        this.expect("{{");
        const parts = this.pattern(true);
        this.expect("}}");
        return parts;
    }

    parse(): Message
    {
        const message: Message = { declarations: new Map(), pattern: undefined, selectors: [], variants: [] };
        const trimmed = this.text.trimStart();
        if (!trimmed.startsWith(".") && !trimmed.startsWith("{{"))
        {
            message.pattern = this.pattern(false);
            return message;
        }
        this.skipSpace();
        while (this.text.startsWith(".input", this.index) || this.text.startsWith(".local", this.index))
        {
            const local = this.text.startsWith(".local", this.index);
            this.index += 6;
            this.skipSpace();
            let name: string;
            if (local)
            {
                name = this.variable().name;
                this.skipSpace();
                this.expect("=");
                this.skipSpace();
            }
            else
            {
                name = "";
            }
            this.expect("{");
            const expression = this.expression();
            if (expression === undefined)
            {
                this.fail("a declaration cannot be markup");
            }
            if (!local)
            {
                if (expression.operand?.kind !== "variable")
                {
                    this.fail(".input needs a variable operand");
                }
                name = expression.operand.name;
            }
            if (message.declarations.has(name))
            {
                this.fail(`$${name} is declared twice`);
            }
            message.declarations.set(name, { expression, local });
            this.skipSpace();
        }
        if (this.text.startsWith(".match", this.index))
        {
            this.index += 6;
            this.skipSpace();
            while (this.peek() === "$" || this.peek() === "{")
            {
                if (this.peek() === "{")
                {
                    this.index++;
                    const expression = this.expression();
                    if (expression === undefined)
                    {
                        this.fail("a selector cannot be markup");
                    }
                    message.selectors.push(expression);
                }
                else
                {
                    message.selectors.push({ operand: this.variable(), fn: undefined, options: {} });
                }
                this.skipSpace();
            }
            if (message.selectors.length === 0)
            {
                this.fail(".match needs at least one selector");
            }
            while (this.index < this.text.length)
            {
                const keys: string[] = [];
                while (this.peek() !== "{")
                {
                    if (this.peek() === "*")
                    {
                        this.index++;
                        keys.push("*");
                    }
                    else
                    {
                        keys.push(this.literal().value);
                    }
                    this.skipSpace();
                }
                if (keys.length !== message.selectors.length)
                {
                    this.fail(`a variant needs ${message.selectors.length} key(s), found ${keys.length}`);
                }
                message.variants.push({ keys, pattern: this.quotedPattern() });
                this.skipSpace();
            }
            if (!message.variants.some((variant) => variant.keys.every((key) => key === "*")))
            {
                this.fail("a matcher needs a variant whose keys are all *");
            }
            return message;
        }
        message.pattern = this.quotedPattern();
        this.skipSpace();
        if (this.index < this.text.length)
        {
            this.fail("unexpected text after the pattern");
        }
        return message;
    }
}

const NUMBER_FUNCTIONS = new Set(["number", "integer", "percent", "currency", "offset"]);
const DATE_FUNCTIONS = new Set(["date", "time", "datetime"]);
const NUMBER_OPTIONS: Record<string, string> = {
    minimumFractionDigits: "minimumFractionDigits",
    maximumFractionDigits: "maximumFractionDigits",
    minimumIntegerDigits: "minimumIntegerDigits",
    minimumSignificantDigits: "minimumSignificantDigits",
    maximumSignificantDigits: "maximumSignificantDigits",
    signDisplay: "signDisplay",
    trailingZeroDisplay: "trailingZeroDisplay",
    roundingMode: "roundingMode",
    roundingIncrement: "roundingIncrement",
    roundingPriority: "roundingPriority",
    currencyDisplay: "currencyDisplay",
    currencySign: "currencySign",
    numberingSystem: "numberingSystem"
};

function identifier(key: string): string
{
    const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter((word) => word !== "");
    const name = words.map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1))).join("");
    return /^[0-9]/.test(name) ? `_${name}` : name === "" ? "_" : name;
}

class Emitter
{
    readonly arguments: Map<string, ArgumentType> = new Map();
    readonly locals: Map<string, string> = new Map();
    readonly prelude: string[] = [];
    private readonly key: string;
    private readonly message: Message;

    constructor(key: string, message: Message)
    {
        this.key = key;
        this.message = message;
    }

    private fail(text: string): never
    {
        throw new Error(`zerolith/i18n: message "${this.key}": ${text}`);
    }

    private argument(name: string, type: ArgumentType): string
    {
        const local = this.locals.get(name);
        if (local !== undefined)
        {
            return local;
        }
        const existing = this.arguments.get(name);
        if (existing === undefined || existing === "string")
        {
            this.arguments.set(name, type);
        }
        else if (existing !== type && type !== "string")
        {
            this.fail(`$${name} is used both as ${existing} and as ${type}`);
        }
        return `args.${name}`;
    }

    private optionValue(value: Literal | Variable | undefined): string | undefined
    {
        if (value === undefined)
        {
            return undefined;
        }
        return value.kind === "literal" ? JSON.stringify(value.value) : `String(${this.argument(value.name, "string")})`;
    }

    private numberOptions(expression: Expression): string
    {
        const entries: string[] = [];
        const fn = expression.fn ?? "number";
        if (fn === "integer")
        {
            entries.push("maximumFractionDigits: 0");
        }
        else if (fn === "percent")
        {
            entries.push("style: \"percent\"");
        }
        else if (fn === "currency")
        {
            const currency = this.optionValue(expression.options["currency"]);
            if (currency === undefined)
            {
                this.fail(":currency needs a currency option");
            }
            entries.push("style: \"currency\"", `currency: ${currency}`);
        }
        for (const [option, value] of Object.entries(expression.options))
        {
            const mapped = NUMBER_OPTIONS[option];
            if (mapped !== undefined)
            {
                const literal = value.kind === "literal" ? value.value : undefined;
                const numeric = literal !== undefined && /^[0-9]+$/.test(literal) ? literal : undefined;
                entries.push(`${mapped}: ${numeric ?? this.optionValue(value) ?? "undefined"}`);
            }
            else if (option === "useGrouping" && value.kind === "literal")
            {
                entries.push(`useGrouping: ${value.value === "never" ? "false" : value.value === "always" ? "true" : JSON.stringify(value.value)}`);
            }
            else if (option === "fractionDigits" && value.kind === "literal" && /^[0-9]+$/.test(value.value))
            {
                entries.push(`minimumFractionDigits: ${value.value}`, `maximumFractionDigits: ${value.value}`);
            }
        }
        return `{ ${entries.join(", ")} }`;
    }

    private dateOptions(expression: Expression): string
    {
        const entries: string[] = [];
        const fn = expression.fn ?? "date";
        const literal = (name: string): string | undefined =>
        {
            const value = expression.options[name];
            return value?.kind === "literal" ? value.value : undefined;
        };
        const length = literal(fn === "datetime" ? "dateLength" : "length") ?? (fn === "time" ? undefined : "medium");
        if (length !== undefined && fn !== "time")
        {
            entries.push(`dateStyle: ${JSON.stringify(length)}`);
        }
        const precision = literal(fn === "datetime" ? "timePrecision" : "precision") ?? (fn === "date" ? undefined : "minute");
        if (precision !== undefined && fn !== "date")
        {
            entries.push(`timeStyle: ${JSON.stringify(precision === "second" ? "medium" : "short")}`);
        }
        const zone = literal("timeZone");
        if (zone !== undefined && zone !== "input")
        {
            entries.push(`timeZone: ${JSON.stringify(zone)}`);
        }
        const hour12 = literal("hour12");
        if (hour12 !== undefined)
        {
            entries.push(`hour12: ${hour12 === "true"}`);
        }
        const style = literal("timeZoneStyle");
        if (style !== undefined)
        {
            entries.push(`timeZoneName: ${JSON.stringify(style)}`);
        }
        return `{ ${entries.join(", ")} }`;
    }

    /** The JavaScript for an expression's numeric value, before formatting. */
    private numeric(expression: Expression): string
    {
        const operand = expression.operand;
        let value: string;
        if (operand === undefined)
        {
            this.fail(`:${expression.fn ?? ""} needs an operand`);
        }
        else if (operand.kind === "literal")
        {
            value = Number.isFinite(Number(operand.value)) ? String(Number(operand.value)) : this.fail(`${JSON.stringify(operand.value)} is not a number`);
        }
        else
        {
            value = this.argument(operand.name, "number");
        }
        if (expression.fn === "offset")
        {
            const add = this.optionValue(expression.options["add"]);
            const subtract = this.optionValue(expression.options["subtract"]);
            if ((add === undefined) === (subtract === undefined))
            {
                this.fail(":offset needs exactly one of add or subtract");
            }
            value = `(${value} ${add === undefined ? "-" : "+"} Number(${add ?? subtract ?? "0"}))`;
        }
        return value;
    }

    /** Resolves a plain `{$x}` to its declaration when one exists. */
    private resolve(expression: Expression): Expression
    {
        if (expression.fn === undefined && expression.operand?.kind === "variable")
        {
            const declared = this.message.declarations.get(expression.operand.name);
            if (declared !== undefined && !declared.local)
            {
                return declared.expression;
            }
        }
        return expression;
    }

    /** The JavaScript producing the formatted string of an expression. */
    format(raw: Expression): string
    {
        const expression = this.resolve(raw);
        const fn = expression.fn;
        if (fn === undefined || fn === "string")
        {
            const operand = expression.operand;
            if (operand === undefined)
            {
                this.fail(":string needs an operand");
            }
            return operand.kind === "literal" ? JSON.stringify(operand.value) : `String(${this.argument(operand.name, "string")})`;
        }
        if (NUMBER_FUNCTIONS.has(fn))
        {
            return `number(${this.numeric(expression)}, ${this.numberOptions(expression)})`;
        }
        if (DATE_FUNCTIONS.has(fn))
        {
            const operand = expression.operand;
            if (operand === undefined)
            {
                this.fail(`:${fn} needs an operand`);
            }
            const value = operand.kind === "literal" ? `new Date(${JSON.stringify(operand.value)})` : this.argument(operand.name, "date");
            return `date(${value}, ${this.dateOptions(expression)})`;
        }
        this.fail(`unknown function :${fn}`);
    }

    /** The JavaScript for a selector: its comparable value and the categories it matches. */
    selector(raw: Expression): string
    {
        const expression = this.resolve(raw);
        const fn = expression.fn ?? "string";
        if (NUMBER_FUNCTIONS.has(fn))
        {
            const select = expression.options["select"];
            const mode = select?.kind === "literal" ? select.value : "plural";
            const value = fn === "percent" ? `(${this.numeric(expression)}) * 100` : this.numeric(expression);
            if (mode === "exact")
            {
                return `{ value: String(${value}), categories: [] }`;
            }
            return `{ value: String(${value}), categories: [plural(${value}, ${JSON.stringify(mode === "ordinal" ? "ordinal" : "cardinal")})] }`;
        }
        if (fn === "string")
        {
            const operand = expression.operand;
            if (operand === undefined)
            {
                this.fail("a selector needs an operand");
            }
            const value = operand.kind === "literal" ? JSON.stringify(operand.value) : `String(${this.argument(operand.name, "string")})`;
            return `{ value: ${value}, categories: [] }`;
        }
        this.fail(`:${fn} cannot select`);
    }

    pattern(parts: Part[]): string
    {
        if (parts.length === 0)
        {
            return "\"\"";
        }
        return parts.map((part) => (typeof part === "string" ? JSON.stringify(part) : this.format(part))).join(" + ");
    }

    body(): string
    {
        for (const [name, declaration] of this.message.declarations)
        {
            if (declaration.local)
            {
                const value = this.format(declaration.expression);
                this.locals.set(name, `local_${name}`);
                this.prelude.push(`const local_${name} = ${value};`);
            }
        }
        if (this.message.pattern !== undefined)
        {
            return this.pattern(this.message.pattern);
        }
        const selectors = this.message.selectors.map((selector) => this.selector(selector));
        const variants = this.message.variants.map((variant) => `{ keys: ${JSON.stringify(variant.keys)}, pattern: () => ${this.pattern(variant.pattern)} }`);
        return `select([${selectors.join(", ")}], [${variants.join(", ")}])`;
    }
}

const HELPERS = `const formats = new Map();
function cached(kind, options, create)
{
    const key = kind + JSON.stringify(options);
    let instance = formats.get(key);
    if (instance === undefined)
    {
        instance = create();
        formats.set(key, instance);
    }
    return instance;
}
function number(value, options)
{
    return cached("n", options, () => new Intl.NumberFormat(locale, options)).format(value);
}
function date(value, options)
{
    return cached("d", options, () => new Intl.DateTimeFormat(locale, options)).format(value);
}
function plural(value, type)
{
    return cached("p", { type }, () => new Intl.PluralRules(locale, { type })).select(value);
}
function select(selectors, variants)
{
    let best;
    let bestRank;
    for (const variant of variants)
    {
        const rank = [];
        let matches = true;
        for (const [index, key] of variant.keys.entries())
        {
            const selector = selectors[index];
            if (key === "*")
            {
                rank.push(0);
            }
            else if (key === selector.value)
            {
                rank.push(2);
            }
            else if (selector.categories.includes(key))
            {
                rank.push(1);
            }
            else
            {
                matches = false;
                break;
            }
        }
        if (!matches)
        {
            continue;
        }
        if (bestRank === undefined || rank.some((score, index) => score > bestRank[index] && rank.slice(0, index).every((earlier, position) => earlier === bestRank[position])))
        {
            best = variant;
            bestRank = rank;
        }
    }
    return best === undefined ? "" : best.pattern();
}`;

function typeOf(type: ArgumentType): string
{
    return type === "number" ? "number" : type === "date" ? "Date | number" : "string | number";
}

/**
 * Compiles one locale's catalog into a module: `locale`, one exported
 * function per message named from its key, and the `Intl` helpers they
 * share. Each function takes an `args` object typed from the message's
 * placeholders, or nothing when the message has none.
 */
export function compileMessages(locale: string, catalog: Catalog, options: CompileOptions = {}): CompiledCatalog
{
    const javascript = options.language === "js";
    const out: string[] = [];
    out.push(`// Generated by @zerolith/i18n from ${options.source ?? `the ${locale} catalog`}. Do not edit; regenerate instead.`);
    if (javascript)
    {
        out.push("// @ts-check");
    }
    out.push(`export const locale${javascript ? "" : ": string"} = ${JSON.stringify(locale)};`);
    out.push("");
    out.push(javascript ? HELPERS : HELPERS.replace(/^function (\w+)\(([^)]*)\)/gm, (_match, name: string, params: string) => `function ${name}(${params.split(", ").filter((p) => p !== "").map((p) => `${p}: any`).join(", ")}): any`).replace("const formats = new Map();", "const formats: Map<string, any> = new Map();").replace("let best;", "let best: any;").replace("let bestRank;", "let bestRank: any;").replace("const rank = [];", "const rank: number[] = [];"));
    out.push("");
    const names: string[] = [];
    const seen = new Set<string>();
    for (const [key, source] of Object.entries(catalog))
    {
        const name = identifier(key);
        if (seen.has(name))
        {
            throw new Error(`zerolith/i18n: keys "${key}" and another one both become ${name}`);
        }
        seen.add(name);
        names.push(name);
        const message = new Parser(source, key).parse();
        const emitter = new Emitter(key, message);
        const body = emitter.body();
        const args = [...emitter.arguments.entries()].toSorted(([a], [b]) => a.localeCompare(b));
        const doc = source.replace(/\*\//g, "* /").split(/\r?\n/).map((line) => ` * ${line}`.trimEnd()).join("\n");
        const argumentType = `{ ${args.map(([argument, type]) => `${argument}: ${typeOf(type)}`).join("; ")} }`;
        if (javascript)
        {
            out.push(`/**\n${doc}${args.length > 0 ? `\n * @param {${argumentType}} args` : ""}\n * @returns {string}\n */`);
            out.push(`export function ${name}(${args.length > 0 ? "args" : ""})`);
        }
        else
        {
            out.push(`/**\n${doc}\n */`);
            out.push(`export function ${name}(${args.length > 0 ? `args: ${argumentType}` : ""}): string`);
        }
        out.push("{");
        for (const line of emitter.prelude)
        {
            out.push(`    ${line}`);
        }
        out.push(`    return ${body};`);
        out.push("}");
        out.push("");
    }
    return { code: out.join("\n"), names };
}

/** The keys of a catalog as function names, for comparing locales. */
export function messageNames(catalog: Catalog): string[]
{
    return Object.keys(catalog).map(identifier);
}

/**
 * The index module for a set of locales: the list of locales and one lazy
 * loader per locale, so each locale is its own chunk.
 */
export function compileIndex(locales: readonly string[], options: CompileOptions = {}): string
{
    const javascript = options.language === "js";
    const extension = javascript ? "js" : "ts";
    const lines = [`// Generated by @zerolith/i18n. Do not edit; regenerate instead.`];
    if (javascript)
    {
        lines.push("// @ts-check");
    }
    lines.push(`export const locales${javascript ? "" : ": readonly string[]"} = ${JSON.stringify(locales)};`);
    lines.push("");
    lines.push(`/** Loads one locale's messages; each locale is its own module. */`);
    lines.push(javascript ? "export const loaders = {" : `export const loaders: Readonly<Record<string, () => Promise<typeof import("./${locales[0] ?? "en"}.${extension}")>>> = {`);
    lines.push(locales.map((locale) => `    ${JSON.stringify(locale)}: () => import("./${locale}.${extension}")`).join(",\n"));
    lines.push("};");
    lines.push("");
    return lines.join("\n");
}

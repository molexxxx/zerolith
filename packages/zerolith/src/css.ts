/**
 * Component styles. A `css` literal, or a stylesheet file imported with
 * `?scoped`, becomes one constructable stylesheet, adopted by the document
 * when the module loads, whose rules are wrapped in an @scope block keyed
 * by a generated class. The scope's lower bound is the interior of any
 * nested scoped component: a parent can style a child's root element but
 * nothing inside it. There is no shadow DOM, so design tokens, resets, and
 * global stylesheets apply as usual.
 */
import { fail } from "./diagnostics.js";

/** The class every scoped root carries, used as the lower bound of enclosing scopes. */
export const SCOPE_MARKER: string = "zl-s";

/** A stylesheet produced by `css`. Bind it to a root element's class attribute. */
export interface Styles
{
    /** The generated class that selects this component's roots. */
    readonly scope: string;
    /** The full stylesheet text including the @scope wrapper, for server rendering. */
    readonly text: string;
    /** The class names to put on a root element: the shared marker plus `scope`. */
    toString(): string;
}

class ScopedStyles implements Styles
{
    readonly scope: string;
    text: string;
    /** The rules as written, before wrapping, so a sheet can be composed into another. */
    rules: string;
    /** The stylesheet the document adopted, whose rules a changed file replaces. */
    sheet: CSSStyleSheet | undefined;

    constructor(scope: string, rules: string, text: string)
    {
        this.scope = scope;
        this.rules = rules;
        this.text = text;
    }

    toString(): string
    {
        return SCOPE_MARKER + " " + this.scope;
    }
}

/** FNV-1a over the text, rendered in base 36, so the same CSS always gets the same class. */
function hash(text: string): string
{
    let value = 0x811c9dc5;
    for (let i = 0; i < text.length; i++)
    {
        value ^= text.charCodeAt(i);
        value = Math.imul(value, 0x01000193);
    }
    return (value >>> 0).toString(36);
}

const sheets: Map<string, ScopedStyles> = new Map();
const files: Map<string, ScopedStyles> = new Map();
const created: ScopedStyles[] = [];

/** Every stylesheet created so far, in creation order, for server rendering. */
export function styleSheets(): readonly Styles[]
{
    return [...created];
}

/** The rules inside the @scope block that keys them to `scope`. */
function wrap(scope: string, rules: string): string
{
    return `@scope (.${scope}) to (:scope .${SCOPE_MARKER} > *) {\n${rules}\n}`;
}

/** The shadow roots a view was rendered into, held weakly, which adopt every scoped stylesheet the document does. */
let shadowRoots: Array<WeakRef<ShadowRoot>> = [];
const heldShadowRoots: WeakSet<ShadowRoot> = new WeakSet();
let pruneShadowRootsAt = 64;

function adoptBy(root: Document | ShadowRoot, sheet: CSSStyleSheet): void
{
    if (!root.adoptedStyleSheets.includes(sheet))
    {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }
}

function adopt(text: string): CSSStyleSheet | undefined
{
    if (typeof document === "undefined" || typeof CSSStyleSheet === "undefined")
    {
        return undefined;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    adoptBy(document, sheet);
    for (const known of shadowRoots)
    {
        const root = known.deref();
        if (root !== undefined)
        {
            adoptBy(root, sheet);
        }
    }
    return sheet;
}

/**
 * Has the shadow root that holds `node`, when there is one, adopt every
 * scoped stylesheet the document has adopted and every one created later,
 * since a shadow tree sees none of the document's. A view rendered inside
 * another component's shadow root, as a custom element can be, is then
 * styled as it is in the page, and a stylesheet file changed during
 * development changes there too, being the same stylesheet. A node that
 * joins a shadow tree after its view rendered is not seen here.
 */
export function adoptStylesAt(node: Node): void
{
    const root = node.getRootNode();
    if (typeof ShadowRoot === "undefined" || !(root instanceof ShadowRoot) || root.ownerDocument !== document || heldShadowRoots.has(root))
    {
        return;
    }
    heldShadowRoots.add(root);
    if (shadowRoots.length >= pruneShadowRootsAt)
    {
        shadowRoots = shadowRoots.filter((known) => known.deref() !== undefined);
        pruneShadowRootsAt = Math.max(64, shadowRoots.length * 2);
    }
    shadowRoots.push(new WeakRef(root));
    for (const styles of created)
    {
        if (styles.sheet !== undefined)
        {
            adoptBy(root, styles.sheet);
        }
    }
}

function create(scope: string, rules: string): ScopedStyles
{
    const text = wrap(scope, rules);
    const styles = new ScopedStyles(scope, rules, text);
    styles.sheet = adopt(text);
    created.push(styles);
    return styles;
}

/**
 * Declares scoped component styles. Values may be numbers or other `css`
 * results; strings are rejected so untrusted text can never become CSS.
 */
export function css(strings: TemplateStringsArray, ...values: ReadonlyArray<number | Styles>): Styles
{
    let rules = strings[0] ?? "";
    for (let i = 0; i < values.length; i++)
    {
        const value = values[i];
        if (typeof value === "number")
        {
            rules += String(value);
        }
        else if (value instanceof ScopedStyles)
        {
            rules += value.rules;
        }
        else
        {
            throw fail("css_value_not_allowed", { index: i, type: typeof value });
        }
        rules += strings[i + 1] ?? "";
    }
    const cached = sheets.get(rules);
    if (cached !== undefined)
    {
        return cached;
    }
    const styles = create("zl-" + hash(rules), rules);
    sheets.set(rules, styles);
    return styles;
}

/**
 * The styles of a stylesheet file imported with `?scoped`, as in
 * `import card from "./card.css?scoped"`. The dev server, the build, and
 * the Vite plugin turn that import into a call to this function with the
 * file's path in the project and its rules, which are scoped as a `css`
 * literal's are. The scope class holds the file's name and a hash of its
 * path rather than of its text, so the server and the browser agree on it
 * however each processed the file, and a second call for the same path,
 * made when the file changed in development, replaces the rules of the
 * stylesheet the document adopted while every element keeps its class.
 * A constructable stylesheet resolves references against the page, so the
 * tools hand over rules whose references are already URLs the page can use.
 */
export function styleFile(path: string, rules: string): Styles
{
    const known = files.get(path);
    if (known !== undefined)
    {
        if (known.rules !== rules)
        {
            known.rules = rules;
            known.text = wrap(known.scope, rules);
            known.sheet?.replaceSync(known.text);
        }
        return known;
    }
    const name = (path.split("/").at(-1) ?? "")
        .replace(/\.[^.]*$/, "")
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "");
    const styles = create("zl-" + (name === "" ? "" : name + "-") + hash(path), rules);
    files.set(path, styles);
    return styles;
}

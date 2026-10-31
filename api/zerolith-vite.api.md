# @zerolith/vite

Every export of `@zerolith/vite` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function lintModule(code: string, id: string, parse: ModuleParser): Finding[]
function lowerJsx(code: string, id: string, parse: ModuleParser): JsxOutput | null
function position(code: string, offset: number): { line: number; column: number }
function prepareModule(code: string, id: string, parse: ModuleParser, scan: TemplateScanner): PrepareOutput | null
function splitImports(code: string, id: string, parse: ModuleParser): SplitImport[]
function transformModule(code: string, id: string, parse: ModuleParser): TransformOutput | null
function zerolith(options?: ZerolithPluginOptions): Plugin[]

class JsxError extends Error
{
    constructor(message: string, offset: number)
    readonly offset: number
}

class PrepareError extends Error
{
    constructor(message: string, offset: number)
    readonly offset: number
}

interface AstNode
{
    type: string
    start: number
    end: number
}

interface Edit
{
    start: number
    end: number
    text: string
}

interface Finding
{
    readonly code: LintCode
    readonly message: string
    readonly offset: number
}

interface IdentityMap
{
    version: 3
    sources: string[]
    names: string[]
    mappings: string
}

interface JsxOutput
{
    code: string
    map: IdentityMap
}

interface ParsedModule
{
    program: { body: readonly AstNode[] }
    errors: readonly unknown[]
}

interface PrepareOutput
{
    code: string
    map: IdentityMap
}

interface ScannedPart
{
    readonly kind: number
    readonly name: string
    readonly strings: readonly string[]
}

interface SplitImport
{
    readonly specifier: string
    readonly kind: "route" | "locale"
    readonly offset: number
}

interface TransformOutput
{
    code: string
    map: IdentityMap
}

interface ZerolithPluginOptions
{
    include?: RegExp
    exclude?: RegExp
    jsx?: boolean
    lint?: boolean
    prepare?: boolean
}

type LintCode = "template_frozen_read" | "image_without_alt" | "button_without_name" | "frame_without_title"
type ModuleParser = (filename: string, code: string) => ParsedModule
type TemplateScanner = (strings: readonly string[]) => { markup: string; parts: readonly ScannedPart[] }

const MESSAGES_HEADER: string
const PREPARED_BINDING: string
const TEMPLATE_BINDING: string
const VIEW_BINDING: string
```

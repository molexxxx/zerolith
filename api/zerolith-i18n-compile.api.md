# @zerolith/i18n/compile

function compileIndex(locales: readonly string[], _): string
function compileMessages(locale: string, catalog: Catalog, _): CompiledCatalog
function messageNames(catalog: Catalog): string[]
interface CompiledCatalog
    code: string
    names: string[]
interface CompileOptions
    language?: "ts" | "js"
    source?: string
type Catalog = Readonly<Record<string, string>>

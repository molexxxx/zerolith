# @zerolith/i18n/compile

Every export of `@zerolith/i18n/compile` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function compileIndex(locales: readonly string[], options?: CompileOptions): string
function compileMessages(locale: string, catalog: Catalog, options?: CompileOptions): CompiledCatalog
function messageNames(catalog: Catalog): string[]

interface CompiledCatalog
{
    code: string
    names: string[]
}

interface CompileOptions
{
    language?: "ts" | "js"
    source?: string
}

type Catalog = Readonly<Record<string, string>>
```

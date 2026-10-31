# @zerolith/client/generate

Every export of `@zerolith/client/generate` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function generateClient(document: OpenApiDocument, options?: GenerateOptions): string

interface GenerateOptions
{
    clientSpecifier?: string
    apiName?: string
}

interface MediaTypeObject
{
    schema?: SchemaObject
}

interface OpenApiDocument
{
    openapi: string
    info?: { title?: string; version?: string }
    paths?: Record<string, PathItemObject>
    components?: { schemas?: Record<string, SchemaObject>; parameters?: Record<string, ParameterObject>; requestBodies?: Record<string, RequestBodyObject>; responses?: Record<string, ResponseObject>; pathItems?: Record<string, PathItemObject> }
}

interface OperationObject
{
    operationId?: string
    summary?: string
    description?: string
    deprecated?: boolean
    parameters?: ParameterObject[]
    requestBody?: RequestBodyObject
    responses?: Record<string, ResponseObject>
}

interface ParameterObject
{
    $ref?: string
    name?: string
    in?: "query" | "querystring" | "header" | "path" | "cookie"
    required?: boolean
    description?: string
    schema?: SchemaObject
    content?: Record<string, MediaTypeObject>
}

interface PathItemObject
{
    $ref?: string
    summary?: string
    description?: string
    parameters?: ParameterObject[]
    get?: OperationObject
    put?: OperationObject
    post?: OperationObject
    delete?: OperationObject
    options?: OperationObject
    head?: OperationObject
    patch?: OperationObject
    trace?: OperationObject
    query?: OperationObject
    additionalOperations?: Record<string, OperationObject>
}

interface RequestBodyObject
{
    $ref?: string
    description?: string
    required?: boolean
    content?: Record<string, MediaTypeObject>
}

interface ResponseObject
{
    $ref?: string
    description?: string
    content?: Record<string, MediaTypeObject>
}

interface SchemaObject
{
    $ref?: string
    type?: string | string[]
    nullable?: boolean
    enum?: unknown[]
    const?: unknown
    properties?: Record<string, SchemaObject>
    required?: string[]
    additionalProperties?: boolean | SchemaObject
    items?: SchemaObject
    prefixItems?: SchemaObject[]
    oneOf?: SchemaObject[]
    anyOf?: SchemaObject[]
    allOf?: SchemaObject[]
    description?: string
    title?: string
}
```

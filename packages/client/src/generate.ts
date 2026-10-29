/**
 * Generates the contract module from an OpenAPI 3.x document: one type per
 * component schema, an `Api` interface with one entry per operation, and
 * the `routes` table the client runs on. Pure string work, so it runs
 * anywhere; the `zerolith-client` command wraps it for the shell.
 */

/** A JSON Schema object as OpenAPI 3.1 and later carry it (draft 2020-12 plus the OAS vocabulary). */
export interface SchemaObject
{
    $ref?: string;
    type?: string | string[];
    nullable?: boolean;
    enum?: unknown[];
    const?: unknown;
    properties?: Record<string, SchemaObject>;
    required?: string[];
    additionalProperties?: boolean | SchemaObject;
    items?: SchemaObject;
    prefixItems?: SchemaObject[];
    oneOf?: SchemaObject[];
    anyOf?: SchemaObject[];
    allOf?: SchemaObject[];
    description?: string;
    title?: string;
}

/** A Parameter Object or a reference to one. */
export interface ParameterObject
{
    $ref?: string;
    name?: string;
    in?: "query" | "querystring" | "header" | "path" | "cookie";
    required?: boolean;
    description?: string;
    schema?: SchemaObject;
    content?: Record<string, MediaTypeObject>;
}

/** A Media Type Object. */
export interface MediaTypeObject
{
    schema?: SchemaObject;
}

/** A Request Body Object or a reference to one. */
export interface RequestBodyObject
{
    $ref?: string;
    description?: string;
    required?: boolean;
    content?: Record<string, MediaTypeObject>;
}

/** A Response Object or a reference to one. */
export interface ResponseObject
{
    $ref?: string;
    description?: string;
    content?: Record<string, MediaTypeObject>;
}

/** An Operation Object. */
export interface OperationObject
{
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
    parameters?: ParameterObject[];
    requestBody?: RequestBodyObject;
    responses?: Record<string, ResponseObject>;
}

/** A Path Item Object. */
export interface PathItemObject
{
    $ref?: string;
    summary?: string;
    description?: string;
    parameters?: ParameterObject[];
    get?: OperationObject;
    put?: OperationObject;
    post?: OperationObject;
    delete?: OperationObject;
    options?: OperationObject;
    head?: OperationObject;
    patch?: OperationObject;
    trace?: OperationObject;
    query?: OperationObject;
    additionalOperations?: Record<string, OperationObject>;
}

/** The parts of an OpenAPI document the generator reads. */
export interface OpenApiDocument
{
    openapi: string;
    info?: { title?: string; version?: string };
    paths?: Record<string, PathItemObject>;
    components?: {
        schemas?: Record<string, SchemaObject>;
        parameters?: Record<string, ParameterObject>;
        requestBodies?: Record<string, RequestBodyObject>;
        responses?: Record<string, ResponseObject>;
        pathItems?: Record<string, PathItemObject>;
    };
}

/** Options for `generateClient`. */
export interface GenerateOptions
{
    /** The module the generated file imports `RouteTable` from. Defaults to `@zerolith/client`. */
    clientSpecifier?: string;
    /** The name of the generated contract interface. Defaults to `Api`. */
    apiName?: string;
}

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace", "query"] as const;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

interface Context
{
    document: OpenApiDocument;
    apiName: string;
}

function fail(message: string): never
{
    throw new Error(`zerolith/client: ${message}`);
}

function words(text: string): string[]
{
    return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter((word) => word !== "");
}

function pascal(text: string): string
{
    return words(text).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

function camel(text: string): string
{
    const name = pascal(text);
    return name.charAt(0).toLowerCase() + name.slice(1);
}

function typeName(text: string): string
{
    const name = pascal(text);
    return /^[0-9]/.test(name) ? `_${name}` : name === "" ? "_" : name;
}

function key(name: string): string
{
    return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

function comment(text: string | undefined, indent: string): string
{
    if (text === undefined || text.trim() === "")
    {
        return "";
    }
    const lines = text.trim().replace(/\*\//g, "* /").split(/\r?\n/);
    return lines.length === 1 ? `${indent}/** ${lines[0]} */\n` : `${indent}/**\n${lines.map((line) => `${indent} * ${line}`.trimEnd()).join("\n")}\n${indent} */\n`;
}

function indentLines(text: string, indent: string): string
{
    return text.split("\n").map((line, index) => (index === 0 ? line : `${indent}${line}`)).join("\n");
}

function resolveRef<T>(context: Context, ref: string, section: string): T
{
    const prefix = `#/components/${section}/`;
    if (!ref.startsWith(prefix))
    {
        fail(`only local references into components are supported, found ${ref}`);
    }
    const name = decodeURIComponent(ref.slice(prefix.length).replace(/~1/g, "/").replace(/~0/g, "~"));
    const table = (context.document.components as Record<string, Record<string, T> | undefined> | undefined)?.[section];
    const found = table?.[name];
    if (found === undefined)
    {
        fail(`${ref} does not exist`);
    }
    return found;
}

function deref<T extends { $ref?: string }>(context: Context, value: T, section: string): T
{
    let current = value;
    for (let depth = 0; current.$ref !== undefined; depth++)
    {
        if (depth > 16)
        {
            fail(`reference loop at ${current.$ref}`);
        }
        current = resolveRef<T>(context, current.$ref, section);
    }
    return current;
}

function schemaRefName(ref: string): string
{
    const prefix = "#/components/schemas/";
    if (!ref.startsWith(prefix))
    {
        fail(`only local schema references are supported, found ${ref}`);
    }
    return typeName(decodeURIComponent(ref.slice(prefix.length)));
}

function literal(value: unknown): string
{
    return value === undefined ? "undefined" : JSON.stringify(value);
}

/** Renders a schema as a TypeScript type. `indent` is the current indentation for nested object types. */
function typeOf(schema: SchemaObject | undefined, indent: string): string
{
    if (schema === undefined)
    {
        return "unknown";
    }
    if (schema.$ref !== undefined)
    {
        return schemaRefName(schema.$ref);
    }
    const parts: string[] = [];
    if (schema.const !== undefined)
    {
        parts.push(literal(schema.const));
    }
    else if (schema.enum !== undefined)
    {
        parts.push(schema.enum.map(literal).join(" | "));
    }
    else if (schema.oneOf !== undefined || schema.anyOf !== undefined)
    {
        parts.push((schema.oneOf ?? schema.anyOf ?? []).map((option) => typeOf(option, indent)).join(" | "));
    }
    else if (schema.allOf !== undefined)
    {
        parts.push(schema.allOf.map((option) => wrap(typeOf(option, indent))).join(" & "));
    }
    else
    {
        const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type];
        if (types.length === 0 && (schema.properties !== undefined || schema.additionalProperties !== undefined))
        {
            types.push("object");
        }
        if (types.length === 0 && (schema.items !== undefined || schema.prefixItems !== undefined))
        {
            types.push("array");
        }
        if (types.length === 0)
        {
            parts.push("unknown");
        }
        for (const type of types)
        {
            parts.push(primitive(type, schema, indent));
        }
    }
    if (schema.nullable === true && !parts.includes("null"))
    {
        parts.push("null");
    }
    return [...new Set(parts)].join(" | ");
}

function wrap(type: string): string
{
    return type.includes(" | ") ? `(${type})` : type;
}

function primitive(type: string, schema: SchemaObject, indent: string): string
{
    switch (type)
    {
        case "string":
            return "string";
        case "number":
        case "integer":
            return "number";
        case "boolean":
            return "boolean";
        case "null":
            return "null";
        case "array":
            if (schema.prefixItems !== undefined)
            {
                const rest = schema.items === undefined ? "" : `, ...${wrap(typeOf(schema.items, indent))}[]`;
                return `[${schema.prefixItems.map((item) => typeOf(item, indent)).join(", ")}${rest}]`;
            }
            return `${wrap(typeOf(schema.items, indent))}[]`;
        case "object":
            return objectType(schema, indent);
        default:
            return "unknown";
    }
}

function objectType(schema: SchemaObject, indent: string): string
{
    const properties = Object.entries(schema.properties ?? {});
    const required = new Set(schema.required ?? []);
    const extra = schema.additionalProperties;
    const record = extra === undefined || extra === false ? undefined : `Record<string, ${extra === true ? "unknown" : typeOf(extra, indent)}>`;
    if (properties.length === 0)
    {
        return record ?? (extra === false ? "Record<string, never>" : "Record<string, unknown>");
    }
    const inner = `${indent}    `;
    const lines = properties.map(([name, property]) =>
    {
        const optional = required.has(name) ? "" : "?";
        return `${comment(property.description, inner)}${inner}${key(name)}${optional}: ${indentLines(typeOf(property, inner), "")};`;
    });
    const body = `{\n${lines.join("\n")}\n${indent}}`;
    return record === undefined ? body : `${body} & ${record}`;
}

function jsonSchemaOf(content: Record<string, MediaTypeObject> | undefined): { kind: "json"; schema: SchemaObject | undefined } | { kind: "form" } | { kind: "urlencoded" } | { kind: "text" } | { kind: "none" } | { kind: "other" }
{
    if (content === undefined || Object.keys(content).length === 0)
    {
        return { kind: "none" };
    }
    for (const [type, media] of Object.entries(content))
    {
        const bare = type.split(";")[0]?.trim().toLowerCase() ?? "";
        if (bare === "application/json" || bare.endsWith("+json"))
        {
            return { kind: "json", schema: media.schema };
        }
    }
    const types = Object.keys(content).map((type) => type.split(";")[0]?.trim().toLowerCase() ?? "");
    if (types.includes("multipart/form-data"))
    {
        return { kind: "form" };
    }
    if (types.includes("application/x-www-form-urlencoded"))
    {
        return { kind: "urlencoded" };
    }
    if (types.some((type) => type.startsWith("text/")))
    {
        return { kind: "text" };
    }
    return { kind: "other" };
}

interface Entry
{
    name: string;
    method: string;
    path: string;
    lines: string[];
    doc: string | undefined;
}

function operationName(operation: OperationObject, method: string, path: string): string
{
    if (operation.operationId !== undefined && operation.operationId.trim() !== "")
    {
        return camel(operation.operationId);
    }
    const segments = path.split("/").filter((segment) => segment !== "").map((segment) =>
    {
        const match = /^\{(.+)\}$/.exec(segment);
        return match === null ? pascal(segment) : `By${pascal(match[1] ?? "")}`;
    });
    return camel(`${method} ${segments.join(" ")}`);
}

function parameterGroups(context: Context, item: PathItemObject, operation: OperationObject): { params: string[]; query: string[]; queryRequired: boolean }
{
    const merged = new Map<string, ParameterObject>();
    for (const list of [item.parameters ?? [], operation.parameters ?? []])
    {
        for (const raw of list)
        {
            const parameter = deref(context, raw, "parameters");
            if (parameter.name === undefined || parameter.in === undefined)
            {
                fail(`a parameter needs a name and a location`);
            }
            merged.set(`${parameter.in}:${parameter.name}`, parameter);
        }
    }
    const params: string[] = [];
    const query: string[] = [];
    let queryRequired = false;
    for (const parameter of merged.values())
    {
        const name = parameter.name ?? "";
        const schema = parameter.schema ?? (parameter.content === undefined ? undefined : Object.values(parameter.content)[0]?.schema);
        const type = typeOf(schema, "            ");
        const doc = comment(parameter.description, "            ");
        if (parameter.in === "path")
        {
            params.push(`${doc}            ${key(name)}: ${type};`);
        }
        else if (parameter.in === "query")
        {
            const required = parameter.required === true;
            queryRequired ||= required;
            query.push(`${doc}            ${key(name)}${required ? "" : "?"}: ${type}${required ? "" : " | undefined"};`);
        }
        else if (parameter.in === "querystring")
        {
            queryRequired ||= parameter.required === true;
            query.push(`${doc}            [name: string]: unknown;`);
        }
    }
    return { params, query, queryRequired };
}

function bodyType(context: Context, operation: OperationObject): { type: string; required: boolean } | undefined
{
    if (operation.requestBody === undefined)
    {
        return undefined;
    }
    const body = deref(context, operation.requestBody, "requestBodies");
    const content = jsonSchemaOf(body.content);
    const required = body.required === true;
    switch (content.kind)
    {
        case "json":
            return { type: typeOf(content.schema, "        "), required };
        case "form":
            return { type: "FormData", required };
        case "urlencoded":
            return { type: "URLSearchParams", required };
        case "text":
            return { type: "string", required };
        case "none":
            return undefined;
        default:
            return { type: "BodyInit", required };
    }
}

function outputType(context: Context, operation: OperationObject): string
{
    const responses = Object.entries(operation.responses ?? {});
    const successful = responses.filter(([status]) => /^2(\d\d|XX)$/.test(status)).toSorted(([a], [b]) => a.localeCompare(b));
    const chosen = successful.length > 0 ? successful : responses.filter(([status]) => status === "default");
    if (chosen.length === 0)
    {
        return "unknown";
    }
    const types = new Set<string>();
    for (const [, raw] of chosen)
    {
        const response = deref(context, raw, "responses");
        const content = jsonSchemaOf(response.content);
        switch (content.kind)
        {
            case "json":
                types.add(typeOf(content.schema, "        "));
                break;
            case "text":
                types.add("string");
                break;
            case "none":
                types.add("undefined");
                break;
            default:
                types.add("unknown");
        }
    }
    return [...types].join(" | ");
}

function entryOf(context: Context, path: string, item: PathItemObject, method: string, operation: OperationObject): Entry
{
    const { params, query, queryRequired } = parameterGroups(context, item, operation);
    const lines = [`        method: "${method}";`, `        path: ${JSON.stringify(path)};`];
    if (params.length > 0)
    {
        lines.push(`        params: {\n${params.join("\n")}\n        };`);
    }
    if (query.length > 0)
    {
        lines.push(`        query${queryRequired ? "" : "?"}: {\n${query.join("\n")}\n        };`);
    }
    const body = bodyType(context, operation);
    if (body !== undefined)
    {
        lines.push(`        body${body.required ? "" : "?"}: ${body.type}${body.required ? "" : " | undefined"};`);
    }
    lines.push(`        output: ${outputType(context, operation)};`);
    const doc = [operation.summary, operation.description, operation.deprecated === true ? "@deprecated" : undefined].filter((part) => part !== undefined && part !== "").join("\n\n");
    return { name: operationName(operation, method, path), method, path, lines, doc: doc === "" ? undefined : doc };
}

/**
 * Generates the contract module for an OpenAPI 3.x document given as a
 * parsed object (JSON; convert YAML first). Schemas under
 * `components.schemas` become exported types, every operation becomes an
 * entry of the `Api` interface named by its `operationId` (or by its
 * method and path), and `routes` carries the method and path of each.
 * Header and cookie parameters, security, and non-local references are
 * left out; the client sends headers through its options.
 */
export function generateClient(document: OpenApiDocument, options: GenerateOptions = {}): string
{
    if (typeof document.openapi !== "string" || !document.openapi.startsWith("3."))
    {
        fail(`expected an OpenAPI 3.x document, found openapi: ${JSON.stringify(document.openapi)}`);
    }
    const context: Context = { document, apiName: options.apiName ?? "Api" };
    const specifier = options.clientSpecifier ?? "@zerolith/client";
    const out: string[] = [];
    const title = document.info?.title === undefined ? "an OpenAPI document" : `${document.info.title}${document.info.version === undefined ? "" : ` ${document.info.version}`}`;
    out.push(`// Generated by @zerolith/client from ${title}. Do not edit; regenerate instead.`);
    out.push(`import type { RouteTable } from ${JSON.stringify(specifier)};`);
    out.push("");

    const schemas = Object.entries(document.components?.schemas ?? {}).toSorted(([a], [b]) => a.localeCompare(b));
    for (const [name, schema] of schemas)
    {
        out.push(`${comment(schema.description ?? schema.title, "")}export type ${typeName(name)} = ${typeOf(schema, "")};`);
        out.push("");
    }

    const entries: Entry[] = [];
    const seen = new Set<string>();
    for (const [path, rawItem] of Object.entries(document.paths ?? {}).toSorted(([a], [b]) => a.localeCompare(b)))
    {
        const item = deref(context, rawItem, "pathItems");
        const operations: [string, OperationObject][] = [];
        for (const method of METHODS)
        {
            const operation = item[method];
            if (operation !== undefined)
            {
                operations.push([method, operation]);
            }
        }
        for (const [method, operation] of Object.entries(item.additionalOperations ?? {}))
        {
            operations.push([method.toLowerCase(), operation]);
        }
        for (const [method, operation] of operations)
        {
            const entry = entryOf(context, path, item, method, operation);
            if (seen.has(entry.name))
            {
                fail(`two operations resolve to the name "${entry.name}"; give them distinct operationId values`);
            }
            seen.add(entry.name);
            entries.push(entry);
        }
    }

    out.push(`export interface ${context.apiName}\n{`);
    out.push(entries.map((entry) => `${comment(entry.doc, "    ")}    ${key(entry.name)}: {\n${entry.lines.join("\n")}\n    };`).join("\n"));
    out.push("}");
    out.push("");
    out.push("export const routes = {");
    out.push(entries.map((entry) => `    ${key(entry.name)}: { method: "${entry.method}", path: ${JSON.stringify(entry.path)} }`).join(",\n"));
    out.push(`} as const satisfies RouteTable<${context.apiName}>;`);
    out.push("");
    return out.join("\n");
}

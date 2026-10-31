/**
 * Renders the type trees of `deno doc --json` back to TypeScript text.
 * Leaves carry a `repr`; structured kinds are rebuilt from their parts.
 */

export interface TsType
{
    kind: string;
    repr?: string;
    value?: unknown;
}

export interface Param
{
    kind: string;
    name?: string;
    optional?: boolean;
    tsType?: TsType;
    arg?: Param;
    left?: Param;
    props?: PatternProperty[];
    elements?: Array<Param | null>;
}

interface PatternProperty
{
    kind: string;
    key?: string;
    value?: Param | string | null;
    arg?: Param;
}

export interface TypeParam
{
    name: string;
    constraint?: TsType;
    default?: TsType;
}

interface FnValue
{
    constructor: boolean;
    params: Param[];
    tsType: TsType;
    typeParams?: TypeParam[];
}

interface ConditionalValue
{
    checkType: TsType;
    extendsType: TsType;
    trueType: TsType;
    falseType: TsType;
}

interface TypeRefValue
{
    typeName: string;
    typeParams?: TsType[];
}

interface LiteralValue
{
    kind: string;
    string?: string;
    number?: number;
    boolean?: boolean;
    tsTypes?: TsType[];
}

interface TypeLiteralValue
{
    properties?: Array<{ name: string; optional?: boolean; readonly?: boolean; tsType?: TsType }>;
    methods?: Array<{ name: string; params: Param[]; returnType?: TsType; optional?: boolean; typeParams?: TypeParam[] }>;
    indexSignatures?: Array<{ readonly?: boolean; params: Param[]; tsType?: TsType }>;
    callSignatures?: Array<{ params: Param[]; tsType?: TsType; typeParams?: TypeParam[] }>;
}

interface MappedValue
{
    readonly?: boolean | string;
    optional?: boolean | string;
    typeParam: TypeParam;
    nameType?: TsType;
    tsType?: TsType;
}

function list(types: TsType[] | undefined, separator: string): string
{
    return (types ?? []).map(typeText).join(separator);
}

/** The text for a parameter list. */
export function paramsText(params: Param[] | undefined): string
{
    return (params ?? []).map(paramText).join(", ");
}

/** A parameter as a declaration file writes it: a default value makes it optional, and destructuring keeps its pattern without the defaults. */
function paramText(param: Param): string
{
    if (param.kind === "assign" && param.left !== undefined)
    {
        const tsType = param.left.tsType ?? param.tsType;
        return paramText({ ...param.left, optional: true, ...(tsType === undefined ? {} : { tsType }) });
    }
    const optional = param.optional === true ? "?" : "";
    return `${patternText(param)}${optional}${param.tsType === undefined ? "" : `: ${typeText(param.tsType)}`}`;
}

function patternText(param: Param): string
{
    switch (param.kind)
    {
        case "identifier":
            return param.name ?? "";
        case "assign":
            return param.left === undefined ? "" : patternText(param.left);
        case "rest":
            return `...${param.arg === undefined ? "" : patternText(param.arg)}`;
        case "object":
            return `{ ${(param.props ?? []).map(patternPropertyText).join(", ")} }`;
        case "array":
            return `[${(param.elements ?? []).map((element) => element === null ? "" : patternText(element)).join(", ")}]`;
        default:
            throw new Error(`unsupported parameter kind ${param.kind}`);
    }
}

function patternPropertyText(property: PatternProperty): string
{
    if (property.kind === "rest")
    {
        return `...${property.arg === undefined ? "" : patternText(property.arg)}`;
    }
    if (property.kind === "keyValue" && typeof property.value === "object" && property.value !== null)
    {
        return `${property.key ?? ""}: ${patternText(property.value)}`;
    }
    return property.key ?? "";
}

/** A property name as TypeScript writes it: quoted unless it is an identifier, a number, or a computed name. */
export function propertyName(name: string): string
{
    return /^[A-Za-z_$][\w$]*$|^\d+$|^\[/.test(name) ? name : JSON.stringify(name);
}

/** The text for a type parameter list, including the angle brackets, or an empty string. */
export function typeParamsText(params: TypeParam[] | undefined): string
{
    if (params === undefined || params.length === 0)
    {
        return "";
    }
    return "<" + params.map((param) =>
    {
        let text = param.name;
        if (param.constraint !== undefined)
        {
            text += ` extends ${typeText(param.constraint)}`;
        }
        if (param.default !== undefined)
        {
            text += ` = ${typeText(param.default)}`;
        }
        return text;
    }).join(", ") + ">";
}

/** The TypeScript text for a type tree. */
export function typeText(type: TsType | undefined): string
{
    if (type === undefined)
    {
        return "unknown";
    }
    const value = type.value;
    switch (type.kind)
    {
        case "keyword":
            return String(value);
        case "literal":
        {
            const literal = value as LiteralValue;
            switch (literal.kind)
            {
                case "string":
                    return JSON.stringify(literal.string ?? "");
                case "number":
                    return String(literal.number);
                case "boolean":
                    return String(literal.boolean);
                case "bigInt":
                    return `${literal.string ?? ""}n`;
                case "template":
                    return `\`${(literal.tsTypes ?? []).map((part, index) => index % 2 === 0 ? (part.value as LiteralValue).string ?? "" : `\${${typeText(part)}}`).join("")}\``;
                default:
                    throw new Error(`unsupported literal kind ${literal.kind}`);
            }
        }
        case "typeRef":
        {
            const ref = value as TypeRefValue;
            const args = ref.typeParams === undefined || ref.typeParams.length === 0 ? "" : `<${list(ref.typeParams, ", ")}>`;
            return ref.typeName + args;
        }
        case "union":
            return list(value as TsType[], " | ");
        case "intersection":
            return list(value as TsType[], " & ");
        case "array":
            return `${wrap(value as TsType)}[]`;
        case "tuple":
            return `[${list(value as TsType[], ", ")}]`;
        case "parenthesized":
            return `(${typeText(value as TsType)})`;
        case "rest":
            return `...${typeText(value as TsType)}`;
        case "optional":
            return `${typeText(value as TsType)}?`;
        case "fnOrConstructor":
        {
            const fn = value as FnValue;
            return `${fn.constructor ? "new " : ""}${typeParamsText(fn.typeParams)}(${paramsText(fn.params)}) => ${typeText(fn.tsType)}`;
        }
        case "conditional":
        {
            const conditional = value as ConditionalValue;
            return `${typeText(conditional.checkType)} extends ${typeText(conditional.extendsType)} ? ${typeText(conditional.trueType)} : ${typeText(conditional.falseType)}`;
        }
        case "typeOperator":
        {
            const operator = value as { operator: string; tsType: TsType };
            return `${operator.operator} ${typeText(operator.tsType)}`;
        }
        case "indexedAccess":
        {
            const access = value as { objType: TsType; indexType: TsType };
            return `${typeText(access.objType)}[${typeText(access.indexType)}]`;
        }
        case "typeQuery":
            return `typeof ${String(value)}`;
        case "this":
            return "this";
        case "infer":
            return `infer ${(value as { typeParam: TypeParam }).typeParam.name}`;
        case "typePredicate":
        {
            const predicate = value as { asserts?: boolean; param: { type: string; name?: string }; type?: TsType };
            const subject = predicate.param.type === "this" ? "this" : predicate.param.name ?? "";
            return `${predicate.asserts ? "asserts " : ""}${subject}${predicate.type === undefined ? "" : ` is ${typeText(predicate.type)}`}`;
        }
        case "mapped":
        {
            const mapped = value as MappedValue;
            const readonly = mapped.readonly === undefined || mapped.readonly === false ? "" : "readonly ";
            const optional = mapped.optional === undefined || mapped.optional === false ? "" : "?";
            const as = mapped.nameType === undefined ? "" : ` as ${typeText(mapped.nameType)}`;
            return `{ ${readonly}[${mapped.typeParam.name} in ${typeText(mapped.typeParam.constraint)}${as}]${optional}: ${typeText(mapped.tsType)} }`;
        }
        case "typeLiteral":
        {
            const literal = value as TypeLiteralValue;
            const members: string[] = [];
            for (const signature of literal.callSignatures ?? [])
            {
                members.push(`${typeParamsText(signature.typeParams)}(${paramsText(signature.params)}): ${typeText(signature.tsType)}`);
            }
            for (const property of literal.properties ?? [])
            {
                members.push(`${property.readonly === true ? "readonly " : ""}${propertyName(property.name)}${property.optional === true ? "?" : ""}: ${typeText(property.tsType)}`);
            }
            for (const method of literal.methods ?? [])
            {
                members.push(`${propertyName(method.name)}${method.optional === true ? "?" : ""}${typeParamsText(method.typeParams)}(${paramsText(method.params)}): ${typeText(method.returnType)}`);
            }
            for (const index of literal.indexSignatures ?? [])
            {
                members.push(`${index.readonly === true ? "readonly " : ""}[${paramsText(index.params)}]: ${typeText(index.tsType)}`);
            }
            return members.length === 0 ? "{}" : `{ ${members.join("; ")} }`;
        }
        default:
            throw new Error(`unsupported type kind ${type.kind}`);
    }
}

function wrap(type: TsType): string
{
    const text = typeText(type);
    return type.kind === "union" || type.kind === "intersection" || type.kind === "fnOrConstructor" || type.kind === "conditional" ? `(${text})` : text;
}

# zerolith/element

function define<Props extends readonly string[]>(name: string, options: ElementOptions<Props>): void
interface ElementOptions<Props extends readonly string[]>
    props: Props
    view: (props: ElementProps<Props>, host: HTMLElement) => unknown
type ElementProps<Props extends readonly string[]> = { readonly [K in Props[number]]: ReadableSignal<unknown> }

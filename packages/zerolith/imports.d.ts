/**
 * The types of the imports zerolith's tools add to a module, for a
 * project's `env.d.ts` to reference with
 * `/// <reference types="zerolith/imports" />`.
 */

/**
 * A stylesheet imported with `?scoped`, as in
 * `import card from "./card.css?scoped"`: its rules, scoped to the element
 * whose class binds the value, as a `css` literal's are.
 */
declare module "*.css?scoped"
{
    import type { Styles } from "zerolith";

    const styles: Styles;
    export default styles;
}

/**
 * A stylesheet imported for its rules alone, as in `import "./print.css"`,
 * which apply to the whole page. TypeScript checks that such an import
 * names a module, and this declaration is that module.
 */
declare module "*.css"
{
}

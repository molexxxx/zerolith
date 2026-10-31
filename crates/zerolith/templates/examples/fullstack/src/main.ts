// The entry: wait for the first route, then render the navigation and the
// current page.
import { html, render } from "zerolith";
import { router } from "./router.ts";

await router.ready;
render(html`
    <nav>
        <a href=${router.href("home")}>Notes</a>
        <a href=${router.href("about")}>About</a>
    </nav>
    ${router.outlet()}`, "#app");

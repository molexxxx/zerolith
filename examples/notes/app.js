// The entry: one render call mounting the layout around the router's outlet.
import { render } from "zerolith";
import { Layout } from "./components.js";
import { router } from "./router.js";

render(Layout({ content: router.outlet() }), /** @type {HTMLElement} */ (document.getElementById("app")));

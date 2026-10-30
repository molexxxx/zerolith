// The entry: one render call mounting the layout around the router's outlet,
// and the inspector, which Alt+Shift+Z opens.
import { render } from "zerolith";
import { mountDevtools } from "@zerolith/devtools";
import { Layout } from "./components.js";
import { router } from "./router.js";

render(Layout({ content: router.outlet() }), "#app");
mountDevtools();

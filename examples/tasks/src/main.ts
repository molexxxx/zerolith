// The entry: wait for the first messages, mount the layout around the
// router's outlet, watch focus origin for the focus ring rule, and open
// the inspector in development.
import { render } from "zerolith";
import { focusOrigin } from "@zerolith/a11y";
import { mountDevtools } from "@zerolith/devtools";
import { Layout } from "./components.ts";
import { load, locale } from "./locale.ts";
import { router } from "./router.ts";

await load(locale.locale.get());
await router.ready;
focusOrigin();
render(Layout({ content: router.outlet() }), "#app");
mountDevtools();

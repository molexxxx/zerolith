// The entry: keep the document's language in step with the chosen format,
// wait for the first route, then show the app to a signed-in member and the
// sign-in page to anyone else, and mount the inspector while developing.
import { html, render, when } from "zerolith";
import { mountDevtools } from "@zerolith/devtools";
import { applyLocale } from "@zerolith/i18n";
import { Shell } from "./components/shell.ts";
import { SignIn } from "./components/sign-in.ts";
import { locale } from "./locale.ts";
import { router } from "./router.ts";
import { signedOut, user } from "./store.ts";

applyLocale(locale);
await router.ready;
render(html`${when(user, () => Shell({ content: router.outlet() }), () => when(signedOut, () => SignIn()))}`, "#app");
mountDevtools();

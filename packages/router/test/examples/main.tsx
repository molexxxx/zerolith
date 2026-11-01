import { render } from "zerolith";
import { Layout } from "./layout.tsx";
import { router } from "./router.ts";

await router.ready;
render(<Layout content={router.outlet()} />, "#app");

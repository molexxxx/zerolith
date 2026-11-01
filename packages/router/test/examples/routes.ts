import { defineRoutes, lazy, route } from "@zerolith/router";
import { Home } from "./components/home.tsx";
import { ReleasePage, loadRelease, releaseHead } from "./components/release.tsx";

export const routes = defineRoutes({
    home: route({ path: "/", view: Home, head: { title: "Releases" } }),
    release: route({ path: "/releases/:tag", load: loadRelease, view: ReleasePage, head: releaseHead }),
    settings: route({
        path: "/settings",
        view: lazy(() => import("./components/settings.tsx").then((module) => module.Settings)),
        head: { title: "Settings" }
    })
});

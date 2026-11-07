// The route table's release notes entries; the starter's sit beside them.
import { defineRoutes, route } from "@zerolith/router";
// #region import
import { ReleasePage } from "./components/release.ts";
// #endregion import
import { Releases } from "./components/releases.ts";

export const routes = defineRoutes({
    releases: route({
        path: "/releases",
        view: () => Releases(),
        head: { title: "Release notes" }
    }),
    // #region route
    release: route({
        path: "/releases/:version/notes",
        view: ({ params }) => ReleasePage({ version: params.version }),
        head: ({ params }) => ({ title: `${params.version} release notes` })
    })
    // #endregion route
});

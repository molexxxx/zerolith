// The route table's release notes entry; the starter's sit beside it.
import { defineRoutes, route } from "@zerolith/router";
// #region import
import { Releases } from "./components/releases.ts";
// #endregion import

export const routes = defineRoutes({
    // #region route
    releases: route({
        path: "/releases",
        view: () => Releases(),
        head: { title: "Release notes" }
    })
    // #endregion route
});

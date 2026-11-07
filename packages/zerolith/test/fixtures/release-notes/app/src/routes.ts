// The route table's release notes entries; the starter's sit beside them.
import { defineRoutes, route } from "@zerolith/router";
import { ReleasePage } from "./components/release.ts";
import { Releases } from "./components/releases.ts";

export const routes = defineRoutes({
    releases: route({
        path: "/releases",
        view: () => Releases(),
        head: { title: "Release notes" }
    }),
    release: route({
        path: "/releases/:version/notes",
        view: ({ params }) => ReleasePage({ version: params.version }),
        head: ({ params }) => ({ title: `${params.version} release notes` })
    })
});

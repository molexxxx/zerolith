// The route table with the packing list page added. The starter's own
// routes sit next to this entry in a project; the tutorial shows the new
// lines only.
import { defineRoutes, route } from "@zerolith/router";
// #region import
import { Packing } from "./components/packing.ts";
// #endregion import

export const routes = defineRoutes({
    // #region route
    packing: route({ path: "/packing", view: () => Packing(), head: { title: "Packing list" } })
    // #endregion route
});

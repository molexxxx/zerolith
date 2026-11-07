// The route table with the sign-up page added; the starter's routes stay.
import { defineRoutes, route } from "@zerolith/router";
// #region import
import { SignUp } from "./components/sign-up.ts";
// #endregion import

export const routes = defineRoutes({
    // #region route
    signUp: route({
        path: "/sign-up",
        view: () => SignUp(),
        head: { title: "Sign up" }
    })
    // #endregion route
});

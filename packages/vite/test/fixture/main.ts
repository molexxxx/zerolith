import { render } from "zerolith";
import { App } from "./app.ts";

render(Shell(), "#app");

export function Shell(): unknown
{
    return App();
}

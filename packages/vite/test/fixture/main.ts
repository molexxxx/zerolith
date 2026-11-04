import { type View, render } from "zerolith";
import { App } from "./app.ts";

render(Shell(), "#app");

export function Shell(): View
{
    return App();
}

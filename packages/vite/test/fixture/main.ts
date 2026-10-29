import { render } from "zerolith";
import { App } from "./app.ts";

render(Shell(), document.getElementById("app") as HTMLElement);

export function Shell(): unknown
{
    return App();
}

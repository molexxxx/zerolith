import { render, signal } from "zerolith";
import { Counter } from "./counter.tsx";

const title = signal("JSX fixture");

render(
    <main>
        <h1 prop:title={title}>{title}</h1>
        <Counter start={2} label="Count">
            <em data-testid="child">a child</em>
        </Counter>
    </main>,
    "#app"
);

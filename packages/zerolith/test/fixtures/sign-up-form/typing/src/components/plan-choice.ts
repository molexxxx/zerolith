// The plans as a group of radio buttons, with the group's message.
import { type View, css, html } from "zerolith";
import { plans } from "../schema.ts";
import { Message, type MessageText } from "./message.ts";

const group = css`
    :scope { display: grid; gap: 0.75rem; }
    label { flex-wrap: nowrap; }
`;

export function PlanChoice({ message }: { message: MessageText }): View
{
    return html`
        <fieldset class=${group} aria-describedby="plan-message">
            <legend>Plan</legend>
            ${plans.map((plan) => html`
                <label>
                    <input type="radio" name="plan" value=${plan.id} required>
                    ${plan.name}: ${plan.detail}
                </label>`)}
            ${Message({ id: "plan-message", text: message })}
        </fieldset>`;
}

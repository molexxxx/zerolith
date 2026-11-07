// The feedback form: whether the page helped and an optional comment, sent
// to the api the host page names, with the outcome announced on the page
// and dispatched as an event.
import {
    type Problem, type ReadableSignal, type View,
    computed, html, signal, when
} from "zerolith";
import { ProblemError, createClient } from "@zerolith/client";
import { type Api, type Feedback, routes } from "../api.ts";

interface FeedbackProps
{
    api: ReadableSignal<unknown>;
    question: ReadableSignal<unknown>;
    page: ReadableSignal<unknown>;
    host: HTMLElement;
}

/** The text of an attribute or a property, or undefined when it has none. */
function text(value: unknown): string | undefined
{
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** What went wrong: the backend's problem, or one for no answer at all. */
function problemOf(error: unknown): Problem
{
    return error instanceof ProblemError
        ? error.problem
        : { title: "The feedback service could not be reached" };
}

/** Dispatches an event that bubbles out of the widget to the host page. */
function dispatch(host: HTMLElement, type: string, detail: unknown): void
{
    const init = { bubbles: true, composed: true, detail };
    host.dispatchEvent(new CustomEvent(type, init));
}

export function FeedbackForm(
    { api, question, page, host }: FeedbackProps
): View
{
    const legend = computed(() =>
        text(question.get()) ?? "Did this page help?");
    const state = signal<"ready" | "sending" | "sent">("ready");
    const asking = computed(() => state.get() !== "sent");
    const sending = computed(() => state.get() === "sending");
    const notice = signal("");
    const region = signal<HTMLElement | undefined>(undefined);

    function failed(problem: Problem): void
    {
        state.set("ready");
        notice.set(`Not sent: ${problem.detail ?? problem.title ?? "error"}`);
        dispatch(host, "feedback-failed", problem);
    }

    async function send(event: SubmitEvent): Promise<void>
    {
        event.preventDefault();
        if (state.get() === "sending")
        {
            return;
        }
        const baseUrl = text(api.get());
        if (baseUrl === undefined)
        {
            failed({ title: "The page names no api to send it to" });
            return;
        }
        const data = new FormData(event.currentTarget as HTMLFormElement);
        const comment = String(data.get("comment") ?? "").trim();
        const feedback: Feedback = {
            helpful: data.get("helpful") === "yes",
            page: text(page.get()) ?? location.origin + location.pathname
        };
        if (comment !== "")
        {
            feedback.comment = comment;
        }
        state.set("sending");
        notice.set("Sending your feedback.");
        try
        {
            const client = createClient<Api>(routes, { baseUrl });
            const receipt = await client.call("sendFeedback",
                { body: feedback });
            const focused = host.contains(document.activeElement);
            state.set("sent");
            notice.set("Thanks for your feedback.");
            if (focused)
            {
                region.get()?.focus();
            }
            dispatch(host, "feedback-sent", { ...feedback, ...receipt });
        }
        catch (error)
        {
            failed(problemOf(error));
        }
    }

    return html`
        <div>
            ${when(asking, () => html`
                <form @submit=${send}>
                    <fieldset>
                        <legend>${legend}</legend>
                        <label>
                            <input type="radio" name="helpful" value="yes"
                                required>
                            Yes
                        </label>
                        <label>
                            <input type="radio" name="helpful" value="no">
                            No
                        </label>
                    </fieldset>
                    <label class="comment">
                        Comment, if you like
                        <textarea name="comment" maxlength="1000"
                            rows="3"></textarea>
                    </label>
                    <button type="submit" aria-disabled=${sending}>Send</button>
                </form>`)}
            <p role="status" tabindex="-1" ref=${region}>${notice}</p>
        </div>`;
}

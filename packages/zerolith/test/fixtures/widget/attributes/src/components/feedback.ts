// The feedback form, asking the question the host page gives.
import { type ReadableSignal, type View, computed, html } from "zerolith";

/** The text of an attribute or a property, or undefined when it has none. */
function text(value: unknown): string | undefined
{
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function FeedbackForm(
    { question }: { question: ReadableSignal<unknown> }
): View
{
    const legend = computed(() =>
        text(question.get()) ?? "Did this page help?");
    return html`
        <form>
            <fieldset>
                <legend>${legend}</legend>
                <label>
                    <input type="radio" name="helpful" value="yes" required>
                    Yes
                </label>
                <label>
                    <input type="radio" name="helpful" value="no">
                    No
                </label>
            </fieldset>
            <label class="comment">
                Comment, if you like
                <textarea name="comment" maxlength="1000" rows="3"></textarea>
            </label>
            <button type="submit">Send</button>
        </form>`;
}

// The feedback form: whether the page helped, and an optional comment.
import { type View, html } from "zerolith";

export function FeedbackForm(): View
{
    return html`
        <form>
            <fieldset>
                <legend>Did this page help?</legend>
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

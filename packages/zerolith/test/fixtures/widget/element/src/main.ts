// The entry, and the one script a host page loads: it defines
// <feedback-widget>, whose content is the feedback form.
import { define } from "zerolith/element";
import { FeedbackForm } from "./components/feedback.ts";

define("feedback-widget", {
    props: [],
    view: () => FeedbackForm()
});

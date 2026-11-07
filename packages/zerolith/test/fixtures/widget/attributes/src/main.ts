// The entry, and the one script a host page loads: it defines
// <feedback-widget>, whose question is an attribute and a property.
import { define } from "zerolith/element";
import { FeedbackForm } from "./components/feedback.ts";

define("feedback-widget", {
    props: ["question"],
    view: ({ question }) => FeedbackForm({ question })
});

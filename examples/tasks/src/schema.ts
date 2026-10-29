// The validation both sides run: the form before it sends, the API when it receives.
import type { StandardSchema } from "@zerolith/forms";

export interface TaskDraft
{
    title: string;
}

export const taskSchema: StandardSchema<unknown, TaskDraft> = {
    "~standard": {
        version: 1,
        vendor: "tasks",
        validate(value)
        {
            const title = typeof value === "object" && value !== null ? (value as { title?: unknown }).title : undefined;
            const trimmed = typeof title === "string" ? title.trim() : "";
            if (trimmed.length < 2)
            {
                return { issues: [{ message: "Give the task a title of at least two characters.", path: ["title"] }] };
            }
            return { value: { title: trimmed } };
        }
    }
};

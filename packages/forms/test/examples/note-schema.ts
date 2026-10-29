// The schema shared by the forms guide's client and server examples.
import type { StandardSchema } from "@zerolith/forms";

// #region schema
export interface Note
{
    title: string;
}

// Any Standard Schema library works here; this one is written by hand to show the interface.
export const noteSchema: StandardSchema<unknown, Note> = {
    "~standard": {
        version: 1,
        vendor: "notes",
        validate(value)
        {
            const title = typeof value === "object" && value !== null ? (value as { title?: unknown }).title : undefined;
            if (typeof title === "string" && title.trim().length >= 2)
            {
                return { value: { title: title.trim() } };
            }
            return { issues: [{ message: "Give the note a title of at least two characters.", path: ["title"] }] };
        }
    }
};
// #endregion schema

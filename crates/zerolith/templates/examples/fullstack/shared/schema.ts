// The validation the app and the backend share. Each schema is a Standard
// Schema, so the forms run it in the browser before anything is sent and the
// API runs the same checks on what arrives; zod or valibot would plug in the
// same way.
import type { StandardIssue, StandardSchema } from "@zerolith/forms";
import { type TaskStatus, statuses } from "./model.ts";

type Fields = Record<string, unknown>;

/** A Standard Schema from a check that returns the parsed value or the issues it found. */
function schema<Output extends object>(check: (fields: Fields) => Output | StandardIssue[]): StandardSchema<unknown, Output>
{
    return {
        "~standard": {
            version: 1,
            vendor: "harbor",
            validate(value)
            {
                const result = check(typeof value === "object" && value !== null ? value as Fields : {});
                return Array.isArray(result) ? { issues: result } : { value: result };
            }
        }
    };
}

/** A field as trimmed text, or the empty string when it is missing. */
function text(fields: Fields, name: string): string
{
    const value = fields[name];
    return typeof value === "string" ? value.trim() : "";
}

/** What the sign-in form sends. */
export interface SignIn
{
    email: string;
    password: string;
}

export const signInSchema = schema<SignIn>((fields) =>
{
    const email = text(fields, "email");
    const password = text(fields, "password");
    const issues: StandardIssue[] = [];
    if (!email.includes("@"))
    {
        issues.push({ message: "Enter the email address you signed up with.", path: ["email"] });
    }
    if (password === "")
    {
        issues.push({ message: "Enter your password.", path: ["password"] });
    }
    return issues.length > 0 ? issues : { email, password };
});

/** What the new project form sends. */
export interface NewProject
{
    name: string;
    summary: string;
}

export const newProjectSchema = schema<NewProject>((fields) =>
{
    const name = text(fields, "name");
    const summary = text(fields, "summary");
    const issues: StandardIssue[] = [];
    if (name.length < 2 || name.length > 60)
    {
        issues.push({ message: "Give the project a name of 2 to 60 characters.", path: ["name"] });
    }
    if (summary.length > 140)
    {
        issues.push({ message: "Keep the summary to 140 characters.", path: ["summary"] });
    }
    return issues.length > 0 ? issues : { name, summary };
});

/** What the new task form sends; an empty due date means none. */
export interface NewTask
{
    title: string;
    due: string | null;
}

export const newTaskSchema = schema<NewTask>((fields) =>
{
    const title = text(fields, "title");
    const due = text(fields, "due");
    const issues: StandardIssue[] = [];
    if (title.length < 2 || title.length > 80)
    {
        issues.push({ message: "Give the task a title of 2 to 80 characters.", path: ["title"] });
    }
    if (due !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(due))
    {
        issues.push({ message: "Pick a date, or leave the due date empty.", path: ["due"] });
    }
    return issues.length > 0 ? issues : { title, due: due === "" ? null : due };
});

/** A change to a task's status. */
export interface TaskChange
{
    status: TaskStatus;
}

export const taskChangeSchema = schema<TaskChange>((fields) =>
{
    const status = statuses.find((candidate) => candidate === fields["status"]);
    return status === undefined ? [{ message: "Choose todo, doing, or done.", path: ["status"] }] : { status };
});

import { afterEach, expect, it, vi } from "vitest";
import { accessibilityIssues, cleanup, mount, settle } from "@zerolith/test";
import type { Project, Session, Summary } from "../shared/model.ts";

// The pages against an API kept in memory. The store asks the API for the
// session as soon as its module runs, so fetch and EventSource are replaced
// before the pages are imported.
const session: Session = { user: { id: 1, name: "Ada Lovelace", email: "ada@harbor.test" } };
const summary: Summary = { projects: 1, open: 2, dueSoon: 1, doneThisWeek: 1 };
const projects: Project[] = [{ id: 1, name: "Website relaunch", summary: "A faster site.", open: 2, done: 1 }];

vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
{
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/api/projects")
    {
        return request.formData().then((data) =>
        {
            const project = { id: projects.length + 1, name: String(data.get("name")), summary: String(data.get("summary")), open: 0, done: 0 };
            projects.push(project);
            return Response.json(project, { status: 201 });
        });
    }
    const answers: Record<string, unknown> = { "/api/session": session, "/api/summary": summary, "/api/projects": projects, "/api/activity": [] };
    return Promise.resolve(Response.json(answers[pathname]));
});

vi.stubGlobal("EventSource", class
{
    addEventListener(): void
    {
    }

    close(): void
    {
    }
});

const { Dashboard } = await import("../src/components/dashboard.ts");
const { Projects } = await import("../src/components/projects.ts");

afterEach(cleanup);

it("greets the member and shows the day's numbers", async () =>
{
    const { container } = mount(() => Dashboard());
    await settle();
    expect(container.querySelector("h1")?.textContent).toBe("Welcome back, Ada.");
    expect(Array.from(container.querySelectorAll(".stat .value"), (value) => value.textContent)).toEqual(["2", "1", "1", "1"]);
    expect(container.textContent).toContain("Nothing has happened yet today.");
    expect(accessibilityIssues(container)).toEqual([]);
});

it("checks a new project in the browser, then adds it through the form", async () =>
{
    const { container } = mount(() => Projects());
    await settle();
    expect(container.querySelectorAll("li")).toHaveLength(1);
    const name = container.querySelector("input[name=name]") as HTMLInputElement;
    name.value = "x";
    name.form?.requestSubmit();
    await settle();
    expect(container.querySelector("#field-name-message")?.textContent).toBe("Give the project a name of 2 to 60 characters.");
    name.value = "Launch party";
    name.form?.requestSubmit();
    await settle();
    await settle();
    expect(Array.from(container.querySelectorAll("li h2"), (title) => title.textContent)).toEqual(["Website relaunch", "Launch party"]);
    expect(accessibilityIssues(container)).toEqual([]);
});

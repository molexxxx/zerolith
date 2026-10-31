import { describe, expect, it } from "vitest";
import { type Entry, group, rank, segments, terms } from "../search.js";

function entry(title: string, fields: Partial<Entry> = {}): Entry
{
    return { path: `/guide/${title.toLowerCase().replace(/\W+/g, "-")}/`, title, section: "Guide", heading: title, anchor: "", text: "", ...fields };
}

function titles(entries: Entry[], query: string): string[]
{
    return rank(entries, query).map((hit) => hit.entry.anchor === "" ? hit.entry.title : `${hit.entry.title} / ${hit.entry.heading}`);
}

function marks(text: string, words: string[], prose: boolean): string[]
{
    return segments(text, words, prose).filter((part) => part.match).map((part) => part.text);
}

describe("docs search", () =>
{
    it("splits a query into lowercase terms", () =>
    {
        expect(terms("Create Router!")).toEqual(["create", "router"]);
        expect(terms("  ")).toEqual([]);
    });

    it("ranks a term that starts the title or a word of it above one inside a word", () =>
    {
        expect(titles([entry("Accessibility"), entry("Command line"), entry("computed_cycle")], "c")).toEqual(["Command line", "computed_cycle", "Accessibility"]);
    });

    it("reads the capitalized part of a camel-case name as the start of a word", () =>
    {
        expect(titles([entry("unrouterlike"), entry("createRouter")], "router")).toEqual(["createRouter", "unrouterlike"]);
        expect(marks("createRouter, then the router", ["router"], true)).toEqual(["Router", "router"]);
    });

    it("requires every term and drops entries that miss one", () =>
    {
        expect(titles([entry("Routing", { text: "lazy views" }), entry("Forms", { text: "lazy" })], "lazy routing")).toEqual(["Routing"]);
    });

    it("keeps three entries a page, and a heading many pages share only as the page's best", () =>
    {
        const sections = ["one", "two", "three", "four"].map((name) => entry("Signals", { heading: `Signal ${name}`, anchor: name, text: "signal" }));
        expect(rank([entry("Signals"), ...sections], "signal")).toHaveLength(3);

        const codes = ["a", "b", "c", "d", "e"].flatMap((code) => [
            entry(`code_${code}`, { path: `/e/code_${code}/`, section: "Diagnostics", text: "a fix" }),
            entry(`code_${code}`, { path: `/e/code_${code}/`, section: "Diagnostics", heading: "What to do", anchor: "what-to-do", text: "fix it" })
        ]);
        const hits = rank(codes, "fix");
        expect(hits).toHaveLength(5);
        expect(new Set(hits.map((hit) => hit.entry.path)).size).toBe(5);
    });

    it("groups hits by section in the order of each section's best hit and numbers them in the order they show", () =>
    {
        const entries = [entry("Router", { section: "Reference" }), entry("Routing", { text: "the router" }), entry("Router errors", { section: "Reference", heading: "router_failed" })];
        const groups = group(rank(entries, "router"));
        expect(groups.map((section) => section.label)).toEqual(["Reference", "Guide"]);
        expect(groups.flatMap((section) => section.hits.map((hit) => hit.index))).toEqual([0, 1, 2]);
    });

    it("marks word starts in prose, leaves one-letter terms unmarked there, and marks inside a title word that starts none", () =>
    {
        expect(marks("A coding agent can", ["c"], true)).toEqual([]);
        expect(marks("Coding agents", ["c"], false)).toEqual(["C"]);
        expect(marks("Accessibility", ["cess"], false)).toEqual(["cess"]);
        expect(marks("Accessibility", ["cess"], true)).toEqual([]);
    });
});

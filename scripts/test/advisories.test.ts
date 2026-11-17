import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Exception, advisoriesOf, checkExceptions, verdict } from "../advisories.ts";

const script = fileURLToPath(new URL("../audit.ts", import.meta.url));
const repositoryExceptions = fileURLToPath(new URL("../../.github/audit-exceptions.json", import.meta.url));

/** A report as npm audit gives it for one advisory against picomatch, which the packages that depend on picomatch list by name. */
function report(): Record<string, unknown>
{
    return {
        auditReportVersion: 2,
        vulnerabilities: {
            picomatch: { name: "picomatch", severity: "high", via: [{ source: 1247710, name: "picomatch", title: "picomatch vulnerable to ReDoS", url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", range: "<=4.0.7" }] },
            fdir: { name: "fdir", severity: "high", via: ["picomatch"] },
            vitest: { name: "vitest", severity: "high", via: ["picomatch", "tinyglobby", "vite"] }
        },
        metadata: { vulnerabilities: { high: 3, total: 3 } }
    };
}

/** An exceptions file's contents, holding `exceptions`. */
function holding(exceptions: unknown[]): unknown
{
    return { exceptions };
}

const picomatch: Exception = { advisory: "GHSA-fc5q-39xc-vjpf", package: "picomatch", reason: "only patterns from the repository's own configuration reach it", review: "2026-12-01" };

describe("npm advisories", () =>
{
    it("names each advisory once, by its GitHub id, against the package it was filed for", () =>
    {
        expect(advisoriesOf(report())).toEqual([{ id: "GHSA-fc5q-39xc-vjpf", package: "picomatch", title: "picomatch vulnerable to ReDoS" }]);
        expect(advisoriesOf({ auditReportVersion: 2, vulnerabilities: {} })).toEqual([]);
    });

    it("lets through an advisory an exception names until its review day, and fails it after", () =>
    {
        const advisories = advisoriesOf(report());
        expect(verdict(advisories, [picomatch], "2026-12-01")).toEqual({ failures: [], excused: advisories });
        expect(verdict(advisories, [picomatch], "2026-12-02").failures).toEqual(["the exception for GHSA-fc5q-39xc-vjpf in picomatch was due for review on 2026-12-01: move to a release that fixes it, or check again and set a new day"]);
    });

    it("fails an advisory no exception names, one whose exception names another package, and an exception the report no longer holds", () =>
    {
        const advisories = advisoriesOf(report());
        expect(verdict(advisories, [], "2026-11-17").failures).toEqual(["GHSA-fc5q-39xc-vjpf in picomatch: picomatch vulnerable to ReDoS"]);
        expect(verdict(advisories, [{ ...picomatch, package: "micromatch" }], "2026-11-17").failures).toEqual(["GHSA-fc5q-39xc-vjpf is filed against picomatch, and its exception names micromatch"]);
        expect(verdict([], [picomatch], "2026-11-17").failures).toEqual(["GHSA-fc5q-39xc-vjpf is no longer reported: take its exception out of .github/audit-exceptions.json"]);
    });

    it("throws when npm could not make a report, or made one it cannot read", () =>
    {
        expect(() => advisoriesOf({ error: { code: "ENOAUDIT", summary: "Your configured registry does not support audit requests." } })).toThrow("npm audit failed: Your configured registry does not support audit requests.");
        expect(() => advisoriesOf("")).toThrow("npm audit gave no report");
        expect(() => advisoriesOf({ vulnerabilities: { fdir: { via: "picomatch" } } })).toThrow("npm audit's entry for fdir names nothing it comes from");
    });

    it("refuses an exception without a GitHub id, a package, a reason, or a real day, with another key, or given twice", () =>
    {
        expect(checkExceptions(holding([picomatch]), "x.json")).toEqual([picomatch]);
        expect(() => checkExceptions(holding([{ ...picomatch, advisory: "CVE-2026-112366" }]), "x.json")).toThrow("is not a GitHub advisory id");
        expect(() => checkExceptions(holding([{ ...picomatch, package: "" }]), "x.json")).toThrow("names no package");
        expect(() => checkExceptions(holding([{ ...picomatch, reason: "dev only" }]), "x.json")).toThrow("gives no reason");
        expect(() => checkExceptions(holding([{ ...picomatch, review: "2026-02-30" }]), "x.json")).toThrow("is not a day as YYYY-MM-DD");
        expect(() => checkExceptions(holding([{ ...picomatch, until: "2026-12-01" }]), "x.json")).toThrow("must hold exactly advisory, package, reason, review");
        expect(() => checkExceptions(holding([picomatch, picomatch]), "x.json")).toThrow("is excepted twice");
        expect(() => checkExceptions({ exceptions: [], more: true }, "x.json")).toThrow("is not an object holding a list of exceptions");
    });

    it("keeps an exceptions file in the repository that the check takes", async () =>
    {
        const value: unknown = JSON.parse(await readFile(repositoryExceptions, "utf8"));
        expect(() => checkExceptions(value, repositoryExceptions)).not.toThrow();
    });
});

describe("node scripts/audit.ts", () =>
{
    it("exits with 0 when every advisory is let through, saying until when, and with 1 naming what fails", async () =>
    {
        const scratch = await mkdtemp(join(tmpdir(), "zerolith-audit-"));
        try
        {
            const reportFile = join(scratch, "report.json");
            const exceptions = join(scratch, "exceptions.json");
            await writeFile(reportFile, JSON.stringify(report()));
            await writeFile(exceptions, JSON.stringify({ exceptions: [picomatch] }));
            const passed = spawnSync(process.execPath, [script, "--report", reportFile, "--exceptions", exceptions, "--today", "2026-11-17"], { encoding: "utf8" });
            expect(passed.stderr).toBe("");
            expect(passed.status).toBe(0);
            expect(passed.stdout).toContain("let through until 2026-12-01: GHSA-fc5q-39xc-vjpf in picomatch");
            const late = spawnSync(process.execPath, [script, "--report", reportFile, "--exceptions", exceptions, "--today", "2026-12-02"], { encoding: "utf8" });
            expect(late.status).toBe(1);
            expect(late.stderr).toContain("was due for review on 2026-12-01");
        }
        finally
        {
            await rm(scratch, { recursive: true, force: true });
        }
    });
});

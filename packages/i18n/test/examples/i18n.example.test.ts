// Executed examples for the internationalization guide.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { computed } from "zerolith";
import { createLocale, formatters, negotiateLocale } from "@zerolith/i18n";
import { compileMessages } from "@zerolith/i18n/compile";

describe("internationalization guide", () =>
{
    it("locale", () =>
    {
        const request = new Request("https://notes.example/", { headers: { "accept-language": "de-AT,de;q=0.9,en;q=0.5" } });
        // #region locale
        const locale = createLocale({
            supported: ["en", "de", "ar"],
            initial: request.headers.get("accept-language")      // or navigator.languages in the browser
        });
        const format = formatters(locale.locale);
        const total = computed(() => format.number(1234.5, { style: "currency", currency: "EUR" }));

        expect(locale.locale.get()).toBe("de");
        expect(total.get()).toBe("1.234,50 €");

        locale.set("ar-EG");
        expect(locale.direction.get()).toBe("rtl");
        // #endregion locale
        expect(negotiateLocale("fr", ["en", "de"], "en")).toBe("en");
    });

    it("messages", async () =>
    {
        const folder = await mkdtemp(join(tmpdir(), "zerolith-i18n-guide-"));
        // #region catalog
        const en = {
            "notes-count": ".input {$count :number}\n.match $count\n0 {{No notes yet}}\none {{One note}}\n* {{{$count} notes}}",
            "saved-at": "Saved {$when :datetime dateLength=medium timePrecision=minute hour12=false timeZone=UTC}",
            "welcome": "Welcome back, {$name}!"
        };
        // #endregion catalog
        await writeFile(join(folder, "en.js"), compileMessages("en", en, { language: "js" }).code);
        const messages = (await import(pathToFileURL(join(folder, "en.js")).href)) as { notesCount(args: { count: number }): string; savedAt(args: { when: Date | number }): string; welcome(args: { name: string | number }): string };
        // #region use
        expect(messages.notesCount({ count: 0 })).toBe("No notes yet");
        expect(messages.notesCount({ count: 1 })).toBe("One note");
        expect(messages.notesCount({ count: 12 })).toBe("12 notes");
        expect(messages.savedAt({ when: Date.UTC(2026, 9, 28, 9, 30) })).toBe("Saved Oct 28, 2026, 09:30");
        expect(messages.welcome({ name: "Ada" })).toBe("Welcome back, Ada!");
        // #endregion use
        await rm(folder, { recursive: true, force: true });
    });
});

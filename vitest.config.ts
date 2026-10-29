import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { zerolith } from "./packages/vite/src/index.ts";

const coreEntry = fileURLToPath(new URL("./packages/zerolith/src/index.ts", import.meta.url));
const routerEntry = fileURLToPath(new URL("./packages/router/src/index.ts", import.meta.url));

export default defineConfig({
    plugins: zerolith().filter((plugin) => plugin.name === "zerolith:jsx"),
    resolve: {
        alias: {
            "@zerolith/vite/runtime": fileURLToPath(new URL("./packages/vite/src/runtime.ts", import.meta.url)),
            "@zerolith/vite": fileURLToPath(new URL("./packages/vite/src/index.ts", import.meta.url)),
            "@zerolith/client/port": fileURLToPath(new URL("./packages/client/src/port.ts", import.meta.url)),
            "@zerolith/client/generate": fileURLToPath(new URL("./packages/client/src/generate.ts", import.meta.url)),
            "@zerolith/client": fileURLToPath(new URL("./packages/client/src/index.ts", import.meta.url)),
            "@zerolith/otel": fileURLToPath(new URL("./packages/otel/src/index.ts", import.meta.url)),
            "@zerolith/i18n/compile": fileURLToPath(new URL("./packages/i18n/src/compile.ts", import.meta.url)),
            "@zerolith/i18n": fileURLToPath(new URL("./packages/i18n/src/index.ts", import.meta.url)),
            "@zerolith/a11y": fileURLToPath(new URL("./packages/a11y/src/index.ts", import.meta.url)),
            "@zerolith/test": fileURLToPath(new URL("./packages/test/src/index.ts", import.meta.url)),
            "@zerolith/forms": fileURLToPath(new URL("./packages/forms/src/index.ts", import.meta.url)),
            "@zerolith/devtools": fileURLToPath(new URL("./packages/devtools/src/index.ts", import.meta.url)),
            "@zerolith/router/server": fileURLToPath(new URL("./packages/router/src/server.ts", import.meta.url)),
            "@zerolith/router": routerEntry,
            "zerolith/element": fileURLToPath(new URL("./packages/zerolith/src/element.ts", import.meta.url)),
            "zerolith/ssr": fileURLToPath(new URL("./packages/zerolith/src/ssr.ts", import.meta.url)),
            zerolith: coreEntry
        }
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "node",
                    environment: "node",
                    include: ["packages/*/test/**/*.test.{ts,tsx}", "examples/*/test/**/*.test.{ts,tsx}", "scripts/**/test/**/*.test.{ts,tsx}"],
                    exclude: ["**/*.browser.test.{ts,tsx}", "**/node_modules/**", "**/dist/**"]
                }
            },
            {
                extends: true,
                test: {
                    name: "browser",
                    include: ["packages/*/test/**/*.browser.test.{ts,tsx}"],
                    exclude: ["**/node_modules/**", "**/dist/**"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{ browser: "chromium" }]
                    }
                }
            }
        ]
    }
});

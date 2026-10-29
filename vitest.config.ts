import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const coreEntry = fileURLToPath(new URL("./packages/zerolith/src/index.ts", import.meta.url));
const routerEntry = fileURLToPath(new URL("./packages/router/src/index.ts", import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@zerolith/devtools": fileURLToPath(new URL("./packages/devtools/src/index.ts", import.meta.url)),
            "@zerolith/router": routerEntry,
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
                    include: ["packages/*/test/**/*.test.ts", "examples/*/test/**/*.test.ts"],
                    exclude: ["**/*.browser.test.ts", "**/node_modules/**", "**/dist/**"]
                }
            },
            {
                extends: true,
                test: {
                    name: "browser",
                    include: ["packages/*/test/**/*.browser.test.ts"],
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

import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const coreEntry = fileURLToPath(new URL("./packages/zerolith/src/index.ts", import.meta.url));
const routerEntry = fileURLToPath(new URL("./packages/router/src/index.ts", import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@zerolith/vite/runtime": fileURLToPath(new URL("./packages/vite/src/runtime.ts", import.meta.url)),
            "@zerolith/vite": fileURLToPath(new URL("./packages/vite/src/index.ts", import.meta.url)),
            "@zerolith/forms": fileURLToPath(new URL("./packages/forms/src/index.ts", import.meta.url)),
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

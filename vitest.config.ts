import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { zerolith } from "./packages/vite/src/index.ts";

const coreEntry = fileURLToPath(new URL("./packages/zerolith/src/index.ts", import.meta.url));
const routerEntry = fileURLToPath(new URL("./packages/router/src/index.ts", import.meta.url));

export default defineConfig({
    plugins: zerolith({ hot: false, lint: false }),
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
            "@zerolith/state": fileURLToPath(new URL("./packages/state/src/index.ts", import.meta.url)),
            "@zerolith/browser": fileURLToPath(new URL("./packages/browser/src/index.ts", import.meta.url)),
            "@zerolith/test": fileURLToPath(new URL("./packages/test/src/index.ts", import.meta.url)),
            "@zerolith/forms": fileURLToPath(new URL("./packages/forms/src/index.ts", import.meta.url)),
            "@zerolith/devtools": fileURLToPath(new URL("./packages/devtools/src/index.ts", import.meta.url)),
            "@zerolith/router/server": fileURLToPath(new URL("./packages/router/src/server.ts", import.meta.url)),
            "@zerolith/router": routerEntry,
            "zerolith/internal": fileURLToPath(new URL("./packages/zerolith/src/internal.ts", import.meta.url)),
            "zerolith/element": fileURLToPath(new URL("./packages/zerolith/src/element.ts", import.meta.url)),
            "zerolith/ssr": fileURLToPath(new URL("./packages/zerolith/src/ssr.ts", import.meta.url)),
            zerolith: coreEntry
        }
    },
    test: {
        coverage: {
            provider: "v8",
            include: ["packages/*/src/**/*.ts"],
            /** The launcher in packages/cli is tested in the cli project, against the built binary this run does not start. */
            exclude: ["**/*.d.ts", "packages/cli/src/**"],
            reporter: ["text-summary", "json-summary"],
            reportsDirectory: "coverage",
            thresholds: {
                lines: 92.5, statements: 92.4, functions: 91.5, branches: 84.7,
                "packages/a11y/src/**": { lines: 91.3, statements: 91.1, functions: 87.1, branches: 81.0 },
                "packages/browser/src/**": { lines: 99.5, statements: 99.5, functions: 99.5, branches: 97.0 },
                "packages/client/src/**": { lines: 93.7, statements: 93.7, functions: 95.6, branches: 83.5 },
                "packages/devtools/src/**": { lines: 79.7, statements: 77.3, functions: 67.1, branches: 64.0 },
                "packages/forms/src/**": { lines: 92.1, statements: 91.0, functions: 84.2, branches: 85.1 },
                "packages/i18n/src/**": { lines: 91.0, statements: 91.4, functions: 95.6, branches: 81.1 },
                "packages/otel/src/**": { lines: 87.9, statements: 86.4, functions: 69.2, branches: 70.0 },
                "packages/router/src/**": { lines: 95.0, statements: 95.1, functions: 93.6, branches: 90.2 },
                "packages/state/src/**": { lines: 97.5, statements: 97.6, functions: 96.5, branches: 93.3 },
                "packages/test/src/**": { lines: 97.1, statements: 97.2, functions: 85.7, branches: 80.3 },
                "packages/vite/src/**": { lines: 93.9, statements: 94.0, functions: 97.1, branches: 86.7 },
                "packages/zerolith/src/**": { lines: 92.1, statements: 92.3, functions: 91.0, branches: 86.0 }
            }
        },
        projects: [
            {
                extends: true,
                test: {
                    name: "node",
                    environment: "node",
                    include: ["packages/*/test/**/*.test.{ts,tsx}", "examples/*/test/**/*.test.{ts,tsx}", "scripts/**/test/**/*.test.{ts,tsx}"],
                    exclude: ["**/*.browser.test.{ts,tsx}", "**/*.cli.test.ts", "**/node_modules/**", "**/dist/**"]
                }
            },
            {
                extends: true,
                test: {
                    name: "cli",
                    environment: "node",
                    include: ["examples/*/test/**/*.cli.test.ts", "packages/*/test/**/*.cli.test.ts"],
                    exclude: ["**/node_modules/**", "**/dist/**"]
                }
            },
            {
                extends: true,
                test: {
                    name: "browser",
                    include: ["packages/*/test/**/*.browser.test.{ts,tsx}", "examples/*/test/**/*.browser.test.{ts,tsx}"],
                    exclude: ["**/node_modules/**", "**/dist/**", "**/fixtures/**"],
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

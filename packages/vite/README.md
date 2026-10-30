# @zerolith/vite

The Vite plugin for zerolith. zerolith runs under Vite with no plugin: the packages are plain ES modules, and Vite's default `development` condition selects the diagnostic build and the inspector in development. The plugin adds what a build step makes possible.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { zerolith } from "@zerolith/vite";

export default defineConfig({
    plugins: [zerolith()]
});
```

- **JSX.** `.jsx` and `.tsx` files are lowered to the `html` calls they stand for, so nothing from JSX reaches the browser. `jsx: false` leaves them to Vite.
- **Hot replacement that understands components.** In development, exported components become stable proxies to their latest version, `render` and `hydrate` roots render again after an edit, and named signals keep their values.
- **Warnings at transform time** for a frozen `${signal.get()}` read in a template and for images, buttons, and frames without an accessible name, each with a diagnostic code. `lint: false` turns them off.
- **Templates prepared at build time.** `vite build` scans every `html` literal ahead of time, so the browser binds templates without scanning them and the scanner leaves the bundle, and a template with no bindings is created once at module scope. A module that uses `html` other than as a template tag, or re-exports it, fails the build at that line. `prepare: false` keeps the scanner.
- **A production check.** A build in production mode fails when the development build of the core reached the output.

The guide is on the [docs site](https://molexxxx.github.io/zerolith/guide/vite/).

Status: alpha. Install with `npm install --save-dev @zerolith/vite@alpha`; the API may change before 1.0.

## License

Apache-2.0. See `LICENSE`.

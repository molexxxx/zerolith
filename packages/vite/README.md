# @zerolith/vite

The Vite plugin for zerolith. zerolith itself needs no plugin under Vite: the packages are plain ES modules and Vite's default `development` condition selects the diagnostic build and the inspector in development. The plugin adds hot module replacement that understands components.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { zerolith } from "@zerolith/vite";

export default defineConfig({
    plugins: [zerolith()]
});
```

In development it rewrites each module so that exported functions with capitalized names become stable proxies to their latest version, calls to `render` and `hydrate` are recorded with the expression they rendered, and a changed module accepts its own update: named signals are saved before the module is replaced, every root renders again, and the saved values flow back into signals created with the same names. Production builds are untouched.

The guide is `docs/guide/vite.md` in the repository.

Status: alpha. Install with `npm install --save-dev @zerolith/vite@alpha`; the API may change before 1.0.

## License

Apache-2.0. See `LICENSE`.

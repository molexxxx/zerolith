/**
 * Serves the repository for working on examples: `node scripts/serve.ts`
 * then open http://127.0.0.1:8080/examples/notes/. Run `npm run build`
 * first; the import maps point at the built packages.
 */
import { createStaticServer, listen } from "./static.ts";

const origin = await listen(createStaticServer(), Number(process.argv[2] ?? 8080));
console.log(`examples at ${origin}/examples/`);

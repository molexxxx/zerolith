/**
 * Serves a folder of the repository as static files, such as the built
 * docs site:
 *   node scripts/serve.ts 8081 site  then open http://127.0.0.1:8081/
 * Run `npm run docs` first. The examples run on the zerolith command line
 * instead; see their READMEs.
 */
import { join } from "node:path";
import { createStaticServer, listen, repositoryRoot } from "./static.ts";

const port = Number(process.argv[2] ?? 8080);
const folder = process.argv[3];
const root = folder === undefined ? repositoryRoot : join(repositoryRoot, folder);
const origin = await listen(createStaticServer(root), port);
console.log(`serving ${folder ?? "the repository"} at ${origin}/`);

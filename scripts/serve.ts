/**
 * Serves a folder of the repository as static files, the built docs site
 * unless another folder is named:
 *   node scripts/serve.ts 8081 site  then open http://127.0.0.1:8081/
 * Run `npm run docs` first. The examples run on the zerolith command line
 * instead; see their READMEs.
 */
import { join } from "node:path";
import { port } from "./options.ts";
import { createStaticServer, listen, repositoryRoot } from "./static.ts";

const listenOn = port("port", process.argv[2] ?? "8080");
const folder = process.argv[3] ?? "site";
const origin = await listen(createStaticServer(join(repositoryRoot, folder)), listenOn);
console.log(`serving ${folder} at ${origin}/`);

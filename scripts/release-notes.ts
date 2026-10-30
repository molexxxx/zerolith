/**
 * Prints the notes of the GitHub release for a version, its CHANGELOG.md
 * section and how to install it: `node scripts/release-notes.ts 0.1.0-alpha.2`.
 * The release workflow passes them to the release it creates.
 */
import { readFile } from "node:fs/promises";
import process from "node:process";
import { checkVersion, releaseNotes } from "./release.ts";

const version = checkVersion(process.argv[2] ?? "");
process.stdout.write(releaseNotes(await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8"), version));

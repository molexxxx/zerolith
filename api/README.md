# API reports

Each file here lists the public API of one package entry, such as `zerolith` or `@zerolith/router`: every export with its signature, and the members of its interfaces, classes, and namespaces, written as TypeScript. They are generated from the source, not written by hand.

The docs build compares the source with these files and fails while they differ, so a change to what users can import shows up in a pull request as a change here and is reviewed as one. After reviewing a change to the API, run `npm run api` to rewrite the reports and commit them with it.

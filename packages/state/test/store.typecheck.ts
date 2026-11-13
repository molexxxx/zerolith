// Compiled by npm run typecheck and never run: the store's setter takes
// only paths and values its data allows, and its view only reads.
import { store } from "@zerolith/state";

const [board, setBoard] = store({ rows: [] as { id: number; label: string }[], owner: { name: "Ada" } as { name: string } | undefined });

setBoard("rows", 0, "label", "renamed");
setBoard("rows", (rows) => [...rows, { id: 1, label: "one" }]);
setBoard("owner", "name", (name) => name.toUpperCase());

// @ts-expect-error a row has no title
setBoard("rows", 0, "title", "x");

// @ts-expect-error an id is a number
setBoard("rows", 0, "id", "one");

// @ts-expect-error the store is read-only
(board.rows[0] as (typeof board.rows)[number]).label = "changed";

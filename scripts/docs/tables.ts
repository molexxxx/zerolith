/**
 * Tables as the docs pages render them: each body cell carries its
 * column's name, which a phone shows above the cell once the rows stack.
 */
import { type Renderer, TextRenderer, type Tokens } from "marked";
import { escapeHtml } from "./highlight.ts";

/** A header's text with its markup and raw HTML left out, as a label shows it. */
class LabelText extends TextRenderer
{
    override html(): string
    {
        return "";
    }
}

/**
 * A table whose body cells carry their column's name in `data-label`, and
 * whose parts keep their table roles, which a browser drops from a table
 * restyled as blocks.
 */
export function labeledTable(renderer: Renderer, token: Tokens.Table): string
{
    const plain = new LabelText();
    plain.parser = renderer.parser;
    const labels = token.header.map((cell) => escapeHtml(renderer.parser.parseInline(cell.tokens, plain)));
    const head = token.header.map((cell) => renderer.tablecell(cell).replace(/^<th/, "<th role=\"columnheader\"")).join("");
    const rows = token.rows.map((row) => `<tr role="row">\n${row.map((cell, index) => renderer.tablecell(cell).replace(/^<td/, `<td role="cell" data-label="${labels[index] ?? ""}"`)).join("")}</tr>\n`).join("");
    return `<table role="table">\n<thead role="rowgroup">\n<tr role="row">\n${head}</tr>\n</thead>\n${rows === "" ? "" : `<tbody role="rowgroup">${rows}</tbody>`}</table>\n`;
}

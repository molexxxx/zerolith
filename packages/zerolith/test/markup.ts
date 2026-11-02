/** Markup with its comments removed, the hydration markers among them, read through the HTML parser as a browser reads a page. */
export function withoutComments(markup: string): string
{
    const template = document.createElement("template");
    template.innerHTML = markup;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_COMMENT);
    const comments: Node[] = [];
    while (walker.nextNode() !== null)
    {
        comments.push(walker.currentNode);
    }
    for (const comment of comments)
    {
        comment.parentNode?.removeChild(comment);
    }
    return template.innerHTML;
}

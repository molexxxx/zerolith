/**
 * Everything outside one element made inert, for a drawer, a menu, or a
 * dialog that is not a native modal: the page behind it takes no focus,
 * no clicks, and no reading by assistive technology until it is given
 * back.
 */

/** How many holds each element is under, so the attribute leaves only with the last; an element inert on its own, with the attribute and no hold, is never touched. */
const holds = new WeakMap<Element, number>();

/** The siblings of `node` and the element the walk continues from: its parent element, or for a node at the top of a shadow tree the tree's host, whose siblings come next. */
function above(node: Node): { siblings: Iterable<Element>; next: Element } | null
{
    const parent = node.parentNode;
    if (parent === null)
    {
        return null;
    }
    if (parent.nodeType === 1)
    {
        return { siblings: (parent as Element).children, next: parent as Element };
    }
    if (parent.nodeType === 11 && "host" in parent)
    {
        return { siblings: (parent as ShadowRoot).children, next: (parent as ShadowRoot).host };
    }
    return null;
}

/**
 * Makes everything outside `element` inert and returns what undoes it: the
 * siblings of the element and of each of its ancestors up to the body get
 * the `inert` attribute, through a shadow tree's host where the element is
 * in one, and the returned function takes it back. An element inert on its
 * own is left as it is, and one two calls hold stays inert until the last
 * lets go, so two drawers at once undo only what each added. Returned
 * from an effect that reads the open state, it holds while the drawer is
 * open and lets go when it closes or the effect is disposed. An element
 * not yet in the page is held once it is, by the next microtask, as a
 * `ref` creates it before its template is inserted. A native `<dialog>`
 * opened with `showModal()` makes the page behind it inert itself and
 * needs none of this.
 */
export function inertOutside(element: Element): () => void
{
    const held: Element[] = [];
    let released = false;
    const hold = (): void =>
    {
        if (released || !element.isConnected)
        {
            return;
        }
        const body = element.ownerDocument.body;
        let node: Element = element;
        while (node !== body)
        {
            const step = above(node);
            if (step === null)
            {
                break;
            }
            for (const sibling of step.siblings)
            {
                if (sibling === node)
                {
                    continue;
                }
                const count = holds.get(sibling) ?? 0;
                if (count === 0)
                {
                    if (sibling.hasAttribute("inert"))
                    {
                        continue;
                    }
                    sibling.setAttribute("inert", "");
                }
                holds.set(sibling, count + 1);
                held.push(sibling);
            }
            node = step.next;
        }
    };
    if (element.isConnected)
    {
        hold();
    }
    else
    {
        queueMicrotask(hold);
    }
    return () =>
    {
        released = true;
        for (const sibling of held)
        {
            const count = (holds.get(sibling) ?? 1) - 1;
            if (count === 0)
            {
                holds.delete(sibling);
                sibling.removeAttribute("inert");
            }
            else
            {
                holds.set(sibling, count);
            }
        }
        held.length = 0;
    };
}

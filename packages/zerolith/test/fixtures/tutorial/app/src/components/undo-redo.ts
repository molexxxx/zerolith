// The buttons that undo and redo changes to the list.
import { type View, computed, html } from "zerolith";
import { changes } from "../store.ts";

/**
 * The click handler for a button that runs `move`. A button that turns
 * itself off loses keyboard focus, so focus moves to the other button,
 * which the move has just turned on.
 */
function pressing(move: () => boolean): (event: Event) => void
{
    return (event) =>
    {
        const button = event.currentTarget as HTMLButtonElement;
        move();
        if (button.disabled)
        {
            const other = button.nextElementSibling
                ?? button.previousElementSibling;
            (other as HTMLElement | null)?.focus();
        }
    };
}

export function UndoRedo(): View
{
    const noUndo = computed(() => !changes.canUndo.get());
    const noRedo = computed(() => !changes.canRedo.get());
    return html`
        <div>
            <button type="button" ?disabled=${noUndo}
                @click=${pressing(changes.undo)}>Undo</button>
            <button type="button" ?disabled=${noRedo}
                @click=${pressing(changes.redo)}>Redo</button>
        </div>`;
}

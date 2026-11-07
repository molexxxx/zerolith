// The buttons that undo and redo changes to the list.
import { type View, computed, html } from "zerolith";
import { changes } from "../store.ts";

export function UndoRedo(): View
{
    const noUndo = computed(() => !changes.canUndo.get());
    const noRedo = computed(() => !changes.canRedo.get());
    return html`
        <div>
            <button type="button" ?disabled=${noUndo}
                @click=${changes.undo}>Undo</button>
            <button type="button" ?disabled=${noRedo}
                @click=${changes.redo}>Redo</button>
        </div>`;
}

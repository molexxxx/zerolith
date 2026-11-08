// The tip calculator page.
import { type View, computed, html, signal } from "zerolith";

export function Tip(): View
{
    const bill = signal("");
    const percent = signal(18);
    const amount = computed(() => Number(bill.get()) || 0);
    const tip = computed(() => amount.get() * percent.get() / 100);
    const total = computed(() => amount.get() + tip.get());
    function typed(event: Event): void
    {
        bill.set((event.currentTarget as HTMLInputElement).value);
    }
    return html`
        <h1>Tip calculator</h1>
        <label>Bill
            <input inputmode="decimal" .value=${bill} @input=${typed}>
        </label>
        <fieldset>
            <legend>Tip</legend>
            ${[15, 18, 20].map((choice) => html`
                <label>
                    <input type="radio" name="percent"
                        .checked=${computed(() => percent.get() === choice)}
                        @change=${() => percent.set(choice)}>
                    ${choice}%
                </label>`)}
        </fieldset>
        <p>Tip: ${computed(() => tip.get().toFixed(2))}</p>
        <p>Total: ${computed(() => total.get().toFixed(2))}</p>`;
}

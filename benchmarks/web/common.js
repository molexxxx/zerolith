// Row generation shared by every implementation, matching the label
// vocabulary of js-framework-benchmark so update costs are comparable.

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
const colors = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
const nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

let nextId = 1;

function pick(list)
{
    return list[Math.floor(Math.random() * list.length)];
}

export function buildRows(count)
{
    return Array.from({ length: count }, () => ({ id: nextId++, label: `${pick(adjectives)} ${pick(colors)} ${pick(nouns)}` }));
}

export function nextFrame()
{
    return new Promise((resolve) =>
    {
        requestAnimationFrame(() => setTimeout(resolve, 0));
    });
}

/**
 * Times one operation plus the synchronous style and layout it forces, then
 * lets a frame pass outside the measurement so paint from one sample does
 * not land inside the next.
 */
export async function timed(operation)
{
    const start = performance.now();
    operation();
    void document.body.offsetHeight;
    const elapsed = performance.now() - start;
    await nextFrame();
    return elapsed;
}

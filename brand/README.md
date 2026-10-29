# zerolith brand

The visual system for every zerolith surface: GitHub and npm, the command line, dev tools, and the docs site. Open [index.html](index.html) in a browser for the full reference with every asset in place.

## Mark

The stele is a standing stone with a zero cut through it.

- It is always one color, and the zero stays open so the ground shows through. Never fill the zero with a second color; the seam renders as a jagged edge.
- Chartreuse on dark grounds, basalt on light grounds and on chartreuse.
- Keep the width of the zero clear on every side. The smallest size is 16 px tall; below that, use the favicon tile.
- It appears once per composition: no echoes, contour rings, outlines, or drawn rock around it.

Files: `mark/stele.svg` (uses `currentColor`), `mark/stele-chartreuse.svg`, `mark/stele-basalt.svg`, `mark/stele-chalk.svg`.

## Lockups

The wordmark is Unbounded at weight 600, lowercase, tracked to -0.03 em, and converted to outlines so it renders without the font. In the horizontal lockup the stele stands 1.55 times the cap height, 0.31 em from the word.

Files in `lockup/`: `horizontal-on-dark.svg`, `horizontal-on-light.svg`, `stacked-on-dark.svg`, `stacked-on-light.svg`, and the wordmark alone in `wordmark.svg` (uses `currentColor`), `wordmark-on-dark.svg`, `wordmark-on-light.svg`.

## App icon and favicon

A chartreuse tile with the stele in basalt.

| File | Use |
| --- | --- |
| `app-icon/favicon.svg`, `app-icon/favicon.ico` | Browser tabs; the ICO holds 16, 32, and 48 px |
| `app-icon/app-icon.svg`, `icon-192.png`, `icon-512.png` | Web app manifests and avatars |
| `app-icon/app-icon-square.svg`, `apple-touch-icon.png` | Platforms that round the corners themselves |
| `app-icon/app-icon-maskable.svg`, `icon-maskable-512.png` | Maskable icons; the stele sits inside the safe zone |
| `.github/assets/icon.svg` (repository root) | A copy of `app-icon.svg` for tools that show a repository's icon; `npm run brand` writes it |

## Color

Basalt carries every surface. Chartreuse `#AACF16` is spent on five things only: the mark, the primary action, the active navigation item, code keywords, and focus. On light grounds chartreuse is a fill only, and deep olive `#4B5E00` takes its text and focus roles. Status colors (danger, warning, hint) are for diagnostics; success is the text color with the check icon.

`tokens.css` holds the values as custom properties, with dark as the default and a light theme for `prefers-color-scheme: light` or `data-theme="light"`. `tokens.json` holds the same values in the Design Tokens Community Group format, plus the terminal mapping. Code blocks stay on basalt in both themes.

## Type

| Family | Role |
| --- | --- |
| Unbounded 600 | Wordmark and headings, tracking -0.03 em |
| Onest 400 and 600 | Body text and interface labels |
| Martian Mono 400 | Code, file names, and small uppercase labels |

All three are licensed under the SIL Open Font License 1.1.

## Interface

Square corners, 2 px rules, and no shadows, glows, or gradients. The primary action is the one solid chartreuse block on a screen; secondary actions are 2 px outlines. Focus is a 2 px outline in the focus color.

## Icons

`icons/` holds three sets drawn on a 24 px grid with 2 px strokes, square caps, and mitered corners, all using `currentColor`:

- `ui/`: interface icons for the docs and tools.
- `packages/`: one glyph per package.
- `diagnostics/`: error (octagon), warning (triangle), and hint (bulb). Each severity differs in shape as well as color.

## GitHub, npm, and the command line

`github/readme-header-dark.svg` and `github/readme-header-light.svg` head the README through a `<picture>` element, each on a transparent background so the page theme shows through and only the ink changes; npm shows the light version. `github/social-card.png` is the 1280 by 640 card a shared link unfurls into.

In the terminal, severities use the basic ANSI colors so each terminal theme tunes them to its own background, and chartreuse appears only as a badge background with basalt text. Output stays plain when `NO_COLOR` is set or output is not a terminal.

## Rebuilding the rasters

The SVG files are the sources. `npm run brand` renders the PNG and ICO files from them with Playwright and stamps each PNG with its source. Lockups and the README header are outlined from the font files, so a change to their text means regenerating the outlines rather than editing the SVG by hand.

## Never

- Orange, amber, or ochre accents.
- A two-tone stele, or echoes of the mark.
- Glows, gradients, and drop shadows.
- Green-tinted grays; chartreuse is the only green.
- Labels stacked above headings.
- Calling zerolith small or minimal.

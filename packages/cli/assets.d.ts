/**
 * The types of the files `zerolith dev` and `zerolith build` turn into
 * values when a module imports them, for a project's `env.d.ts` to
 * reference with `/// <reference types="@zerolith/cli/assets" />`. An
 * image, a font, media, or a document gives its URL, `?url` gives any
 * file's URL, and `?raw` gives a file's text. A project on Vite takes the
 * same types from `vite/client` instead, since both declare these modules.
 */

/** A file imported for its text, as in `import notes from "./notes.md?raw"`. */
declare module "*?raw"
{
    const text: string;
    export default text;
}

/** Any file imported for its URL, as in `import url from "./worker.js?url"`. */
declare module "*?url"
{
    const url: string;
    export default url;
}

/** A `.apng` file, imported for its URL. */
declare module "*.apng"
{
    const url: string;
    export default url;
}

/** A `.bmp` file, imported for its URL. */
declare module "*.bmp"
{
    const url: string;
    export default url;
}

/** A `.png` file, imported for its URL. */
declare module "*.png"
{
    const url: string;
    export default url;
}

/** A `.jpg` file, imported for its URL. */
declare module "*.jpg"
{
    const url: string;
    export default url;
}

/** A `.jpeg` file, imported for its URL. */
declare module "*.jpeg"
{
    const url: string;
    export default url;
}

/** A `.jfif` file, imported for its URL. */
declare module "*.jfif"
{
    const url: string;
    export default url;
}

/** A `.pjpeg` file, imported for its URL. */
declare module "*.pjpeg"
{
    const url: string;
    export default url;
}

/** A `.pjp` file, imported for its URL. */
declare module "*.pjp"
{
    const url: string;
    export default url;
}

/** A `.gif` file, imported for its URL. */
declare module "*.gif"
{
    const url: string;
    export default url;
}

/** A `.svg` file, imported for its URL. */
declare module "*.svg"
{
    const url: string;
    export default url;
}

/** A `.ico` file, imported for its URL. */
declare module "*.ico"
{
    const url: string;
    export default url;
}

/** A `.webp` file, imported for its URL. */
declare module "*.webp"
{
    const url: string;
    export default url;
}

/** A `.avif` file, imported for its URL. */
declare module "*.avif"
{
    const url: string;
    export default url;
}

/** A `.cur` file, imported for its URL. */
declare module "*.cur"
{
    const url: string;
    export default url;
}

/** A `.jxl` file, imported for its URL. */
declare module "*.jxl"
{
    const url: string;
    export default url;
}

/** A `.mp4` file, imported for its URL. */
declare module "*.mp4"
{
    const url: string;
    export default url;
}

/** A `.webm` file, imported for its URL. */
declare module "*.webm"
{
    const url: string;
    export default url;
}

/** A `.ogg` file, imported for its URL. */
declare module "*.ogg"
{
    const url: string;
    export default url;
}

/** A `.mp3` file, imported for its URL. */
declare module "*.mp3"
{
    const url: string;
    export default url;
}

/** A `.wav` file, imported for its URL. */
declare module "*.wav"
{
    const url: string;
    export default url;
}

/** A `.flac` file, imported for its URL. */
declare module "*.flac"
{
    const url: string;
    export default url;
}

/** A `.aac` file, imported for its URL. */
declare module "*.aac"
{
    const url: string;
    export default url;
}

/** A `.opus` file, imported for its URL. */
declare module "*.opus"
{
    const url: string;
    export default url;
}

/** A `.mov` file, imported for its URL. */
declare module "*.mov"
{
    const url: string;
    export default url;
}

/** A `.m4a` file, imported for its URL. */
declare module "*.m4a"
{
    const url: string;
    export default url;
}

/** A `.vtt` file, imported for its URL. */
declare module "*.vtt"
{
    const url: string;
    export default url;
}

/** A `.woff` file, imported for its URL. */
declare module "*.woff"
{
    const url: string;
    export default url;
}

/** A `.woff2` file, imported for its URL. */
declare module "*.woff2"
{
    const url: string;
    export default url;
}

/** A `.eot` file, imported for its URL. */
declare module "*.eot"
{
    const url: string;
    export default url;
}

/** A `.ttf` file, imported for its URL. */
declare module "*.ttf"
{
    const url: string;
    export default url;
}

/** A `.otf` file, imported for its URL. */
declare module "*.otf"
{
    const url: string;
    export default url;
}

/** A `.webmanifest` file, imported for its URL. */
declare module "*.webmanifest"
{
    const url: string;
    export default url;
}

/** A `.pdf` file, imported for its URL. */
declare module "*.pdf"
{
    const url: string;
    export default url;
}

/** A `.txt` file, imported for its URL. */
declare module "*.txt"
{
    const url: string;
    export default url;
}

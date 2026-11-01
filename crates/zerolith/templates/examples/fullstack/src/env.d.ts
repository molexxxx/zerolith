// The values import.meta.env carries under zerolith dev and zerolith build:
// the mode, the base path, and every PUBLIC_ variable from the .env files
// and the environment. The references type the stylesheets imported with
// ?scoped and the images, fonts, and other files imported for their URL or,
// with ?raw, their text.
/// <reference types="zerolith/imports" />
/// <reference types="@zerolith/cli/assets" />
interface ImportMetaEnv
{
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly BASE_URL: string;
    readonly [name: `PUBLIC_${string}`]: string | undefined;
}

interface ImportMeta
{
    readonly env: ImportMetaEnv;
}

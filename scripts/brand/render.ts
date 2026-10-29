/**
 * Renders the raster brand assets from their SVG sources in `brand/`: the
 * web app icons, the Apple touch icon, the maskable icon, `favicon.ico`, and
 * the GitHub social card. It also copies the app icon to `.github/assets/icon.svg`,
 * where tools that show a repository's icon look for it. The SVGs are the
 * sources of truth; rerun this after changing one of them.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { chromium, type Browser } from "playwright";

const root = fileURLToPath(new URL("../../brand/", import.meta.url));
const repositoryIcon = fileURLToPath(new URL("../../.github/assets/icon.svg", import.meta.url));

interface Raster
{
    source: string;
    target: string;
    width: number;
    height: number;
}

const rasters: Raster[] = [
    { source: "app-icon/app-icon.svg", target: "app-icon/icon-192.png", width: 192, height: 192 },
    { source: "app-icon/app-icon.svg", target: "app-icon/icon-512.png", width: 512, height: 512 },
    { source: "app-icon/app-icon-square.svg", target: "app-icon/apple-touch-icon.png", width: 180, height: 180 },
    { source: "app-icon/app-icon-maskable.svg", target: "app-icon/icon-maskable-512.png", width: 512, height: 512 },
    { source: "github/social-card.svg", target: "github/social-card.png", width: 1280, height: 640 },
];

const faviconSizes = [16, 32, 48];

async function render(browser: Browser, source: string, width: number, height: number): Promise<Buffer>
{
    const data = readFileSync(root + source).toString("base64");
    const page = await browser.newPage({ viewport: { width, height } });
    try
    {
        await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><img alt="" src="data:image/svg+xml;base64,${data}" width="${width}" height="${height}" style="display:block"></body></html>`);
        await page.locator("img").evaluate((image: HTMLImageElement) => image.decode());
        return await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
    }
    finally
    {
        await page.close();
    }
}

function withSource(png: Buffer, source: string): Buffer
{
    const type = Buffer.from("tEXt", "latin1");
    const data = Buffer.from(`Source\0Rendered from brand/${source} by scripts/brand/render.ts`, "latin1");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0);
    const headerEnd = 8 + 12 + png.readUInt32BE(8);
    return Buffer.concat([png.subarray(0, headerEnd), length, type, data, checksum, png.subarray(headerEnd)]);
}

function ico(images: { size: number; png: Buffer }[]): Buffer
{
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    const entries: Buffer[] = [];
    let offset = 6 + images.length * 16;
    for (const image of images)
    {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
        entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(image.png.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += image.png.length;
        entries.push(entry);
    }
    return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

mkdirSync(dirname(repositoryIcon), { recursive: true });
copyFileSync(root + "app-icon/app-icon.svg", repositoryIcon);
console.log(".github/assets/icon.svg");

const browser = await chromium.launch();
try
{
    const rendered = await Promise.all(rasters.map(async (raster) => ({ raster, png: await render(browser, raster.source, raster.width, raster.height) })));
    for (const { raster, png } of rendered)
    {
        writeFileSync(root + raster.target, withSource(png, raster.source));
        console.log(`brand/${raster.target}`);
    }
    const frames = await Promise.all(faviconSizes.map(async (size) => ({ size, png: await render(browser, "app-icon/favicon.svg", size, size) })));
    writeFileSync(root + "app-icon/favicon.ico", ico(frames));
    console.log("brand/app-icon/favicon.ico");
}
finally
{
    await browser.close();
}

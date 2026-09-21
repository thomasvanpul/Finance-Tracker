/**
 * Contact sheets of the reference board, for checking fifty captures in a few
 * images rather than fifty. Twelve per sheet, written to .review/shots/.
 *
 *   pnpm --filter @workspace/scripts exec tsx src/reference-board-contact.ts
 */

import { chromium } from "playwright";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const BOARD = path.join(REPO, "design", "reference-board");
const OUT = path.join(REPO, ".review", "shots", "reference-board");
const PER_SHEET = 12;

async function main(): Promise<void> {
  const files = (await readdir(BOARD)).filter((f) => f.endsWith(".jpg")).sort();
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  for (let i = 0; i < files.length; i += PER_SHEET) {
    const chunk = files.slice(i, i + PER_SHEET);
    const cells = chunk
      .map(
        (f) =>
          `<figure><img src="file://${path.join(BOARD, f)}"><figcaption>${f}</figcaption></figure>`,
      )
      .join("");
    // Written to disk and opened as file://, because a setContent() page is
    // about:blank and is not allowed to load file:// images.
    const html = path.join(OUT, "sheet.html");
    await writeFile(
      html,
      `<style>
        body{margin:0;background:#111;font:12px monospace;color:#ddd}
        main{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}
        figure{margin:0}img{width:100%;aspect-ratio:1.6;object-fit:cover;object-position:top;display:block;background:#000}
        figcaption{padding:2px 0 6px}
      </style><main>${cells}</main>`,
    );
    await page.goto(`file://${html}`);
    await page.waitForTimeout(800);
    const sheet = path.join(OUT, `sheet-${String(i / PER_SHEET + 1).padStart(2, "0")}.jpg`);
    await page.screenshot({ path: sheet, type: "jpeg", quality: 80, fullPage: true });
    console.log(sheet, chunk.length);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Capture the Numeris reference board, headless.
 *
 * Reads `design/reference-board/board.json`, screenshots every `url` entry at
 * desktop width (or copies every `copy` entry out of the vault), and writes
 * `NN-<id>.jpg` beside the manifest. A per-screen `status.json` records what
 * happened so a failed capture is a named failure, not a missing file.
 *
 *   pnpm --filter @workspace/scripts exec tsx src/reference-board-capture.ts [id ...]
 *
 * With ids, only those screens are (re)captured. Nothing here touches the app,
 * the seed account or the capture lock: these are third-party pages.
 */

import { chromium, type Browser, type Page } from "playwright";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Screen = {
  id: string;
  group: string;
  title: string;
  why: string;
  url?: string;
  copy?: string;
  wait?: number;
  phone?: boolean;
  /** Scroll this many px before shooting, for marketing pages whose product shot sits under a text hero. */
  scroll?: number;
  /** Extra selectors to hide on this page only — an announcement overlay, a launch modal — named in the manifest so the README can say what was removed. */
  hide?: string[];
  /** "commit" for a page whose DOMContentLoaded never fires (blocking embeds); the shot is taken after `wait` ms instead. */
  waitUntil?: "commit" | "domcontentloaded";
  /** URL substrings to abort for this page only — third-party embeds that keep the renderer busy for ever. */
  block?: string[];
};

type Board = { groups: string[]; screens: Screen[] };

type Status = {
  id: string;
  file: string;
  ok: boolean;
  source: "web" | "vault";
  error?: string;
  finalUrl?: string;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const BOARD = path.join(REPO, "design", "reference-board");
const VAULT = path.join(
  homedir(),
  "Library/Mobile Documents/iCloud~md~obsidian/Documents/vault_general",
);

const DESKTOP = { width: 1600, height: 1000 };
const PHONE = { width: 430, height: 932 };
const DEFAULT_WAIT_MS = 3000;
const AFTER_SCROLL_MS = 2500; // lazy-loaded images below the fold need longer than a paint
const NAV_TIMEOUT_MS = 45_000;
const JPEG_QUALITY = 86;

// Consent and cookie chrome hides the screen being judged. Hidden, not clicked:
// clicking "accept" on fifty third-party sites is a consent nobody gave, and a
// display:none is enough for a picture.
const HIDE_SELECTORS = [
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  ".osano-cm-window",
  "#CybotCookiebotDialog",
  "#usercentrics-root",
  "#sp_message_container_",
  '[id^="sp_message_container"]',
  '[class*="cookie-banner"]',
  '[class*="cookieBanner"]',
  '[class*="cookie-consent"]',
  '[class*="CookieConsent"]',
  '[id*="cookie-banner"]',
  '[id*="cookieBanner"]',
  '[id*="cookie-consent"]',
  '[aria-label*="cookie" i]',
  '[data-testid*="cookie" i]',
  ".cc-window",
  ".truste_overlay",
  ".truste_box_overlay",
  "#truste-consent-track",
  "#gdpr-banner",
  ".gdpr-banner",
  '[class*="consent-banner"]',
  '[id*="consent-banner"]',
  "#cookie-law-info-bar",
  ".te-consent",
  '[class*="consent"]',
];

// Every DOM root on the page: the document plus every open shadow root under
// it. `querySelectorAll` stops at a shadow boundary, and teenage.engineering
// keeps its cookie notice behind one.
const ALL_ROOTS_JS = `const allRoots = () => {
    const roots = [document];
    for (const el of document.querySelectorAll("*")) if (el.shadowRoot) roots.push(el.shadowRoot);
    for (let i = 1; i < roots.length; i++) for (const el of roots[i].querySelectorAll("*")) if (el.shadowRoot) roots.push(el.shadowRoot);
    return roots;
  };`;

function fileFor(index: number, screen: Screen): string {
  return `${String(index + 1).padStart(2, "0")}-${screen.id}.jpg`;
}

// Second net for the dialogs the selector list misses. Two shapes: a fixed
// or sticky banner that talks about cookies or privacy (size-bounded so a page
// that is *about* privacy is not blanked), and a modal dialog with the same
// text, which may sit inside a full-viewport backdrop — that backdrop is hidden
// too when its text is short, because a consent wall has nothing else to say.
const HIDE_FIXED_CONSENT = `(() => {
  ${ALL_ROOTS_JS}
  const vw = innerWidth, vh = innerHeight;
  const re = /cookie|value your privacy|privacy (choices|preferences|matters)|consent/i;
  const nodes = allRoots().flatMap((r) => Array.from(r.querySelectorAll(r === document ? "body *" : "*")));
  for (const node of nodes) {
    const cs = getComputedStyle(node);
    const role = node.getAttribute("role") || "";
    const modal = role === "dialog" || role === "alertdialog" || node.getAttribute("aria-modal") === "true";
    if (cs.position !== "fixed" && cs.position !== "sticky" && !modal) continue;
    const r = node.getBoundingClientRect();
    if (r.width < 120 || r.height < 40) continue;
    const text = (node.innerText || "").slice(0, 3000);
    if (!re.test(text)) continue;
    const covering = r.width * r.height > vw * vh * 0.5;
    if (covering && !modal && text.length > 2500) continue;
    node.remove();
  }
  for (const f of document.querySelectorAll("iframe")) {
    const hint = (f.getAttribute("src") || "") + " " + (f.getAttribute("title") || "");
    if (re.test(hint)) f.style.setProperty("display", "none", "important");
  }
  // A modal that blurs the page behind it leaves the blur on the page after the modal is gone.
  for (const node of document.querySelectorAll("body, body *")) {
    const cs = getComputedStyle(node);
    if (/blur/.test(cs.filter)) node.style.setProperty("filter", "none", "important");
    if (/blur/.test(cs.backdropFilter || "")) node.style.setProperty("backdrop-filter", "none", "important");
  }
  document.documentElement.style.setProperty("overflow", "auto", "important");
  document.body.style.setProperty("overflow", "auto", "important");
})()`;

// Everything is hidden by writing inline styles from a page script rather than
// by injecting a <style> tag: a Content-Security-Policy that forbids inline
// styles rejects the tag (teenage.engineering does), and the first version of
// this function lost both nets to one swallowed rejection.
async function hide(page: Page, selectors: string[]): Promise<void> {
  // Built as a string, not a closure: the bundler decorates closures with
  // helpers (`__name`) that do not exist inside the page.
  const script = `(() => {
    ${ALL_ROOTS_JS}
    const roots = allRoots();
    for (const sel of ${JSON.stringify(selectors)}) {
      let nodes = [];
      try { nodes = roots.flatMap((r) => Array.from(r.querySelectorAll(sel))); } catch { continue; }
      // Removed, not hidden: a notice animated from a script loop gets its
      // inline style rewritten every frame, and display:none loses.
      for (const n of nodes) n.remove();
    }
  })()`;
  try {
    await page.evaluate(script);
  } catch (error) {
    // Logged, not swallowed: a silent failure here cost a capture pass once.
    console.warn(`    hide failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

// Installed before any page script runs: some notices (teenage.engineering)
// are re-inserted by the page after removal, so a one-off sweep loses. The
// observer removes a matching node the moment it appears, for the whole visit.
function removeOnSight(selectors: string[]): string {
  return `(() => {
    ${ALL_ROOTS_JS}
    const list = ${JSON.stringify(selectors)};
    const sweep = () => {
      const roots = allRoots();
      for (const sel of list) {
        let nodes = [];
        try { nodes = roots.flatMap((r) => Array.from(r.querySelectorAll(sel))); } catch { continue; }
        for (const n of nodes) n.remove();
      }
    };
    const start = () => {
      sweep();
      // The observer cannot see inside shadow roots; the interval covers those.
      new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true });
      setInterval(sweep, 250);
    };
    if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start);
  })()`;
}

async function hideConsent(page: Page, extra: string[] = []): Promise<void> {
  await hide(page, [...HIDE_SELECTORS, ...extra]);
  try {
    await page.evaluate(HIDE_FIXED_CONSENT);
  } catch (error) {
    console.warn(`    consent sweep failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }
}

async function captureWeb(browser: Browser, screen: Screen, out: string): Promise<Status> {
  const viewport = screen.phone ? PHONE : DESKTOP;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: screen.phone ? 2 : 1,
    isMobile: !!screen.phone,
    locale: "en-GB",
    timezoneId: "Europe/London",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  });
  if (screen.block?.length) {
    const block = screen.block;
    await context.route("**/*", (route) =>
      block.some((b) => route.request().url().includes(b)) ? route.abort() : route.continue(),
    );
  }
  await context.addInitScript(removeOnSight([...HIDE_SELECTORS, ...(screen.hide ?? [])]));
  const page = await context.newPage();
  const status: Status = { id: screen.id, file: path.basename(out), ok: false, source: "web" };
  try {
    const response = await page.goto(screen.url!, {
      waitUntil: screen.waitUntil ?? "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    if (response && response.status() >= 400) {
      throw new Error(`HTTP ${response.status()}`);
    }
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await hideConsent(page, screen.hide);
    await page.waitForTimeout(screen.wait ?? DEFAULT_WAIT_MS);
    if (screen.scroll) {
      await page.evaluate((y) => window.scrollTo(0, y), screen.scroll);
      await page.waitForTimeout(AFTER_SCROLL_MS);
    }
    await hideConsent(page, screen.hide);
    await page.screenshot({ path: out, type: "jpeg", quality: JPEG_QUALITY, fullPage: false });
    status.ok = true;
    status.finalUrl = page.url();
  } catch (error) {
    status.error = error instanceof Error ? error.message.split("\n")[0] : String(error);
  } finally {
    await context.close();
  }
  return status;
}

async function captureCopy(screen: Screen, out: string): Promise<Status> {
  const status: Status = { id: screen.id, file: path.basename(out), ok: false, source: "vault" };
  try {
    await copyFile(path.join(VAULT, screen.copy!), out);
    status.ok = true;
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
  }
  return status;
}

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2));
  const board = JSON.parse(await readFile(path.join(BOARD, "board.json"), "utf8")) as Board;
  await mkdir(BOARD, { recursive: true });

  const statusPath = path.join(BOARD, "status.json");
  let previous: Status[] = [];
  try {
    previous = JSON.parse(await readFile(statusPath, "utf8")) as Status[];
  } catch {
    previous = [];
  }
  const byId = new Map(previous.map((s) => [s.id, s]));

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    for (const [index, screen] of board.screens.entries()) {
      if (only.size && !only.has(screen.id)) continue;
      const out = path.join(BOARD, fileFor(index, screen));
      const status = screen.copy
        ? await captureCopy(screen, out)
        : await captureWeb(browser, screen, out);
      byId.set(screen.id, status);
      const mark = status.ok ? "ok " : "ERR";
      console.log(`${mark} ${status.file}${status.error ? `  ${status.error}` : ""}`);
      // Written after every screen, so a run killed at 30 has left 30 statuses.
      const ordered = board.screens.map((s) => byId.get(s.id)).filter((s): s is Status => !!s);
      await writeFile(statusPath, JSON.stringify(ordered, null, 2) + "\n");
    }
  } finally {
    await browser.close();
  }

  const all = [...byId.values()];
  const failed = all.filter((s) => !s.ok);
  console.log(`\n${all.length - failed.length} captured, ${failed.length} failed`);
  for (const f of failed) console.log(`  ${f.id}: ${f.error}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

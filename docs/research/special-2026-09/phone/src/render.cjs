// Builds self-contained HTML (tokens inlined), renders void + arctic PNGs at 390x844 DPR 2,
// probes every .pnum for clipping, and always closes the browser.
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/TvpPro/Developer/Finance-Tracker/scripts/node_modules/playwright');

const SRC = __dirname;
const OUT = path.resolve(SRC, '..');
const tokens = fs.readFileSync(path.join(SRC, 'tokens.css'), 'utf8');
const pages = ['A-reach', 'B-depth', 'C-ticker'];

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const name of pages) {
      const html = fs.readFileSync(path.join(SRC, name + '.html'), 'utf8').replace('/*TOKENS*/', tokens);
      const file = path.join(OUT, name + '.html');
      fs.writeFileSync(file, html);
      for (const theme of ['void', 'arctic']) {
        await page.goto('file://' + file);
        await page.evaluate(t => { if (t !== 'void') document.documentElement.dataset.theme = t; }, theme);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const clipped = await page.evaluate(() => [...document.querySelectorAll('.pnum')].filter(el => {
          const r = el.getBoundingClientRect();
          return el.scrollWidth > el.clientWidth + 1 || r.right > 390 || r.left < 0;
        }).map(el => el.textContent));
        const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).join(','));
        await page.screenshot({ path: path.join(OUT, `${name}-${theme}.png`) });
        console.log(name, theme, 'clipped:', JSON.stringify(clipped), 'fonts:', fonts);
      }
    }
  } finally {
    await browser.close();
  }
})();

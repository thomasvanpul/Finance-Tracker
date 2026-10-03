// Which £0 figures an offline render shows that the API never supplied.
//
// A zero on its own proves nothing: /upcoming with no income due reads
// 30D INCOME +£0.00 online and offline, and that zero is real. What the
// offline check guards against is a figure that had a value while the API
// answered and reads £0 once it cannot — a user on a plane reading their net
// worth as zero. So each zero is keyed by the line above it (its label, in
// the app's KPI and table markup) and the offline render is diffed against
// the online render of the same route. fabricated-zeros.test.ts.

// A whole zero: £0, £0.00, signed or not. Not £0.50, £0.05 or £0,5.
const ZERO_FIGURE = /[+−-]?£0(?:\.0+)?(?![\d.,])/g;

// Every £0 figure in a page's innerText, as "<line above> | <its line>".
export function zeroFigures(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const keys: string[] = [];
  lines.forEach((line, i) => {
    const hits = line.match(ZERO_FIGURE)?.length ?? 0;
    for (let n = 0; n < hits; n++) keys.push(`${lines[i - 1] ?? ""} | ${line}`);
  });
  return keys;
}

// Zero figures offline beyond those the same route showed online, counted:
// two zero rows offline against one online is one fabrication.
export function fabricatedZeros(onlineText: string, offlineText: string): string[] {
  const seenOnline = new Map<string, number>();
  for (const key of zeroFigures(onlineText)) seenOnline.set(key, (seenOnline.get(key) ?? 0) + 1);
  const extra: string[] = [];
  for (const key of zeroFigures(offlineText)) {
    const left = seenOnline.get(key) ?? 0;
    if (left > 0) seenOnline.set(key, left - 1);
    else extra.push(key);
  }
  return extra;
}

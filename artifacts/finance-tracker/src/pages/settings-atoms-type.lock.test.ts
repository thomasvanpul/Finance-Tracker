// Lock · the Settings row atoms follow DESIGN.md §10.
//
// Row titles and help text, button labels, nav-item and theme-effect names,
// select options (transition style, masking mode, landing page) and the
// "what is sent" sentences in SettingsInfoRow are language, so sans. The
// panel header and the storage KPI figures with their legends are data, so
// mono, and they are left alone here.
//
// The rows spread ROW, which still sets mono for the plain rows in
// settings.tsx, so a language atom has to name sans rather than drop the
// family — dropping it would inherit mono from the row.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const atoms = readFileSync(path.resolve(__dirname, "./settings-atoms.tsx"), "utf8");

function bodyOf(src: string, fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nexport function ", start + 1);
  return src.slice(start, next > 0 ? next : undefined);
}

const LANGUAGE_ATOMS = [
  "RowLabel",
  "ActionBtn",
  "SettingsInfoRow",
  "SettingsDataResetRow",
  "SettingsSelectRow",
  "SettingsNavItemRow",
  "SettingsWidgetRow",
  "SettingsThemeEffectRow",
];

describe("Settings atoms type", () => {
  it.each(LANGUAGE_ATOMS)("%s draws its copy in sans", (fn) => {
    const body = bodyOf(atoms, fn);
    expect(body).not.toContain("--font-mono");
    expect(body).toContain("--font-sans");
  });

  it("keeps the panel header and the storage KPI figures and legends in mono", () => {
    expect(atoms).toMatch(/HEADER_STYLE = \{[^}]*fontFamily: "var\(--font-mono\)"/);
    const kpi = bodyOf(atoms, "StorageKpiStrip");
    expect(kpi.match(/var\(--font-mono\)/g)).toHaveLength(2);
  });
});

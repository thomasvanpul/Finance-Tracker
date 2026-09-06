// Regenerates the service-ceilings table in docs/OPERATIONS.md from the typed
// source at artifacts/api-server/src/lib/service-facts.ts.
//
// The doc keeps its own prose — the reasoning, the symptom, the upgrade
// argument. Only the table between the two SERVICE-FACTS markers is written
// here, so the numbers exist once and the words exist once.
//
//   pnpm --filter @workspace/api-server gen:service-facts
//
// service-facts.doc-drift.lock.test.ts runs the same render and fails if the
// committed file differs, so a change to the typed source that skips this
// script cannot land.
//
// It sits beside service-facts.ts rather than in scripts/ because that package
// sets a rootDir of its own src/ and cannot import across package boundaries.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_FACTS, totalMonthlyCostGbp } from "./service-facts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
export const DOC_PATH = join(REPO_ROOT, "docs", "OPERATIONS.md");
const BEGIN = "<!-- BEGIN SERVICE-FACTS (generated — edit lib/service-facts.ts, then pnpm gen:service-facts) -->";
const END = "<!-- END SERVICE-FACTS -->";

function money(gbp: number): string {
  return gbp === 0 ? "£0" : `£${gbp}/mo`;
}

export function renderTable(): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(
    `Generated from \`artifacts/api-server/src/lib/service-facts.ts\`. ` +
      `Total monthly spend: **${money(totalMonthlyCostGbp())}**.`,
  );
  lines.push("");
  lines.push("| Service | Plan | Cost | Next plan | Ceiling that bites first | Checked |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const s of SERVICE_FACTS) {
    const first = s.ceilings[0];
    const ceiling = first
      ? `${first.label} ${first.limit === null ? "—" : first.limit} ${first.unit}`
      : "—";
    lines.push(
      `| ${s.name} | ${s.plan} | ${money(s.monthlyCostGbp)} | ` +
        `${s.nextPlan ? `${s.nextPlan.name} ≈ ${money(s.nextPlan.monthlyCostGbp)}` : "—"} | ` +
        `${ceiling} | ${s.checkedOn} |`,
    );
  }
  lines.push("");
  const blockers = SERVICE_FACTS.filter((s) => s.launchBlocker !== null);
  if (blockers.length > 0) {
    lines.push("**Cannot ship to public users as configured:**");
    lines.push("");
    for (const s of blockers) {
      lines.push(`- **${s.name}** — ${s.launchBlocker}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderDoc(current: string): string {
  const b = current.indexOf(BEGIN);
  const e = current.indexOf(END);
  if (b === -1 || e === -1) {
    throw new Error(
      `SERVICE-FACTS markers not found in ${DOC_PATH}. Expected both:\n  ${BEGIN}\n  ${END}`,
    );
  }
  return current.slice(0, b + BEGIN.length) + "\n" + renderTable() + current.slice(e);
}

function main(): void {
  const current = readFileSync(DOC_PATH, "utf-8");
  const next = renderDoc(current);
  if (next === current) {
    console.log("docs/OPERATIONS.md already up to date");
    return;
  }
  writeFileSync(DOC_PATH, next);
  console.log("docs/OPERATIONS.md service-facts table regenerated");
}

if (process.argv[1] && process.argv[1].endsWith("service-facts-doc.ts")) main();

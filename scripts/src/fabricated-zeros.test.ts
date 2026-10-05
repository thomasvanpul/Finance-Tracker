// Lock on verify-offline's FABRICATED ZEROS check.
//
// It used to be /£0(?:\.\d{2})?\b/ over the first 500 characters of the
// offline page, which flagged a zero the API supplied (/upcoming 30D INCOME
// +£0.00 with no income due) and so could never pass a screen with a genuine
// zero — and it matched £0.50 as well. The check now asks a different
// question: which £0 figures does the offline page show that the same route
// did not show online, with the API answering? The online render is the
// record of what the API supplied.
//
// node:test, matching app-routes.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { zeroFigures, fabricatedZeros } from "./fabricated-zeros.js";

const UPCOMING_ONLINE = "UPCOMING\n30D INCOME\n+£0.00\n30D OUTGOING\n−£1,240.00";

test("an API-supplied zero is not fabricated", () => {
  assert.deepEqual(fabricatedZeros(UPCOMING_ONLINE, UPCOMING_ONLINE), []);
});

test("a zero offline that was a real figure online is fabricated", () => {
  const online = "NET WORTH\n£48,210.00\nTOTAL SPENT\n£612.40";
  const offline = "NET WORTH\n£0.00\nTOTAL SPENT\n£612.40";
  assert.deepEqual(fabricatedZeros(online, offline), ["NET WORTH | £0.00"]);
});

test("a zero past the first 500 characters is still seen", () => {
  const filler = "ROW\n£12.00\n".repeat(60);
  const online = `${filler}BALANCE\n£90.00`;
  const offline = `${filler}BALANCE\n£0`;
  assert.deepEqual(fabricatedZeros(online, offline), ["BALANCE | £0"]);
});

test("counts repeats: one more zero row offline than online is one fabrication", () => {
  const online = "SPENT\n£0.00\nSPENT\n£40.00";
  const offline = "SPENT\n£0.00\nSPENT\n£0.00";
  assert.deepEqual(fabricatedZeros(online, offline), ["SPENT | £0.00"]);
});

test("only a whole zero is a zero — £0.50, £0.05 and £0,5 are not", () => {
  assert.deepEqual(zeroFigures("FEE\n£0.50\nFX\n£0.05\nODD\n£0,5"), []);
  assert.deepEqual(zeroFigures("A\n£0\nB\n−£0.00\nC\n+£0.00"), ["A | £0", "B | −£0.00", "C | +£0.00"]);
});

// ─── T1 (5 Oct 2026): a null input must be STATED, not scored ────────────────
//
// The ten defects T1 fixed were all one shape: an input nobody supplied,
// shown as a number. These assert the text-level check a browser run uses,
// and the cross-route diff that catches a second definition of one figure.
//
// What they do NOT assert: that the app renders this way. These are the
// checker. The capture in .review/shots/t1/ is the record of the render.

import {
  STATED_UNKNOWN,
  figuresByLabel,
  unknownsNotStated,
  figureAcrossRoutes,
  distinctFigures,
} from "./fabricated-zeros.js";

test("a figure belongs to the label above it", () => {
  const text = "SAVINGS RATE\n-2.5%\nMONTHLY INCOME\n£1,250.00\nRUNWAY\n—";
  const byLabel = figuresByLabel(text);
  assert.deepEqual(byLabel.get("savings rate"), ["-2.5%"]);
  assert.deepEqual(byLabel.get("monthly income"), ["£1,250.00"]);
  assert.deepEqual(byLabel.get("runway"), [STATED_UNKNOWN]);
});

test("a label containing digits is not mistaken for a value", () => {
  // "30D INCOME" is a label. Reading it as a figure would key the next
  // label's value to it and shift every pair on the page by one.
  const byLabel = figuresByLabel("UPCOMING\n30D INCOME\n+£0.00");
  assert.deepEqual(byLabel.get("30d income"), ["+£0.00"]);
  assert.equal(byLabel.has("upcoming"), false);
});

test("an unknown shown as zero, as a grade, or not at all is reported", () => {
  const page = "SAVINGS RATE\n0%\nHEALTH SCORE\n42\nRUNWAY\n£0.00\nPORTFOLIO\n—";
  assert.deepEqual(
    unknownsNotStated(page, ["Savings Rate", "Runway", "Portfolio", "Tax Due"]),
    [
      { label: "Savings Rate", showed: "0%" },
      { label: "Runway", showed: "£0.00" },
      // "Tax Due" is absent: a cell that stopped rendering states nothing.
      { label: "Tax Due", showed: "missing" },
    ],
  );
});

test("a grade standing in for an unknown is reported as the grade", () => {
  // Item 3: a null pillar must read as unknown, "never as 0 or as a grade".
  // Reporting this as "missing" would send a reader looking for a cell that
  // is in fact on the screen.
  assert.deepEqual(unknownsNotStated("HEALTH SCORE\n42", ["HEALTH SCORE"]), [
    { label: "HEALTH SCORE", showed: "42" },
  ]);
});

test("a stated unknown passes; a bare 0 does not", () => {
  assert.deepEqual(unknownsNotStated("SAVINGS RATE\n—", ["SAVINGS RATE"]), []);
  assert.deepEqual(unknownsNotStated("SAVINGS RATE\n0%", ["SAVINGS RATE"]), [
    { label: "SAVINGS RATE", showed: "0%" },
  ]);
});

test("four routes agreeing on one figure yield one distinct value", () => {
  const pages = {
    "/": "MONTHLY INCOME\n+£1,250.00",
    "/analytics": "Avg Mo. Income · recorded months\n+£1,250.00",
    "/cashflow": "RECORDED THIS MONTH\n+£1,250.00",
    "/whatif": "CURRENT INCOME\n+£1,250.00",
  };
  const labels = {
    "/": "MONTHLY INCOME",
    "/analytics": "Avg Mo. Income · recorded months",
    "/cashflow": "RECORDED THIS MONTH",
    "/whatif": "CURRENT INCOME",
  };
  assert.deepEqual(distinctFigures(figureAcrossRoutes(pages, labels)), ["+£1,250.00"]);
});

test("a second definition of one figure shows up as a second distinct value", () => {
  // The measured defect: /whatif opened at an invented £3,000 while every
  // other surface read £1,250 from the ledger.
  const found = figureAcrossRoutes(
    { "/": "MONTHLY INCOME\n+£1,250.00", "/whatif": "CURRENT INCOME\n£3,000.00" },
    { "/": "MONTHLY INCOME", "/whatif": "CURRENT INCOME" },
  );
  assert.deepEqual(distinctFigures(found), ["+£1,250.00", "£3,000.00"]);
});

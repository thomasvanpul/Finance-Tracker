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

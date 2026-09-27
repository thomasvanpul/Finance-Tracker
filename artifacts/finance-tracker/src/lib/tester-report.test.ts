import { describe, expect, it } from "vitest";
import { browserLabel, buildReportText, deviceLabel, reportFileName, type DeviceFacts } from "./tester-report";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const phone: DeviceFacts = {
  userAgent: IPHONE_SAFARI,
  maxTouchPoints: 5,
  width: 390,
  height: 844,
  pixelRatio: 3,
  installed: true,
};

describe("deviceLabel", () => {
  it("names an iPhone with its iOS version", () => {
    expect(deviceLabel(phone)).toBe("iPhone · iOS 18.2");
  });

  it("tells an iPad reporting a Mac user agent apart by touch points", () => {
    // The Mac user agent carries the frozen "10_15_7", not the iPadOS
    // version, so no version is claimed.
    expect(deviceLabel({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })).toBe("iPad");
    expect(deviceLabel({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 })).toBe("Mac");
  });

  it("names Android with its version", () => {
    expect(deviceLabel({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe("Android 15");
  });
});

describe("browserLabel", () => {
  it("does not mistake Chrome on iOS or on the Mac for Safari", () => {
    expect(browserLabel(IPHONE_CHROME)).toBe("Chrome");
    expect(browserLabel(MAC_CHROME)).toBe("Chrome");
    expect(browserLabel(IPHONE_SAFARI)).toBe("Safari");
  });
});

describe("buildReportText", () => {
  const at = new Date(2026, 8, 30, 9, 5);

  it("carries the note, the screen and the device, and nothing from the URL query", () => {
    const text = buildReportText({
      kind: "bug",
      note: "  The total overlaps the tab bar  ",
      route: "/spending?q=tesco#row-4",
      device: phone,
      commit: "f47e490bbb6fad94",
      at,
    });
    expect(text).toBe(
      [
        "NUMERIS · BUG",
        "The total overlaps the tab bar",
        "",
        "screen  /spending",
        "device  iPhone · iOS 18.2 · installed app",
        "view    390×844 @3x",
        "build   f47e490",
        "time    2026-09-30 09:05",
      ].join("\n"),
    );
    expect(text).not.toContain("tesco");
  });

  it("drops the empty note line and names the browser when not installed", () => {
    const text = buildReportText({
      kind: "idea",
      note: "   ",
      route: "/",
      device: { ...phone, userAgent: MAC_CHROME, maxTouchPoints: 0, installed: false, pixelRatio: 2 },
      commit: null,
      at,
    });
    expect(text.split("\n").slice(0, 3)).toEqual(["NUMERIS · IDEA", "", "screen  /"]);
    expect(text).toContain("device  Mac · Chrome");
    expect(text).toContain("build   local");
  });
});

describe("reportFileName", () => {
  it("is stable and sortable", () => {
    expect(reportFileName({ kind: "bug", at: new Date(2026, 8, 30, 9, 5) })).toBe("numeris-bug-202609300905.png");
  });
});

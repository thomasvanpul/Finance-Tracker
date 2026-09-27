// The text a tester's report carries into the testers' group chat.
//
// Pure, so it is tested without a DOM. The component gathers the facts;
// this decides what reaches the chat. Nothing here may carry a figure, an
// email address or an account name: the report goes to a group of other
// testers, and the screenshot beside it has its figures masked by default.

export type ReportKind = "bug" | "idea";

export interface DeviceFacts {
  userAgent: string;
  maxTouchPoints: number;
  width: number;
  height: number;
  pixelRatio: number;
  installed: boolean;
}

export interface ReportFacts {
  kind: ReportKind;
  note: string;
  route: string;
  device: DeviceFacts;
  commit: string | null;
  at: Date;
}

// iPadOS 13+ reports a Mac user agent; the touch-point count is the only
// thing that tells them apart in a browser.
export function deviceLabel(d: Pick<DeviceFacts, "userAgent" | "maxTouchPoints">): string {
  const ua = d.userAgent;
  const iosVersion = /OS (\d+)[_.](\d+)/.exec(ua);
  if (/iPhone/.test(ua)) return iosVersion ? `iPhone · iOS ${iosVersion[1]}.${iosVersion[2]}` : "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && d.maxTouchPoints > 1)) {
    return iosVersion ? `iPad · iPadOS ${iosVersion[1]}.${iosVersion[2]}` : "iPad";
  }
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "unknown device";
}

// Order matters: Edge and Chrome on iOS both carry "Safari" too.
export function browserLabel(userAgent: string): string {
  if (/EdgiOS|Edg\//.test(userAgent)) return "Edge";
  if (/CriOS|Chrome\//.test(userAgent)) return "Chrome";
  if (/FxiOS|Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "browser";
}

const HEADINGS: Record<ReportKind, string> = { bug: "NUMERIS · BUG", idea: "NUMERIS · IDEA" };

function stamp(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

// Query strings can carry search text or ids; the path is enough to find
// the screen.
function screenOf(route: string): string {
  const path = route.split(/[?#]/)[0];
  return path.length > 0 ? path : "/";
}

export function buildReportText(f: ReportFacts): string {
  const d = f.device;
  const where = d.installed ? "installed app" : browserLabel(d.userAgent);
  const lines = [
    HEADINGS[f.kind],
    f.note.trim(),
    "",
    `screen  ${screenOf(f.route)}`,
    `device  ${deviceLabel(d)} · ${where}`,
    `view    ${d.width}×${d.height} @${Math.round(d.pixelRatio * 10) / 10}x`,
    `build   ${f.commit ? f.commit.slice(0, 7) : "local"}`,
    `time    ${stamp(f.at)}`,
  ];
  return lines.filter((line, i) => !(i === 1 && line === "")).join("\n");
}

export function reportFileName(f: Pick<ReportFacts, "kind" | "at">): string {
  return `numeris-${f.kind}-${stamp(f.at).replace(/[-: ]/g, "")}.png`;
}

import { useState, useMemo, useRef } from "react";
import { useListTransactions, useListUpcoming } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import type { Transaction, UpcomingItem } from "@workspace/api-client-react";
import { Download, Upload, Plus, Bell, BellOff, Calendar, X, Check } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYYYYMM(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayTransactions {
  transactions: Transaction[];
  upcoming: UpcomingItem[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

interface CustomEvent {
  id: string;
  date: string;
  time?: string; // HH:MM
  title: string;
  description?: string;
  color: string;
  notifyAt?: string; // ISO timestamp
}

interface FeedEvent {
  date: string;
  title: string;
  feedId: string;
}

interface ImportedFeed {
  id: string;
  name: string;
  color: string;
  events: FeedEvent[];
}

// ─── Predefined calendar feeds ────────────────────────────────────────────────

interface PredefinedFeed {
  id: string;
  name: string;
  color: string;
  category: string;
  events: Array<{ date: string; title: string }>;
}

const PREDEFINED_FEEDS: PredefinedFeed[] = [
  {
    id: "uk-holidays",
    name: "UK Bank Holidays",
    color: "#4ADE80",
    category: "Holidays",
    events: [
      { date: "2025-01-01", title: "New Year's Day" },
      { date: "2025-04-18", title: "Good Friday" },
      { date: "2025-04-21", title: "Easter Monday" },
      { date: "2025-05-05", title: "Early May Bank Holiday" },
      { date: "2025-05-26", title: "Spring Bank Holiday" },
      { date: "2025-08-25", title: "Summer Bank Holiday" },
      { date: "2025-12-25", title: "Christmas Day" },
      { date: "2025-12-26", title: "Boxing Day" },
      { date: "2026-01-01", title: "New Year's Day" },
      { date: "2026-04-03", title: "Good Friday" },
      { date: "2026-04-06", title: "Easter Monday" },
      { date: "2026-05-04", title: "Early May Bank Holiday" },
      { date: "2026-05-25", title: "Spring Bank Holiday" },
      { date: "2026-08-31", title: "Summer Bank Holiday" },
      { date: "2026-12-25", title: "Christmas Day" },
      { date: "2026-12-28", title: "Boxing Day (substitute)" },
    ],
  },
  {
    id: "us-holidays",
    name: "US Federal Holidays",
    color: "#60A5FA",
    category: "Holidays",
    events: [
      { date: "2025-01-01", title: "New Year's Day" },
      { date: "2025-01-20", title: "MLK Jr. Day" },
      { date: "2025-02-17", title: "Presidents' Day" },
      { date: "2025-05-26", title: "Memorial Day" },
      { date: "2025-06-19", title: "Juneteenth" },
      { date: "2025-07-04", title: "Independence Day" },
      { date: "2025-09-01", title: "Labor Day" },
      { date: "2025-10-13", title: "Columbus Day" },
      { date: "2025-11-11", title: "Veterans Day" },
      { date: "2025-11-27", title: "Thanksgiving" },
      { date: "2025-12-25", title: "Christmas Day" },
      { date: "2026-01-01", title: "New Year's Day" },
      { date: "2026-01-19", title: "MLK Jr. Day" },
      { date: "2026-02-16", title: "Presidents' Day" },
      { date: "2026-05-25", title: "Memorial Day" },
      { date: "2026-06-19", title: "Juneteenth" },
      { date: "2026-07-04", title: "Independence Day" },
    ],
  },
  {
    id: "boe-mpc",
    name: "BoE MPC Meetings",
    color: "#F0883E",
    category: "Economics",
    events: [
      { date: "2025-02-06", title: "BoE MPC Decision" },
      { date: "2025-03-20", title: "BoE MPC Decision" },
      { date: "2025-05-08", title: "BoE MPC Decision" },
      { date: "2025-06-19", title: "BoE MPC Decision" },
      { date: "2025-08-07", title: "BoE MPC Decision" },
      { date: "2025-09-18", title: "BoE MPC Decision" },
      { date: "2025-11-06", title: "BoE MPC Decision" },
      { date: "2025-12-18", title: "BoE MPC Decision" },
      { date: "2026-02-05", title: "BoE MPC Decision" },
      { date: "2026-03-19", title: "BoE MPC Decision" },
      { date: "2026-05-07", title: "BoE MPC Decision" },
    ],
  },
  {
    id: "fomc",
    name: "US FOMC Meetings",
    color: "#4D9FFF",
    category: "Economics",
    events: [
      { date: "2025-01-29", title: "FOMC Rate Decision" },
      { date: "2025-03-19", title: "FOMC Rate Decision" },
      { date: "2025-05-07", title: "FOMC Rate Decision" },
      { date: "2025-06-18", title: "FOMC Rate Decision" },
      { date: "2025-07-30", title: "FOMC Rate Decision" },
      { date: "2025-09-17", title: "FOMC Rate Decision" },
      { date: "2025-10-29", title: "FOMC Rate Decision" },
      { date: "2025-12-10", title: "FOMC Rate Decision" },
      { date: "2026-01-28", title: "FOMC Rate Decision" },
      { date: "2026-03-18", title: "FOMC Rate Decision" },
    ],
  },
  {
    id: "uk-cpi",
    name: "UK CPI Releases",
    color: "#22D3EE",
    category: "Economics",
    events: [
      { date: "2025-01-15", title: "UK CPI Release" },
      { date: "2025-02-19", title: "UK CPI Release" },
      { date: "2025-03-26", title: "UK CPI Release" },
      { date: "2025-04-16", title: "UK CPI Release" },
      { date: "2025-05-21", title: "UK CPI Release" },
      { date: "2025-06-18", title: "UK CPI Release" },
      { date: "2025-07-16", title: "UK CPI Release" },
      { date: "2025-08-20", title: "UK CPI Release" },
      { date: "2025-09-17", title: "UK CPI Release" },
      { date: "2025-10-15", title: "UK CPI Release" },
      { date: "2025-11-19", title: "UK CPI Release" },
      { date: "2025-12-17", title: "UK CPI Release" },
    ],
  },
  {
    id: "us-nfp",
    name: "US Jobs Report (NFP)",
    color: "#56D364",
    category: "Economics",
    events: [
      { date: "2025-01-10", title: "US Non-Farm Payrolls" },
      { date: "2025-02-07", title: "US Non-Farm Payrolls" },
      { date: "2025-03-07", title: "US Non-Farm Payrolls" },
      { date: "2025-04-04", title: "US Non-Farm Payrolls" },
      { date: "2025-05-02", title: "US Non-Farm Payrolls" },
      { date: "2025-06-06", title: "US Non-Farm Payrolls" },
      { date: "2025-07-03", title: "US Non-Farm Payrolls" },
      { date: "2025-08-01", title: "US Non-Farm Payrolls" },
      { date: "2025-09-05", title: "US Non-Farm Payrolls" },
      { date: "2025-10-03", title: "US Non-Farm Payrolls" },
      { date: "2025-11-07", title: "US Non-Farm Payrolls" },
      { date: "2025-12-05", title: "US Non-Farm Payrolls" },
    ],
  },
  {
    id: "earnings-mega-cap",
    name: "Mega-Cap Earnings",
    color: "#D2A8FF",
    category: "Earnings",
    events: [
      // Q4 2024 (reported Jan-Feb 2025)
      { date: "2025-01-29", title: "AAPL Earnings (Q1 FY25)" },
      { date: "2025-01-29", title: "META Earnings (Q4 2024)" },
      { date: "2025-01-29", title: "MSFT Earnings (Q2 FY25)" },
      { date: "2025-01-29", title: "TSLA Earnings (Q4 2024)" },
      { date: "2025-02-04", title: "GOOG Earnings (Q4 2024)" },
      { date: "2025-02-06", title: "AMZN Earnings (Q4 2024)" },
      { date: "2025-02-26", title: "NVDA Earnings (Q4 FY25)" },
      // Q1 2025 (reported Apr-May)
      { date: "2025-04-29", title: "AAPL Earnings (Q2 FY25)" },
      { date: "2025-04-29", title: "META Earnings (Q1 2025)" },
      { date: "2025-04-30", title: "MSFT Earnings (Q3 FY25)" },
      { date: "2025-04-22", title: "TSLA Earnings (Q1 2025)" },
      { date: "2025-04-29", title: "GOOG Earnings (Q1 2025)" },
      { date: "2025-05-01", title: "AMZN Earnings (Q1 2025)" },
      { date: "2025-05-28", title: "NVDA Earnings (Q1 FY26)" },
      // Q2 2025 (reported Jul-Aug)
      { date: "2025-07-31", title: "AAPL Earnings (Q3 FY25)" },
      { date: "2025-07-30", title: "META Earnings (Q2 2025)" },
      { date: "2025-07-30", title: "MSFT Earnings (Q4 FY25)" },
      { date: "2025-07-22", title: "TSLA Earnings (Q2 2025)" },
      { date: "2025-07-29", title: "GOOG Earnings (Q2 2025)" },
      { date: "2025-08-01", title: "AMZN Earnings (Q2 2025)" },
      { date: "2025-08-27", title: "NVDA Earnings (Q2 FY26)" },
      // Q3 2025 (reported Oct-Nov)
      { date: "2025-10-30", title: "AAPL Earnings (Q4 FY25)" },
      { date: "2025-10-29", title: "META Earnings (Q3 2025)" },
      { date: "2025-10-29", title: "MSFT Earnings (Q1 FY26)" },
      { date: "2025-10-22", title: "TSLA Earnings (Q3 2025)" },
      { date: "2025-10-28", title: "GOOG Earnings (Q3 2025)" },
      { date: "2025-10-30", title: "AMZN Earnings (Q3 2025)" },
      { date: "2025-11-19", title: "NVDA Earnings (Q3 FY26)" },
    ],
  },
];

// ─── ICS utilities ────────────────────────────────────────────────────────────

function escapeICS(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildICS(events: Array<{ date: string; title: string; description?: string }>): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Finance Tracker//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Finance Tracker",
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  for (const ev of events) {
    const dateVal = ev.date.replace(/-/g, "");
    const vevent = [
      "BEGIN:VEVENT",
      `UID:ft-${ev.date}-${Math.random().toString(36).slice(2)}@financetracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateVal}`,
      `DTEND;VALUE=DATE:${dateVal}`,
      `SUMMARY:${escapeICS(ev.title)}`,
      ev.description ? `DESCRIPTION:${escapeICS(ev.description)}` : null,
      "END:VEVENT",
    ].filter((x): x is string => x !== null);
    lines.push(...vevent);
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseICS(text: string): Array<{ date: string; title: string }> {
  const results: Array<{ date: string; title: string }> = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let inEvent = false;
  let summary = "";
  let dtstart = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") { inEvent = true; summary = ""; dtstart = ""; }
    else if (line === "END:VEVENT") {
      if (inEvent && dtstart && summary) {
        const dateStr = dtstart.replace(/T.*$/, "").replace(/[^0-9]/g, "");
        if (dateStr.length >= 8) {
          results.push({
            date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
            title: summary.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";"),
          });
        }
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith("SUMMARY:") || line.startsWith("SUMMARY;")) {
        summary = line.replace(/^SUMMARY[;:][^:]*:?/, "").replace(/^SUMMARY:/, "");
      } else if (line.startsWith("DTSTART")) {
        dtstart = line.split(":").slice(1).join(":");
      }
    }
  }
  return results;
}

function loadCustomEvents(): CustomEvent[] {
  try { const r = localStorage.getItem("ft-cal-events"); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveCustomEvents(events: CustomEvent[]) {
  localStorage.setItem("ft-cal-events", JSON.stringify(events));
}
function loadEnabledFeeds(): string[] {
  try { const r = localStorage.getItem("ft-cal-feeds"); return r ? JSON.parse(r) : ["uk-holidays"]; } catch { return ["uk-holidays"]; }
}
function saveEnabledFeeds(ids: string[]) {
  localStorage.setItem("ft-cal-feeds", JSON.stringify(ids));
}
function loadImportedFeeds(): ImportedFeed[] {
  try { const r = localStorage.getItem("ft-cal-imported"); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveImportedFeeds(feeds: ImportedFeed[]) {
  localStorage.setItem("ft-cal-imported", JSON.stringify(feeds));
}

// ─── Notification helper ──────────────────────────────────────────────────────

function useNotifPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  async function request() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }
  return { permission, request };
}

const EVENT_COLORS = ["#F4A21E", "#4ADE80", "#60A5FA", "#F87171", "#22D3EE", "#D2A8FF", "#FF7B72", "#E3B341"];

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ft-green)", display: "inline-block" }} />
        Income
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ft-red)", display: "inline-block" }} />
        Expense
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "7px solid var(--ft-amber)", display: "inline-block" }} />
        Bill due
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 8, height: 3, background: "var(--ft-accent)", display: "inline-block", borderRadius: 1 }} />
        Event
      </span>
    </div>
  );
}

// ─── Custom Event Form ────────────────────────────────────────────────────────

function EventForm({
  defaultDate,
  onSave,
  onCancel,
}: {
  defaultDate: string;
  onSave: (ev: Omit<CustomEvent, "id">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(EVENT_COLORS[0]);

  const inp: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)",
    background: "var(--ft-base)", border: "1px solid var(--ft-border2)",
    padding: "5px 8px", width: "100%", outline: "none", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)",
    letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 4,
  };

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: 16, marginBottom: 12 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>Add Event</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" style={inp} />
        </div>
        <div>
          <label style={lbl}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Time (optional)</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes…" style={inp} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Color</label>
          <div style={{ display: "flex", gap: 6 }}>
            {EVENT_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--ft-text)" : "2px solid transparent", cursor: "pointer", outline: "none" }} />
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => { if (title.trim() && date) onSave({ title: title.trim(), date, time: time || undefined, description: description || undefined, color }); }}
          disabled={!title.trim() || !date}
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", background: title.trim() && date ? "var(--ft-accent)" : "var(--ft-raised)", color: title.trim() && date ? "var(--ft-base)" : "var(--ft-dim)", border: "none", padding: "6px 16px", cursor: title.trim() && date ? "pointer" : "default" }}
        >
          Save Event
        </button>
        <button onClick={onCancel} style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "6px 12px", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Calendar Sources Panel ───────────────────────────────────────────────────

function SourcesPanel({
  enabledFeeds,
  onToggleFeed,
  importedFeeds,
  onImport,
  onDeleteImported,
  customEvents,
  allEvents,
  onExport,
  notifPermission,
  onRequestNotif,
  onClose,
}: {
  enabledFeeds: string[];
  onToggleFeed: (id: string) => void;
  importedFeeds: ImportedFeed[];
  onImport: (feed: ImportedFeed) => void;
  onDeleteImported: (id: string) => void;
  customEvents: CustomEvent[];
  allEvents: Array<{ date: string; title: string; description?: string }>;
  onExport: () => void;
  notifPermission: NotificationPermission;
  onRequestNotif: () => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const feedCategories = Array.from(new Set(PREDEFINED_FEEDS.map((f) => f.category)));

  async function handleFileImport(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const events = parseICS(text);
    if (events.length === 0) return;
    const feed: ImportedFeed = {
      id: `import-${Date.now()}`,
      name: file.name.replace(".ics", ""),
      color: EVENT_COLORS[importedFeeds.length % EVENT_COLORS.length],
      events: events.map((e) => ({ ...e, feedId: `import-${Date.now()}` })),
    };
    onImport(feed);
  }

  const headerStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)",
    letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 14px 4px",
    borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)",
  };

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", minWidth: 280, maxWidth: 320 }}>
      <div style={{ background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)" }}>Calendar Sources</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", display: "flex", alignItems: "center" }}>
          <X size={12} />
        </button>
      </div>

      {/* Predefined feeds by category */}
      {feedCategories.map((cat) => (
        <div key={cat}>
          <div style={headerStyle}>{cat}</div>
          {PREDEFINED_FEEDS.filter((f) => f.category === cat).map((feed) => {
            const active = enabledFeeds.includes(feed.id);
            return (
              <div key={feed.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: "1px solid var(--ft-border)", cursor: "pointer" }} onClick={() => onToggleFeed(feed.id)}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: feed.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: active ? "var(--ft-text)" : "var(--ft-dim)", flex: 1 }}>{feed.name}</span>
                <span style={{ color: active ? "var(--ft-green)" : "var(--ft-border2)", flexShrink: 0 }}>
                  {active ? <Check size={10} /> : <div style={{ width: 10, height: 10, border: "1px solid var(--ft-border2)", borderRadius: 2 }} />}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Imported feeds */}
      {importedFeeds.length > 0 && (
        <div>
          <div style={headerStyle}>Imported</div>
          {importedFeeds.map((feed) => (
            <div key={feed.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: feed.color, flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1 }}>{feed.name} <span style={{ color: "var(--ft-dim)" }}>({feed.events.length})</span></span>
              <button onClick={() => onDeleteImported(feed.id)} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" style={{ display: "none" }} onChange={(e) => handleFileImport(e.target.files?.[0])} />
        <button
          onClick={() => fileRef.current?.click()}
          style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "7px 12px", cursor: "pointer", width: "100%", letterSpacing: "0.04em" }}
        >
          <Upload size={11} /> Import .ics File
        </button>
        <button
          onClick={onExport}
          style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "7px 12px", cursor: "pointer", width: "100%", letterSpacing: "0.04em" }}
        >
          <Download size={11} /> Export Calendar (.ics)
        </button>
        <button
          onClick={onRequestNotif}
          style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: notifPermission === "granted" ? "var(--ft-green)" : "var(--ft-text)", background: "var(--ft-raised)", border: `1px solid ${notifPermission === "granted" ? "var(--ft-green)44" : "var(--ft-border2)"}`, padding: "7px 12px", cursor: "pointer", width: "100%", letterSpacing: "0.04em" }}
        >
          {notifPermission === "granted" ? <Bell size={11} /> : <BellOff size={11} />}
          {notifPermission === "granted" ? "Notifications: On" : notifPermission === "denied" ? "Notifications: Blocked" : "Enable Notifications"}
        </button>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", lineHeight: 1.6, borderTop: "1px solid var(--ft-border)", paddingTop: 8 }}>
          To add to Apple/Google Calendar: export the .ics file and import via your calendar app's "Add from file" option.
        </div>
      </div>
    </div>
  );
}

// ─── Day Detail Panel ─────────────────────────────────────────────────────────

interface DayDetailPanelProps {
  dateStr: string;
  data: DayTransactions;
  feedEvents: FeedEvent[];
  customEvents: CustomEvent[];
  onClose: () => void;
  onDeleteCustom: (id: string) => void;
}

function DayDetailPanel({ dateStr, data, feedEvents, customEvents, onClose, onDeleteCustom }: DayDetailPanelProps) {
  const [, month, day] = dateStr.split("-").map(Number);
  const displayDate = `${day} ${MONTH_NAMES[(month ?? 1) - 1]}`;

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: 0, minWidth: 260, maxWidth: 320, fontFamily: "var(--font-mono)" }}>
      <div style={{ background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ft-text)" }}>{displayDate}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", display: "flex", alignItems: "center" }}>
          <X size={12} />
        </button>
      </div>

      {(data.totalIncome > 0 || data.totalExpenses > 0) && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {[
            { label: "In", value: data.totalIncome, color: "var(--ft-green)" },
            { label: "Out", value: data.totalExpenses, color: "var(--ft-red)" },
            { label: "Net", value: data.net, color: data.net >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color }}>{value !== 0 ? formatGbp(Math.abs(value)) : "—"}</div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar feed events */}
      {feedEvents.length > 0 && (
        <div style={{ padding: "6px 0" }}>
          <div style={{ padding: "4px 12px", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Events</div>
          {feedEvents.map((ev, i) => {
            const feed = PREDEFINED_FEEDS.find((f) => f.id === ev.feedId);
            return (
              <div key={i} style={{ padding: "5px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: feed?.color ?? "var(--ft-accent)", flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 10, color: "var(--ft-text)", flex: 1 }}>{ev.title}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom events */}
      {customEvents.length > 0 && (
        <div style={{ padding: "6px 0" }}>
          <div style={{ padding: "4px 12px", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>My Events</div>
          {customEvents.map((ev) => (
            <div key={ev.id} style={{ padding: "5px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ev.color, flexShrink: 0, display: "inline-block" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ev.title}</span>
                  {ev.time && <span style={{ fontSize: 9, color: "var(--ft-accent)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>{ev.time}</span>}
                </div>
                {ev.description && <div style={{ fontSize: 8, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.description}</div>}
              </div>
              <button onClick={() => onDeleteCustom(ev.id)} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", padding: 2, flexShrink: 0, display: "flex", alignItems: "center" }}>
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Transactions */}
      {data.transactions.length > 0 && (
        <div style={{ padding: "6px 0" }}>
          <div style={{ padding: "4px 12px", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Transactions</div>
          {data.transactions.map((tx) => (
            <div key={tx.id} style={{ padding: "5px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", flexShrink: 0, display: "inline-block" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description}</div>
                <div style={{ fontSize: 8, color: "var(--ft-dim)" }}>{tx.category}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", flexShrink: 0 }}>
                {tx.type === "income" ? "+" : "-"}{formatGbp(tx.gbpValue)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bills */}
      {data.upcoming.length > 0 && (
        <div style={{ padding: "6px 0" }}>
          <div style={{ padding: "4px 12px", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Upcoming Bills</div>
          {data.upcoming.map((item) => (
            <div key={item.id} style={{ padding: "5px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "7px solid " + (item.status === "paid" ? "var(--ft-green)" : "var(--ft-amber)"), flexShrink: 0, display: "inline-block" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                <div style={{ fontSize: 8, color: item.status === "paid" ? "var(--ft-green)" : "var(--ft-amber)" }}>{item.status}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--ft-amber)", flexShrink: 0 }}>
                {formatGbp(item.gbpEquivalent)}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.transactions.length === 0 && data.upcoming.length === 0 && feedEvents.length === 0 && customEvents.length === 0 && (
        <div style={{ padding: "16px 12px", fontSize: 10, color: "var(--ft-dim)", textAlign: "center" }}>No activity this day</div>
      )}
    </div>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

interface CalendarGridProps {
  year: number;
  month: number;
  dayMap: Map<string, DayTransactions>;
  feedEventMap: Map<string, FeedEvent[]>;
  customEventMap: Map<string, CustomEvent[]>;
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
  onAddEvent: (date: string) => void;
  todayStr: string;
}

function CalendarGrid({ year, month, dayMap, feedEventMap, customEventMap, selectedDate, onSelectDate, onAddEvent, todayStr }: CalendarGridProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const maxSpend = useMemo(() => {
    let max = 0;
    dayMap.forEach((d) => { if (d.totalExpenses > max) max = d.totalExpenses; });
    return max;
  }, [dayMap]);

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const currentYYYYMM = toYYYYMM(year, month);
  const todayYYYYMM = todayStr.slice(0, 7);
  const isFutureMonth = currentYYYYMM > todayYYYYMM;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--ft-border)" }}>
        {DAY_NAMES.map((d) => (
          <div key={d} style={{ padding: "6px 4px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", borderRight: "1px solid var(--ft-border)" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} style={{ minHeight: 72, borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)" }} />;
          }

          const dateStr = toDateStr(year, month, day);
          const data = dayMap.get(dateStr);
          const feedEvs = feedEventMap.get(dateStr) ?? [];
          const custEvs = customEventMap.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const isSelected = dateStr === selectedDate;

          const intensityRatio = data && maxSpend > 0 ? data.totalExpenses / maxSpend : 0;
          const bgOpacity = Math.round(intensityRatio * 18);

          const incomeCount = data?.transactions.filter((t) => t.type === "income").length ?? 0;
          const expenseCount = data?.transactions.filter((t) => t.type === "expense").length ?? 0;
          const billCount = data?.upcoming.length ?? 0;
          const paidBillCount = data?.upcoming.filter((u) => u.status === "paid").length ?? 0;
          const hasActivity = !!(data || feedEvs.length > 0 || custEvs.length > 0);

          return (
            <div
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              style={{
                minHeight: 72,
                borderRight: "1px solid var(--ft-border)",
                borderBottom: "1px solid var(--ft-border)",
                padding: "4px 5px",
                cursor: hasActivity ? "pointer" : "default",
                background: isSelected
                  ? "var(--ft-accent)11"
                  : `rgba(244, 162, 30, ${bgOpacity / 1000})`,
                border: isToday ? `2px solid var(--ft-accent)` : "1px solid var(--ft-border)",
                outline: isSelected ? "1px solid var(--ft-accent)" : "none",
                opacity: isFutureMonth && isFuture ? 0.55 : 1,
                transition: "background 0.1s",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? "var(--ft-accent)" : "var(--ft-muted)",
                }}>
                  {day}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddEvent(dateStr); }}
                  style={{ background: "none", border: "none", color: "var(--ft-border2)", cursor: "pointer", padding: 1, display: "flex", alignItems: "center", opacity: 0, transition: "opacity 0.1s" }}
                  className="add-event-btn"
                  title="Add event"
                >
                  <Plus size={8} />
                </button>
              </div>

              {/* Feed event bars */}
              {feedEvs.slice(0, 2).map((ev, i) => {
                const feed = PREDEFINED_FEEDS.find((f) => f.id === ev.feedId);
                return (
                  <div key={i} style={{ height: 3, background: feed?.color ?? "var(--ft-accent)", borderRadius: 1, marginBottom: 2, opacity: 0.85 }} title={ev.title} />
                );
              })}

              {/* Custom event bars */}
              {custEvs.slice(0, 2).map((ev, i) => (
                <div key={i} style={{ height: 3, background: ev.color, borderRadius: 1, marginBottom: 2 }} title={ev.title} />
              ))}

              {/* Transaction dots */}
              {(incomeCount > 0 || expenseCount > 0) && (
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginBottom: 2, marginTop: 1 }}>
                  {incomeCount > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-green)", display: "inline-block" }} />}
                  {expenseCount > 0 && Array.from({ length: Math.min(expenseCount, 3) }, (_, i) => (
                    <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-red)", display: "inline-block" }} />
                  ))}
                </div>
              )}

              {/* Bills */}
              {billCount > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {(data?.upcoming ?? []).slice(0, 1).map((bill) => (
                    <div key={bill.id} style={{ background: bill.status === "paid" ? "var(--ft-green)22" : "var(--ft-amber)22", borderRadius: 2, padding: "1px 3px", fontSize: 7, fontFamily: "var(--font-mono)", color: bill.status === "paid" ? "var(--ft-green)" : "var(--ft-amber)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {bill.description.slice(0, 8)}
                    </div>
                  ))}
                  {billCount > 1 && <div style={{ fontSize: 7, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>+{billCount - 1}</div>}
                </div>
              )}

              {paidBillCount > 0 && billCount === paidBillCount && (
                <span style={{ position: "absolute", top: 3, right: 4, fontSize: 7, color: "var(--ft-green)" }}>✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({ transactions, upcoming, year, month }: { transactions: Transaction[]; upcoming: UpcomingItem[]; year: number; month: number }) {
  const prefix = toYYYYMM(year, month);
  const monthTx = transactions.filter((t) => t.date.startsWith(prefix));
  const monthBills = upcoming.filter((u) => u.dueDate.startsWith(prefix));
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.gbpValue, 0);
  const expenses = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.gbpValue, 0);
  const net = income - expenses;
  const billsPaid = monthBills.filter((u) => u.status === "paid").length;
  const billsPending = monthBills.filter((u) => u.status === "pending").length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", border: "1px solid var(--ft-border)", borderTop: "none", background: "var(--ft-surface)" }}>
      {[
        { label: "Income", value: formatGbp(income), color: "var(--ft-green)" },
        { label: "Expenses", value: formatGbp(expenses), color: "var(--ft-red)" },
        { label: "Net", value: formatGbp(net), color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
        { label: "Transactions", value: String(monthTx.length), color: "var(--ft-text)" },
        { label: "Bills", value: `${billsPaid} paid / ${billsPending} due`, color: billsPending > 0 ? "var(--ft-amber)" : "var(--ft-green)" },
      ].map(({ label, value, color }, i) => (
        <div key={label} style={{ padding: "8px 12px", borderRight: i < 4 ? "1px solid var(--ft-border)" : "none" }}>
          <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700, color }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventFormDate, setEventFormDate] = useState(today.toISOString().slice(0, 10));
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>(() => loadCustomEvents());
  const [enabledFeeds, setEnabledFeeds] = useState<string[]>(() => loadEnabledFeeds());
  const [importedFeeds, setImportedFeeds] = useState<ImportedFeed[]>(() => loadImportedFeeds());
  const { permission: notifPermission, request: requestNotif } = useNotifPermission();

  const todayStr = today.toISOString().slice(0, 10);

  const { data: transactions = [] } = useListTransactions({});
  const { data: upcoming = [] } = useListUpcoming();

  const dayMap = useMemo(() => {
    const map = new Map<string, DayTransactions>();
    const ensureDay = (ds: string) => {
      if (!map.has(ds)) map.set(ds, { transactions: [], upcoming: [], totalIncome: 0, totalExpenses: 0, net: 0 });
      return map.get(ds)!;
    };
    for (const tx of transactions) {
      const d = ensureDay(tx.date);
      d.transactions.push(tx);
      if (tx.type === "income") d.totalIncome += tx.gbpValue;
      else if (tx.type === "expense") d.totalExpenses += tx.gbpValue;
      d.net = d.totalIncome - d.totalExpenses;
    }
    for (const item of upcoming) { ensureDay(item.dueDate).upcoming.push(item); }
    return map;
  }, [transactions, upcoming]);

  // Build feed event map
  const feedEventMap = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    const addFeedEvents = (events: Array<{ date: string; title: string }>, feedId: string) => {
      for (const ev of events) {
        if (!map.has(ev.date)) map.set(ev.date, []);
        map.get(ev.date)!.push({ ...ev, feedId });
      }
    };
    for (const feed of PREDEFINED_FEEDS) {
      if (enabledFeeds.includes(feed.id)) addFeedEvents(feed.events, feed.id);
    }
    for (const feed of importedFeeds) {
      addFeedEvents(feed.events, feed.id);
    }
    return map;
  }, [enabledFeeds, importedFeeds]);

  // Build custom event map
  const customEventMap = useMemo(() => {
    const map = new Map<string, CustomEvent[]>();
    for (const ev of customEvents) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return map;
  }, [customEvents]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
    setSelectedDate(null);
  };

  function addCustomEvent(ev: Omit<CustomEvent, "id">) {
    const next = [...customEvents, { ...ev, id: Date.now().toString() }];
    setCustomEvents(next);
    saveCustomEvents(next);
    setShowEventForm(false);
  }

  function deleteCustomEvent(id: string) {
    const next = customEvents.filter((e) => e.id !== id);
    setCustomEvents(next);
    saveCustomEvents(next);
  }

  function toggleFeed(id: string) {
    const next = enabledFeeds.includes(id) ? enabledFeeds.filter((f) => f !== id) : [...enabledFeeds, id];
    setEnabledFeeds(next);
    saveEnabledFeeds(next);
  }

  function handleImport(feed: ImportedFeed) {
    const next = [...importedFeeds, feed];
    setImportedFeeds(next);
    saveImportedFeeds(next);
  }

  function handleDeleteImported(id: string) {
    const next = importedFeeds.filter((f) => f.id !== id);
    setImportedFeeds(next);
    saveImportedFeeds(next);
  }

  function handleExport() {
    const allEvs: Array<{ date: string; title: string; description?: string }> = [
      ...customEvents.map((e) => ({ date: e.date, title: e.title, description: e.description })),
      ...transactions.map((t) => ({ date: t.date, title: `${t.type === "income" ? "+" : "-"}${formatGbp(t.gbpValue)} ${t.description}` })),
      ...upcoming.map((u) => ({ date: u.dueDate, title: `Bill: ${u.description} ${formatGbp(u.gbpEquivalent)}` })),
    ];
    for (const feed of PREDEFINED_FEEDS) {
      if (enabledFeeds.includes(feed.id)) allEvs.push(...feed.events);
    }
    downloadICS(buildICS(allEvs), `finance-tracker-${year}-${String(month + 1).padStart(2, "0")}.ics`);
  }

  const selectedData = selectedDate ? dayMap.get(selectedDate) ?? { transactions: [], upcoming: [], totalIncome: 0, totalExpenses: 0, net: 0 } : null;
  const selectedFeedEvs = selectedDate ? (feedEventMap.get(selectedDate) ?? []) : [];
  const selectedCustomEvs = selectedDate ? (customEventMap.get(selectedDate) ?? []) : [];
  const hasSelectedActivity = selectedData && (selectedData.transactions.length > 0 || selectedData.upcoming.length > 0 || selectedFeedEvs.length > 0 || selectedCustomEvs.length > 0);

  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
        <span style={{ color: "var(--ft-accent)" }}>·</span> Calendar
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)", marginBottom: 16 }}>
        Calendar
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={prevMonth} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 12, padding: "4px 12px", cursor: "pointer" }}>‹</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-text)" }}>{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 12, padding: "4px 12px", cursor: "pointer" }}>›</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { setEventFormDate(todayStr); setShowEventForm((v) => !v); setShowSources(false); }}
            style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--ft-text)", background: showEventForm ? "var(--ft-raised)" : "transparent", border: "1px solid var(--ft-border2)", padding: "5px 10px", cursor: "pointer" }}
          >
            <Plus size={10} /> Add Event
          </button>
          <button
            onClick={() => { setShowSources((v) => !v); setShowEventForm(false); }}
            style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: showSources ? "var(--ft-accent)" : "var(--ft-text)", background: showSources ? "var(--ft-raised)" : "transparent", border: `1px solid ${showSources ? "var(--ft-accent)44" : "var(--ft-border2)"}`, padding: "5px 10px", cursor: "pointer" }}
          >
            <Calendar size={10} /> Sources
            {enabledFeeds.length > 0 && (
              <span style={{ background: "var(--ft-accent)", color: "var(--ft-base)", borderRadius: "50%", width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>{enabledFeeds.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Event form */}
      {showEventForm && (
        <EventForm
          defaultDate={eventFormDate}
          onSave={addCustomEvent}
          onCancel={() => setShowEventForm(false)}
        />
      )}

      <div style={{ marginBottom: 8 }}>
        <Legend />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* Calendar */}
        <div style={{ flex: 1, border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <style>{`.add-event-btn:hover { opacity: 1 !important; }`}</style>
          <CalendarGrid
            year={year}
            month={month}
            dayMap={dayMap}
            feedEventMap={feedEventMap}
            customEventMap={customEventMap}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onAddEvent={(date) => { setEventFormDate(date); setShowEventForm(true); setShowSources(false); }}
            todayStr={todayStr}
          />
          <SummaryStrip transactions={transactions} upcoming={upcoming} year={year} month={month} />
        </div>

        {/* Side panels */}
        {showSources && (
          <div style={{ flexShrink: 0 }}>
            <SourcesPanel
              enabledFeeds={enabledFeeds}
              onToggleFeed={toggleFeed}
              importedFeeds={importedFeeds}
              onImport={handleImport}
              onDeleteImported={handleDeleteImported}
              customEvents={customEvents}
              allEvents={[]}
              onExport={handleExport}
              notifPermission={notifPermission}
              onRequestNotif={requestNotif}
              onClose={() => setShowSources(false)}
            />
          </div>
        )}

        {selectedDate && hasSelectedActivity && !showSources && (
          <div style={{ flexShrink: 0 }}>
            <DayDetailPanel
              dateStr={selectedDate}
              data={selectedData ?? { transactions: [], upcoming: [], totalIncome: 0, totalExpenses: 0, net: 0 }}
              feedEvents={selectedFeedEvs}
              customEvents={selectedCustomEvs}
              onClose={() => setSelectedDate(null)}
              onDeleteCustom={deleteCustomEvent}
            />
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo, useRef, useCallback } from "react";
import { useListTransactions, useListUpcoming, useListSubscriptions, useListDebts, useListGoals } from "@workspace/api-client-react";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { formatGbp } from "@/lib/utils";
import type { Transaction, UpcomingItem, Subscription } from "@workspace/api-client-react";
import { Download, Upload, Plus, Bell, BellOff, Calendar, X, Check, AlignJustify, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

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
  subscriptions: Subscription[];
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
      { date: "2026-06-18", title: "BoE MPC Decision" },
      { date: "2026-08-06", title: "BoE MPC Decision" },
      { date: "2026-09-17", title: "BoE MPC Decision" },
      { date: "2026-11-05", title: "BoE MPC Decision" },
      { date: "2026-12-17", title: "BoE MPC Decision" },
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
      { date: "2026-05-06", title: "FOMC Rate Decision" },
      { date: "2026-06-17", title: "FOMC Rate Decision" },
      { date: "2026-07-29", title: "FOMC Rate Decision" },
      { date: "2026-09-16", title: "FOMC Rate Decision" },
      { date: "2026-10-28", title: "FOMC Rate Decision" },
      { date: "2026-12-09", title: "FOMC Rate Decision" },
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
      { date: "2026-01-14", title: "UK CPI Release" },
      { date: "2026-02-18", title: "UK CPI Release" },
      { date: "2026-03-25", title: "UK CPI Release" },
      { date: "2026-04-15", title: "UK CPI Release" },
      { date: "2026-05-20", title: "UK CPI Release" },
      { date: "2026-06-17", title: "UK CPI Release" },
      { date: "2026-07-15", title: "UK CPI Release" },
      { date: "2026-08-19", title: "UK CPI Release" },
      { date: "2026-09-16", title: "UK CPI Release" },
      { date: "2026-10-14", title: "UK CPI Release" },
      { date: "2026-11-18", title: "UK CPI Release" },
      { date: "2026-12-16", title: "UK CPI Release" },
    ],
  },
  {
    id: "us-cpi",
    name: "US CPI Releases",
    color: "#79C0FF",
    category: "Economics",
    events: [
      { date: "2025-01-15", title: "US CPI Release" },
      { date: "2025-02-12", title: "US CPI Release" },
      { date: "2025-03-12", title: "US CPI Release" },
      { date: "2025-04-10", title: "US CPI Release" },
      { date: "2025-05-13", title: "US CPI Release" },
      { date: "2025-06-11", title: "US CPI Release" },
      { date: "2025-07-15", title: "US CPI Release" },
      { date: "2025-08-12", title: "US CPI Release" },
      { date: "2025-09-10", title: "US CPI Release" },
      { date: "2025-10-15", title: "US CPI Release" },
      { date: "2025-11-12", title: "US CPI Release" },
      { date: "2025-12-10", title: "US CPI Release" },
      { date: "2026-01-15", title: "US CPI Release" },
      { date: "2026-02-11", title: "US CPI Release" },
      { date: "2026-03-11", title: "US CPI Release" },
      { date: "2026-04-10", title: "US CPI Release" },
      { date: "2026-05-13", title: "US CPI Release" },
      { date: "2026-06-10", title: "US CPI Release" },
      { date: "2026-07-14", title: "US CPI Release" },
      { date: "2026-08-12", title: "US CPI Release" },
      { date: "2026-09-09", title: "US CPI Release" },
      { date: "2026-10-14", title: "US CPI Release" },
      { date: "2026-11-11", title: "US CPI Release" },
      { date: "2026-12-09", title: "US CPI Release" },
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
      { date: "2026-01-09", title: "US Non-Farm Payrolls" },
      { date: "2026-02-06", title: "US Non-Farm Payrolls" },
      { date: "2026-03-06", title: "US Non-Farm Payrolls" },
      { date: "2026-04-03", title: "US Non-Farm Payrolls" },
      { date: "2026-05-01", title: "US Non-Farm Payrolls" },
      { date: "2026-06-05", title: "US Non-Farm Payrolls" },
      { date: "2026-07-02", title: "US Non-Farm Payrolls" },
      { date: "2026-08-07", title: "US Non-Farm Payrolls" },
      { date: "2026-09-04", title: "US Non-Farm Payrolls" },
      { date: "2026-10-02", title: "US Non-Farm Payrolls" },
      { date: "2026-11-06", title: "US Non-Farm Payrolls" },
      { date: "2026-12-04", title: "US Non-Farm Payrolls" },
    ],
  },
  {
    id: "us-gdp",
    name: "US GDP Releases",
    color: "#3FB950",
    category: "Economics",
    events: [
      { date: "2025-01-30", title: "US GDP Q4 2024 (Advance)" },
      { date: "2025-02-27", title: "US GDP Q4 2024 (Second)" },
      { date: "2025-03-27", title: "US GDP Q4 2024 (Third)" },
      { date: "2025-04-30", title: "US GDP Q1 2025 (Advance)" },
      { date: "2025-05-29", title: "US GDP Q1 2025 (Second)" },
      { date: "2025-06-26", title: "US GDP Q1 2025 (Third)" },
      { date: "2025-07-30", title: "US GDP Q2 2025 (Advance)" },
      { date: "2025-08-28", title: "US GDP Q2 2025 (Second)" },
      { date: "2025-09-25", title: "US GDP Q2 2025 (Third)" },
      { date: "2025-10-30", title: "US GDP Q3 2025 (Advance)" },
      { date: "2025-11-26", title: "US GDP Q3 2025 (Second)" },
      { date: "2025-12-18", title: "US GDP Q3 2025 (Third)" },
      { date: "2026-01-29", title: "US GDP Q4 2025 (Advance)" },
      { date: "2026-02-26", title: "US GDP Q4 2025 (Second)" },
      { date: "2026-03-26", title: "US GDP Q4 2025 (Third)" },
      { date: "2026-04-29", title: "US GDP Q1 2026 (Advance)" },
      { date: "2026-05-28", title: "US GDP Q1 2026 (Second)" },
      { date: "2026-06-25", title: "US GDP Q1 2026 (Third)" },
      { date: "2026-07-29", title: "US GDP Q2 2026 (Advance)" },
      { date: "2026-08-27", title: "US GDP Q2 2026 (Second)" },
      { date: "2026-09-24", title: "US GDP Q2 2026 (Third)" },
      { date: "2026-10-29", title: "US GDP Q3 2026 (Advance)" },
      { date: "2026-11-24", title: "US GDP Q3 2026 (Second)" },
      { date: "2026-12-17", title: "US GDP Q3 2026 (Third)" },
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
      { date: "2025-01-22", title: "TSLA Earnings (Q4 2024)" },
      { date: "2025-02-04", title: "GOOG Earnings (Q4 2024)" },
      { date: "2025-02-06", title: "AMZN Earnings (Q4 2024)" },
      { date: "2025-02-26", title: "NVDA Earnings (Q4 FY25)" },
      // Q1 2025 (reported Apr-May)
      { date: "2025-04-30", title: "AAPL Earnings (Q2 FY25)" },
      { date: "2025-04-30", title: "META Earnings (Q1 2025)" },
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
      // Q4 2025 (reported Jan-Feb 2026)
      { date: "2026-01-22", title: "TSLA Earnings (Q4 2025)" },
      { date: "2026-01-29", title: "AAPL Earnings (Q1 FY26)" },
      { date: "2026-01-29", title: "META Earnings (Q4 2025)" },
      { date: "2026-01-29", title: "MSFT Earnings (Q2 FY26)" },
      { date: "2026-02-03", title: "GOOG Earnings (Q4 2025)" },
      { date: "2026-02-05", title: "AMZN Earnings (Q4 2025)" },
      { date: "2026-02-25", title: "NVDA Earnings (Q4 FY26)" },
      // Q1 2026 (reported Apr-May)
      { date: "2026-04-22", title: "TSLA Earnings (Q1 2026)" },
      { date: "2026-04-28", title: "GOOG Earnings (Q1 2026)" },
      { date: "2026-04-29", title: "META Earnings (Q1 2026)" },
      { date: "2026-04-29", title: "MSFT Earnings (Q3 FY26)" },
      { date: "2026-04-30", title: "AAPL Earnings (Q2 FY26)" },
      { date: "2026-05-01", title: "AMZN Earnings (Q1 2026)" },
      { date: "2026-05-27", title: "NVDA Earnings (Q1 FY27)" },
      // Q2 2026 (reported Jul-Aug)
      { date: "2026-07-21", title: "TSLA Earnings (Q2 2026)" },
      { date: "2026-07-28", title: "GOOG Earnings (Q2 2026)" },
      { date: "2026-07-29", title: "META Earnings (Q2 2026)" },
      { date: "2026-07-29", title: "MSFT Earnings (Q4 FY26)" },
      { date: "2026-07-31", title: "AAPL Earnings (Q3 FY26)" },
      { date: "2026-07-31", title: "AMZN Earnings (Q2 2026)" },
      { date: "2026-08-26", title: "NVDA Earnings (Q2 FY27)" },
      // Q3 2026 (reported Oct-Nov)
      { date: "2026-10-21", title: "TSLA Earnings (Q3 2026)" },
      { date: "2026-10-27", title: "GOOG Earnings (Q3 2026)" },
      { date: "2026-10-28", title: "META Earnings (Q3 2026)" },
      { date: "2026-10-28", title: "MSFT Earnings (Q1 FY27)" },
      { date: "2026-10-30", title: "AAPL Earnings (Q4 FY26)" },
      { date: "2026-10-30", title: "AMZN Earnings (Q3 2026)" },
      { date: "2026-11-18", title: "NVDA Earnings (Q3 FY27)" },
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

// ─── WeekStripDayCell sub-component ──────────────────────────────────────────

interface WeekStripDayCellProps {
  dateStr: string;
  dayName: string;
  dayNum: string;
  isToday: boolean;
  events: FeedEvent[];
}

function WeekStripDayCell({ dateStr, dayName, dayNum, isToday, events }: WeekStripDayCellProps) {
  return (
    <div
      key={dateStr}
      style={{
        background: isToday
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "var(--ft-surface)",
        padding: "7px 8px 10px",
        minHeight: 72,
      }}
    >
      <VStack marginBottom={6}>
        <Text as="span" mono size={8} weight={isToday ? 700 : 400} color={isToday ? "var(--ft-accent)" : "var(--ft-dim)"} letterSpacing="0.07em">
          {dayName}
        </Text>
        <Text as="span" mono size={9} color={isToday ? "var(--ft-accent)" : "var(--ft-muted)"} letterSpacing="0.03em">
          {dayNum}
        </Text>
      </VStack>
      <VStack gap={3}>
        {events.length === 0 ? (
          <Text as="span" mono size={8} color="var(--ft-border2)">—</Text>
        ) : (
          events.slice(0, 4).map((ev, j) => {
            const feedColor = PREDEFINED_FEEDS.find((f) => f.id === ev.feedId)?.color ?? "#888";
            return (
              <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: feedColor, flexShrink: 0, marginTop: 3 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-muted)", lineHeight: 1.35 }}>{ev.title}</span>
              </div>
            );
          })
        )}
        {events.length > 4 && (
          <Text as="span" mono size={8} color="var(--ft-dim)">+{events.length - 4} more</Text>
        )}
      </VStack>
    </div>
  );
}

// ─── FeedItemRow sub-component ────────────────────────────────────────────────

interface FeedItemRowProps {
  feed: { id: string; name: string; color: string };
  active: boolean;
  onToggle: (id: string) => void;
}

function FeedItemRow({ feed, active, onToggle }: FeedItemRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 14px", borderBottom: "1px solid var(--ft-border)",
        cursor: "pointer",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onClick={() => onToggle(feed.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: feed.color, flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: active ? "var(--ft-text)" : "var(--ft-dim)", flex: 1 }}>{feed.name}</span>
      <span style={{ color: active ? "var(--ft-green)" : "var(--ft-border2)", flexShrink: 0 }}>
        {active ? <Check size={10} /> : <div style={{ width: 10, height: 10, border: "1px solid var(--ft-border2)", borderRadius: 2 }} />}
      </span>
    </div>
  );
}

// ─── ImportedFeedRow sub-component ───────────────────────────────────────────

interface ImportedFeedRowProps {
  feed: ImportedFeed;
  deleteConfirmId: string | null;
  onDelete: (id: string) => void;
}

function ImportedFeedRow({ feed, deleteConfirmId, onDelete }: ImportedFeedRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 14px", borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: feed.color, flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1 }}>
        {feed.name} <span style={{ color: "var(--ft-dim)" }}>({feed.events.length})</span>
      </span>
      <button
        onClick={() => onDelete(feed.id)}
        title="Remove imported feed"
        style={{
          background: deleteConfirmId === feed.id ? "var(--ft-red)" : "none",
          border: "none",
          color: deleteConfirmId === feed.id ? "#fff" : "var(--ft-dim)",
          cursor: "pointer", padding: "2px 4px", display: "flex", alignItems: "center",
          borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 8,
        }}
      >
        {deleteConfirmId === feed.id ? "DEL?" : <X size={10} />}
      </button>
    </div>
  );
}

// ─── DayFeedEventRow sub-component ───────────────────────────────────────────

interface DayFeedEventRowProps {
  ev: FeedEvent;
}

function DayFeedEventRow({ ev }: DayFeedEventRowProps) {
  const [hov, setHov] = useState(false);
  const feed = PREDEFINED_FEEDS.find((f) => f.id === ev.feedId);
  return (
    <div
      style={{
        padding: "6px 12px", borderBottom: "1px solid var(--ft-border)",
        display: "flex", alignItems: "center", gap: 8,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: feed?.color ?? "var(--ft-accent)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--ft-text)" }}>{ev.title}</div>
        {feed && <div style={{ fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{feed.name}</div>}
      </div>
    </div>
  );
}

// ─── DayCustomEventRow sub-component ─────────────────────────────────────────

interface DayCustomEventRowProps {
  ev: CustomEvent;
  deleteConfirmEvId: string | null;
  onDeleteClick: (id: string) => void;
}

function DayCustomEventRow({ ev, deleteConfirmEvId, onDeleteClick }: DayCustomEventRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        padding: "6px 12px", borderBottom: "1px solid var(--ft-border)",
        display: "flex", alignItems: "center", gap: 8,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ev.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <HStack gap={6} align="center">
          <span style={{ fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ev.title}</span>
          {ev.time && <span style={{ fontSize: 9, color: "var(--ft-accent)", flexShrink: 0 }}>{ev.time}</span>}
        </HStack>
        {ev.description && <div style={{ fontSize: 8, color: "var(--ft-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{ev.description}</div>}
      </div>
      <button
        onClick={() => onDeleteClick(ev.id)}
        title="Delete event"
        style={{
          background: deleteConfirmEvId === ev.id ? "var(--ft-red)" : "none",
          border: deleteConfirmEvId === ev.id ? "none" : "1px solid var(--ft-border)",
          color: deleteConfirmEvId === ev.id ? "#fff" : "var(--ft-dim)",
          cursor: "pointer", padding: "2px 5px", flexShrink: 0,
          display: "flex", alignItems: "center", borderRadius: 2, fontSize: 8,
        }}
      >
        {deleteConfirmEvId === ev.id ? "DEL?" : <X size={9} />}
      </button>
    </div>
  );
}

// ─── DayTxRow sub-component ───────────────────────────────────────────────────

interface DayTxRowProps {
  tx: Transaction;
}

function DayTxRow({ tx }: DayTxRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        padding: "5px 12px", borderBottom: "1px solid var(--ft-border)",
        display: "flex", alignItems: "center", gap: 8, minHeight: 30,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description}</div>
        {tx.category && <div style={{ fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{tx.category}</div>}
      </div>
      <span className="pnum" style={{ fontSize: 10, fontWeight: 700, color: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {tx.type === "income" ? "+" : "−"}{formatGbp(tx.gbpValue)}
      </span>
    </div>
  );
}

// ─── DayBillRow sub-component ─────────────────────────────────────────────────

interface DayBillRowProps {
  item: UpcomingItem;
}

function DayBillRow({ item }: DayBillRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        padding: "5px 12px", borderBottom: "1px solid var(--ft-border)",
        display: "flex", alignItems: "center", gap: 8, minHeight: 30,
        background: hov ? "color-mix(in srgb, var(--ft-amber) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ width: 0, height: 0, borderLeft: "3px solid transparent", borderRight: "3px solid transparent", borderBottom: "6px solid " + (item.status === "paid" ? "var(--ft-green)" : "var(--ft-amber)"), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
        <div style={{ fontSize: 8, color: item.status === "paid" ? "var(--ft-green)" : "var(--ft-amber)", marginTop: 1 }}>{item.status?.toUpperCase()}</div>
      </div>
      <span className="pnum" style={{ fontSize: 10, fontWeight: 700, color: item.status === "paid" ? "var(--ft-green)" : "var(--ft-amber)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {formatGbp(item.gbpEquivalent)}
      </span>
    </div>
  );
}

// ─── DaySubRow sub-component ──────────────────────────────────────────────────

interface DaySubRowProps {
  sub: Subscription;
}

function DaySubRow({ sub }: DaySubRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        padding: "5px 12px", borderBottom: "1px solid var(--ft-border)",
        display: "flex", alignItems: "center", gap: 8, minHeight: 30,
        background: hov ? "color-mix(in srgb, var(--ft-amber) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ width: 8, height: 3, background: "var(--ft-amber)", flexShrink: 0, borderRadius: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</div>
      </div>
      <span className="pnum" style={{ fontSize: 10, fontWeight: 700, color: "var(--ft-amber)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {formatGbp(sub.amount)}
      </span>
    </div>
  );
}

// ─── SummaryStripCell sub-component ──────────────────────────────────────────

interface SummaryStripCellProps {
  label: string;
  value: string;
  color: string;
  sub: string;
  accentBorderColor?: string;
}

function SummaryStripCell({ label, value, color, sub, accentBorderColor }: SummaryStripCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        padding: "8px 12px", background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "var(--ft-surface)",
        transition: "background 0.1s",
        borderTop: accentBorderColor ? `2px solid ${accentBorderColor}` : undefined,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
      <div className="pnum" style={{ fontSize: 15, fontFamily: "var(--font-mono)", fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ─── AgendaEvent type (used by AgendaView + AgendaEventRow) ──────────────────

type AgendaEvent = { date: string; type: "tx" | "bill" | "sub" | "custom" | "feed" | "debt" | "goal"; label: string; amount?: number; amountColor?: string; color?: string };

// ─── AgendaEventRow sub-component ────────────────────────────────────────────

interface AgendaEventRowProps {
  ev: AgendaEvent;
  typeBadgeColors: Record<string, string>;
  typeLabels: Record<string, string>;
}

function AgendaEventRow({ ev, typeBadgeColors, typeLabels }: AgendaEventRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        padding: "5px 14px 5px 28px",
        borderBottom: "1px solid var(--ft-border)",
        gap: 8,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: "50%", background: ev.color ?? "var(--ft-dim)" }} />
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 8, color: typeBadgeColors[ev.type] ?? "var(--ft-dim)",
        letterSpacing: "0.07em", width: 52, flexShrink: 0, fontWeight: 600,
      }}>
        {typeLabels[ev.type] ?? ev.type}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.label}</span>
      {ev.amount !== undefined && (
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: ev.amountColor ?? "var(--ft-muted)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {formatGbp(ev.amount)}
        </span>
      )}
    </div>
  );
}

// ─── WeekDayCell sub-component ────────────────────────────────────────────────

interface WeekDayCellProps {
  date: string;
  dayData: DayTransactions | undefined;
  feedEvs: FeedEvent[];
  custEvs: CustomEvent[];
  onAddEvent: (date: string) => void;
}

function WeekDayCell({ date, dayData, feedEvs, custEvs, onAddEvent }: WeekDayCellProps) {
  const income = dayData?.totalIncome ?? 0;
  const expenses = dayData?.totalExpenses ?? 0;
  const txCount = dayData?.transactions.length ?? 0;
  const billCount = dayData?.upcoming.length ?? 0;
  const subCount = dayData?.subscriptions.length ?? 0;
  const hasAny = txCount > 0 || billCount > 0 || subCount > 0 || feedEvs.length > 0 || custEvs.length > 0;

  return (
    <div style={{ borderRight: "1px solid var(--ft-border)", padding: "6px 5px", minHeight: 120, display: "flex", flexDirection: "column", gap: 3 }}>
      {feedEvs.slice(0, 3).map((ev, i) => {
        const feed = PREDEFINED_FEEDS.find(f => f.id === ev.feedId);
        return <div key={i} style={{ fontSize: 8, fontFamily: "var(--font-mono)", padding: "1px 4px", background: `${feed?.color ?? "var(--ft-border)"}22`, color: feed?.color ?? "var(--ft-dim)", borderLeft: `2px solid ${feed?.color ?? "var(--ft-border)"}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>;
      })}
      {custEvs.slice(0, 3).map((ev, i) => (
        <div key={i} style={{ fontSize: 8, fontFamily: "var(--font-mono)", padding: "1px 4px", background: `${ev.color}22`, color: ev.color, borderLeft: `2px solid ${ev.color}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
      ))}
      {income > 0 && <div className="pnum" style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>+{formatGbp(income)}</div>}
      {expenses > 0 && <div className="pnum" style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-red)", fontVariantNumeric: "tabular-nums" }}>-{formatGbp(expenses)}</div>}
      {billCount > 0 && <Text as="div" mono size={8} color="var(--ft-amber)">↑ {billCount} bill{billCount !== 1 ? "s" : ""}</Text>}
      {subCount > 0 && <Text as="div" mono size={8} color="var(--ft-cyan)">↻ {subCount} sub</Text>}
      {!hasAny && <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-border2)", marginTop: "auto" }}>—</div>}
      <button
        onClick={(e) => { e.stopPropagation(); onAddEvent(date); }}
        style={{ marginTop: "auto", background: "none", border: "none", color: "var(--ft-border2)", cursor: "pointer", padding: "2px 0", fontSize: 9, fontFamily: "var(--font-mono)", textAlign: "left", display: "flex", alignItems: "center", gap: 3 }}
      >
        <Plus size={7} /> add
      </button>
    </div>
  );
}

// ─── This Week in Markets strip ───────────────────────────────────────────────

function ThisWeekStrip({ enabledFeeds, feedEventMap }: { enabledFeeds: string[]; feedEventMap: Map<string, FeedEvent[]> }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Array<{ dateStr: string; dayName: string; dayNum: string; isToday: boolean; events: FeedEvent[] }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = i === 0 ? "TODAY" : i === 1 ? "TMR" : d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
    const dayNum = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
    days.push({ dateStr, dayName, dayNum, isToday: i === 0, events: feedEventMap.get(dateStr) ?? [] });
  }

  const hasAny = days.some((d) => d.events.length > 0);
  if (!hasAny && enabledFeeds.length === 0) return null;

  return (
    <div className="ft-scroll-x" style={{ marginBottom: 16, border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <div style={{ minWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px 5px 10px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)" }}>
          <HStack gap={8} align="center">
            <div style={{ width: 2, height: 10, background: "var(--ft-accent)", flexShrink: 0 }} />
            <Text as="span" mono upper size={9} weight={700} color="var(--ft-accent)" letterSpacing="0.1em">This Week in Markets</Text>
          </HStack>
          {!hasAny && (
            <Text as="span" mono size={9} color="var(--ft-dim)">No events — enable feeds via Sources</Text>
          )}
          {hasAny && (
            <Text as="span" mono size={9} color="var(--ft-dim)">
              {days.reduce((s, d) => s + d.events.length, 0)} event{days.reduce((s, d) => s + d.events.length, 0) !== 1 ? "s" : ""} this week
            </Text>
          )}
        </div>
        {/* border-as-gap 7-column strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--ft-border)" }}>
          {days.map((day) => (
            <WeekStripDayCell
              key={day.dateStr}
              dateStr={day.dateStr}
              dayName={day.dayName}
              dayNum={day.dayNum}
              isToday={day.isToday}
              events={day.events}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { swatch: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ft-green)", display: "inline-block" }} />, label: "Income" },
    { swatch: <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ft-red)", display: "inline-block" }} />, label: "Expense" },
    { swatch: <span style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "7px solid var(--ft-amber)", display: "inline-block" }} />, label: "Bill due" },
    { swatch: <span style={{ width: 8, height: 3, background: "var(--ft-amber)", display: "inline-block", borderRadius: 1 }} />, label: "Subscription" },
    { swatch: <span style={{ width: 8, height: 3, background: "var(--ft-accent)", display: "inline-block", borderRadius: 1 }} />, label: "Event" },
  ];
  return (
    <div style={{
      display: "flex", gap: 0, alignItems: "stretch", border: "1px solid var(--ft-border)",
      background: "var(--ft-border)", overflow: "hidden", flexWrap: "wrap",
    }}>
      {items.map(({ swatch, label }, i) => (
        <div
          key={label}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)",
            padding: "5px 12px", background: "var(--ft-surface)",
            marginRight: i < items.length - 1 ? 1 : 0,
          }}
        >
          {swatch}
          {label}
        </div>
      ))}
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
      <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
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
          <HStack gap={6}>
            {EVENT_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--ft-text)" : "2px solid transparent", cursor: "pointer", outline: "none" }} />
            ))}
          </HStack>
        </div>
      </div>
      <HStack gap={8}>
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
      </HStack>
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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
          {PREDEFINED_FEEDS.filter((f) => f.category === cat).map((feed) => (
            <FeedItemRow
              key={feed.id}
              feed={feed}
              active={enabledFeeds.includes(feed.id)}
              onToggle={onToggleFeed}
            />
          ))}
        </div>
      ))}

      {/* Imported feeds */}
      {importedFeeds.length > 0 && (
        <div>
          <div style={headerStyle}>Imported</div>
          {importedFeeds.map((feed) => (
            <ImportedFeedRow
              key={feed.id}
              feed={feed}
              deleteConfirmId={deleteConfirmId}
              onDelete={(id) => {
                if (deleteConfirmId === id) { setDeleteConfirmId(null); onDeleteImported(id); }
                else { setDeleteConfirmId(id); setTimeout(() => setDeleteConfirmId(null), 3000); }
              }}
            />
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
  const [deleteConfirmEvId, setDeleteConfirmEvId] = useState<string | null>(null);

  const sectionLabel: React.CSSProperties = {
    padding: "4px 12px 3px",
    fontSize: 8,
    fontFamily: "var(--font-mono)",
    color: "var(--ft-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 700,
    background: "var(--ft-raised)",
    borderBottom: "1px solid var(--ft-border)",
  };

  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: 0, minWidth: 268, maxWidth: 320, fontFamily: "var(--font-mono)" }}>
      {/* Header */}
      <div style={{ background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border2)", padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <HStack gap={8} align="center">
          <div style={{ width: 2, height: 14, background: "var(--ft-accent)", flexShrink: 0 }} />
          <Text as="span" size={12} weight={700} color="var(--ft-text)">{displayDate}</Text>
        </HStack>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", display: "flex", alignItems: "center", padding: 2 }}>
          <X size={12} />
        </button>
      </div>

      {/* Day KPI strip */}
      {(data.totalIncome > 0 || data.totalExpenses > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border2)" }}>
          {[
            { label: "In", value: data.totalIncome, color: "var(--ft-green)" },
            { label: "Out", value: data.totalExpenses, color: "var(--ft-red)" },
            { label: "Net", value: data.net, color: data.net >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: "7px 10px", background: "var(--ft-surface)" }}>
              <div style={{ fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
              <div className="pnum" style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
                {value !== 0 ? formatGbp(Math.abs(value)) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar feed events */}
      {feedEvents.length > 0 && (
        <div>
          <div style={{ ...sectionLabel, borderLeft: "3px solid var(--ft-blue)" }}>Market Events</div>
          {feedEvents.map((ev, i) => (
            <DayFeedEventRow key={i} ev={ev} />
          ))}
        </div>
      )}

      {/* Custom events */}
      {customEvents.length > 0 && (
        <div>
          <div style={{ ...sectionLabel, borderLeft: "3px solid var(--ft-accent)" }}>My Events</div>
          {customEvents.map((ev) => (
            <DayCustomEventRow
              key={ev.id}
              ev={ev}
              deleteConfirmEvId={deleteConfirmEvId}
              onDeleteClick={(id) => {
                if (deleteConfirmEvId === id) { setDeleteConfirmEvId(null); onDeleteCustom(id); }
                else { setDeleteConfirmEvId(id); setTimeout(() => setDeleteConfirmEvId(null), 3000); }
              }}
            />
          ))}
        </div>
      )}

      {/* Transactions */}
      {data.transactions.length > 0 && (
        <div>
          <div style={{ ...sectionLabel, borderLeft: "3px solid var(--ft-muted)" }}>Transactions</div>
          {data.transactions.map((tx) => (
            <DayTxRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}

      {/* Bills */}
      {data.upcoming.length > 0 && (
        <div>
          <div style={{ ...sectionLabel, borderLeft: "3px solid var(--ft-amber)" }}>Upcoming Bills</div>
          {data.upcoming.map((item) => (
            <DayBillRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Subscriptions due */}
      {data.subscriptions.length > 0 && (
        <div>
          <div style={{ ...sectionLabel, borderLeft: "3px solid var(--ft-cyan)" }}>Subscriptions Due</div>
          {data.subscriptions.map((sub) => (
            <DaySubRow key={sub.id} sub={sub} />
          ))}
        </div>
      )}

      {data.transactions.length === 0 && data.upcoming.length === 0 && data.subscriptions.length === 0 && feedEvents.length === 0 && customEvents.length === 0 && (
        <div style={{ padding: "24px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 6 }}>○</div>
          <Text as="div" mono size={10} color="var(--ft-dim)">No activity this day</Text>
        </div>
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
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

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
    <div className="ft-scroll-x">
      <div style={{ minWidth: 560 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--ft-border)" }}>
        {DAY_NAMES.map((d) => (
          <div key={d} style={{ padding: "5px 4px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 400, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center", borderRight: "1px solid var(--ft-border)" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} style={{ minHeight: 40, borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)" }} />;
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
          const subCount = data?.subscriptions.length ?? 0;
          const hasActivity = !!(data || feedEvs.length > 0 || custEvs.length > 0 || subCount > 0);

          const dayNet = data ? data.totalIncome - data.totalExpenses : 0;

          return (
            <div
              key={dateStr}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              onMouseEnter={() => setHoveredDay(dateStr)}
              onMouseLeave={() => setHoveredDay(null)}
              style={{
                minHeight: 48,
                borderRight: "1px solid var(--ft-border)",
                borderBottom: "1px solid var(--ft-border)",
                borderTop: isToday ? "2px solid var(--ft-accent)" : "1px solid var(--ft-border)",
                padding: "3px 4px",
                cursor: hasActivity ? "pointer" : "default",
                background: isSelected
                  ? "color-mix(in srgb, var(--ft-accent) 10%, var(--ft-surface))"
                  : isToday
                  ? "color-mix(in srgb, var(--ft-accent) 8%, var(--ft-surface))"
                  : hoveredDay === dateStr && hasActivity
                  ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))"
                  : `rgba(244, 162, 30, ${bgOpacity / 1000})`,
                outline: isSelected ? "1px solid var(--ft-accent)" : "none",
                opacity: isFutureMonth && isFuture ? 0.5 : 1,
                transition: "background 0.1s",
                position: "relative",
              }}
            >
              <HStack align="center" justify="between" marginBottom={2}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  fontWeight: 600,
                  color: isToday ? "var(--ft-accent)" : isFuture ? "var(--ft-muted)" : "var(--ft-text)",
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
              </HStack>

              {/* Day net total */}
              {(data && (data.totalIncome > 0 || data.totalExpenses > 0)) && (
                <div className="pnum" style={{
                  fontFamily: "var(--font-mono)", fontSize: 9,
                  color: dayNet > 0 ? "var(--ft-green)" : dayNet < 0 ? "var(--ft-red)" : "var(--ft-dim)",
                  marginBottom: 2, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                }}>
                  {dayNet > 0 ? "+" : dayNet < 0 ? "−" : ""}{dayNet !== 0 ? formatGbp(Math.abs(dayNet)) : ""}
                </div>
              )}

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

              {/* Subscription due bars */}
              {subCount > 0 && (data?.subscriptions ?? []).slice(0, 2).map((sub) => (
                <div key={sub.id} style={{ height: 3, background: "var(--ft-amber)", borderRadius: 1, marginBottom: 2, opacity: 0.9 }} title={`${sub.name} — ${formatGbp(sub.amount)}`} />
              ))}

              {/* Transaction dots */}
              {(incomeCount > 0 || expenseCount > 0) && (
                <HStack gap={2} align="center" marginTop={1} marginBottom={2}>
                  {Array.from({ length: Math.min(incomeCount, 3) }, (_, i) => (
                    <span key={`inc-${i}`} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-green)", display: "inline-block", flexShrink: 0 }} />
                  ))}
                  {Array.from({ length: Math.min(expenseCount, 3) }, (_, i) => (
                    <span key={`exp-${i}`} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-red)", display: "inline-block", flexShrink: 0 }} />
                  ))}
                  {(incomeCount + expenseCount) > 3 && (
                    <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", lineHeight: 1, flexShrink: 0 }}>+{(incomeCount + expenseCount) - 3}</span>
                  )}
                </HStack>
              )}

              {/* Bills */}
              {billCount > 0 && (
                <VStack gap={1}>
                  {(data?.upcoming ?? []).slice(0, 1).map((bill) => (
                    <div key={bill.id} style={{ background: bill.status === "paid" ? "var(--ft-green)22" : "var(--ft-amber)22", borderRadius: 2, padding: "1px 3px", fontSize: 8, fontFamily: "var(--font-mono)", color: bill.status === "paid" ? "var(--ft-green)" : "var(--ft-amber)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {bill.description.slice(0, 8)}
                    </div>
                  ))}
                  {billCount > 1 && <Text as="div" mono size={8} color="var(--ft-dim)">+{billCount - 1}</Text>}
                </VStack>
              )}

              {paidBillCount > 0 && billCount === paidBillCount && (
                <span style={{ position: "absolute", top: 3, right: 4, fontSize: 8, color: "var(--ft-green)" }}>✓</span>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ─── Agenda View ──────────────────────────────────────────────────────────────

interface AgendaViewProps {
  dayMap: Map<string, DayTransactions>;
  feedEventMap: Map<string, FeedEvent[]>;
  customEventMap: Map<string, CustomEvent[]>;
  todayStr: string;
  debtEvents: { date: string; label: string }[];
  goalEvents: { date: string; label: string }[];
  onSelectDate: (d: string) => void;
}

function AgendaView({ dayMap, feedEventMap, customEventMap, todayStr, debtEvents, goalEvents, onSelectDate }: AgendaViewProps) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const today = new Date(todayStr);
  const end = new Date(today);
  end.setDate(end.getDate() + 90);

  const events: AgendaEvent[] = [];

  const addDays = (date: Date, n: number) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
  const toISO = (d: Date) => d.toISOString().slice(0, 10);

  for (let d = new Date(today); d <= end; d = addDays(d, 1)) {
    const ds = toISO(d);
    const dayData = dayMap.get(ds);
    if (dayData) {
      for (const tx of dayData.transactions) {
        events.push({ date: ds, type: "tx", label: tx.description || tx.category, amount: tx.gbpValue, amountColor: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)", color: tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)" });
      }
      for (const bill of dayData.upcoming) {
        events.push({ date: ds, type: "bill", label: bill.description, amount: bill.gbpEquivalent, amountColor: "var(--ft-amber)", color: "var(--ft-amber)" });
      }
      for (const sub of dayData.subscriptions) {
        events.push({ date: ds, type: "sub", label: `${sub.name} (sub)`, amount: sub.amount, amountColor: "var(--ft-cyan)", color: "var(--ft-cyan)" });
      }
    }
    for (const fev of (feedEventMap.get(ds) ?? [])) {
      events.push({ date: ds, type: "feed", label: fev.title, color: "var(--ft-dim)" });
    }
    for (const cev of (customEventMap.get(ds) ?? [])) {
      events.push({ date: ds, type: "custom", label: cev.title, color: cev.color });
    }
  }
  for (const de of debtEvents) {
    if (de.date >= todayStr && de.date <= toISO(end)) {
      events.push({ date: de.date, type: "debt", label: de.label, color: "var(--ft-red)" });
    }
  }
  for (const ge of goalEvents) {
    if (ge.date >= todayStr && ge.date <= toISO(end)) {
      events.push({ date: ge.date, type: "goal", label: ge.label, color: "var(--ft-accent)" });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  if (events.length === 0) {
    return (
      <div style={{
        padding: "48px 24px", textAlign: "center",
        border: "1px solid var(--ft-border)", background: "var(--ft-surface)",
      }}>
        <CalendarDays size={24} style={{ color: "var(--ft-border2)", marginBottom: 10 }} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", marginBottom: 4 }}>No upcoming events in the next 90 days</div>
        <Text as="div" mono size={9} color="var(--ft-border2)">Add transactions, bills, or enable market data feeds via Sources</Text>
      </div>
    );
  }

  const grouped: { week: string; days: { date: string; events: AgendaEvent[] }[] }[] = [];
  const byDate = new Map<string, AgendaEvent[]>();
  for (const ev of events) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date)!.push(ev);
  }
  const uniqueDates = [...byDate.keys()].sort();

  const weekKey = (ds: string) => {
    const d = new Date(ds);
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const mon = new Date(d); mon.setDate(d.getDate() - day);
    return mon.toISOString().slice(0, 10);
  };
  const weekGroups = new Map<string, string[]>();
  for (const ds of uniqueDates) {
    const wk = weekKey(ds);
    if (!weekGroups.has(wk)) weekGroups.set(wk, []);
    weekGroups.get(wk)!.push(ds);
  }
  for (const [wk, days] of weekGroups) {
    grouped.push({ week: wk, days: days.map(ds => ({ date: ds, events: byDate.get(ds)! })) });
  }

  const fmtDay = (ds: string) => new Date(ds).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const fmtWeekRange = (wkStart: string) => {
    const s = new Date(wkStart);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return `${s.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${e.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  };

  const TYPE_LABELS: Record<string, string> = { tx: "TX", bill: "BILL", sub: "SUB", custom: "EVENT", feed: "MKT", debt: "DEBT", goal: "GOAL" };

  const TYPE_BADGE_COLORS: Record<string, string> = {
    tx: "var(--ft-muted)", bill: "var(--ft-amber)", sub: "var(--ft-cyan)",
    custom: "var(--ft-accent)", feed: "var(--ft-blue)", debt: "var(--ft-red)", goal: "var(--ft-accent)",
  };

  return (
    <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", maxHeight: 600, overflowY: "auto" }}>
      {grouped.map(({ week, days }) => (
        <div key={week}>
          {/* Week header */}
          <div style={{
            padding: "5px 14px",
            background: "var(--ft-raised)",
            borderBottom: "1px solid var(--ft-border)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ width: 2, height: 10, background: "var(--ft-border2)", flexShrink: 0 }} />
            <Text as="span" mono upper size={8} weight={600} color="var(--ft-muted)" letterSpacing="0.1em">
              {fmtWeekRange(week)}
            </Text>
          </div>
          {days.map(({ date: ds, events: dayEvs }) => (
            <div key={ds}>
              <div
                onClick={() => onSelectDate(ds)}
                onMouseEnter={() => setHoveredDate(ds)}
                onMouseLeave={() => setHoveredDate(null)}
                style={{
                  padding: "6px 14px",
                  background: ds === todayStr
                    ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
                    : hoveredDate === ds
                    ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
                    : undefined,
                  borderBottom: "1px solid var(--ft-border)",
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: ds === todayStr ? "var(--ft-accent)" : "var(--ft-muted)", fontWeight: ds === todayStr ? 700 : 400, minWidth: 100, flexShrink: 0 }}>
                  {ds === todayStr ? "Today" : fmtDay(ds)}
                </span>
                <HStack gap={5} wrap grow>
                  {dayEvs.slice(0, 4).map((ev, i) => (
                    <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "1px 6px", background: "var(--ft-raised)", border: `1px solid ${ev.color ?? "var(--ft-border)"}`, color: ev.color ?? "var(--ft-muted)", borderRadius: 2 }}>
                      {TYPE_LABELS[ev.type]}
                    </span>
                  ))}
                  {dayEvs.length > 4 && <Text as="span" mono size={9} color="var(--ft-dim)">+{dayEvs.length - 4}</Text>}
                </HStack>
              </div>
              {dayEvs.map((ev, i) => (
                <AgendaEventRow
                  key={i}
                  ev={ev}
                  typeBadgeColors={TYPE_BADGE_COLORS}
                  typeLabels={TYPE_LABELS}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  weekStart: Date;
  dayMap: Map<string, DayTransactions>;
  feedEventMap: Map<string, FeedEvent[]>;
  customEventMap: Map<string, CustomEvent[]>;
  todayStr: string;
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
  onAddEvent: (date: string) => void;
}

function WeekView({ weekStart, dayMap, feedEventMap, customEventMap, todayStr, selectedDate, onSelectDate, onAddEvent }: WeekViewProps) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return { date: d.toISOString().slice(0, 10), dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], dayNum: d.getDate(), month: d.toLocaleDateString("en-GB", { month: "short" }) };
  });

  return (
    <div className="ft-scroll-x" style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
      <div style={{ minWidth: 420 }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--ft-border)" }}>
        {days.map(({ date, dow, dayNum, month }) => {
          const isToday = date === todayStr;
          const isSelected = date === selectedDate;
          return (
            <div
              key={date}
              onClick={() => onSelectDate(isSelected ? null : date)}
              style={{ padding: "8px 6px", textAlign: "center", borderRight: "1px solid var(--ft-border)", cursor: "pointer", background: isSelected ? "var(--ft-accent)11" : isToday ? "var(--ft-raised)" : undefined }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{dow}</div>
              <Text as="div" mono size={16} weight={isToday ? 700 : 400} color={isToday ? "var(--ft-accent)" : "var(--ft-text)"} lineHeight={1.2}>{dayNum}</Text>
              <Text as="div" mono size={8} color="var(--ft-dim)">{month}</Text>
            </div>
          );
        })}
      </div>
      {/* Events grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", minHeight: 200 }}>
        {days.map(({ date }) => (
          <WeekDayCell
            key={date}
            date={date}
            dayData={dayMap.get(date)}
            feedEvs={feedEventMap.get(date) ?? []}
            custEvs={customEventMap.get(date) ?? []}
            onAddEvent={onAddEvent}
          />
        ))}
      </div>
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
    <div
      className="ft-kpi-bar"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 1,
        background: "var(--ft-border)",
        borderTop: "1px solid var(--ft-border2)",
      }}
    >
      {[
        { label: "Income",       value: formatGbp(income),                              color: "var(--ft-green)",                                      sub: `${monthTx.filter(t => t.type === "income").length} tx`,   accent: "var(--ft-green)" },
        { label: "Expenses",     value: formatGbp(expenses),                            color: "var(--ft-red)",                                        sub: `${monthTx.filter(t => t.type === "expense").length} tx`,  accent: "var(--ft-red)" },
        { label: "Net",          value: (net >= 0 ? "+" : "") + formatGbp(Math.abs(net)), color: net >= 0 ? "var(--ft-green)" : "var(--ft-red)",        sub: net >= 0 ? "surplus" : "deficit",                          accent: net >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
        { label: "Transactions", value: String(monthTx.length),                          color: "var(--ft-text)",                                       sub: "this month",                                              accent: "var(--ft-muted)" },
        { label: "Bills",        value: `${billsPaid}/${billsPaid + billsPending}`,       color: billsPending > 0 ? "var(--ft-amber)" : "var(--ft-green)", sub: billsPending > 0 ? `${billsPending} pending` : "all paid", accent: billsPending > 0 ? "var(--ft-amber)" : "var(--ft-green)" },
      ].map(({ label, value, color, sub, accent }) => (
        <SummaryStripCell key={label} label={label} value={value} color={color} sub={sub} accentBorderColor={accent} />
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
  const [viewMode, setViewMode] = useState<"month" | "week" | "agenda">("month");
  const [weekOffset, setWeekOffset] = useState(0);
  const { permission: notifPermission, request: requestNotif } = useNotifPermission();

  const todayStr = today.toISOString().slice(0, 10);

  const { data: transactions = [] } = useListTransactions({});
  const { data: upcoming = [] } = useListUpcoming();
  const { data: rawSubscriptions = [] } = useListSubscriptions();
  const { data: rawDebts = [] } = useListDebts();
  const { data: rawGoals = [] } = useListGoals();

  // Only active subscriptions with a nextDue date
  const activeSubscriptions = useMemo(
    () => rawSubscriptions.filter((s) => s.active && s.nextDue),
    [rawSubscriptions]
  );

  const dayMap = useMemo(() => {
    const map = new Map<string, DayTransactions>();
    const ensureDay = (ds: string) => {
      if (!map.has(ds)) map.set(ds, { transactions: [], upcoming: [], subscriptions: [], totalIncome: 0, totalExpenses: 0, net: 0 });
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
    for (const sub of activeSubscriptions) {
      if (sub.nextDue) ensureDay(sub.nextDue).subscriptions.push(sub);
    }
    return map;
  }, [transactions, upcoming, activeSubscriptions]);

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

  // Derive debt & goal calendar events
  const debtEvents = useMemo(() => {
    return (rawDebts as { id: number; status: string; dueDate?: string | null; personName: string; direction: string; nativeAmount: number }[])
      .filter(d => d.status === "pending" && d.dueDate)
      .map(d => ({ date: d.dueDate!, label: `${d.direction === "i_owe_them" ? "Pay" : "Receive"} · ${d.personName}` }));
  }, [rawDebts]);

  const goalEvents = useMemo(() => {
    return (rawGoals as { id: number; name: string; targetDate?: string | null }[])
      .filter(g => g.targetDate)
      .map(g => ({ date: g.targetDate!, label: `Goal: ${g.name}` }));
  }, [rawGoals]);

  // Week view start — Monday of week at offset from current week
  const weekStart = useMemo(() => {
    const d = new Date(today);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - dow + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
    setSelectedDate(null);
  };

  const goToToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setWeekOffset(0);
    setSelectedDate(todayStr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr]);

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

  const selectedData = selectedDate ? dayMap.get(selectedDate) ?? { transactions: [], upcoming: [], subscriptions: [], totalIncome: 0, totalExpenses: 0, net: 0 } : null;
  const selectedFeedEvs = selectedDate ? (feedEventMap.get(selectedDate) ?? []) : [];
  const selectedCustomEvs = selectedDate ? (customEventMap.get(selectedDate) ?? []) : [];
  const hasSelectedActivity = selectedData && (selectedData.transactions.length > 0 || selectedData.upcoming.length > 0 || selectedData.subscriptions.length > 0 || selectedFeedEvs.length > 0 || selectedCustomEvs.length > 0);

  return (
    <div>
      <PageHeader
        icon={Calendar}
        title="Calendar"
        subtitle="financial events · transaction history · subscription due dates"
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const msgs: Record<string, string | null> = {
          budget:  "Subscription due dates and upcoming bills are overlaid automatically — use the Agenda view to see your full payment schedule at a glance.",
          wealth:  "Goal deadlines and upcoming investment events appear here. Use the calendar to plan large capital deployments around income and expense dates.",
          market:  "Overlay your transaction history with upcoming payments to identify optimal windows for deploying surplus capital into positions.",
          social:  "Shared expenses and group trip dates can be added as custom events — keep your social financial commitments visible alongside regular bills.",
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* Controls */}
      <div className="ft-filter-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        {/* Left: nav */}
        <HStack gap={6} align="center">
          {viewMode === "month" && (
            <>
              <button onClick={prevMonth} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 12, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>‹</button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)", minWidth: 140, textAlign: "center" }}>{MONTH_NAMES[month]} {year}</span>
              <button onClick={nextMonth} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 12, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>›</button>
            </>
          )}
          {viewMode === "week" && (
            <>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 12, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>‹</button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-text)", minWidth: 160, textAlign: "center" }}>
                {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)", fontSize: 12, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>›</button>
            </>
          )}
          {viewMode === "agenda" && (
            <Text as="span" mono size={11} weight={700} color="var(--ft-text)">Next 90 Days</Text>
          )}
          <button
            onClick={goToToday}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", cursor: "pointer", border: "1px solid var(--ft-accent)", color: "var(--ft-accent)", background: "transparent" }}
          >
            Today
          </button>
        </HStack>

        {/* Center: view mode */}
        <div style={{ display: "flex", gap: 1, border: "1px solid var(--ft-border)", overflow: "hidden" }}>
          {([
            { id: "month", icon: <LayoutGrid size={10} />, label: "Month" },
            { id: "week", icon: <CalendarDays size={10} />, label: "Week" },
            { id: "agenda", icon: <AlignJustify size={10} />, label: "Agenda" },
          ] as const).map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 9, padding: "4px 10px", cursor: "pointer", border: "none", background: viewMode === id ? "var(--ft-accent)" : "var(--ft-surface)", color: viewMode === id ? "var(--ft-base)" : "var(--ft-muted)", letterSpacing: "0.06em" }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Right: actions */}
        <HStack gap={8}>
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
        </HStack>
      </div>

      {/* Event form */}
      {showEventForm && (
        <EventForm
          defaultDate={eventFormDate}
          onSave={addCustomEvent}
          onCancel={() => setShowEventForm(false)}
        />
      )}

      <ThisWeekStrip enabledFeeds={enabledFeeds} feedEventMap={feedEventMap} />

      <HStack gap={12} align="center" justify="between" wrap marginBottom={8}>
        <Legend />
      </HStack>

      <HStack gap={12} align="start" wrap>
        {/* Calendar */}
        <div style={{ flex: 1 }}>
          <style>{`.add-event-btn:hover { opacity: 1 !important; }`}</style>

          {viewMode === "month" && (
            <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
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
          )}

          {viewMode === "week" && (
            <WeekView
              weekStart={weekStart}
              dayMap={dayMap}
              feedEventMap={feedEventMap}
              customEventMap={customEventMap}
              todayStr={todayStr}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onAddEvent={(date) => { setEventFormDate(date); setShowEventForm(true); setShowSources(false); }}
            />
          )}

          {viewMode === "agenda" && (
            <AgendaView
              dayMap={dayMap}
              feedEventMap={feedEventMap}
              customEventMap={customEventMap}
              todayStr={todayStr}
              debtEvents={debtEvents}
              goalEvents={goalEvents}
              onSelectDate={(d) => { setSelectedDate(d); setViewMode("month"); setYear(parseInt(d.slice(0,4))); setMonth(parseInt(d.slice(5,7))-1); }}
            />
          )}
        </div>

        {/* Side panels */}
        {showSources && (
          <div style={{ flexShrink: 0, minWidth: 0, maxWidth: "100%" }}>
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
          <div style={{ flexShrink: 0, minWidth: 0, maxWidth: "100%" }}>
            <DayDetailPanel
              dateStr={selectedDate}
              data={selectedData ?? { transactions: [], upcoming: [], subscriptions: [], totalIncome: 0, totalExpenses: 0, net: 0 }}
              feedEvents={selectedFeedEvs}
              customEvents={selectedCustomEvs}
              onClose={() => setSelectedDate(null)}
              onDeleteCustom={deleteCustomEvent}
            />
          </div>
        )}
      </HStack>
    </div>
  );
}

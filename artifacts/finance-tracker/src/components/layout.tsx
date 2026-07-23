import { Link, useLocation } from "wouter";
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useFintrackTheme } from "@/contexts/theme-context";
import { authClient } from "@/lib/auth-client";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMarketQuotes, useGetDashboard, useGetSettingsCurrency } from "@workspace/api-client-react";
import { useTickers } from "@/contexts/tickers-context";
import { usePrivacy, PrivNum } from "@/contexts/privacy-context";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { QuickAddTransaction, useQuickAdd } from "@/components/quick-add-transaction";
import { GlobalSearch, useGlobalSearch } from "@/components/global-search";
import { Search, Pencil, Check, Pin, ChevronUp, ChevronDown, Settings2, ChevronsLeft, ChevronsRight, Eye, EyeOff, ChevronRight } from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { formatGbp } from "@/lib/utils";
import { setBaseCurrency } from "@/lib/currency-store";
import { ThemeEffects } from "@/components/theme-effects";
import { useEasterEggs, EasterEggRenderer } from "@/components/easter-eggs";
import { AiAgent } from "@/components/ai-agent";
import { loadSidebarConfig, saveSidebarConfig } from "@/lib/sidebar-config";
import type { SidebarConfig, SidebarItemConfig } from "@/lib/sidebar-config";

interface LayoutProps {
  children: React.ReactNode;
}

// Primary nav — always visible in sidebar
const NAV_SECTIONS = [
  {
    label: "CORE",
    items: [
      { href: "/",             label: "Dashboard",    code: "G·D" },
      { href: "/accounts",     label: "Accounts",     code: "G·A" },
      { href: "/transactions", label: "Transactions", code: "G·T" },
    ],
  },
  {
    label: "INVEST",
    items: [
      { href: "/investments",   label: "Portfolio",    code: "G·I" },
      { href: "/net-worth",     label: "Net Worth",    code: "G·W" },
    ],
  },
  {
    label: "PLAN",
    items: [
      { href: "/budget",   label: "Budget",  code: "G·B" },
      { href: "/goals",    label: "Goals",   code: "G·L" },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { href: "/analytics",    label: "Analytics",    code: "G·N" },
    ],
  },
];

// Secondary nav — hidden behind "More" toggle by default
const SECONDARY_NAV_SECTIONS = [
  {
    label: "PLAN",
    items: [
      { href: "/owing",         label: "Debts",         code: "G·O" },
      { href: "/subscriptions", label: "Subscriptions", code: "G·C" },
      { href: "/calendar",      label: "Calendar",      code: "G·K" },
    ],
  },
  {
    label: "INVEST",
    items: [
      { href: "/tax",           label: "Tax",           code: "G·Y" },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { href: "/health-score",  label: "Health Score",  code: "G·H" },
      { href: "/cashflow",      label: "Cash Flow",     code: "G·V" },
      { href: "/year-review",   label: "Year Review",   code: "G·E" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { href: "/whatif",    label: "Calculators", code: "G·F" },
      { href: "/import",    label: "Import",      code: "G·J" },
      { href: "/learn",     label: "Learn",       code: "G·Q" },
    ],
  },
];

const BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", code: "G·S" },
];

// Flat list of all configurable nav items (sections only, not bottom items)
const ALL_NAV_ITEMS: { href: string; label: string; code: string; section: string }[] = [
  ...NAV_SECTIONS.flatMap((s) => s.items.map((item) => ({ ...item, section: s.label }))),
  ...SECONDARY_NAV_SECTIONS.flatMap((s) => s.items.map((item) => ({ ...item, section: s.label }))),
];

// Which hrefs are secondary (shown behind "More" toggle)
const SECONDARY_HREFS = new Set(
  SECONDARY_NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href))
);

const G_KEY_MAP: Record<string, string> = {
  d: "/", a: "/accounts", t: "/transactions", r: "/reports",
  u: "/upcoming", o: "/owing", i: "/investments",
  l: "/goals", n: "/analytics", b: "/budget",
  x: "/split", c: "/subscriptions", w: "/net-worth",
  m: "/mortgage", y: "/tax", h: "/health-score",
  f: "/whatif", k: "/calendar",
  s: "/settings", p: "/profile", q: "/learn",
  v: "/cashflow", e: "/year-review", j: "/import", z: "/wardrobe",
};


// ── World clock ─────────────────────────────────────────────────────────────

interface WorldCity {
  label: string;
  flag: string;
  tz: string;
  exchange: string;
  marketOpen: string;   // "HH:MM" local time (24h)
  marketClose: string;
}

const WORLD_CITIES: WorldCity[] = [
  { label: "London",    flag: "🇬🇧", tz: "Europe/London",      exchange: "LSE",     marketOpen: "08:00", marketClose: "16:30" },
  { label: "New York",  flag: "🇺🇸", tz: "America/New_York",   exchange: "NYSE",    marketOpen: "09:30", marketClose: "16:00" },
  { label: "Tokyo",     flag: "🇯🇵", tz: "Asia/Tokyo",          exchange: "TSE",     marketOpen: "09:00", marketClose: "15:30" },
  { label: "Hong Kong", flag: "🇨🇳", tz: "Asia/Hong_Kong",      exchange: "HKEX",   marketOpen: "09:30", marketClose: "16:00" },
  { label: "Sydney",    flag: "🇦🇺", tz: "Australia/Sydney",    exchange: "ASX",     marketOpen: "10:00", marketClose: "16:00" },
  { label: "Frankfurt", flag: "🇩🇪", tz: "Europe/Berlin",       exchange: "XETRA",  marketOpen: "09:00", marketClose: "17:30" },
];

function tzTime(tz: string, now: Date): string {
  return now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function isMarketOpen(city: WorldCity, now: Date): boolean {
  const localStr = now.toLocaleString("en-GB", { timeZone: city.tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = localStr.match(/(\w+), (\d+):(\d+)/);
  if (!parts) return false;
  const [, day, hh, mm] = parts;
  if (["Sat", "Sun"].includes(day)) return false;
  const t = parseInt(hh) * 60 + parseInt(mm);
  const [oh, om] = city.marketOpen.split(":").map(Number);
  const [ch, cm] = city.marketClose.split(":").map(Number);
  return t >= oh * 60 + om && t < ch * 60 + cm;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return {
    local: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    now,
  };
}

// ── World Clock hover component ──────────────────────────────────────────────

function ClockDisplay({ clock }: { clock: string; }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const now = new Date();

  return (
    <>
      <span
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", letterSpacing: "0.08em", paddingRight: 16, borderRight: "1px solid var(--ft-border)", marginRight: 16, cursor: "default", userSelect: "none" }}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPos({ x: rect.right, y: rect.bottom });
          setHover(true);
        }}
        onMouseLeave={() => setHover(false)}
      >
        {clock}
      </span>

      {hover && createPortal(
        <div
          style={{ position: "fixed", right: window.innerWidth - pos.x, top: pos.y + 6, zIndex: 9999, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: 280 }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.12em" }}>WORLD CLOCK — MAJOR EXCHANGES</div>
          {WORLD_CITIES.map((city) => {
            const open = isMarketOpen(city, now);
            const t = tzTime(city.tz, now);
            return (
              <div key={city.tz} style={{ display: "flex", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid var(--ft-border)", gap: 10 }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{city.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--ft-text)" }}>{city.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{city.exchange}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", letterSpacing: "0.04em" }}>{t}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, padding: "1px 6px", background: open ? "rgba(63,185,80,0.15)" : "rgba(255,255,255,0.05)", color: open ? "var(--ft-green)" : "var(--ft-dim)", border: `1px solid ${open ? "rgba(63,185,80,0.3)" : "var(--ft-border)"}` }}>
                    {open ? "OPEN" : "CLOSED"}
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{ padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>Market hours exclude public holidays</div>
        </div>,
        document.body,
      )}
    </>
  );
}

function NavRow({
  href, label, code, collapsed, active,
}: { href: string; label: string; code: string; collapsed: boolean; active: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href}>
      <button
        aria-label={label}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          width: "100%",
          padding: collapsed ? "3px 8px" : "3px 10px 3px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          border: "none",
          borderRadius: 0,
          background: hovered && !active ? "rgba(255,255,255,0.04)" : "transparent",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Icon chip */}
        <span style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 26,
          borderRadius: 5,
          flexShrink: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.05em",
          background: active
            ? "rgba(244,162,30,0.15)"
            : "rgba(255,255,255,0.04)",
          color: active ? "var(--ft-accent)" : "var(--ft-dim)",
          border: active
            ? "1px solid rgba(244,162,30,0.3)"
            : "1px solid rgba(255,255,255,0.06)",
          boxShadow: active ? "0 0 8px rgba(244,162,30,0.15)" : "none",
          transition: "all 0.12s",
        }}>
          {code}
        </span>

        {/* Label */}
        {!collapsed && (
          <span style={{
            fontSize: 12,
            fontWeight: active ? 600 : 400,
            color: active ? "var(--ft-text)" : "var(--ft-muted)",
            letterSpacing: "0.01em",
            transition: "color 0.1s",
          }}>
            {label}
          </span>
        )}

        {/* Active indicator dot */}
        {active && collapsed && (
          <span style={{
            position: "absolute",
            right: 6,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "var(--ft-accent)",
          }} />
        )}
      </button>
    </Link>
  );
}

function SectionDivider({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return (
      <div style={{
        margin: "10px 12px 4px",
        height: 1,
        background: "var(--ft-border)",
      }} />
    );
  }
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 12px 3px 14px",
    }}>
      <span style={{
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.14em",
        color: "var(--ft-dim)",
        fontWeight: 600,
        userSelect: "none",
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--ft-border)" }} />
    </div>
  );
}

function formatTickerPrice(ticker: string, price: number): string {
  if (ticker.endsWith("=X")) return price.toFixed(4);
  if (ticker.startsWith("BTC") || ticker.startsWith("ETH")) {
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  }
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function fmtLargeNum(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toLocaleString();
}

function LiveTickerBar() {
  const { tickers, update, add, remove, reset } = useTickers();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ ticker: string; label: string }[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [tipTicker, setTipTicker] = useState<{ ticker: string; label: string; x: number; y: number } | null>(null);
  const tipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tickerStr = tickers.map(t => t.ticker).filter(Boolean).join(",");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quotes } = useGetMarketQuotes(
    { tickers: tickerStr || "^GSPC" },
    { query: { enabled: tickerStr.length > 0, refetchInterval: 60000 } } as any
  );

  const quoteMap = Object.fromEntries((quotes ?? []).map(q => [q.ticker, q]));

  function openEdit() {
    setDraft(tickers.map(t => ({ ...t })));
    setEditing(true);
  }

  function commitEdit() {
    draft.forEach((d, i) => {
      if (d.ticker.trim()) update(i, { ticker: d.ticker.trim().toUpperCase(), label: d.label.trim() || d.ticker.trim().toUpperCase() });
    });
    setEditing(false);
  }

  function showTip(slot: { ticker: string; label: string }, rect: DOMRect) {
    if (tipTimeout.current) clearTimeout(tipTimeout.current);
    setTipTicker({ ticker: slot.ticker, label: slot.label || slot.ticker, x: rect.left + rect.width / 2, y: rect.bottom });
  }

  function hideTip() {
    tipTimeout.current = setTimeout(() => setTipTicker(null), 120);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tipQ: any = tipTicker ? quoteMap[tipTicker.ticker] : null;
  const tipChg = tipQ?.changePercent as number | undefined;

  return (
    <>
    {/* Ticker hover card portal */}
    {tipTicker && tipQ && createPortal(
      <div
        style={{ position: "fixed", left: tipTicker.x, top: tipTicker.y + 6, transform: "translateX(-50%)", zIndex: 9999, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", boxShadow: "0 8px 28px rgba(0,0,0,0.6)", minWidth: 220 }}
        onMouseEnter={() => { if (tipTimeout.current) clearTimeout(tipTimeout.current); setTipTicker(tipTicker); }}
        onMouseLeave={() => setTipTicker(null)}
      >
        {/* Header */}
        <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "0.04em" }}>{tipTicker.ticker}</div>
            {tipQ.displayName && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{tipQ.displayName}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>{formatTickerPrice(tipTicker.ticker, tipQ.price)}</div>
            {tipChg != null && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: tipChg >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600 }}>
                {tipChg >= 0 ? "▲" : "▼"} {Math.abs(tipChg).toFixed(2)}%
              </div>
            )}
          </div>
        </div>
        {/* Detail rows */}
        <div style={{ padding: "6px 0" }}>
          {[
            ["PREV CLOSE", tipQ.previousClose != null ? formatTickerPrice(tipTicker.ticker, tipQ.previousClose) : null],
            ["DAY RANGE", tipQ.dayLow != null && tipQ.dayHigh != null ? `${formatTickerPrice(tipTicker.ticker, tipQ.dayLow)} – ${formatTickerPrice(tipTicker.ticker, tipQ.dayHigh)}` : null],
            ["52W RANGE", tipQ.low52w != null && tipQ.high52w != null ? `${formatTickerPrice(tipTicker.ticker, tipQ.low52w)} – ${formatTickerPrice(tipTicker.ticker, tipQ.high52w)}` : null],
            ["VOLUME", tipQ.volume != null ? fmtLargeNum(tipQ.volume) : null],
            ["MKT CAP", tipQ.marketCap != null ? fmtLargeNum(tipQ.marketCap) : null],
            ["P/E", tipQ.pe != null ? `${tipQ.pe.toFixed(1)}×` : null],
          ].map(([label, val]) => val == null ? null : (
            <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "3px 12px", gap: 16 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>{label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>,
      document.body,
    )}

    <div className="hidden lg:flex items-center" style={{ gap: 0, borderRight: "1px solid var(--ft-border)", paddingRight: 12, marginRight: 12, position: "relative" }}>
      {!editing ? (
        <>
          {tickers.map((slot, i) => {
            const q = quoteMap[slot.ticker];
            return (
              <div
                key={slot.ticker + i}
                onMouseEnter={(e) => showTip(slot, e.currentTarget.getBoundingClientRect())}
                onMouseLeave={hideTip}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px",
                  borderRight: i < tickers.length - 1 ? "1px solid var(--ft-border)" : "none",
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  cursor: "default",
                }}>
                <span style={{ color: "var(--ft-dim)", letterSpacing: "0.04em" }}>{slot.label || slot.ticker}</span>
                {q ? (
                  <>
                    <span style={{ color: "var(--ft-text)", fontWeight: 600 }}>
                      {formatTickerPrice(slot.ticker, q.price)}
                    </span>
                    {(q as any).changePercent != null && (
                      <span style={{
                        color: (q as any).changePercent >= 0 ? "var(--ft-green)" : "var(--ft-red)",
                        fontSize: 9,
                      }}>
                        {(q as any).changePercent >= 0 ? "+" : ""}{((q as any).changePercent as number).toFixed(2)}%
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--ft-border2)" }}>—</span>
                )}
              </div>
            );
          })}
          {/* Edit button */}
          <button
            onClick={openEdit}
            title="Edit tickers"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--ft-dim)", padding: "4px 6px",
              fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1,
              transition: "color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
          >
            <Pencil size={10} />
          </button>
        </>
      ) : (
        /* Edit mode */
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
          {draft.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <input
                ref={el => { inputRefs.current[i * 2] = el; }}
                value={d.label}
                onChange={e => setDraft(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="Label"
                style={{
                  width: 36, fontFamily: "var(--font-mono)", fontSize: 9,
                  background: "var(--ft-raised)", border: "1px solid var(--ft-accent)",
                  color: "var(--ft-text)", padding: "2px 4px", outline: "none",
                }}
              />
              <input
                ref={el => { inputRefs.current[i * 2 + 1] = el; }}
                value={d.ticker}
                onChange={e => setDraft(prev => prev.map((x, j) => j === i ? { ...x, ticker: e.target.value } : x))}
                placeholder="TICK"
                style={{
                  width: 52, fontFamily: "var(--font-mono)", fontSize: 9,
                  background: "var(--ft-raised)", border: "1px solid var(--ft-border2)",
                  color: "var(--ft-accent)", padding: "2px 4px", outline: "none",
                }}
                onKeyDown={e => e.key === "Enter" && commitEdit()}
              />
              <button
                onClick={() => { setDraft(prev => prev.filter((_, j) => j !== i)); remove(i); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-red)", fontFamily: "var(--font-mono)", fontSize: 10, padding: "0 2px", lineHeight: 1 }}
              >×</button>
            </div>
          ))}
          {draft.length < 8 && (
            <button
              onClick={() => { setDraft(prev => [...prev, { ticker: "", label: "" }]); add(); }}
              style={{ background: "none", border: "1px dashed var(--ft-border2)", cursor: "pointer", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px" }}
            >
              +
            </button>
          )}
          <button
            onClick={commitEdit}
            style={{
              background: "var(--ft-accent)", border: "none", cursor: "pointer",
              color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 9,
              padding: "3px 8px", marginLeft: 4,
            }}
          >
            OK
          </button>
          <button
            onClick={() => { reset(); setEditing(false); }}
            style={{
              background: "none", border: "1px solid var(--ft-border)", cursor: "pointer",
              color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px",
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  </>
  );
}

interface SidebarConfigPanelProps {
  config: SidebarConfig;
  allItems: { href: string; label: string; code: string; section: string }[];
  collapsed: boolean;
  onClose: () => void;
  onChange: (next: SidebarConfig) => void;
}

function SidebarConfigPanel({ config, allItems, collapsed, onClose, onChange }: SidebarConfigPanelProps) {
  const itemMap = new Map<string, SidebarItemConfig>(config.items.map((c) => [c.href, c]));

  function getItem(href: string): SidebarItemConfig {
    return itemMap.get(href) ?? { href, visible: true, pinned: false };
  }

  function updateItem(href: string, patch: Partial<SidebarItemConfig>) {
    const next: SidebarConfig = {
      ...config,
      items: config.items.map((item) =>
        item.href === href ? { ...item, ...patch } : item
      ),
    };
    onChange(next);
  }

  function moveItem(href: string, dir: -1 | 1) {
    const items = [...config.items];
    const idx = items.findIndex((i) => i.href === href);
    if (idx === -1) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange({ ...config, items: next });
  }

  function resetToDefault() {
    onChange({
      items: allItems.map((item) => ({ href: item.href, visible: true, pinned: false })),
      pinnedFirst: true,
    });
  }

  if (collapsed) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        gap: 2,
        overflowY: "auto",
        scrollbarWidth: "none",
      }}>
        <div style={{
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-accent)",
          letterSpacing: "0.1em",
          marginBottom: 6,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
        }}>CFG</div>
        {allItems.map((item) => {
          const c = getItem(item.href);
          return (
            <button
              key={item.href}
              title={`${item.label} — click to toggle visibility`}
              onClick={() => updateItem(item.href, { visible: !c.visible })}
              style={{
                width: 28,
                height: 26,
                background: c.visible
                  ? c.pinned ? "rgba(244,162,30,0.12)" : "rgba(255,255,255,0.04)"
                  : "transparent",
                border: c.visible
                  ? c.pinned ? "1px solid rgba(244,162,30,0.25)" : "1px solid var(--ft-border)"
                  : "1px dashed rgba(255,255,255,0.1)",
                borderRadius: 4,
                cursor: "pointer",
                color: c.visible ? (c.pinned ? "var(--ft-accent)" : "var(--ft-muted)") : "var(--ft-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                opacity: c.visible ? 1 : 0.4,
                transition: "all 0.1s",
                flexShrink: 0,
                padding: 0,
              }}
            >
              {item.code.split("·")[1]}
            </button>
          );
        })}
        <button
          onClick={onClose}
          title="Done"
          style={{
            marginTop: 8,
            width: 28,
            height: 22,
            background: "var(--ft-accent)",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            color: "var(--ft-base)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
          }}
        >OK</button>
      </div>
    );
  }

  // Section groups for configure panel — use config.items order so move up/down is reflected
  const allItemLookup = new Map(allItems.map(i => [i.href, i]));
  const orderedForConfig = config.items
    .map(c => allItemLookup.get(c.href))
    .filter((i): i is (typeof allItems)[0] => i != null);
  const sectionGroups: { label: string; items: typeof allItems }[] = [];
  for (const item of orderedForConfig) {
    const last = sectionGroups[sectionGroups.length - 1];
    if (last && last.label === item.section) {
      last.items.push(item);
    } else {
      sectionGroups.push({ label: item.section, items: [item] });
    }
  }

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      overflowX: "hidden",
      scrollbarWidth: "none",
    }}>
      {/* Header */}
      <div style={{
        padding: "8px 14px 6px",
        borderBottom: "1px solid var(--ft-border)",
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.14em",
          color: "var(--ft-accent)",
          fontWeight: 700,
        }}>CONFIGURE NAV</div>
        <div style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-dim)",
          marginTop: 2,
          letterSpacing: "0.04em",
        }}>toggle · pin · reorder</div>
      </div>

      {/* Pinned-first toggle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 14px",
        borderBottom: "1px solid var(--ft-border)",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-muted)",
          letterSpacing: "0.06em",
        }}>PINNED ITEMS FIRST</span>
        <button
          onClick={() => onChange({ ...config, pinnedFirst: !config.pinnedFirst })}
          style={{
            width: 28,
            height: 14,
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            background: config.pinnedFirst ? "var(--ft-accent)" : "var(--ft-border2)",
            position: "relative",
            transition: "background 0.15s",
            flexShrink: 0,
            padding: 0,
          }}
          aria-label="Toggle pinned items first"
        >
          <span style={{
            position: "absolute",
            top: 2,
            left: config.pinnedFirst ? 16 : 2,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--ft-base)",
            transition: "left 0.15s",
          }} />
        </button>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {sectionGroups.map((group) => (
          <div key={group.label}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px 3px",
            }}>
              <span style={{
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.14em",
                color: "var(--ft-dim)",
                fontWeight: 600,
              }}>{group.label}</span>
              <div style={{ flex: 1, height: 1, background: "var(--ft-border)" }} />
            </div>
            {group.items.map((item) => {
              const c = getItem(item.href);
              return (
                <div
                  key={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 10px 0 12px",
                    height: 28,
                    opacity: c.visible ? 1 : 0.4,
                    transition: "opacity 0.12s",
                  }}
                >
                  {/* Visibility toggle */}
                  <button
                    onClick={() => updateItem(item.href, { visible: !c.visible })}
                    title={c.visible ? "Hide from nav" : "Show in nav"}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      border: `1px solid ${c.visible ? "var(--ft-border2)" : "var(--ft-border)"}`,
                      background: c.visible ? "var(--ft-raised)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      padding: 0,
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.visible ? "var(--ft-border2)" : "var(--ft-border)"; }}
                  >
                    {c.visible && (
                      <Check size={8} color="var(--ft-green)" />
                    )}
                  </button>

                  {/* Code chip */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: c.pinned ? "var(--ft-accent)" : "var(--ft-dim)",
                    letterSpacing: "0.04em",
                    flexShrink: 0,
                    width: 26,
                    textAlign: "center",
                  }}>{item.code}</span>

                  {/* Label */}
                  <span style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: c.visible ? "var(--ft-text)" : "var(--ft-dim)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.02em",
                  }}>{item.label}</span>

                  {/* Pin toggle */}
                  <button
                    onClick={() => updateItem(item.href, { pinned: !c.pinned, visible: c.pinned ? c.visible : true })}
                    title={c.pinned ? "Unpin" : "Pin to top"}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: c.pinned ? "var(--ft-accent)" : "var(--ft-dim)",
                      fontSize: 10,
                      lineHeight: 1,
                      padding: "0 2px",
                      flexShrink: 0,
                      transition: "color 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = c.pinned ? "var(--ft-accent)" : "var(--ft-dim)"; }}
                  >
                    <Pin size={10} />
                  </button>

                  {/* Move up/down */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 0, flexShrink: 0 }}>
                    <button
                      onClick={() => moveItem(item.href, -1)}
                      title="Move up"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--ft-dim)",
                        fontSize: 7,
                        lineHeight: 1,
                        padding: "1px 2px",
                        height: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "color 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-text)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
                    ><ChevronUp size={8} /></button>
                    <button
                      onClick={() => moveItem(item.href, 1)}
                      title="Move down"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--ft-dim)",
                        fontSize: 7,
                        lineHeight: 1,
                        padding: "1px 2px",
                        height: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "color 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-text)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ft-dim)"; }}
                    ><ChevronDown size={8} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div style={{
        borderTop: "1px solid var(--ft-border)",
        padding: "6px 12px",
        display: "flex",
        gap: 6,
        flexShrink: 0,
      }}>
        <button
          onClick={resetToDefault}
          style={{
            flex: 1,
            background: "none",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-dim)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "4px 0",
            letterSpacing: "0.06em",
            transition: "all 0.1s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--ft-text)";
            e.currentTarget.style.borderColor = "var(--ft-border2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--ft-dim)";
            e.currentTarget.style.borderColor = "var(--ft-border)";
          }}
        >RESET</button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            background: "var(--ft-accent)",
            border: "none",
            color: "var(--ft-base)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            padding: "4px 0",
            letterSpacing: "0.06em",
            transition: "opacity 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >DONE</button>
      </div>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location, navigate] = useLocation();
  const { theme } = useFintrackTheme();
  const { local: clock } = useClock();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { open: cmdOpen, closePalette } = useCommandPalette();
  const { open: qaOpen, close: qaClose } = useQuickAdd();
  const { open: searchOpen, openSearch, closeSearch } = useGlobalSearch();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("ft-sidebar") === "collapsed"; } catch { return false; }
  });
  const [moreOpen, setMoreOpen] = useState(() => {
    try { return localStorage.getItem("nr-sidebar-more") === "1"; } catch { return false; }
  });
  const [showHelp, setShowHelp] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const { privacy, togglePrivacy } = usePrivacy();
  const [sidebarConfig, setSidebarConfig] = useState<SidebarConfig>(() =>
    loadSidebarConfig(ALL_NAV_ITEMS)
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const s = localStorage.getItem("ft-sidebar-width");
      return s ? Math.max(160, Math.min(360, Number(s))) : 212;
    } catch { return 212; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHovered, setResizeHovered] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const { data: dashboardData } = useGetDashboard();
  const { data: currencyData } = useGetSettingsCurrency();
  useEffect(() => {
    if (currencyData?.baseCurrency) setBaseCurrency(currencyData.baseCurrency);
  }, [currencyData?.baseCurrency]);
  const pendingGRef = useRef(false);
  const { overlay: eggOverlay, clearOverlay, logoRef } = useEasterEggs();

  const toggleSidebar = useCallback(() => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem("ft-sidebar", next ? "collapsed" : "expanded"); } catch {}
      return next;
    });
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    if (collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthRef.current;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(160, Math.min(360, startW + ev.clientX - startX));
      setSidebarWidth(next);
      sidebarWidthRef.current = next;
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem("ft-sidebar-width", String(sidebarWidthRef.current)); } catch {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable = target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" || target.isContentEditable;
      if (isEditable) return;

      if (e.key === "[" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleSidebar(); return; }

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !pendingGRef.current) {
        e.preventDefault();
        setShowHelp(h => !h);
        return;
      }

      if (e.key === "Escape") { setShowHelp(false); return; }

      // G+key navigation: press G, then D/A/T/U/O/I/S/P within 1.5s
      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        pendingGRef.current = true;
        setTimeout(() => { pendingGRef.current = false; }, 1500);
        return;
      }

      if (pendingGRef.current) {
        const path = G_KEY_MAP[e.key.toLowerCase()];
        if (path !== undefined) {
          e.preventDefault();
          pendingGRef.current = false;
          navigate(path);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar, navigate]);

  useEffect(() => {
    document.body.classList.toggle("dark", theme !== "arctic");
  }, [theme]);

  const userInitial = session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? "U";
  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient.clear();
  };

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const allItems = NAV_SECTIONS.flatMap(s => s.items).concat(BOTTOM_ITEMS);
  const activePage = allItems.find(i => isActive(i.href))?.label ?? "Dashboard";

  const sidebarW = collapsed ? 54 : sidebarWidth;

  return (
    <>
    <CommandPalette open={cmdOpen} onClose={closePalette} />
    <QuickAddTransaction open={qaOpen} onClose={qaClose} />
    <GlobalSearch open={searchOpen} onClose={closeSearch} />

    {showHelp && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={() => setShowHelp(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0,0,0,0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: 520,
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            padding: "24px 28px",
          }}
        >
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-accent)",
            letterSpacing: "0.18em",
            marginBottom: 20,
            fontWeight: 700,
          }}>
            KEYBOARD SHORTCUTS
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px 24px",
          }}>
            {[
              ["G·D", "Dashboard"],
              ["G·A", "Accounts"],
              ["G·T", "Transactions"],
              ["G·R", "Reports"],
              ["G·U", "Upcoming"],
              ["G·O", "Owing"],
              ["G·L", "Goals"],
              ["G·I", "Investments"],
              ["G·N", "Analytics"],
              ["G·S", "Settings"],
              ["G·P", "Profile"],
              ["⌘[", "Toggle sidebar"],
              ["⌘K", "Global search"],
              ["/", "Focus search"],
              ["N", "Quick add transaction"],
              ["?", "This help"],
            ].map(([key, label]) => (
              <div key={key} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}>
                <span style={{
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border2)",
                  color: "var(--ft-accent)",
                  padding: "2px 6px",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  fontWeight: 700,
                  flexShrink: 0,
                  minWidth: 52,
                  textAlign: "center",
                }}>
                  {key}
                </span>
                <span style={{ color: "var(--ft-muted)", fontSize: 11 }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 20,
            paddingTop: 14,
            borderTop: "1px solid var(--ft-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            letterSpacing: "0.08em",
          }}>
            PRESS ESC OR CLICK OUTSIDE TO CLOSE
          </div>
        </div>
      </div>
    )}
    <div
      className="flex h-[100dvh] overflow-hidden"
      style={{ background: "var(--ft-base)", color: "var(--ft-text)", fontFamily: "var(--font-body, var(--font-sans))" }}
    >
      <ThemeEffects />

      {/* ══ Sidebar ══ */}
      <aside
        style={{
          width: sidebarW,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--ft-surface)",
          borderRight: "1px solid var(--ft-border)",
          transition: isResizing ? "none" : "width 0.2s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Left accent rail */}
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: "var(--ft-accent)",
          opacity: 0.7,
        }} />

        {/* Resize handle — right edge drag zone */}
        {!collapsed && (
          <div
            onPointerDown={handleResizeStart}
            onMouseEnter={() => setResizeHovered(true)}
            onMouseLeave={() => setResizeHovered(false)}
            title="Drag to resize"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 6,
              cursor: "col-resize",
              zIndex: 20,
              background: isResizing
                ? "var(--ft-accent)"
                : resizeHovered
                ? "var(--ft-accent)"
                : "transparent",
              opacity: isResizing ? 0.5 : resizeHovered ? 0.35 : 0,
              transition: "opacity 0.12s",
            }}
          />
        )}

        {/* Brand */}
        <div
          ref={logoRef}
          data-logo
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            paddingLeft: collapsed ? 0 : 16,
            paddingRight: 10,
            justifyContent: collapsed ? "center" : "space-between",
            borderBottom: "1px solid var(--ft-border)",
            flexShrink: 0,
            cursor: "default",
          }}
        >
          {collapsed ? (
            <LogoMark />
          ) : (
            <Logo />
          )}
        </div>

        {/* Nav or Configure Panel */}
        {configuring ? (
          <SidebarConfigPanel
            config={sidebarConfig}
            allItems={ALL_NAV_ITEMS}
            collapsed={collapsed}
            onClose={() => setConfiguring(false)}
            onChange={(next) => {
              setSidebarConfig(next);
              saveSidebarConfig(next);
            }}
          />
        ) : (
          <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingTop: 8, paddingBottom: 4, scrollbarWidth: "none" }}>
            {(() => {
              const configMap = new Map<string, SidebarItemConfig>(
                sidebarConfig.items.map((c) => [c.href, c])
              );

              const pinnedItems = sidebarConfig.pinnedFirst
                ? ALL_NAV_ITEMS.filter((item) => configMap.get(item.href)?.pinned && configMap.get(item.href)?.visible !== false)
                : [];

              // Build sections from config.items order so reordering is reflected in nav
              const allNavLookup = new Map(ALL_NAV_ITEMS.map(i => [i.href, i]));
              const orderedNavItems = sidebarConfig.items
                .filter(c => {
                  if (c.visible === false) return false;
                  if (sidebarConfig.pinnedFirst && c.pinned) return false;
                  if (!moreOpen && SECONDARY_HREFS.has(c.href)) return false;
                  return true;
                })
                .map(c => allNavLookup.get(c.href))
                .filter((i): i is (typeof ALL_NAV_ITEMS)[0] => i != null);
              const filteredSections: { label: string; items: typeof ALL_NAV_ITEMS }[] = [];
              for (const item of orderedNavItems) {
                const last = filteredSections[filteredSections.length - 1];
                if (last && last.label === item.section) {
                  last.items.push(item);
                } else {
                  filteredSections.push({ label: item.section, items: [item] });
                }
              }

              return (
                <>
                  {/* Pinned section */}
                  {pinnedItems.length > 0 && (
                    <div>
                      {!collapsed && (
                        <div style={{ padding: "0 12px 3px 14px" }}>
                          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.14em", color: "var(--ft-accent)", fontWeight: 700, opacity: 0.8 }}>
                            PINNED
                          </span>
                        </div>
                      )}
                      {collapsed && <div style={{ height: 4 }} />}
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {pinnedItems.map((item) => (
                          <NavRow
                            key={item.href + "-pinned"}
                            href={item.href}
                            label={item.label}
                            code={item.code}
                            collapsed={collapsed}
                            active={isActive(item.href)}
                          />
                        ))}
                      </div>
                      <div style={{ margin: "6px 12px 2px", height: 1, background: "rgba(244,162,30,0.2)" }} />
                    </div>
                  )}

                  {/* Regular sections */}
                  {filteredSections.map((section, i) => (
                    <div key={`${section.label}-${i}`}>
                      {(i > 0 || pinnedItems.length > 0) && (
                        <SectionDivider label={section.label} collapsed={collapsed} />
                      )}
                      {i === 0 && pinnedItems.length === 0 && !collapsed && (
                        <div style={{ padding: "0 12px 3px 14px" }}>
                          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.14em", color: "var(--ft-dim)", fontWeight: 600 }}>
                            {section.label}
                          </span>
                        </div>
                      )}
                      {i === 0 && pinnedItems.length === 0 && collapsed && <div style={{ height: 4 }} />}
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {section.items.map((item) => (
                          <NavRow
                            key={item.href}
                            href={item.href}
                            label={item.label}
                            code={item.code}
                            collapsed={collapsed}
                            active={isActive(item.href)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* More / Less toggle */}
                  <div style={{ margin: collapsed ? "8px 10px 4px" : "6px 12px 4px" }}>
                    <button
                      onClick={() => {
                        const next = !moreOpen;
                        setMoreOpen(next);
                        try { localStorage.setItem("nr-sidebar-more", next ? "1" : "0"); } catch {}
                      }}
                      style={{
                        width: "100%",
                        background: "none",
                        border: `1px dashed ${moreOpen ? "var(--ft-border2)" : "var(--ft-border)"}`,
                        borderRadius: 4,
                        cursor: "pointer",
                        color: moreOpen ? "var(--ft-muted)" : "var(--ft-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: collapsed ? 8 : 9,
                        letterSpacing: "0.08em",
                        padding: collapsed ? "4px 0" : "3px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: collapsed ? "center" : "space-between",
                        gap: 4,
                        transition: "all 0.1s",
                      }}
                      title={moreOpen ? "Show less" : "Show more"}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-text)"; e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = moreOpen ? "var(--ft-muted)" : "var(--ft-dim)"; e.currentTarget.style.borderColor = moreOpen ? "var(--ft-border2)" : "var(--ft-border)"; }}
                    >
                      {collapsed ? (
                        moreOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />
                      ) : (
                        <>
                          <span>{moreOpen ? "LESS" : "MORE"}</span>
                          {moreOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                        </>
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </nav>
        )}

        {/* Configure sidebar gear button */}
        <div style={{ borderTop: "1px solid var(--ft-border)", flexShrink: 0 }}>
          <button
            onClick={() => setConfiguring((c) => !c)}
            title="Configure sidebar"
            aria-label="Configure sidebar"
            style={{
              width: "100%",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: configuring ? "var(--ft-accent)" : "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: collapsed ? 13 : 9,
              letterSpacing: "0.06em",
              padding: "5px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: 6,
              paddingLeft: collapsed ? 0 : 14,
              transition: "color 0.1s, background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!configuring) {
                e.currentTarget.style.color = "var(--ft-text)";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }
            }}
            onMouseLeave={(e) => {
              if (!configuring) {
                e.currentTarget.style.color = "var(--ft-dim)";
                e.currentTarget.style.background = "none";
              }
            }}
          >
            <Settings2 size={11} />
            {!collapsed && <span>CONFIGURE NAV</span>}
          </button>
        </div>

        {/* Bottom: settings / profile */}
        <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {BOTTOM_ITEMS.map(item => (
              <NavRow
                key={item.href}
                href={item.href}
                label={item.label}
                code={item.code}
                collapsed={collapsed}
                active={isActive(item.href)}
              />
            ))}
          </div>

          {/* User card — click navigates to profile */}
          <div
            onClick={() => navigate("/profile")}
            title="View profile"
            style={{
              margin: "8px 8px 6px",
              padding: collapsed ? "6px 4px" : "8px 10px",
              borderRadius: 7,
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              display: "flex",
              alignItems: "center",
              gap: 9,
              justifyContent: collapsed ? "center" : "flex-start",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--ft-border2)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--ft-border)")}
          >
            {/* Avatar with status ring */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt="Profile"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    objectFit: "cover",
                    display: "block",
                    boxShadow: "0 0 0 2px var(--ft-raised), 0 0 0 3px var(--ft-border2)",
                  }}
                />
              ) : (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--ft-accent) 0%, color-mix(in srgb, var(--ft-accent) 60%, var(--ft-blue)) 100%)",
                color: "var(--ft-base)",
                fontSize: 11,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-head)",
                boxShadow: "0 0 0 2px var(--ft-raised), 0 0 0 3px var(--ft-border2)",
              }}>
                {userInitial}
              </div>
              )}
              {/* Online dot */}
              <span className="ft-live-dot" style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 7,
                height: 7,
                boxShadow: "0 0 0 1.5px var(--ft-raised)",
              }} />
            </div>

            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userName}
                </div>
                <div style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userEmail}
                </div>
              </div>
            )}
          </div>

          {/* Net worth strip */}
          {dashboardData && (
            <div style={{
              borderTop: "1px solid var(--ft-border)",
              padding: collapsed ? "5px 0" : "5px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "space-between",
              gap: 4,
              fontFamily: "var(--font-mono)",
            }}>
              {collapsed ? (
                <PrivNum style={{ fontSize: 9, color: "var(--ft-accent)", fontWeight: 700, letterSpacing: "0.02em" }}>
                  {formatGbp(dashboardData.netWorth)}
                </PrivNum>
              ) : (
                <>
                  <span style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em" }}>NET WORTH</span>
                  <PrivNum style={{ fontSize: 10, color: "var(--ft-text)", fontWeight: 700 }}>
                    {formatGbp(dashboardData.netWorth)}
                  </PrivNum>
                </>
              )}
            </div>
          )}

          {/* Collapse toggle */}
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title="⌘["
            style={{
              width: "100%",
              background: "none",
              border: "none",
              borderTop: "1px solid var(--ft-border)",
              color: "var(--ft-dim)",
              cursor: "pointer",
              padding: "5px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-text)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; e.currentTarget.style.background = "none"; }}
          >
            {collapsed ? <ChevronsRight size={10} /> : <ChevronsLeft size={10} />}
            {!collapsed && <span style={{ fontSize: 9 }}>⌘[</span>}
          </button>
        </div>
      </aside>

      {/* ══ Right panel ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "var(--ft-surface)",
          borderBottom: "1px solid var(--ft-border)",
          flexShrink: 0,
          gap: 16,
        }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.1em", flexShrink: 0 }}>
              NUMERIS
            </span>
            <span style={{ color: "var(--ft-border2)", fontSize: 12, flexShrink: 0 }}>›</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", flexShrink: 0 }}>
              {activePage.toUpperCase()}
            </span>
          </div>

          {/* Right: market + clock + sign out */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
            {/* Live market ticker bar */}
            <LiveTickerBar />

            {/* Clock with world timezone hover */}
            <ClockDisplay clock={clock} />

            {/* Global search button */}
            <button
              onClick={openSearch}
              title="Search (⌘K)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                padding: "4px 10px",
                borderRadius: 4,
                letterSpacing: "0.06em",
                marginRight: 10,
                transition: "all 0.1s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = "var(--ft-text)";
                e.currentTarget.style.borderColor = "var(--ft-border2)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = "var(--ft-muted)";
                e.currentTarget.style.borderColor = "var(--ft-border)";
              }}
            >
              <Search size={12} />
              <span>SEARCH</span>
              <span style={{ color: "var(--ft-dim)", fontSize: 9, borderLeft: "1px solid var(--ft-border)", paddingLeft: 6 }}>⌘K</span>
            </button>

            {/* Privacy toggle */}
            <button
              onClick={togglePrivacy}
              title={privacy ? "Show numbers" : "Hide numbers"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "4px 9px",
                background: privacy ? "rgba(244,162,30,0.12)" : "var(--ft-raised)",
                border: `1px solid ${privacy ? "var(--ft-accent)" : "var(--ft-border)"}`,
                color: privacy ? "var(--ft-accent)" : "var(--ft-muted)",
                cursor: "pointer", borderRadius: 4, marginRight: 8,
                transition: "all 0.1s",
              }}
            >
              {privacy ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              style={{
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                padding: "4px 10px",
                borderRadius: 4,
                letterSpacing: "0.08em",
                transition: "all 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-red)"; e.currentTarget.style.borderColor = "var(--ft-red)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-muted)"; e.currentTarget.style.borderColor = "var(--ft-border)"; }}
            >
              SIGN OUT
            </button>
          </div>
        </header>

        {/* Main */}
        <main style={{ flex: 1, overflowY: "auto", background: "var(--ft-base)" }}>
          <div style={{ padding: "20px 24px 32px" }}>{children}</div>
        </main>

        {/* Status strip */}
        <footer style={{
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          flexShrink: 0,
          letterSpacing: "0.06em",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="ft-live-dot" />
              <span style={{ color: "var(--ft-green)" }}>CONNECTED</span>
            </span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>RAILWAY · TLS 1.3</span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>{userEmail}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>⌘[ SIDEBAR</span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>/ COMMAND</span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>financetracker.work</span>
          </div>
        </footer>
      </div>
    </div>
    <EasterEggRenderer overlay={eggOverlay} clearOverlay={clearOverlay} />
    <AiAgent sidebarW={sidebarW} />
    </>
  );
}

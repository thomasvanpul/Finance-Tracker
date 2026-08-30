import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiFetch } from "@/lib/api-fetch";
import { getAiStyle, setAiStylePref, type AiStyle } from "@/components/ai-agent";
import { loadCatRules, saveCatRules, type CatRule } from "@/lib/auto-cat";
import { PERSONAS, loadPersonaIds, applyPersonas, PERSONA_COLORS, PERSONA_GLYPHS, PERSONA_INSIGHT_PREVIEWS, PERSONA_BG, widgetIdsForPersona, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { loadSidebarConfig, saveSidebarConfig } from "@/lib/sidebar-config";
import {
  useGetSettingsCurrency,
  useUpdateSettingsCurrency,
  useGetWiseStatus,
  useSyncWiseTransactions,
  useListAccounts,
  useListTransactions,
} from "@workspace/api-client-react";
import { useCategoryMeta } from "@/contexts/category-context";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Lock } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useFintrackTheme, type FintrackTheme } from "@/contexts/theme-context";
import { useWidgets, WIDGET_REGISTRY } from "@/contexts/widgets-context";
import { getBotSkin, setBotSkin, SKINS, type BotSkinId } from "@/lib/bot-skins";
import { BotPreview, type Phase } from "@/components/ai-wanderer";
import { ConnectionsPanel } from "./settings-connections";

const WARDROBE_PHASES: Phase[] = ["idle", "sitting", "coffee", "thinking", "dancing", "complaining", "tired", "jumping", "lying"];

// ── Storage keys ──────────────────────────────────────────────────────────────
const ALERT_RULES_KEY = "ft-alert-rules";
const DENSITY_KEY = "ft-density";

// ── Types ─────────────────────────────────────────────────────────────────────
type Density = "compact" | "normal" | "comfortable";

type NavItem =
  | "appearance" | "display" | "wardrobe" | "terminal-profile"
  | "currency" | "alerts" | "rules" | "dashboard" | "tx-defaults"
  | "widgets" | "data" | "advanced"
  | "shortcuts" | "ai"
  | "connections" | "wise" | "crypto-wallets" | "digest"
  | "categories";

interface AlertRules {
  largeTxThreshold: number;
  budgetWarningPct: number;
  savingsRateMin: number;
  categorySpikeAlertPct: number;
  budgetHardStop: boolean;
  goalBehindMonths: number;
  billReminderDays: number;
  enabled: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SUPPORTED_CURRENCIES = ["GBP","USD","EUR","MYR","CNY","JPY","AUD","CAD","SGD","HKD","THB","INR"] as const;
const COMMON_FX_PAIRS = ["USD","EUR","MYR","AUD","CAD","SGD","JPY","CNY"] as const;

const CATEGORIES = [
  "Salary","Freelance","Investment Income","Gift",
  "Rent / Mortgage","Groceries","Eating Out","Coffee",
  "Transport","Fuel","Flights","Accommodation",
  "Utilities","Subscriptions","Healthcare","Insurance",
  "Shopping","Electronics","Clothing",
  "Entertainment","Sport","Education",
  "Transfer","Savings","Tax","Other",
];

// tone drives Dark / Light grouping in the picker. Mario is 'dark'
// despite its blue base — the whole theme is a novelty and it groups
// with the stylised themes rather than pretending to be a daytime
// choice.
type ThemeTone = "dark" | "light";
const SWATCH_DATA: { id: FintrackTheme; label: string; tone: ThemeTone; tagline: string; base: string; surface: string; accent: string; text: string; muted: string }[] = [
  { id: "void",       label: "Void",       tone: "dark",  tagline: "Terminal amber on void",       base: "#08090B", surface: "#0F1117", accent: "#F4A21E", text: "#CDD6F4", muted: "#6C7A96" },
  { id: "phosphor",   label: "Phosphor",   tone: "dark",  tagline: "CRT phosphor green",           base: "#020802", surface: "#050F05", accent: "#7FFF00", text: "#39FF14", muted: "#1E8C0A" },
  { id: "arctic",     label: "Arctic",     tone: "light", tagline: "Corporate daylight",           base: "#F0F4F8", surface: "#FFFFFF", accent: "#0052CC", text: "#1A2333", muted: "#5A6A84" },
  { id: "parchment",  label: "Parchment",  tone: "light", tagline: "FT paper, newsprint red",      base: "#F5EBD8", surface: "#FFF8EC", accent: "#7A1F30", text: "#241A0C", muted: "#4B3818" },
  { id: "slate",      label: "Slate",      tone: "light", tagline: "Granite desk, deep teal",      base: "#DFE6EE", surface: "#F0F4F8", accent: "#0E5766", text: "#141A22", muted: "#3E4A58" },
  { id: "linen",      label: "Linen",      tone: "light", tagline: "Warm ledger, olive gold",      base: "#EEE7D6", surface: "#F8F2E3", accent: "#5A4610", text: "#241D0F", muted: "#4A3E1E" },
  { id: "amber",      label: "Amber",      tone: "dark",  tagline: "Warm trader console",          base: "#0A0600", surface: "#120C00", accent: "#FFD700", text: "#FFB000", muted: "#A07020" },
  { id: "midnight",   label: "Midnight",   tone: "dark",  tagline: "Late-night deep blue",         base: "#010817", surface: "#05112A", accent: "#4D9FFF", text: "#E8F0FF", muted: "#7A99CC" },
  { id: "matrix",     label: "Matrix",     tone: "dark",  tagline: "Decoded reality",              base: "#000300", surface: "#010601", accent: "#00FF41", text: "#00CC33", muted: "#007700" },
  { id: "synthwave",  label: "Synthwave",  tone: "dark",  tagline: "Neon grids, 80s midnight",     base: "#0D001A", surface: "#170028", accent: "#FF007A", text: "#E8D5FF", muted: "#9966CC" },
  { id: "deep-space", label: "Deep Space", tone: "dark",  tagline: "Cosmic observatory",           base: "#010108", surface: "#06060F", accent: "#7B5EA7", text: "#C8D0E8", muted: "#6870A0" },
  { id: "mario",      label: "Mario",      tone: "dark",  tagline: "8-bit power-up",              base: "#5C94FC", surface: "#3A70DC", accent: "#F8C800", text: "#FCFCFC", muted: "#6888CC" },
  { id: "gilded",     label: "Gilded",     tone: "dark",  tagline: "Black gold, no noise",         base: "#080600", surface: "#0E0C00", accent: "#C8941E", text: "#F0E6C8", muted: "#7A5E0A" },
  { id: "bloodline",  label: "Bloodline",  tone: "dark",  tagline: "Dark market, red signals",     base: "#0F0003", surface: "#1A0008", accent: "#CC1A2F", text: "#F5C2C7", muted: "#883344" },
];

const SHORTCUTS = [
  ["/","Open command palette"],
  ["G D","Go to Dashboard"],
  ["G T","Go to Transactions"],
  ["G S","Go to Settings"],
  ["G P","Go to Profile"],
  ["N","New transaction"],
  ["F","Focus filter / search"],
  ["Esc","Close modal / cancel"],
  ["↑ ↓","Navigate table rows"],
  ["Enter","Select focused row"],
  ["Tab","Cycle panels"],
];

const ALL_NAV_ITEMS_FOR_SETTINGS = [
  { href: "/",              label: "Dashboard",    section: "CORE" },
  { href: "/accounts",      label: "Accounts",     section: "CORE" },
  { href: "/transactions",  label: "Transactions", section: "CORE" },
  { href: "/investments",   label: "Portfolio",    section: "INVEST" },
  { href: "/net-worth",     label: "Net Worth",    section: "INVEST" },
  { href: "/budget",        label: "Budget",       section: "PLAN" },
  { href: "/goals",         label: "Goals",        section: "PLAN" },
  { href: "/analytics",     label: "Analytics",    section: "INSIGHTS" },
  { href: "/ai-coach",      label: "AI Coach",     section: "INSIGHTS" },
  { href: "/owing",         label: "Debts",        section: "PLAN" },
  { href: "/subscriptions", label: "Subscriptions",section: "PLAN" },
  { href: "/calendar",      label: "Calendar",     section: "PLAN" },
  { href: "/tax",           label: "Tax",          section: "INVEST" },
  { href: "/health-score",  label: "Health Score", section: "INSIGHTS" },
  { href: "/cashflow",      label: "Cash Flow",    section: "INSIGHTS" },
  { href: "/year-review",   label: "Year Review",  section: "INSIGHTS" },
  { href: "/reports",       label: "Reports",      section: "INSIGHTS" },
  { href: "/recurring",     label: "Recurring",    section: "TOOLS" },
  { href: "/whatif",        label: "Calculators",  section: "TOOLS" },
  { href: "/import",        label: "Import",       section: "TOOLS" },
];

// Nav items a market persona should not see (bank-only surfaces).
// Extend this set if a future integration is bank-only. Everything
// else is visible to every persona; the Connections panel itself
// filters providers by persona via providersForPersona().
const MARKET_HIDDEN_NAV: readonly NavItem[] = ["wise"] as const;

function filterNavGroupsForPersona(
  groups: { label: string; items: { id: NavItem; label: string }[] }[],
  persona: "market" | "budget" | "wealth" | "social" | "full",
): { label: string; items: { id: NavItem; label: string }[] }[] {
  if (persona !== "market") return groups;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !MARKET_HIDDEN_NAV.includes(i.id)) }))
    .filter((g) => g.items.length > 0);
}

const NAV_GROUPS: { label: string; items: { id: NavItem; label: string }[] }[] = [
  {
    label: "Personalise",
    items: [
      { id: "terminal-profile", label: "Terminal Profile" },
      { id: "appearance",  label: "Appearance" },
      { id: "display",     label: "Display & Motion" },
      { id: "wardrobe",    label: "Wardrobe" },
      { id: "categories",  label: "Categories" },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "currency",    label: "Currency" },
      { id: "alerts",      label: "Alerts" },
      { id: "rules",       label: "Auto-Categorize" },
      { id: "tx-defaults", label: "Tx Defaults" },
      { id: "dashboard",   label: "Dashboard" },
    ],
  },
  {
    label: "Data",
    items: [
      { id: "widgets",  label: "Widgets" },
      { id: "data",     label: "Export & Backup" },
      { id: "advanced", label: "Advanced" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { id: "connections",    label: "Connections" },
      { id: "wise",           label: "Wise (legacy)" },
      { id: "crypto-wallets", label: "Crypto Wallets" },
      { id: "digest",         label: "Weekly Digest" },
    ],
  },
  {
    label: "AI & Help",
    items: [
      { id: "ai",        label: "AI Coach" },
      { id: "shortcuts", label: "Shortcuts" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadDensity(): Density {
  try {
    const raw = localStorage.getItem(DENSITY_KEY);
    if (raw === "compact" || raw === "normal" || raw === "comfortable") return raw;
    return "normal";
  } catch { return "normal"; }
}

function applyDensity(d: Density) {
  document.body.classList.remove("density-compact","density-normal","density-comfortable");
  document.body.classList.add(`density-${d}`);
}

const DEFAULT_ALERT_RULES: AlertRules = {
  largeTxThreshold: 500, budgetWarningPct: 80, savingsRateMin: 10,
  categorySpikeAlertPct: 50, budgetHardStop: false, goalBehindMonths: 2,
  billReminderDays: 3, enabled: true,
};

function loadAlertRules(): AlertRules {
  try {
    const raw = localStorage.getItem(ALERT_RULES_KEY);
    if (!raw) return { ...DEFAULT_ALERT_RULES };
    return { ...DEFAULT_ALERT_RULES, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_ALERT_RULES }; }
}

function ls(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function lsBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "true";
  } catch { return fallback; }
}

function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function getStorageUsage(): { keyCount: number; sizeKb: number; nrKeyCount: number } {
  const ftKeys = Object.keys(localStorage).filter(k => k.startsWith("ft-"));
  const nrKeys = Object.keys(localStorage).filter(k => k.startsWith("nr-"));
  const all = [...ftKeys, ...nrKeys];
  const totalChars = all.reduce((a, k) => a + (localStorage.getItem(k)?.length ?? 0), 0);
  return { keyCount: ftKeys.length + nrKeys.length, sizeKb: Math.round(totalChars * 2 / 1024 * 10) / 10, nrKeyCount: nrKeys.length };
}

function getFtLocalStorageEntries(): Record<string, string> {
  const e: Record<string,string> = {};
  for (const k of Object.keys(localStorage).filter(k => k.startsWith("ft-")))
    e[k] = localStorage.getItem(k) ?? "";
  return e;
}

// ── Shared primitives extracted to settings-atoms.tsx ─────────────────────
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";
import {
  PANEL_STYLE, HEADER_STYLE, ROW,
  RowLabel, Toggle, SectionHeader, ActionBtn,
  SettingsActionRow, SettingsInputRow, SettingsInfoRow, SettingsDataResetRow,
  SettingsToggleRow, SettingsSelectRow, SettingsNavItemRow, SettingsWidgetRow,
  SettingsThemeEffectRow, StorageKpiStrip,
} from "./settings-atoms";

// Placeholder for old-block-start; the rest of this block is deleted below.

// ── Savings Rate Target ───────────────────────────────────────────────────────
const SAVINGS_TARGET_KEY = "ft-savings-target";
const SAVINGS_TARGET_DEFAULT = 20;

function loadSavingsTarget(): number {
  try {
    const raw = localStorage.getItem(SAVINGS_TARGET_KEY);
    if (raw === null) return SAVINGS_TARGET_DEFAULT;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? SAVINGS_TARGET_DEFAULT : Math.max(0, Math.min(100, parsed));
  } catch { return SAVINGS_TARGET_DEFAULT; }
}

function SavingsRateTargetInput() {
  const [value, setValue] = useState<number>(() => loadSavingsTarget());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.min(100, Number(e.target.value)));
    setValue(v);
    try { localStorage.setItem(SAVINGS_TARGET_KEY, String(v)); } catch { /* ignore */ }
  };

  return (
    <VStack gap={6} marginTop={10}>
      <HStack gap={8} align="center">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={handleChange}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-border2)",
            color: "var(--ft-text)",
            padding: "5px 10px",
            width: 80,
            outline: "none",
          }}
        />
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>%</span>
      </HStack>
      <Text as="div" mono size={9} color="var(--ft-dim)">
        Saved automatically · used on the dashboard KPI
      </Text>
    </VStack>
  );
}



// ── Transaction defaults panel ────────────────────────────────────────────────
function TransactionDefaultsPanel() {
  const [defType, setDefType] = useState(() => ls("nr-tx-default-type", "expense"));
  const [defCurrency, setDefCurrency] = useState(() => ls("nr-tx-default-currency", "GBP"));
  const [defCategory, setDefCategory] = useState(() => ls("nr-tx-default-category", ""));

  const customCats = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("nr-custom-categories") ?? "[]") as string[]; } catch { return []; }
  }, []);
  const allCats = useMemo(() => [...new Set([...CATEGORIES, ...customCats])].sort(), [customCats]);

  const setType = (v: string) => { setDefType(v); lsSet("nr-tx-default-type", v); };
  const setCur = (v: string) => { setDefCurrency(v); lsSet("nr-tx-default-currency", v); };
  const setCat = (v: string) => { setDefCategory(v); lsSet("nr-tx-default-category", v); };

  return (
    <div style={PANEL_STYLE}>
      <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Transaction Defaults</div>
      <div style={ROW}>
        <RowLabel title="Default type" sub='Pre-selects the transaction type in Quick Add (N)' />
        <HStack gap={4} wrap shrink={false}>
          {(["expense","income","transfer"] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const, padding: "4px 10px", background: defType === t ? "var(--ft-accent)" : "transparent", border: `1px solid ${defType === t ? "var(--ft-accent)" : "var(--ft-border)"}`, color: defType === t ? "var(--ft-base)" : "var(--ft-muted)", cursor: "pointer", transition: "background 0.1s" }}>
              {t}
            </button>
          ))}
        </HStack>
      </div>
      <div style={ROW}>
        <RowLabel title="Default currency" sub="Pre-selects the currency in Quick Add" />
        <select value={defCurrency} onChange={e => setCur(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", flexShrink: 0 }}>
          {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={ROW}>
        <RowLabel title="Default category" sub='Pre-fills the category field (leave blank to skip)' />
        <select value={defCategory} onChange={e => setCat(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", flexShrink: 0, maxWidth: "100%" }}>
          <option value="">— none —</option>
          {allCats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
        Defaults apply when you press <kbd style={{ color: "var(--ft-accent)", border: "1px solid var(--ft-border)", padding: "0px 4px" }}>N</kbd> to quick-add a transaction.
      </div>
    </div>
  );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────
const RARITY_COLOR: Record<string, string> = {
  COMMON:    "var(--ft-dim)",
  UNCOMMON:  "var(--ft-green)",
  RARE:      "var(--ft-blue)",
  EPIC:      "#a855f7",
  LEGENDARY: "var(--ft-amber)",
};

const ACCENT_PRESETS = ["#F4A21E","#00FF41","#FF007A","#4D9FFF","#C8941E","#CC1A2F","#7FFF00","#7B5EA7","#56D364","#F8C800","#FF6B6B","#00BCD4"];

// ── Terminal Profile Panel ────────────────────────────────────────────────────

// Feature matrix — ✓ primary · available — not included
type FeatureLevel = "primary" | "available" | "none";
interface FeatureRow { label: string; market: FeatureLevel; budget: FeatureLevel; wealth: FeatureLevel; social: FeatureLevel; full: FeatureLevel; }
const FEATURE_MATRIX: FeatureRow[] = [
  { label: "Live prices & portfolio P&L",  market: "primary",   budget: "none",      wealth: "available", social: "none",      full: "primary"   },
  { label: "Transaction tracking",         market: "available", budget: "primary",   wealth: "available", social: "primary",   full: "primary"   },
  { label: "Budget limits & categories",   market: "none",      budget: "primary",   wealth: "none",      social: "available", full: "primary"   },
  { label: "Spending analytics",           market: "available", budget: "primary",   wealth: "available", social: "available", full: "primary"   },
  { label: "Net worth history",            market: "available", budget: "none",      wealth: "primary",   social: "none",      full: "primary"   },
  { label: "FIRE / retirement planning",   market: "available", budget: "none",      wealth: "primary",   social: "none",      full: "primary"   },
  { label: "Pension & ISA tracker",        market: "available", budget: "none",      wealth: "primary",   social: "none",      full: "primary"   },
  { label: "What-if scenarios",            market: "primary",   budget: "primary",   wealth: "primary",   social: "none",      full: "primary"   },
  { label: "Tax planning (CGT / shelter)", market: "primary",   budget: "none",      wealth: "primary",   social: "none",      full: "primary"   },
  { label: "Bill splitting & groups",      market: "none",      budget: "none",      wealth: "none",      social: "primary",   full: "primary"   },
  { label: "Debt ledger",                  market: "none",      budget: "available", wealth: "available", social: "primary",   full: "primary"   },
  { label: "Savings goals",                market: "none",      budget: "primary",   wealth: "primary",   social: "none",      full: "primary"   },
  { label: "Cashflow forecast",            market: "primary",   budget: "primary",   wealth: "primary",   social: "available", full: "primary"   },
  { label: "AI coach & decisions",         market: "primary",   budget: "primary",   wealth: "primary",   social: "primary",   full: "primary"   },
  { label: "Full nav (30+ pages)",         market: "none",      budget: "none",      wealth: "none",      social: "none",      full: "primary"   },
];


const PERSONA_PAGE_COUNTS: Record<PersonaId, number> = {
  market: 10, budget: 15, wealth: 14, social: 10, full: 32,
};

function FeatureDot({ level, color }: { level: FeatureLevel; color: string }) {
  if (level === "primary") return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, fontWeight: 700, lineHeight: 1 }}>✓</span>
  );
  if (level === "available") return (
    <Text as="span" mono size={11} color="var(--ft-dim)" lineHeight={1}>·</Text>
  );
  return <Text as="span" mono size={11} color="var(--ft-border2)" lineHeight={1}>—</Text>;
}

function TerminalProfilePanel() {
  function handleResetAndReconfigure() {
    localStorage.removeItem("nr-onboarding-complete");
    localStorage.removeItem("ft-onboarding-dismissed");
    localStorage.removeItem("ft-onboarding-complete");
    localStorage.removeItem("ft-persona");
    setTimeout(() => window.location.reload(), 200);
  }

  const currentIds = loadPersonaIds();
  const [selected, setSelected] = useState<Set<PersonaId>>(
    () => new Set(currentIds.length > 0 ? currentIds : ["full"] as PersonaId[])
  );
  const [saved, setSaved] = useState(false);
  const [previewPersona, setPreviewPersona] = useState<PersonaId | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  function toggle(id: PersonaId) {
    if (id === "full") { setSelected(new Set(["full"])); setSaved(false); return; }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete("full");
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  function handleApply() {
    const ids = selected.size > 0 ? Array.from(selected) : (["full"] as PersonaId[]);
    applyPersonas(ids);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const activePreview = previewPersona ?? (selected.size === 1 ? Array.from(selected)[0] : null);
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Terminal Profile</div>
        <div style={{ padding: "16px" }}>

          {/* Intro */}
          <p style={{ ...mono, fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.7, marginBottom: 20 }}>
            Your profile configures the sidebar navigation, default landing page, and dashboard widgets.
            Select one or more profiles that match how you use Finance Tracker — or choose <strong style={{ color: "var(--ft-text)" }}>Full Analyst</strong> for everything.
          </p>

          {/* ── Profile cards ─────────────────────────────────── */}
          <div className="ft-persona-cards" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
            {PERSONAS.map((persona) => {
              const isSelected = selected.has(persona.id);
              const color = PERSONA_COLORS[persona.id];
              const bg = PERSONA_BG[persona.id];
              const glyph = PERSONA_GLYPHS[persona.id];
              const pageCount = PERSONA_PAGE_COUNTS[persona.id];

              return (
                <button
                  key={persona.id}
                  onClick={() => toggle(persona.id)}
                  onMouseEnter={() => setPreviewPersona(persona.id)}
                  onMouseLeave={() => setPreviewPersona(null)}
                  style={{
                    background: isSelected ? bg : "var(--ft-raised)",
                    border: `1px solid ${isSelected ? color : "var(--ft-border)"}`,
                    borderTop: `3px solid ${isSelected ? color : "var(--ft-border2)"}`,
                    padding: "14px 14px 16px",
                    cursor: "pointer",
                    textAlign: "left",
                    outline: "none",
                    transition: "all 0.15s",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0,
                  }}
                >
                  {/* Code + checkmark row */}
                  <HStack align="center" justify="between" marginBottom={10}>
                    <span style={{ ...mono, fontSize: 9, letterSpacing: "0.14em", color: isSelected ? color : "var(--ft-dim)", border: `1px solid ${isSelected ? color : "var(--ft-border)"}`, padding: "2px 5px", fontWeight: 700 }}>
                      {persona.code}
                    </span>
                    <div style={{ width: 16, height: 16, border: `1px solid ${isSelected ? color : "var(--ft-border2)"}`, background: isSelected ? color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--ft-base)", flexShrink: 0, transition: "all 0.15s" }}>
                      {isSelected ? "✓" : ""}
                    </div>
                  </HStack>

                  {/* Glyph + name */}
                  <HStack gap={7} align="center" marginBottom={6}>
                    <span style={{ fontSize: 16, color, lineHeight: 1, flexShrink: 0 }}>{glyph}</span>
                    <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: isSelected ? color : "var(--ft-text)", letterSpacing: "0.02em", lineHeight: 1.2 }}>
                      {persona.label}
                    </span>
                  </HStack>

                  {/* Tagline */}
                  <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.5, marginBottom: 12 }}>
                    {persona.tagline}
                  </div>

                  {/* Highlights */}
                  <VStack gap={4} marginBottom={12} grow>
                    {persona.highlights.map((h) => (
                      <div key={h} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                        <span style={{ ...mono, fontSize: 9, color, flexShrink: 0, lineHeight: 1.5 }}>·</span>
                        <span style={{ ...mono, fontSize: 9, color: "var(--ft-muted)", lineHeight: 1.5 }}>{h}</span>
                      </div>
                    ))}
                  </VStack>

                  {/* Footer stats */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: `1px solid ${isSelected ? color + "44" : "var(--ft-border)"}` }}>
                    <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
                      <span className="pnum">{pageCount}</span> pages
                    </span>
                    <span style={{ ...mono, fontSize: 8, color: isSelected ? color : "var(--ft-dim)", letterSpacing: "0.06em" }}>
                      {isSelected ? "ACTIVE" : "SELECT"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Insight preview ──────────────────────────────── */}
          {activePreview && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: "0.14em", color: "var(--ft-dim)", textTransform: "uppercase", marginBottom: 8 }}>
                WHAT YOU'LL SEE — {PERSONAS.find(p => p.id === activePreview)?.label}
              </div>
              <VStack gap={6}>
                {PERSONA_INSIGHT_PREVIEWS[activePreview].map((preview) => (
                  <div
                    key={preview.page}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      background: "var(--ft-raised)",
                      border: "1px solid var(--ft-border)",
                      padding: "8px 12px",
                    }}
                  >
                    <span style={{ ...mono, fontSize: 8, letterSpacing: "0.1em", color: PERSONA_COLORS[activePreview], border: `1px solid ${PERSONA_COLORS[activePreview]}44`, padding: "2px 6px", flexShrink: 0, lineHeight: 1.6, fontWeight: 700 }}>
                      {preview.page.toUpperCase()}
                    </span>
                    <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", lineHeight: 1.6 }}>
                      {preview.msg}
                    </span>
                  </div>
                ))}
              </VStack>
            </div>
          )}

          {/* ── Feature matrix toggle ────────────────────────── */}
          <button
            onClick={() => setShowMatrix(m => !m)}
            style={{ ...mono, fontSize: 9, letterSpacing: "0.08em", background: "none", border: "1px solid var(--ft-border2)", color: "var(--ft-dim)", padding: "5px 12px", cursor: "pointer", marginBottom: showMatrix ? 12 : 20, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Text as="span" color="var(--ft-accent)">{showMatrix ? "▾" : "▸"}</Text>
            {showMatrix ? "Hide" : "Show"} feature comparison
          </button>

          {/* ── Feature matrix ───────────────────────────────── */}
          {showMatrix && (
            <div className="ft-persona-matrix" style={{ marginBottom: 20, border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
              <div className="ft-persona-matrix-inner">
              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(5, 1fr)", columnGap: 10, borderBottom: "1px solid var(--ft-border)" }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: "0.1em", color: "var(--ft-dim)", padding: "8px 12px" }}>FEATURE</div>
                {PERSONAS.map(p => (
                  <div key={p.id} style={{ ...mono, fontSize: 8, letterSpacing: "0.08em", color: PERSONA_COLORS[p.id], padding: "8px 0", textAlign: "center", fontWeight: 700 }}>
                    {p.code.split("·")[0]}
                  </div>
                ))}
              </div>
              {/* Rows */}
              {FEATURE_MATRIX.map((row, i) => (
                <div
                  key={row.label}
                  style={{ display: "grid", gridTemplateColumns: "2fr repeat(5, 1fr)", columnGap: 10, borderBottom: i < FEATURE_MATRIX.length - 1 ? "1px solid var(--ft-border)" : "none", background: i % 2 === 0 ? "transparent" : "var(--ft-raised)" }}
                >
                  <div style={{ ...mono, fontSize: 9, color: "var(--ft-muted)", padding: "7px 12px", lineHeight: 1.4 }}>{row.label}</div>
                  {(["market","budget","wealth","social","full"] as PersonaId[]).map(pid => (
                    <div key={pid} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "7px 0" }}>
                      <FeatureDot level={row[pid]} color={PERSONA_COLORS[pid]} />
                    </div>
                  ))}
                </div>
              ))}
              {/* Legend */}
              <div style={{ display: "flex", gap: 16, padding: "8px 12px", borderTop: "1px solid var(--ft-border)" }}>
                <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}><span style={{ color: "var(--ft-green)", fontWeight: 700 }}>✓</span> Primary focus</span>
                <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}><span style={{ color: "var(--ft-dim)" }}>·</span> Available</span>
                <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}><span style={{ color: "var(--ft-border2)" }}>—</span> Not included</span>
              </div>
              </div>
            </div>
          )}

          {/* ── Apply row ────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
            <button
              onClick={handleApply}
              disabled={selected.size === 0}
              style={{
                ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", padding: "8px 22px",
                background: saved ? "rgba(74,222,128,0.15)" : "var(--ft-accent)",
                border: `1px solid ${saved ? "var(--ft-green)" : "var(--ft-accent)"}`,
                color: saved ? "var(--ft-green)" : "var(--ft-base)", cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {saved ? "✓ Profile Applied" : "Apply Profile"}
            </button>
            <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
              Sidebar, widgets, and default page update immediately.
            </span>
          </div>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Re-run Setup</div>
        <SettingsActionRow title="Reconfigure terminal" sub="Clears your profile and re-runs the initialization screen on next page load.">
          <ActionBtn label="Reset & Reconfigure" variant="danger" onClick={handleResetAndReconfigure} />
        </SettingsActionRow>
      </div>
    </div>
  );
}

// ── Appearance ────────────────────────────────────────────────────────────────

function AppearancePanel({ theme, setTheme, density, setDensity }: {
  theme: FintrackTheme; setTheme: (t: FintrackTheme) => void;
  density: Density; setDensity: (d: Density) => void;
}) {
  const isMobile = useIsMobile();
  const [hoveredTheme, setHoveredTheme] = useState<FintrackTheme | null>(null);
  const [accentOverride, setAccentOverride] = useState(() => ls("nr-accent-override", ""));
  const previewId = hoveredTheme ?? theme;
  const previewSwatch = SWATCH_DATA.find(x => x.id === previewId)!;

  // All themes are available. The historical XP-gating mechanism was
  // removed 30 Aug when /learn was deleted — a lock icon pointing at
  // a route the user cannot reach is a control that cannot work.
  // See CLAUDE.md § Hard constraints on the "feature the user can
  // see and can never use" defect class.
  const visibleSwatches = SWATCH_DATA;

  // Dark first, Light second: the product's default is dark and most
  // users pick from there. Within each group: alphabetical, so the
  // order stays stable as themes are added and there's no implicit
  // "recommended" ranking. Mario stays in dark (novelty; see the
  // SWATCH_DATA comment above).
  const swatchesByTone = (tone: ThemeTone) =>
    visibleSwatches
      .filter((s) => s.tone === tone)
      .sort((a, b) => a.label.localeCompare(b.label));
  const groupedSwatches: { tone: ThemeTone; label: string; items: typeof visibleSwatches }[] = [
    { tone: "dark",  label: "Dark",  items: swatchesByTone("dark") },
    { tone: "light", label: "Light", items: swatchesByTone("light") },
  ];

  const renderSwatch = (s: typeof SWATCH_DATA[number]) => {
    const isActive = theme === s.id;
    const isHovered = hoveredTheme === s.id;
    return (
      <button
        key={s.id}
        onClick={() => setTheme(s.id)}
        onMouseEnter={() => setHoveredTheme(s.id)}
        onMouseLeave={() => setHoveredTheme(null)}
        aria-pressed={isActive}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, outline: "none" }}
      >
        <div style={{ width: 64, height: 86, border: isActive ? `2px solid ${s.accent}` : isHovered ? `2px solid ${s.accent}88` : "2px solid transparent", boxShadow: isActive ? `0 0 10px ${s.accent}44` : isHovered ? `0 0 6px ${s.accent}22` : "none", overflow: "hidden", position: "relative", transition: "border-color 0.15s, box-shadow 0.15s" }}>
          <div style={{ height: 18, background: s.base, display: "flex", alignItems: "center", paddingLeft: 5, gap: 3 }}>
            {[s.accent, s.muted, s.muted].map((c,i) => <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: c, opacity: i === 0 ? 1 : 0.5 }} />)}
          </div>
          <div style={{ background: s.surface, padding: "5px", display: "flex", flexDirection: "column", gap: 4, height: 68 }}>
            <div style={{ height: 4, background: s.text, borderRadius: 1, width: "70%", opacity: 0.7 }} />
            <div style={{ height: 3, background: s.muted, borderRadius: 1, width: "90%", opacity: 0.5 }} />
            <div style={{ height: 3, background: s.muted, borderRadius: 1, width: "55%", opacity: 0.4 }} />
            <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
              <span style={{ width: 16, height: 8, background: s.accent, display: "block", borderRadius: 1 }} />
            </div>
            <div style={{ height: 3, background: s.accent, borderRadius: 1, width: "40%", opacity: 0.6 }} />
          </div>
          {isActive && <div style={{ position: "absolute", top: 3, right: 4, color: s.accent, lineHeight: 1 }}><Check size={9} /></div>}
        </div>
        <Text as="div" align="center">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: isActive ? s.accent : "var(--ft-muted)", display: "block" }}>{s.label}</span>
        </Text>
      </button>
    );
  };

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Theme</div>
        <div style={{ background: "var(--ft-surface)" }}>
          {groupedSwatches.map((group, idx) =>
            group.items.length === 0 ? null : (
              <div key={group.tone} style={{ padding: idx === 0 ? "12px 16px 4px" : "8px 16px 4px" }}>
                <Text as="div" mono upper size={9} color="var(--ft-dim)" letterSpacing="0.1em" mb={10}>
                  {group.label}
                  <span style={{ marginLeft: 8, color: "var(--ft-border2)" }} className="pnum">
                    {group.items.length}
                  </span>
                </Text>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fill, minmax(72px, 1fr))" : "repeat(auto-fill, minmax(86px, 1fr))", gap: isMobile ? 8 : 12 }}>
                  {group.items.map(renderSwatch)}
                </div>
              </div>
            ),
          )}
        </div>
        {/* Live preview box — shows hovered swatch on hover, active theme otherwise */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <HStack gap={8} align="baseline" marginBottom={8}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Preview</div>
            {hoveredTheme && hoveredTheme !== theme && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: previewSwatch.accent, letterSpacing: "0.06em" }}>{previewSwatch.label}</span>
            )}
          </HStack>
          {(() => {
            const s = previewSwatch;
            return (
              <div style={{ width: 200, height: 100, background: s.base, border: `1px solid ${s.accent}44`, overflow: "hidden", position: "relative", display: "inline-flex", flexDirection: "column", transition: "background 0.12s" }}>
                <div style={{ height: 22, background: s.surface, display: "flex", alignItems: "center", padding: "0 8px", gap: 6, borderBottom: `1px solid ${s.muted}44` }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: s.accent, letterSpacing: "0.1em" }}>NUMERIS</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: s.accent, display: "inline-block" }} />
                </div>
                <div style={{ flex: 1, padding: "6px 8px", display: "flex", gap: 8 }}>
                  <div style={{ width: 40, display: "flex", flexDirection: "column", gap: 4 }}>
                    {[0.7,0.5,0.4,0.3].map((o,i) => <div key={i} style={{ height: 6, background: s.muted, opacity: o, borderRadius: 1 }} />)}
                  </div>
                  <VStack gap={4} grow>
                    <div style={{ height: 8, background: s.text, opacity: 0.7, borderRadius: 1, width: "80%" }} />
                    <div style={{ height: 5, background: s.accent, borderRadius: 1, width: "45%" }} />
                    <div style={{ height: 5, background: s.muted, opacity: 0.4, borderRadius: 1, width: "65%" }} />
                    <div style={{ height: 5, background: s.muted, opacity: 0.3, borderRadius: 1, width: "50%" }} />
                  </VStack>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Display Density</div>
        <div style={{ background: "var(--ft-surface)", padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["compact","normal","comfortable"] as const).map(d => {
            const labels: Record<Density,string> = { compact: "Compact", normal: "Normal", comfortable: "Comfortable" };
            const isActive = density === d;
            return (
              <button key={d} onClick={() => setDensity(d)} aria-pressed={isActive} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 14px", background: isActive ? "var(--ft-accent)" : "transparent", border: `1px solid ${isActive ? "var(--ft-accent)" : "var(--ft-border)"}`, color: isActive ? "var(--ft-base)" : "var(--ft-muted)", cursor: "pointer", transition: "background 0.12s, color 0.12s" }}>
                {labels[d]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom accent override */}
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Custom Accent Colour</div>
        <div style={{ padding: "14px 16px", background: "var(--ft-surface)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 12, lineHeight: 1.6 }}>
            Override the accent colour for any theme. Persists across sessions.
          </div>
          <HStack gap={8} align="center" marginBottom={14}>
            <input
              type="color"
              value={accentOverride || "#F4A21E"}
              onChange={e => {
                const c = e.target.value;
                setAccentOverride(c);
                lsSet("nr-accent-override", c);
                document.documentElement.style.setProperty("--ft-accent", c);
              }}
              style={{ width: 36, height: 28, padding: 2, border: "1px solid var(--ft-border2)", background: "var(--ft-raised)", cursor: "pointer" }}
            />
            <Text as="span" mono size={11} color={accentOverride ? "var(--ft-text)" : "var(--ft-dim)"}>
              {accentOverride || "Theme default"}
            </Text>
            {accentOverride && (
              <button onClick={() => {
                setAccentOverride("");
                localStorage.removeItem("nr-accent-override");
                document.documentElement.style.removeProperty("--ft-accent");
              }} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "transparent", border: "1px solid var(--ft-border)", padding: "3px 10px", cursor: "pointer" }}>
                Reset
              </button>
            )}
          </HStack>
          <HStack gap={6} wrap>
            {ACCENT_PRESETS.map(c => (
              <button key={c} onClick={() => {
                setAccentOverride(c);
                lsSet("nr-accent-override", c);
                document.documentElement.style.setProperty("--ft-accent", c);
              }} aria-label={c} style={{ width: 24, height: 24, background: c, border: accentOverride === c ? "2px solid var(--ft-text)" : "1px solid var(--ft-border)", cursor: "pointer", padding: 0, flexShrink: 0 }} />
            ))}
          </HStack>
        </div>
      </div>
    </VStack>
  );
}

function DisplayAndMotionPanel() {
  const [dateFormat, setDateFormat] = useState(() => ls("nr-date-format", "DD/MM/YYYY"));
  const [numFormat, setNumFormat] = useState(() => ls("nr-number-format", "1,234.56"));
  const [weekStart, setWeekStart] = useState(() => ls("nr-week-start", "mon"));
  const [fontScale, setFontScale] = useState(() => parseInt(ls("nr-font-scale", "100"), 10));
  const [timeFormat, setTimeFormat] = useState(() => ls("nr-time-format", "24h"));
  const [compactNums, setCompactNums] = useState(() => lsBool("nr-compact-numbers", false));
  const [showCents, setShowCents] = useState(() => lsBool("nr-show-cents", true));

  // Motion state (merged from AnimationsPanel)
  const [masterOn, setMasterOn] = useState(() => lsBool("nr-theme-effects-enabled", true));
  const [intensity, setIntensity] = useState(() => parseInt(ls("nr-animation-intensity", "50"), 10));
  const [transition, setTransition] = useState(() => ls("nr-theme-transition", "fade"));
  const [perTheme, setPerTheme] = useState<Record<string, boolean>>(() =>
    SWATCH_DATA.reduce<Record<string, boolean>>((acc, s) => {
      acc[s.id] = lsBool(`nr-theme-effects-${s.id}`, true);
      return acc;
    }, {})
  );
  const setMaster = (v: boolean) => { setMasterOn(v); lsSet("nr-theme-effects-enabled", String(v)); };
  const setPerT = (id: string, v: boolean) => { setPerTheme(p => ({ ...p, [id]: v })); lsSet(`nr-theme-effects-${id}`, String(v)); };
  const setIntensityVal = (v: number) => { setIntensity(v); lsSet("nr-animation-intensity", String(v)); };
  const setTransitionVal = (v: string) => { setTransition(v); lsSet("nr-theme-transition", v); };

  const datePreviewMap: Record<string, string> = {
    "DD/MM/YYYY": "18/07/2026",
    "MM/DD/YYYY": "07/18/2026",
    "YYYY-MM-DD": "2026-07-18",
    "D MMM YYYY": "18 Jul 2026",
  };
  const numPreviewMap: Record<string, string> = {
    "1,234.56": "1,234.56",
    "1.234,56": "1.234,56",
    "1 234.56": "1 234.56",
  };

  const setDate = (v: string) => { setDateFormat(v); lsSet("nr-date-format", v); };
  const setNum = (v: string) => { setNumFormat(v); lsSet("nr-number-format", v); };
  const setWeek = (v: string) => { setWeekStart(v); lsSet("nr-week-start", v); };
  const setScale = (v: number) => {
    setFontScale(v);
    lsSet("nr-font-scale", String(v));
    document.documentElement.style.setProperty("--nr-font-scale", v + "%");
  };
  const setTime = (v: string) => { setTimeFormat(v); lsSet("nr-time-format", v); };
  const setCompact = (v: boolean) => { setCompactNums(v); lsSet("nr-compact-numbers", String(v)); };
  const setCents = (v: boolean) => { setShowCents(v); lsSet("nr-show-cents", String(v)); };

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Date &amp; Time</div>
        <SectionHeader label="Date format" accent="var(--ft-blue)" />
        {(["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD","D MMM YYYY"] as const).map(fmt => (
          <label key={fmt} style={{ ...ROW, cursor: "pointer" }}>
            <HStack gap={10} align="center">
              <input type="radio" name="date-format" checked={dateFormat === fmt} onChange={() => setDate(fmt)} style={{ accentColor: "var(--ft-accent)" }} />
              <Text as="span" mono size={12} color="var(--ft-text)">{fmt}</Text>
            </HStack>
            <Text as="span" mono size={11} color="var(--ft-muted)">{datePreviewMap[fmt]}</Text>
          </label>
        ))}
        <SectionHeader label="Time format" accent="var(--ft-cyan)" />
        <div style={ROW}>
          <RowLabel title="Clock display" sub="Affects timestamps throughout the app" />
          <HStack gap={6} wrap shrink={false}>
            {[["24h","24h"],["12h","12h (AM/PM)"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setTime(val)} style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 12px", background: timeFormat === val ? "var(--ft-accent)" : "transparent", border: `1px solid ${timeFormat === val ? "var(--ft-accent)" : "var(--ft-border)"}`, color: timeFormat === val ? "var(--ft-base)" : "var(--ft-muted)", cursor: "pointer" }}>{lbl}</button>
            ))}
          </HStack>
        </div>
        <SectionHeader label="Calendar" accent="var(--ft-green)" />
        <div style={ROW}>
          <RowLabel title="First day of week" sub="Affects calendar and weekly views" />
          <HStack gap={6} wrap shrink={false}>
            {[["mon","Mon"],["sun","Sun"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setWeek(val)} style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 12px", background: weekStart === val ? "var(--ft-accent)" : "transparent", border: `1px solid ${weekStart === val ? "var(--ft-accent)" : "var(--ft-border)"}`, color: weekStart === val ? "var(--ft-base)" : "var(--ft-muted)", cursor: "pointer" }}>{lbl}</button>
            ))}
          </HStack>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Numbers &amp; Currency</div>
        <SectionHeader label="Number format" accent="var(--ft-blue)" />
        {(["1,234.56","1.234,56","1 234.56"] as const).map(fmt => (
          <label key={fmt} style={{ ...ROW, cursor: "pointer" }}>
            <HStack gap={10} align="center">
              <input type="radio" name="num-format" checked={numFormat === fmt} onChange={() => setNum(fmt)} style={{ accentColor: "var(--ft-accent)" }} />
              <Text as="span" mono size={12} color="var(--ft-text)">{fmt}</Text>
            </HStack>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>{numPreviewMap[fmt]}</span>
          </label>
        ))}
        <SettingsToggleRow title="Compact large numbers" sub='Show £1.2K and £3.4M instead of full values' on={compactNums} onChange={setCompact} />
        <SettingsToggleRow title="Show pence / cents" sub='Display £12.50 instead of £12' on={showCents} onChange={setCents} />
        <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
          Preview: <span className="pnum" style={{ color: "var(--ft-text)" }}>
            {compactNums ? "£1.2K" : showCents ? "£1,234.56" : "£1,234"}
          </span>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Typography</div>
        <SectionHeader label="Font scale" accent="var(--ft-blue)" />
        <div style={{ padding: "12px 14px" }}>
          <HStack gap={10} align="center">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 28 }}>85%</span>
            <input type="range" min={85} max={115} value={fontScale} onChange={e => setScale(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ft-accent)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 32 }}>115%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", width: 36, textAlign: "right" }}>{fontScale}%</span>
          </HStack>
          <Text as="div" mono size={9} color="var(--ft-dim)" mt={6}>Scales all app text. Larger = more readable, smaller = denser layout.</Text>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Motion &amp; Effects</div>
        <SettingsToggleRow title="Theme effects" sub="Master switch — disables all ambient background animations" on={masterOn} onChange={setMaster} />
        {masterOn && (
          <>
            <SectionHeader label="Per-theme effects" accent="var(--ft-cyan)" />
            {SWATCH_DATA.map(s => (
              <SettingsThemeEffectRow key={s.id} label={s.label} accent={s.accent} on={perTheme[s.id] ?? true} onChange={v => setPerT(s.id, v)} />
            ))}
          </>
        )}
        <SectionHeader label="Intensity" accent="var(--ft-blue)" />
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
          <HStack gap={10} align="center">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 46 }}>Minimal</span>
            <input type="range" min={0} max={100} value={intensity} onChange={e => setIntensityVal(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ft-accent)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 30, textAlign: "right" }}>Rich</span>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", width: 32, textAlign: "right" }}>{intensity}</span>
          </HStack>
          <Text as="div" mono size={9} color="var(--ft-dim)" mt={6}>Affects particle density and opacity. Some effects require a page refresh.</Text>
        </div>
        <SettingsSelectRow title="Theme transition" sub="Animation style when switching themes" value={transition} onChange={setTransitionVal}>
          <option value="instant">Instant</option>
          <option value="fade">Fade (200ms)</option>
          <option value="slide">Slide (300ms)</option>
        </SettingsSelectRow>
      </div>
    </VStack>
  );
}

function PrivacyPanel() {
  const [blurAmounts, setBlurAmounts] = useState(() => lsBool("nr-blur-amounts", false));
  const [autoBlurDelay, setAutoBlurDelay] = useState(() => parseInt(ls("nr-auto-blur-delay", "10"), 10));
  const [maskMode, setMaskMode] = useState(() => ls("nr-mask-mode", "none"));
  const [hideFromPrint, setHideFromPrint] = useState(() => lsBool("nr-hide-from-print", false));

  const notify = () => window.dispatchEvent(new CustomEvent("nr-privacy-update"));

  const setBlur = (v: boolean) => { setBlurAmounts(v); lsSet("nr-blur-amounts", String(v)); notify(); };
  const setDelay = (v: number) => { setAutoBlurDelay(v); lsSet("nr-auto-blur-delay", String(v)); notify(); };
  const setMask = (v: string) => { setMaskMode(v); lsSet("nr-mask-mode", v); notify(); };
  const setPrint = (v: boolean) => {
    setHideFromPrint(v);
    lsSet("nr-hide-from-print", String(v));
    if (v) {
      if (!document.getElementById("nr-print-style")) {
        const el = document.createElement("style");
        el.id = "nr-print-style";
        el.textContent = "@media print { .pnum, .pdesc { filter: blur(8px) !important; } }";
        document.head.appendChild(el);
      }
    } else {
      document.getElementById("nr-print-style")?.remove();
    }
  };

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Amount Privacy</div>
        <SettingsToggleRow title="Blur sensitive amounts" sub='Amounts show as "£ ••••" until hovered. Useful in public places.' on={blurAmounts} onChange={setBlur} />
        {blurAmounts && (
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 8 }}>Auto-blur delay after hover: <Text as="span" color="var(--ft-accent)">{autoBlurDelay === 0 ? "Immediate" : `${autoBlurDelay}s`}</Text></div>
            <HStack gap={10} align="center">
              <Text as="span" mono size={9} color="var(--ft-dim)">0s</Text>
              <input type="range" min={0} max={30} value={autoBlurDelay} onChange={e => setDelay(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ft-accent)" }} />
              <Text as="span" mono size={9} color="var(--ft-dim)">30s</Text>
            </HStack>
          </div>
        )}
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Data Masking</div>
        <SettingsSelectRow title="Transaction description masking" sub="Controls how merchant names and descriptions appear" value={maskMode} onChange={setMask}>
          <option value="none">None — show full text</option>
          <option value="partial">Partial — show last 4 chars</option>
          <option value="full">Full blur — hover to reveal</option>
        </SettingsSelectRow>
        <SettingsToggleRow title="Hide amounts when printing" sub="Blurs all financial figures in print / PDF export" on={hideFromPrint} onChange={setPrint} />
        <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
          All privacy settings apply instantly across the app.
        </div>
      </div>
    </VStack>
  );
}

function DashboardPanel() {
  const [defaultPage, setDefaultPage] = useState(() => ls("nr-default-page", "/"));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => lsBool("nr-sidebar-collapsed-default", false));
  const [showNwStrip, setShowNwStrip] = useState(() => lsBool("nr-show-nw-strip", true));
  const [navConfig, setNavConfig] = useState(() => loadSidebarConfig(ALL_NAV_ITEMS_FOR_SETTINGS));

  const setPage = (v: string) => { setDefaultPage(v); lsSet("nr-default-page", v); };
  const setSidebar = (v: boolean) => { setSidebarCollapsed(v); lsSet("nr-sidebar-collapsed-default", String(v)); };
  const setNwStrip = (v: boolean) => { setShowNwStrip(v); lsSet("nr-show-nw-strip", String(v)); };

  const toggleNavItem = (href: string, visible: boolean) => {
    const next = { ...navConfig, items: navConfig.items.map(item => item.href === href ? { ...item, visible } : item) };
    setNavConfig(next);
    saveSidebarConfig(next);
    window.dispatchEvent(new CustomEvent("nr-sidebar-config-update"));
  };

  const pages = [
    ["/", "Dashboard"], ["/transactions", "Transactions"], ["/accounts", "Accounts"],
    ["/analytics", "Analytics"], ["/budget", "Budget"], ["/goals", "Goals"],
    ["/profile", "Profile"],
  ];

  const navItemMap = new Map(navConfig.items.map(i => [i.href, i]));
  const navBySection = ALL_NAV_ITEMS_FOR_SETTINGS.reduce<{ label: string; items: { href: string; label: string; visible: boolean }[] }[]>((acc, item) => {
    const visible = navItemMap.get(item.href)?.visible !== false;
    const last = acc[acc.length - 1];
    if (last && last.label === item.section) { last.items.push({ href: item.href, label: item.label, visible }); }
    else { acc.push({ label: item.section, items: [{ href: item.href, label: item.label, visible }] }); }
    return acc;
  }, []);

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Dashboard</div>
        <SettingsSelectRow title="Default landing page" sub="Navigate here when opening the app" value={defaultPage} onChange={setPage}>
          {pages.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
        </SettingsSelectRow>
        <SettingsToggleRow title="Sidebar collapsed by default" sub="Start with the sidebar in a collapsed state" on={sidebarCollapsed} onChange={setSidebar} />
        <SettingsToggleRow title="Show net worth in sidebar" sub="Display net worth strip in the sidebar footer" on={showNwStrip} onChange={setNwStrip} />
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Navigation Visibility</div>
        <div style={{ padding: "8px 14px 4px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderBottom: "1px solid var(--ft-border)" }}>
          Toggle which pages appear in the sidebar. Hidden pages are still accessible via keyboard shortcuts and the command palette.
        </div>
        {navBySection.map(section => (
          <div key={section.label}>
            <SectionHeader label={section.label} accent="var(--ft-blue)" />
            {section.items.map(item => (
              <SettingsNavItemRow key={item.href} label={item.label} visible={item.visible} onChange={v => toggleNavItem(item.href, v)} />
            ))}
          </div>
        ))}
        <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
          Changes apply immediately. Use the sidebar ⚙ icon to reorder and pin items.
        </div>
      </div>
    </VStack>
  );
}

function CustomCategoriesPanel() {
  const [customCats, setCustomCats] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("nr-custom-categories") ?? "[]"); } catch { return []; }
  });
  const [newCat, setNewCat] = useState("");

  const save = (cats: string[]) => {
    setCustomCats(cats);
    try { localStorage.setItem("nr-custom-categories", JSON.stringify(cats)); } catch { /* ignore */ }
  };

  const handleAdd = () => {
    const v = newCat.trim();
    if (!v || customCats.includes(v) || CATEGORIES.includes(v)) return;
    save([...customCats, v]);
    setNewCat("");
  };

  const handleRemove = (cat: string) => save(customCats.filter(c => c !== cat));

  return (
    <div style={PANEL_STYLE}>
      <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Custom Categories</div>
      <div style={{ padding: "10px 14px 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderBottom: "1px solid var(--ft-border)" }}>
        Add your own categories. They appear alongside built-in categories in Quick Add and auto-cat rules.
      </div>
      {customCats.length > 0 ? (
        <div style={{ padding: "8px 14px" }}>
          {customCats.map(cat => (
            <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--ft-border)" }}>
              <Text as="span" mono size={11} color="var(--ft-text)">{cat}</Text>
              <button onClick={() => handleRemove(cat)} style={{ background: "none", border: "none", color: "var(--ft-red)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, padding: "2px 4px" }} aria-label={`Remove ${cat}`}>×</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", fontStyle: "italic" }}>No custom categories yet.</div>
      )}
      <div style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid var(--ft-border)" }}>
        <input
          type="text" value={newCat} placeholder="New category name"
          onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "5px 10px", outline: "none" }}
        />
        <button onClick={handleAdd} disabled={!newCat.trim()} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: newCat.trim() ? "var(--ft-accent)" : "var(--ft-dim)", background: "transparent", border: `1px solid ${newCat.trim() ? "var(--ft-accent)" : "var(--ft-border2)"}`, padding: "5px 14px", cursor: newCat.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
          + Add
        </button>
      </div>
    </div>
  );
}

function AdvancedPanel({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [beta, setBeta] = useState(() => lsBool("nr-beta-features", false));
  const [devMode, setDevMode] = useState(() => lsBool("nr-dev-mode", false));

  const setBetaVal = (v: boolean) => { setBeta(v); lsSet("nr-beta-features", String(v)); };
  const setDev = (v: boolean) => { setDevMode(v); lsSet("nr-dev-mode", String(v)); };

  const handleClearCache = () => {
    if (!window.confirm("Clear all app preferences (nr-* keys)? This will reset animations, display, privacy, and dashboard settings. Account data is not affected.")) return;
    for (const key of Object.keys(localStorage).filter(k => k.startsWith("nr-")))
      localStorage.removeItem(key);
    toast({ title: "App cache cleared. Reload to apply defaults." });
  };

  const handleResetOnboarding = () => {
    localStorage.removeItem("nr-onboarding-complete");
    localStorage.removeItem("ft-onboarding-dismissed");
    localStorage.removeItem("ft-onboarding-complete");
    localStorage.removeItem("ft-persona");
    toast({ title: "Terminal profile reset. Reloading…" });
    setTimeout(() => window.location.reload(), 800);
  };

  const usage = getStorageUsage();

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Feature Flags</div>
        <SettingsToggleRow title="Beta features" sub='Shows a "BETA" badge on experimental pages' on={beta} onChange={setBetaVal} />
        <SettingsToggleRow title="Developer mode" sub="Shows raw data inspector panels (future use)" on={devMode} onChange={setDev} />
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Maintenance</div>
        <SettingsActionRow title="Clear app cache" sub="Removes all nr-* preference keys. Does not affect transactions or account data.">
          <ActionBtn label="Clear App Cache" variant="danger" onClick={handleClearCache} />
        </SettingsActionRow>
        <SettingsActionRow title="Reset onboarding" sub="Clears the onboarding completion flag and reloads the app.">
          <ActionBtn label="Reset Onboarding" variant="muted" onClick={handleResetOnboarding} />
        </SettingsActionRow>
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Storage Usage</div>
        <StorageKpiStrip keyCount={usage.keyCount} sizeKb={usage.sizeKb} nrKeyCount={usage.nrKeyCount} />
      </div>
    </VStack>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
// ── AI Settings Panel ────────────────────────────────────────────────────────

const AI_STYLES: { id: AiStyle; label: string; desc: string; preview: string }[] = [
  {
    id: "classic",
    label: "Classic",
    desc: "Floating button in the bottom-right corner. Always visible, one click to open.",
    preview: "●  bottom-right button",
  },
  {
    id: "wanderer",
    label: "Wanderer",
    desc: "A little AI mascot that roams around your screen. Click it or press G to chat.",
    preview: "·  roaming mascot character",
  },
  {
    id: "minimal",
    label: "Minimal",
    desc: "No persistent UI. Press G anywhere on the site to open the assistant.",
    preview: "→  keyboard-only · press G",
  },
];

function WardrobePanel() {
  const [skinId, setSkinId] = useState<BotSkinId>(getBotSkin);
  const [previewPhase, setPreviewPhase] = useState<Phase>("idle");
  const [blinking, setBlinking] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const phaseIdxRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 180);
    }, 2800 + Math.random() * 1400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!autoPlay) return;
    const id = setInterval(() => {
      phaseIdxRef.current = (phaseIdxRef.current + 1) % WARDROBE_PHASES.length;
      setPreviewPhase(WARDROBE_PHASES[phaseIdxRef.current]);
    }, 2800);
    return () => clearInterval(id);
  }, [autoPlay]);

  const pickSkin = useCallback((id: BotSkinId) => {
    setBotSkin(id);
    setSkinId(id);
    window.dispatchEvent(new CustomEvent("numeris-skin-change"));
  }, []);

  const RARITY_COLOR_MAP: Record<string, string> = { COMMON: "var(--ft-dim)", EPIC: "#a855f7", LEGENDARY: "var(--ft-amber, #f59e0b)" };

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Bot Skin</div>
        <style>{`
          @keyframes wand-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
          @keyframes wand-sit-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
          @keyframes wand-dance{0%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-6px) rotate(-4deg)}50%{transform:translateY(-8px) rotate(0deg)}75%{transform:translateY(-6px) rotate(4deg)}100%{transform:translateY(0) rotate(0deg)}}
          @keyframes wand-complain{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
          @keyframes wand-jump{0%{transform:translateY(0)}45%{transform:translateY(-30px)}70%{transform:translateY(-3px)}100%{transform:translateY(0)}}
        `}</style>
        {/* Live preview */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 86, height: 120, background: "var(--ft-base)", border: "1px solid var(--ft-border)", display: "flex", alignItems: "flex-end", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize: "16px 16px", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: 24, left: "8%", right: "8%", height: 1, background: "var(--ft-border)" }} />
            <div style={{
              width: previewPhase === "lying" ? 110 : 36, height: previewPhase === "lying" ? 57 : 66, flexShrink: 0,
              transform: previewPhase === "lying" ? "scale(0.62)" : "scale(1.4)", transformOrigin: "center bottom", marginBottom: 24,
              animation: previewPhase === "sitting" ? "wand-sit-bob 3s ease-in-out infinite" : previewPhase === "dancing" ? "wand-dance 0.52s ease-in-out infinite" : previewPhase === "complaining" ? "wand-complain 0.3s ease-in-out infinite" : previewPhase === "tired" || previewPhase === "lying" ? "none" : previewPhase === "jumping" ? "wand-jump 0.75s cubic-bezier(0.36,0.07,0.19,0.97) infinite" : "wand-bob 2.6s ease-in-out infinite",
            }}>
              <BotPreview skinId={skinId} phase={previewPhase} blinking={blinking} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <HStack align="center" justify="between" marginBottom={6}>
              <Text as="span" mono size={8} color="var(--ft-dim)" letterSpacing="0.12em">PHASE</Text>
              <button onClick={() => setAutoPlay(a => !a)} style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", color: autoPlay ? "var(--ft-accent)" : "var(--ft-dim)", background: autoPlay ? "var(--ft-accent)15" : "transparent", border: `1px solid ${autoPlay ? "var(--ft-accent)44" : "var(--ft-border)"}`, padding: "2px 6px", cursor: "pointer" }}>
                {autoPlay ? "AUTO ●" : "AUTO ○"}
              </button>
            </HStack>
            <HStack gap={3} wrap>
              {WARDROBE_PHASES.map(p => (
                <button key={p} onClick={() => { setAutoPlay(false); setPreviewPhase(p); }} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.05em", padding: "2px 5px", border: `1px solid ${previewPhase === p ? "var(--ft-accent)" : "var(--ft-border)"}`, background: previewPhase === p ? "var(--ft-accent)15" : "transparent", color: previewPhase === p ? "var(--ft-accent)" : "var(--ft-dim)", cursor: "pointer", textTransform: "uppercase" }}>
                  {p}
                </button>
              ))}
            </HStack>
            {(() => {
              const skin = SKINS.find(s => s.id === skinId);
              if (!skin) return null;
              return (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                  <Text as="span" mono size={10} weight={700} color="var(--ft-text)">{skin.label}</Text>
                  {" "}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: RARITY_COLOR_MAP[skin.rarity] }}>{skin.rarity}</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div style={{ padding: "4px 0" }}>
          {SKINS.map((skin) => {
            // Skin `requiredTheme` field is kept on the data as a
            // historical marker of the intended rarity gate, but the
            // usability check is dropped — the theme was unlocked via
            // XP, and XP no longer has a source. Every skin is
            // pickable. See CLAUDE.md § Hard constraints.
            const isActive = skinId === skin.id;
            const rarityCol = RARITY_COLOR_MAP[skin.rarity] ?? "var(--ft-dim)";
            return (
              <div key={skin.id} onClick={() => pickSkin(skin.id)} style={{ ...ROW, cursor: "pointer", background: isActive ? "var(--ft-raised)" : "transparent", borderLeft: isActive ? `2px solid ${rarityCol}` : "2px solid transparent", paddingLeft: 12, transition: "background 0.1s", alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <HStack gap={6} align="center" marginBottom={3}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: isActive ? rarityCol : "var(--ft-text)" }}>{skin.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: rarityCol, opacity: 0.85 }}>{skin.rarity}</span>
                  </HStack>
                  <Text as="div" mono size={10} color="var(--ft-muted)" lineHeight={1.5} mb={skin.perks.length > 0 ? 5 : 0}>{skin.desc}</Text>
                  {skin.perks.length > 0 && (
                    <HStack gap="3px 6px" wrap>
                      {skin.perks.map((perk) => (<span key={perk} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: rarityCol, opacity: 0.7, letterSpacing: "0.04em" }}>· {perk}</span>))}
                    </HStack>
                  )}
                </div>
                <HStack gap={6} align="center" marginTop={2} shrink={false}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${isActive ? rarityCol : "var(--ft-border2)"}`, background: isActive ? rarityCol : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isActive && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-base)" }} />}
                  </div>
                </HStack>
              </div>
            );
          })}
        </div>
      </div>
    </VStack>
  );
}

function AiSettingsPanel() {
  const [selected, setSelected] = useState<AiStyle>(getAiStyle);

  const pick = useCallback((s: AiStyle) => {
    setSelected(s);
    setAiStylePref(s);
    window.dispatchEvent(new CustomEvent("numeris-ai-style-change", { detail: s }));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Assistant Style</div>
        <div style={{ padding: "4px 0" }}>
          {AI_STYLES.map((s) => (
            <div
              key={s.id}
              onClick={() => pick(s.id)}
              style={{
                ...ROW,
                cursor: "pointer",
                background: selected === s.id ? "var(--ft-raised)" : "transparent",
                borderLeft: selected === s.id ? `2px solid var(--ft-accent)` : "2px solid transparent",
                paddingLeft: 12,
                transition: "background 0.1s",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: selected === s.id ? "var(--ft-accent)" : "var(--ft-text)", marginBottom: 3 }}>
                  {s.label}
                </div>
                <Text as="div" mono size={10} color="var(--ft-muted)" lineHeight={1.5}>{s.desc}</Text>
                <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.05em" mt={4}>{s.preview}</Text>
              </div>
              <div style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                border: `1.5px solid ${selected === s.id ? "var(--ft-accent)" : "var(--ft-border2)"}`,
                background: selected === s.id ? "var(--ft-accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {selected === s.id && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-base)" }} />}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
          Hotkey: <kbd style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-accent)", padding: "1px 5px", fontSize: 9 }}>G</kbd> — summons the assistant from anywhere on the site (not when typing).
        </div>
      </div>

      {selected === "wanderer" && (
        <div style={{ ...PANEL_STYLE, padding: "10px 14px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)" }}>
            Bot skin can be customised in{" "}
            <span style={{ color: "var(--ft-accent)", cursor: "pointer", textDecoration: "underline" }} onClick={() => window.dispatchEvent(new CustomEvent("numeris-settings-nav", { detail: "wardrobe" }))}>
              Personalise → Wardrobe
            </span>
          </div>
        </div>
      )}

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Contextual Awareness</div>
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.7 }}>
            The AI automatically knows which page you're on and tailors its responses accordingly.
            On the Accounts page it knows you're managing balances; on Investments it focuses on portfolios, etc.
          </div>
          <div style={{ marginTop: 10 }}>
            <SettingsInfoRow label="Page awareness" value="Current page name sent with every message" />
            <SettingsInfoRow label="Financial context" value="Responses tailored to the active section" />
            <SettingsInfoRow label="Powered by" value="Groq → Cerebras → OpenRouter (chain fallback)" accent="var(--ft-accent)" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Wise Account Row ─────────────────────────────────────────────────────────

function WiseAccountRow({ account }: { account: { id: number; name: string; currency: string; lastSyncedAt?: string | null } }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div>
        <Text as="div" mono size={12} weight={500} color="var(--ft-text)">
          {account.name}
        </Text>
        <Text as="div" mono size={10} color="var(--ft-muted)" mt={2}>
          {account.lastSyncedAt
            ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
            : "Never synced"}
        </Text>
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
        fontWeight: 700, color: "var(--ft-accent)",
        border: "1px solid var(--ft-accent)44", padding: "2px 8px",
        background: "var(--ft-accent)11",
      }}>
        {account.currency}
      </span>
    </div>
  );
}

// ── Wise Sync KPI Strip ─────────────────────��─────────────────────────────────
function WiseSyncKpiStrip({ synced, added, updated }: { synced: number; added: number; updated: number }) {
  // Desktop port: per-cell accent stripes deleted (Total / New /
  // Updated aren't rank-ordered or +/- — they're three counters).
  // clamp() on the primary tier + whiteSpace:nowrap so a large
  // count can't wrap.
  const cells: { value: React.ReactNode; label: string }[] = [
    { value: <span className="pnum">{synced}</span>, label: "Total synced" },
    { value: <span className="pnum">{added}</span>, label: "New transactions" },
    { value: <span className="pnum">{updated}</span>, label: "Updated" },
  ];
  return (
    <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)" }}>
      {cells.map(c => (
        <div key={c.label} style={{ background: "var(--ft-surface)", padding: "12px 14px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "var(--ft-text)",
              lineHeight: 1,
              fontSize: "clamp(16px, 1.6vw, 20px)",
              whiteSpace: "nowrap",
            }}
          >
            {c.value}
          </div>
          <Text as="div" mono upper size={9} color="var(--ft-dim)" letterSpacing="0.08em" mt={4}>{c.label}</Text>
        </div>
      ))}
    </div>
  );
}

// ── Wise Integration Panel ────────────────────────────────────────────────────
function WiseIntegrationPanel() {
  const { toast } = useToast();
  const { data: status, isLoading: statusLoading } = useGetWiseStatus();
  const { data: accountsData } = useListAccounts();
  const syncMutation = useSyncWiseTransactions();

  const wiseAccounts = (accountsData ?? []).filter(a => a.isWiseLinked);

  const isConfigured = status?.configured ?? false;
  const isConnected = status?.connected ?? false;

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync();
      toast({
        title: "Wise sync complete",
        description: `Synced ${result.synced} transactions (${result.added} new, ${result.updated} updated)`,
      });
    } catch (err: unknown) {
      toast({
        title: "Wise sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const lastSyncResult = syncMutation.data;

  return (
    <VStack gap={12}>
      {/* Status panel */}
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}>
          <Text as="span" color="var(--ft-accent)">·</Text> Wise Integration
        </div>

        {/* Status row */}
        <div style={{ ...ROW, flexWrap: "wrap", gap: 10 }}>
          <RowLabel
            title="Connection status"
            sub={
              statusLoading
                ? "Checking..."
                : !isConfigured
                ? "Add WISE_API_TOKEN to your server environment to enable Wise sync"
                : isConnected
                ? status?.profileName
                  ? `Connected as ${status.profileName}`
                  : "Token verified"
                : (status?.error ?? "Connection error")
            }
          />
          <div style={{ flexShrink: 0 }}>
            {statusLoading ? (
              <Text as="span" mono size={10} color="var(--ft-muted)" letterSpacing="0.06em">
                CHECKING...
              </Text>
            ) : !isConfigured ? (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                fontWeight: 700, color: "var(--ft-amber)",
                border: "1px solid var(--ft-amber)44", padding: "2px 8px",
                background: "var(--ft-amber)11",
              }}>
                NOT CONFIGURED
              </span>
            ) : isConnected ? (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                fontWeight: 700, color: "var(--ft-green)",
                border: "1px solid var(--ft-green)44", padding: "2px 8px",
                background: "var(--ft-green)11",
              }}>
                CONNECTED
              </span>
            ) : (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                fontWeight: 700, color: "var(--ft-red)",
                border: "1px solid var(--ft-red)44", padding: "2px 8px",
                background: "var(--ft-red)11",
              }}>
                ERROR
              </span>
            )}
          </div>
        </div>

        {/* Sync button + last result */}
        {isConfigured && isConnected && (
          <>
            <div style={{ ...ROW, flexWrap: "wrap", gap: 8 }}>
              <RowLabel title="Sync transactions" sub="Pull the last 90 days from all Wise currency balances" />
              <button
                onClick={handleSync}
                disabled={syncMutation.isPending}
                style={{
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: syncMutation.isPending ? "var(--ft-muted)" : "var(--ft-accent)",
                  background: "transparent",
                  border: `1px solid ${syncMutation.isPending ? "var(--ft-border2)" : "var(--ft-accent)"}`,
                  padding: "7px 18px",
                  cursor: syncMutation.isPending ? "not-allowed" : "pointer",
                  opacity: syncMutation.isPending ? 0.6 : 1,
                  letterSpacing: "0.04em",
                }}
              >
                {syncMutation.isPending ? "SYNCING..." : "↻ SYNC NOW"}
              </button>
            </div>
            {lastSyncResult && (
              <WiseSyncKpiStrip synced={lastSyncResult.synced} added={lastSyncResult.added} updated={lastSyncResult.updated} />
            )}
          </>
        )}

        {/* Info note */}
        <div style={{
          padding: "8px 14px",
          background: "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          fontFamily: "var(--font-mono)", fontSize: 9,
          color: "var(--ft-dim)", letterSpacing: "0.04em",
        }}>
          Wise sync imports the last 90 days of transactions across all your Wise currency balances
        </div>
      </div>

      {/* Linked accounts */}
      {isConfigured && isConnected && (
        <div style={PANEL_STYLE}>
          <div style={HEADER_STYLE}>
            <Text as="span" color="var(--ft-accent)">·</Text> Linked Accounts
          </div>
          {wiseAccounts.length === 0 ? (
            <div style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", fontStyle: "italic" }}>
              No Wise accounts synced yet — click Sync Now to import
            </div>
          ) : (
            wiseAccounts.map(account => (
              <WiseAccountRow key={account.id} account={account} />
            ))
          )}
        </div>
      )}
    </VStack>
  );
}

// ── Crypto Wallets Panel ──────────────────────────────────────────────────────

const CRYPTO_WALLETS_KEY = "ft-crypto-wallets";
const CRYPTO_PRICES_KEY = "ft-crypto-prices";

function DigestPanel() {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem("ft-digest-enabled") === "true"; } catch { return false; }
  });

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem("ft-digest-enabled", next ? "true" : "false"); } catch {}
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await apiFetch("/api/digest/send", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "Digest sent!", description: "Check your inbox for this week's summary." });
      } else {
        toast({ title: "Failed to send", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not reach server", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Weekly Email Digest</div>
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.7, marginBottom: 12 }}>
            Receive a weekly summary of your income, expenses, and top spending categories by email every Monday morning.
            Requires <code style={{ color: "var(--ft-accent)" }}>RESEND_API_KEY</code> to be configured on the server.
          </div>
          <SettingsToggleRow title="Enable weekly digest" on={enabled} onChange={toggleEnabled} />
          <HStack gap={8}>
            <button
              onClick={sendNow}
              disabled={sending}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
                color: "var(--ft-accent)", background: "transparent",
                border: "1px solid var(--ft-accent)", padding: "6px 16px", cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.6 : 1,
              }}
            >
              {sending ? "Sending…" : "Send Test Digest Now"}
            </button>
          </HStack>
        </div>
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> What's included</div>
        <div style={{ padding: "8px 0" }}>
          {[
            ["Weekly income", "Total income received in the past 7 days"],
            ["Weekly expenses", "Total spending across all accounts"],
            ["Net cashflow", "Income minus expenses for the week"],
            ["Top categories", "Your 5 highest spending categories"],
            ["Transaction count", "Number of transactions processed"],
          ].map(([label, desc]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)" }}>{label}</div>
              <Text as="div" mono size={10} color="var(--ft-dim)">{desc}</Text>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CryptoWallet {
  id: string;
  label: string;
  address: string;
  chain: "ETH" | "BTC";
  balance?: number;
  lastSynced?: string;
  error?: string;
}

interface CryptoPrices {
  ETH: number | null;
  BTC: number | null;
}

// No DEFAULT_CRYPTO_PRICES. A hard-coded £2500/ETH £60000/BTC would silently
// value every user's wallets at fabricated prices and roll that into net
// worth downstream. Prices start unknown ("—") and the user overrides them.

function loadCryptoWallets(): CryptoWallet[] {
  try {
    const raw = localStorage.getItem(CRYPTO_WALLETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CryptoWallet[];
  } catch { return []; }
}

function saveCryptoWallets(wallets: CryptoWallet[]) {
  try { localStorage.setItem(CRYPTO_WALLETS_KEY, JSON.stringify(wallets)); } catch { /* ignore */ }
}

function loadCryptoPrices(): CryptoPrices {
  try {
    const raw = localStorage.getItem(CRYPTO_PRICES_KEY);
    if (!raw) return { ETH: null, BTC: null };
    const parsed = JSON.parse(raw) as Partial<CryptoPrices>;
    return {
      ETH: typeof parsed.ETH === "number" && parsed.ETH > 0 ? parsed.ETH : null,
      BTC: typeof parsed.BTC === "number" && parsed.BTC > 0 ? parsed.BTC : null,
    };
  } catch { return { ETH: null, BTC: null }; }
}

function saveCryptoPrices(prices: CryptoPrices) {
  try { localStorage.setItem(CRYPTO_PRICES_KEY, JSON.stringify(prices)); } catch { /* ignore */ }
}

async function fetchEthBalance(address: string): Promise<number> {
  const url = `https://api.etherscan.io/api?module=account&action=balance&address=${encodeURIComponent(address)}&tag=latest`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { status: string; message: string; result: string };
  if (json.status !== "1") throw new Error(json.message || "Etherscan error");
  return parseFloat(json.result) / 1e18;
}

async function fetchBtcBalance(address: string): Promise<number> {
  const url = `https://blockstream.info/api/address/${encodeURIComponent(address)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { chain_stats: { funded_txo_sum: number; spent_txo_sum: number } };
  const sats = json.chain_stats.funded_txo_sum - json.chain_stats.spent_txo_sum;
  return sats / 1e8;
}

async function syncWalletBalance(wallet: CryptoWallet): Promise<CryptoWallet> {
  try {
    const balance = wallet.chain === "ETH"
      ? await fetchEthBalance(wallet.address)
      : await fetchBtcBalance(wallet.address);
    return { ...wallet, balance, lastSynced: new Date().toISOString(), error: undefined };
  } catch (err: unknown) {
    return { ...wallet, error: err instanceof Error ? err.message : "Sync failed", lastSynced: wallet.lastSynced };
  }
}

const CRYPTO_INPUT_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  padding: "6px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function CryptoWalletsPanel() {
  const isMobile = useIsMobile();
  const [wallets, setWallets] = useState<CryptoWallet[]>(() => loadCryptoWallets());
  const [prices, setPrices] = useState<CryptoPrices>(() => loadCryptoPrices());
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);

  // Add wallet form state
  const [showForm, setShowForm] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formChain, setFormChain] = useState<"ETH" | "BTC">("ETH");
  const [formError, setFormError] = useState("");

  // Price override form. Empty when no price is set — the input placeholder
  // prompts the user, never a fabricated default value that would look real.
  const [priceEth, setPriceEth] = useState(prices.ETH != null ? String(prices.ETH) : "");
  const [priceBtc, setPriceBtc] = useState(prices.BTC != null ? String(prices.BTC) : "");

  const persistWallets = useCallback((updated: CryptoWallet[]) => {
    setWallets(updated);
    saveCryptoWallets(updated);
  }, []);

  const handleAddWallet = () => {
    setFormError("");
    const label = formLabel.trim();
    const address = formAddress.trim();
    if (!label) { setFormError("Label is required"); return; }
    if (!address) { setFormError("Address is required"); return; }
    if (formChain === "ETH" && !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setFormError("Invalid ETH address (must be 0x + 40 hex chars)");
      return;
    }
    if (formChain === "BTC" && address.length < 25) {
      setFormError("Invalid BTC address");
      return;
    }
    const newWallet: CryptoWallet = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label,
      address,
      chain: formChain,
    };
    persistWallets([...wallets, newWallet]);
    setFormLabel("");
    setFormAddress("");
    setFormChain("ETH");
    setShowForm(false);
  };

  const handleDeleteWallet = (id: string) => {
    persistWallets(wallets.filter(w => w.id !== id));
  };

  const handleSync = useCallback(async (id: string) => {
    const wallet = wallets.find(w => w.id === id);
    if (!wallet) return;
    setSyncingIds(prev => new Set(prev).add(id));
    const updated = await syncWalletBalance(wallet);
    setWallets(prev => {
      const next = prev.map(w => w.id === id ? updated : w);
      saveCryptoWallets(next);
      return next;
    });
    setSyncingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, [wallets]);

  const handleSyncAll = useCallback(async () => {
    setSyncingAll(true);
    const results: CryptoWallet[] = [];
    for (const wallet of wallets) {
      setSyncingIds(prev => new Set(prev).add(wallet.id));
      const updated = await syncWalletBalance(wallet);
      results.push(updated);
      setSyncingIds(prev => { const s = new Set(prev); s.delete(wallet.id); return s; });
    }
    persistWallets(results);
    setSyncingAll(false);
  }, [wallets, persistWallets]);

  const handleSavePrices = () => {
    const eth = parseFloat(priceEth);
    const btc = parseFloat(priceBtc);
    if (isNaN(eth) || eth <= 0 || isNaN(btc) || btc <= 0) return;
    const updated: CryptoPrices = { ETH: eth, BTC: btc };
    setPrices(updated);
    saveCryptoPrices(updated);
  };

  // Total counts only wallets that BOTH have a synced balance AND a real
  // price for their chain. `unpriced` tallies the ones we had to skip so we
  // can caveat the total honestly rather than under-reporting it silently.
  const { totalValueGbp, unpricedCount } = wallets.reduce<{ totalValueGbp: number; unpricedCount: number }>((acc, w) => {
    if (w.balance == null) return acc;
    const price = w.chain === "ETH" ? prices.ETH : prices.BTC;
    if (price == null) return { totalValueGbp: acc.totalValueGbp, unpricedCount: acc.unpricedCount + 1 };
    return { totalValueGbp: acc.totalValueGbp + w.balance * price, unpricedCount: acc.unpricedCount };
  }, { totalValueGbp: 0, unpricedCount: 0 });

  const hasSynced = wallets.some(w => w.balance != null);
  const hasAnyPricedValue = wallets.some(w => w.balance != null && (w.chain === "ETH" ? prices.ETH : prices.BTC) != null);

  return (
    <VStack gap={12}>

      {/* Header panel with wallet list and Sync All */}
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}>
          <Text as="span" color="var(--ft-accent)">·</Text> Crypto Wallets
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {hasSynced && hasAnyPricedValue && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>
                Total ≈ £<span className="pnum">{totalValueGbp.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</span>
                {unpricedCount > 0 && (
                  <span style={{ color: "var(--ft-dim)", marginLeft: 6 }}>· {unpricedCount} unpriced</span>
                )}
              </span>
            )}
            {hasSynced && !hasAnyPricedValue && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                Total — set a price below to value your wallets
              </span>
            )}
            <button
              onClick={handleSyncAll}
              disabled={syncingAll || wallets.length === 0}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: syncingAll || wallets.length === 0 ? "var(--ft-muted)" : "var(--ft-accent)",
                background: "transparent",
                border: `1px solid ${syncingAll || wallets.length === 0 ? "var(--ft-border2)" : "var(--ft-accent)"}`,
                padding: "3px 10px", cursor: syncingAll || wallets.length === 0 ? "not-allowed" : "pointer",
                opacity: syncingAll || wallets.length === 0 ? 0.5 : 1,
                letterSpacing: "0.04em",
              }}
            >
              {syncingAll ? "SYNCING..." : "↻ SYNC ALL"}
            </button>
            <button
              onClick={() => setShowForm(v => !v)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--ft-accent)", background: "transparent",
                border: "1px solid var(--ft-accent)", padding: "3px 10px",
                cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              {showForm ? "✕ CANCEL" : "+ ADD WALLET"}
            </button>
          </div>
        </div>

        {/* Add wallet form */}
        {showForm && (
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-accent)", marginBottom: 2 }}>
              New Wallet
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <VStack gap={4}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.06em" }}>LABEL</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={e => setFormLabel(e.target.value)}
                  placeholder="e.g. Main ETH wallet"
                  style={CRYPTO_INPUT_STYLE}
                />
              </VStack>
              <VStack gap={4}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.06em" }}>CHAIN</label>
                <select
                  value={formChain}
                  onChange={e => setFormChain(e.target.value as "ETH" | "BTC")}
                  style={{ ...CRYPTO_INPUT_STYLE, cursor: "pointer" }}
                >
                  <option value="ETH">ETH — Ethereum</option>
                  <option value="BTC">BTC — Bitcoin</option>
                </select>
              </VStack>
              <button
                onClick={handleAddWallet}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--ft-base)", background: "var(--ft-accent)",
                  border: "none", padding: "6px 16px", cursor: "pointer",
                  whiteSpace: "nowrap",
                  width: isMobile ? "100%" : undefined,
                }}
              >
                Add
              </button>
            </div>
            <VStack gap={4}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.06em" }}>ADDRESS</label>
              <input
                type="text"
                value={formAddress}
                onChange={e => setFormAddress(e.target.value)}
                placeholder={formChain === "ETH" ? "0x..." : "bc1... or 1... or 3..."}
                style={CRYPTO_INPUT_STYLE}
                onKeyDown={e => { if (e.key === "Enter") handleAddWallet(); }}
              />
            </VStack>
            {formError && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-red)", padding: "4px 0" }}>
                ⚠ {formError}
              </div>
            )}
          </div>
        )}

        {/* Wallet list */}
        {wallets.length === 0 ? (
          <div style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", fontStyle: "italic" }}>
            No wallets saved — click + ADD WALLET to start tracking
          </div>
        ) : (
          wallets.map(wallet => {
            const isSyncing = syncingIds.has(wallet.id);
            const priceForChain = wallet.chain === "ETH" ? prices.ETH : prices.BTC;
            const valueGbp = wallet.balance != null && priceForChain != null
              ? wallet.balance * priceForChain
              : null;

            return (
              <div key={wallet.id} style={{ ...ROW, flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <HStack gap={8} align="center" marginBottom={3}>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: wallet.chain === "ETH" ? "#818CF8" : "#F59E0B",
                      border: `1px solid ${wallet.chain === "ETH" ? "#818CF844" : "#F59E0B44"}`,
                      background: wallet.chain === "ETH" ? "#818CF811" : "#F59E0B11",
                      padding: "1px 7px",
                    }}>
                      {wallet.chain}
                    </span>
                    <Text as="span" mono size={12} weight={600} color="var(--ft-text)">
                      {wallet.label}
                    </Text>
                  </HStack>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", wordBreak: "break-all", marginBottom: 2 }}>
                    {wallet.address}
                  </div>
                  {wallet.error ? (
                    <Text as="div" mono size={10} color="var(--ft-red)" mt={2}>
                      ⚠ {wallet.error}
                    </Text>
                  ) : wallet.balance != null ? (
                    <HStack gap={10} align="baseline" marginTop={3}>
                      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>
                        {wallet.balance.toFixed(6)} {wallet.chain}
                      </span>
                      {valueGbp != null ? (
                        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>
                          ≈ £{valueGbp.toLocaleString("en-GB", { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
                          ≈ £— · set {wallet.chain} price below
                        </span>
                      )}
                    </HStack>
                  ) : null}
                  {wallet.lastSynced && (
                    <Text as="div" mono size={9} color="var(--ft-dim)" mt={2}>
                      Synced {new Date(wallet.lastSynced).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center", paddingTop: 2 }}>
                  <button
                    onClick={() => { void handleSync(wallet.id); }}
                    disabled={isSyncing || syncingAll}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: isSyncing ? "var(--ft-muted)" : "var(--ft-accent)",
                      background: "transparent",
                      border: `1px solid ${isSyncing ? "var(--ft-border2)" : "var(--ft-accent)"}`,
                      padding: "4px 10px", cursor: isSyncing ? "not-allowed" : "pointer",
                      opacity: isSyncing ? 0.6 : 1, letterSpacing: "0.04em",
                    }}
                  >
                    {isSyncing ? "..." : "↻ SYNC"}
                  </button>
                  <button
                    onClick={() => handleDeleteWallet(wallet.id)}
                    disabled={isSyncing || syncingAll}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: "var(--ft-red)", background: "transparent",
                      border: "1px solid var(--ft-red)44", padding: "4px 10px",
                      cursor: isSyncing ? "not-allowed" : "pointer",
                      opacity: isSyncing ? 0.4 : 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Price rate overrides */}
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}>
          <Text as="span" color="var(--ft-accent)">·</Text> Price Rates (GBP)
        </div>
        <VStack gap={10} padding="12px 14px">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
            Override the approximate GBP rate used to calculate fiat values. Stored in localStorage.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr auto", gap: 8, alignItems: "center" }}>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", whiteSpace: "nowrap" }}>1 ETH ≈ £</label>
            <input
              type="number"
              min={1}
              step={100}
              placeholder="Enter ETH price"
              value={priceEth}
              onChange={e => setPriceEth(e.target.value)}
              style={{ ...CRYPTO_INPUT_STYLE, width: "100%" }}
            />
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", whiteSpace: "nowrap", paddingLeft: 8 }}>1 BTC ≈ £</label>
            <input
              type="number"
              min={1}
              step={1000}
              placeholder="Enter BTC price"
              value={priceBtc}
              onChange={e => setPriceBtc(e.target.value)}
              style={{ ...CRYPTO_INPUT_STYLE, width: "100%" }}
            />
            <button
              onClick={handleSavePrices}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--ft-base)", background: "var(--ft-accent)",
                border: "none", padding: "6px 14px", cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Save
            </button>
          </div>
        </VStack>
      </div>

      {/* API info footer */}
      <div style={{
        padding: "8px 14px",
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        fontFamily: "var(--font-mono)", fontSize: 9,
        color: "var(--ft-dim)", letterSpacing: "0.04em", lineHeight: 1.6,
      }}>
        ETH balances via Etherscan public API · BTC balances via Blockstream · No API key required · All requests are client-side
      </div>
    </VStack>
  );
}

// ── Categories panel ──────────────────────────────────────────────────────────
function CategoriesPanel() {
  const { meta, setCategoryMeta, removeCategoryMeta, getEmoji, getColor } = useCategoryMeta();
  const { data: allTxs } = useListTransactions({});

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const tx of allTxs ?? []) {
      if (tx.category) cats.add(tx.category);
    }
    return [...cats].sort();
  }, [allTxs]);

  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [emojiInput, setEmojiInput] = useState("");
  const [colorInput, setColorInput] = useState("#ffffff");

  const openEdit = (cat: string) => {
    setEditingCat(cat);
    setEmojiInput(getEmoji(cat));
    setColorInput(getColor(cat).startsWith("#") ? getColor(cat) : "#aaaaaa");
  };

  const saveEdit = () => {
    if (!editingCat) return;
    setCategoryMeta(editingCat, { emoji: emojiInput, color: colorInput });
    setEditingCat(null);
  };

  const COMMON_COLORS = ["#00ff88","#f59e0b","#3b82f6","#ef4444","#8b5cf6","#ec4899","#10b981","#06b6d4","#f97316","#6b7280"];

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Category Colours &amp; Icons</div>
        <div style={{ padding: "10px 14px 6px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
          Customise the colour and emoji for each spending category. Changes apply across the app.
        </div>
        <div style={{ padding: "4px 0" }}>
          {categories.length === 0 && (
            <div style={{ padding: "16px 14px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
              No categories yet — add some transactions first.
            </div>
          )}
          {categories.map(cat => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{getEmoji(cat)}</span>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: getColor(cat), flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", flex: 1 }}>{cat}</span>
              {meta[cat.toLowerCase()] && (
                <button
                  onClick={() => removeCategoryMeta(cat)}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", background: "transparent", border: "none", cursor: "pointer", letterSpacing: "0.05em" }}
                >
                  RESET
                </button>
              )}
              <button
                onClick={() => openEdit(cat)}
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", background: "transparent", border: "1px solid var(--ft-border)", padding: "2px 8px", cursor: "pointer" }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </div>

      {editingCat && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setEditingCat(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: 20, width: 300, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--ft-dim)" }}>EDIT: {editingCat.toUpperCase()}</div>

            <div>
              <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.08em" mb={6}>EMOJI</Text>
              <input
                value={emojiInput}
                onChange={e => setEmojiInput(e.target.value)}
                placeholder="e.g. X"
                style={{ fontFamily: "var(--font-mono)", fontSize: 18, background: "var(--ft-raised)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "6px 10px", width: "100%", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.08em" mb={6}>COLOUR</Text>
              <HStack gap={6} wrap marginBottom={8}>
                {COMMON_COLORS.map(c => (
                  <div key={c} onClick={() => setColorInput(c)}
                    style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: colorInput === c ? "2px solid var(--ft-text)" : "2px solid transparent" }} />
                ))}
              </HStack>
              <input type="color" value={colorInput} onChange={e => setColorInput(e.target.value)}
                style={{ width: "100%", height: 32, background: "transparent", border: "1px solid var(--ft-border)", cursor: "pointer" }} />
            </div>

            <HStack gap={8}>
              <button onClick={saveEdit} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-accent)", color: "var(--ft-base)", border: "none", padding: "8px", cursor: "pointer", letterSpacing: "0.06em" }}>SAVE</button>
              <button onClick={() => setEditingCat(null)} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, background: "transparent", color: "var(--ft-muted)", border: "1px solid var(--ft-border)", padding: "8px", cursor: "pointer" }}>CANCEL</button>
            </HStack>
          </div>
        </div>
      )}
    </VStack>
  );
}

// ── Currency KPI Strip ────────────────────────────────────────────────────────
function CurrencyKpiStrip({ baseCurrency, pairCount }: { baseCurrency: string; pairCount: number }) {
  const cells: { value: React.ReactNode; label: string; color: string }[] = [
    { value: <span className="pnum" style={{ fontSize: 20 }}>{baseCurrency}</span>, label: "Base currency", color: "var(--ft-accent)" },
    { value: <span className="pnum">{SUPPORTED_CURRENCIES.length}</span>, label: "Supported currencies", color: "var(--ft-blue)" },
    { value: <span className="pnum">{pairCount}</span>, label: "FX overrides active", color: pairCount > 0 ? "var(--ft-amber)" : "var(--ft-dim)" },
  ];
  return (
    <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)" }}>
      {cells.map(c => (
        <div key={c.label} style={{ background: "var(--ft-surface)", padding: "14px 16px", borderTop: `2px solid ${c.color}` }}>
          <Text as="div" mono size={22} weight={700} color="var(--ft-text)" lineHeight={1}>{c.value}</Text>
          <Text as="div" mono upper size={9} color="var(--ft-dim)" letterSpacing="0.08em" mt={4}>{c.label}</Text>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useFintrackTheme();
  const isMobile = useIsMobile();
  const [activePanel, setActivePanel] = useState<NavItem>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("panel");
      // Any known nav id in ?panel= wins. Prior code only allowed
      // "terminal-profile"; widened so screenshot harnesses can pick
      // any tab (e.g. ?panel=connections) without dispatching events.
      const allIds = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
      if (p && (allIds as string[]).includes(p)) return p as NavItem;
    } catch {}
    return "appearance";
  });
  const [density, setDensityState] = useState<Density>(() => loadDensity());
  const [aiStyle, setAiStyleState] = useState<AiStyle>(getAiStyle);

  useEffect(() => {
    const handler = (e: Event) => {
      const panel = (e as CustomEvent<NavItem>).detail;
      if (panel) setActivePanel(panel);
    };
    window.addEventListener("numeris-settings-nav", handler);
    return () => window.removeEventListener("numeris-settings-nav", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const s = (e as CustomEvent<AiStyle>).detail;
      if (s) setAiStyleState(s);
    };
    window.addEventListener("numeris-ai-style-change", handler);
    return () => window.removeEventListener("numeris-ai-style-change", handler);
  }, []);

  const handleSetDensity = (d: Density) => {
    setDensityState(d);
    applyDensity(d);
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ }
  };

  // Currency
  const { data: currencySettings } = useGetSettingsCurrency();
  const updateCurrency = useUpdateSettingsCurrency();
  const baseCur = currencySettings?.baseCurrency ?? "GBP";

  // fxOverridesMap is keyed by base currency: { GBP: { USD: "1.27" }, USD: { EUR: "0.91" } }
  const [fxOverridesMap, setFxOverridesMap] = useState<Record<string, Record<string, string>>>(() => {
    try {
      const raw = JSON.parse(ls("nr-fx-overrides", "{}"));
      // Migrate old flat format { USD: "1.27" } → { GBP: { USD: "1.27" } }
      const firstVal = Object.values(raw)[0];
      if (typeof firstVal === "string") return { GBP: raw };
      return raw;
    } catch { return {}; }
  });
  const fxOverrides = fxOverridesMap[baseCur] ?? {};

  const handleCurrencyChange = async (value: string) => {
    try {
      await updateCurrency.mutateAsync({ data: { baseCurrency: value as (typeof SUPPORTED_CURRENCIES)[number] } });
      toast({ title: `Base currency updated to ${value}` });
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      toast({ title: "Could not update currency", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const handleFxChange = (pair: string, value: string) => {
    setFxOverridesMap(prev => {
      const next = { ...prev, [baseCur]: { ...(prev[baseCur] ?? {}), [pair]: value } };
      lsSet("nr-fx-overrides", JSON.stringify(next));
      return next;
    });
  };

  const handleFxReset = () => {
    setFxOverridesMap(prev => {
      const next = { ...prev };
      delete next[baseCur];
      lsSet("nr-fx-overrides", JSON.stringify(next));
      return next;
    });
    toast({ title: "FX overrides cleared. Live rates will be used." });
  };

  // Widgets
  const { toggle, isEnabled } = useWidgets();

  // Cat rules
  const [catRules, setCatRules] = useState<CatRule[]>(() => loadCatRules());
  const [newKeyword, setNewKeyword] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState(CATEGORIES[0]);

  const handleAddCatRule = () => {
    const keyword = newKeyword.trim();
    if (!keyword) return;
    const updated: CatRule[] = [...catRules, { id: crypto.randomUUID(), contains: keyword, category: newRuleCategory }];
    saveCatRules(updated); setCatRules(updated); setNewKeyword("");
  };

  const handleDeleteCatRule = (id: string) => {
    const updated = catRules.filter(r => r.id !== id);
    saveCatRules(updated); setCatRules(updated);
  };

  // Alerts
  const [alertRules, setAlertRules] = useState<AlertRules>(() => loadAlertRules());
  const handleSaveAlertRules = () => { localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(alertRules)); toast({ title: "Alert rules saved" }); };

  // Data export
  const handleExportBackup = async () => {
    try {
      const res = await apiFetch("/api/export/backup");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `numeris-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      toast({ title: "Backup exported", description: "All account data downloaded" });
    } catch {
      toast({ title: "Export failed", description: "Could not download backup" });
    }
  };

  const handleExportData = () => {
    const payload = { exportedAt: new Date().toISOString(), localStorage: getFtLocalStorageEntries() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `numeris-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "Data exported" });
  };

  const handleReset = (key: string, label: string, storage: "local" | "session" = "local") => {
    if (storage === "local" && !window.confirm(label)) return;
    if (storage === "local") localStorage.removeItem(key); else sessionStorage.removeItem(key);
    toast({ title: "Done" });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // Persona-filtered NAV. Market persona hides bank-only surfaces
  // (see MARKET_HIDDEN_NAV). useActivePersona re-renders on any
  // persona change (server hydration, cross-tab, future settings row)
  // so the nav rebuilds without a page reload.
  const persona = useActivePersona();
  const navGroups = filterNavGroupsForPersona(NAV_GROUPS, persona);
  const allNavItems = navGroups.flatMap(g => g.items);
  const activeLabel = allNavItems.find(i => i.id === activePanel)?.label ?? "Settings";
  const activeGroup = navGroups.find(g => g.items.some(i => i.id === activePanel)) ?? navGroups[0];

  // Desktop root: was `height: calc(100vh - 48px)`. The magic 48
  // guessed the chrome above <main> and got it wrong by 24px
  // (measured 72, comprising the top-bar and any transient banner).
  // Overflowing <main> forced a second scrollbar. Replaced with
  // flex:1 minHeight:0 — <main> is the flex parent (via
  // VIEWPORT_LOCKED_ROUTES in layout.tsx), and this root shrinks
  // to fit whatever height <main> actually gives it. No arithmetic.
  //
  // Mobile keeps `height:auto` so settings flows into the mobile
  // page scroll (index.css .ft-settings-layout mobile override
  // matches this).
  return (
    <div
      className="ft-settings-layout"
      style={{
        display: "flex",
        overflow: isMobile ? "visible" : "hidden",
        ...(isMobile ? { height: "auto" } : { flex: 1, minHeight: 0 }),
      }}
    >

      {isMobile ? (
        /* ── Mobile nav: two-level chip nav ── */
        <div style={{ background: "var(--ft-surface)", borderBottom: "1px solid var(--ft-border)", flexShrink: 0 }}>
          {/* Breadcrumb */}
          <div style={{ padding: "8px 14px 0", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-accent)", letterSpacing: "0.14em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
            <span>◈ SYSTEM CONFIG</span>
            <Text as="span" color="var(--ft-border2)">›</Text>
            <Text as="span" color="var(--ft-dim)">{activeLabel.toUpperCase()}</Text>
          </div>
          {/* Group tabs */}
          <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "8px 14px 0", gap: 0, borderBottom: "1px solid var(--ft-border)" }}>
            {navGroups.map(group => {
              const isGActive = group.label === activeGroup.label;
              return (
                <button
                  key={group.label}
                  onClick={() => {
                    const first = group.items.find(i => !(i.id === "wardrobe" && aiStyle !== "wanderer"));
                    if (first) setActivePanel(first.id);
                  }}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
                    textTransform: "uppercase", padding: "5px 12px 7px", whiteSpace: "nowrap",
                    background: "transparent", outline: "none", cursor: "pointer",
                    border: "none",
                    borderBottom: isGActive ? "2px solid var(--ft-accent)" : "2px solid transparent",
                    color: isGActive ? "var(--ft-accent)" : "var(--ft-muted)",
                    marginBottom: -1,
                  }}
                >
                  {group.label}
                </button>
              );
            })}
          </div>
          {/* Item chips for active group */}
          <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "8px 14px 10px", gap: 6 }}>
            {activeGroup.items.map(item => {
              const isActive = activePanel === item.id;
              const isLocked = item.id === "wardrobe" && aiStyle !== "wanderer";
              return (
                <button
                  key={item.id}
                  disabled={isLocked}
                  onClick={() => !isLocked && setActivePanel(item.id)}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 12px",
                    whiteSpace: "nowrap", outline: "none", cursor: isLocked ? "not-allowed" : "pointer",
                    flexShrink: 0,
                    background: isActive ? "var(--ft-accent)" : "var(--ft-raised)",
                    border: `1px solid ${isActive ? "var(--ft-accent)" : "var(--ft-border2)"}`,
                    color: isActive ? "var(--ft-base)" : isLocked ? "var(--ft-dim)" : "var(--ft-muted)",
                    opacity: isLocked ? 0.5 : 1,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Desktop nav: left sidebar ── */
        <div className="ft-settings-nav" style={{ width: 220, flexShrink: 0, background: "var(--ft-surface)", borderRight: "1px solid var(--ft-border)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 14px 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            <Text as="span" color="var(--ft-accent)">·</Text> System Config
          </div>
          {navGroups.map(group => (
            <div key={group.label}>
              <div style={{ padding: "10px 14px 3px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 700 }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const isActive = activePanel === item.id;
                const isWardrobeLocked = item.id === "wardrobe" && aiStyle !== "wanderer";
                if (isWardrobeLocked) {
                  return (
                    <div
                      key={item.id}
                      title="Enable AI Wanderer first (AI & Help → AI Coach)"
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        width: "100%", textAlign: "left",
                        padding: "7px 14px 7px 16px",
                        fontFamily: "var(--font-mono)", fontSize: 12,
                        background: "transparent",
                        borderLeft: "2px solid transparent",
                        color: "var(--ft-dim)",
                        cursor: "not-allowed",
                      }}
                    >
                      <Lock size={9} style={{ flexShrink: 0 }} />
                      <span>{item.label}</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={item.id}
                    onClick={() => setActivePanel(item.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "7px 14px 7px 16px",
                      fontFamily: "var(--font-mono)", fontSize: 12,
                      background: isActive ? "var(--ft-raised)" : "transparent",
                      borderLeft: isActive ? "2px solid var(--ft-accent)" : "2px solid transparent",
                      borderTop: "none", borderRight: "none", borderBottom: "none",
                      color: isActive ? "var(--ft-text)" : "var(--ft-muted)",
                      cursor: "pointer",
                      transition: "background 0.12s, color 0.12s",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Panel content */}
      <div className="ft-settings-content" style={{ flex: 1, overflowY: isMobile ? "visible" : "auto", padding: isMobile ? "12px 14px" : "16px 20px" }}>

        {activePanel === "terminal-profile" && <TerminalProfilePanel />}

        {activePanel === "appearance" && <AppearancePanel theme={theme} setTheme={setTheme} density={density} setDensity={handleSetDensity} />}

        {activePanel === "display" && <DisplayAndMotionPanel />}

        {activePanel === "currency" && (
          <VStack gap={12}>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Base Currency</div>
              <CurrencyKpiStrip baseCurrency={baseCur} pairCount={Object.keys(fxOverrides).filter(k => fxOverrides[k] !== "").length} />
              <div style={{ padding: "14px 16px", background: "var(--ft-surface)", display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>All amounts will be converted to this currency for display.</p>
                <VStack gap={4} wide maxWidth={240}>
                  <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>Currency</Label>
                  <Select value={currencySettings?.baseCurrency ?? "GBP"} onValueChange={handleCurrencyChange} disabled={updateCurrency.isPending}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </VStack>
              </div>
            </div>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Manual FX Rate Overrides</div>
              <div style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 12 }}>Override live FX rates for multi-currency transaction conversion. Leave blank to use live rates.</p>
                <div className="ft-scroll-x" style={{ marginBottom: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--ft-raised)" }}>
                      {["Pair",`Rate (per 1 ${currencySettings?.baseCurrency ?? "GBP"})`].map(h => <th key={h} style={{ padding: "5px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 600, borderBottom: "1px solid var(--ft-border)", whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {COMMON_FX_PAIRS.filter(pair => pair !== baseCur).map(pair => (
                      <tr key={pair} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                        <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", width: 90, whiteSpace: "nowrap" }}>{baseCur}/{pair}</td>
                        <td style={{ padding: "4px 10px" }}>
                          <input
                            type="number" step="0.0001" min={0}
                            placeholder="live"
                            value={fxOverrides[pair] ?? ""}
                            onChange={e => handleFxChange(pair, e.target.value)}
                            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", width: 120 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <ActionBtn label="Reset to Live Rates" variant="muted" onClick={handleFxReset} />
              </div>
            </div>
          </VStack>
        )}

        {activePanel === "alerts" && (
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Alert Rules</div>
            <SettingsToggleRow title="Enable smart alerts" sub="Threshold-based notifications on the dashboard" on={alertRules.enabled} onChange={v => setAlertRules(p => ({ ...p, enabled: v }))} />
            <SectionHeader label="Transaction Alerts" accent="var(--ft-amber)" />
            <SettingsInputRow title="Large transaction threshold" sub="Alert when a single transaction exceeds this amount">
              <HStack gap={6} align="center">
                <Text as="span" mono size={11} color="var(--ft-muted)">£</Text>
                <Input type="number" min={0} value={alertRules.largeTxThreshold} onChange={e => setAlertRules(p => ({ ...p, largeTxThreshold: Number(e.target.value) }))} className="pnum" style={{ width: 100, fontFamily: "var(--font-mono)", fontSize: 11 }} />
              </HStack>
            </SettingsInputRow>
            <SettingsInputRow title="Category spike alert" sub="Alert when a category is X% above last month">
              <HStack gap={6} align="center">
                <Input type="number" min={1} max={500} value={alertRules.categorySpikeAlertPct} onChange={e => setAlertRules(p => ({ ...p, categorySpikeAlertPct: Number(e.target.value) }))} className="pnum" style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <Text as="span" mono size={11} color="var(--ft-muted)">% above last month</Text>
              </HStack>
            </SettingsInputRow>
            <SectionHeader label="Budget Alerts" accent="var(--ft-red)" />
            <SettingsInputRow title="Budget warning threshold" sub="Show warning when budget used above this %">
              <HStack gap={6} align="center">
                <Input type="number" min={1} max={100} value={alertRules.budgetWarningPct} onChange={e => setAlertRules(p => ({ ...p, budgetWarningPct: Math.min(100, Math.max(1, Number(e.target.value))) }))} className="pnum" style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <Text as="span" mono size={11} color="var(--ft-muted)">%</Text>
              </HStack>
            </SettingsInputRow>
            <SettingsToggleRow title="Overspend warning" sub="Warn when you've exceeded a budget category" on={alertRules.budgetHardStop} onChange={v => setAlertRules(p => ({ ...p, budgetHardStop: v }))} />
            <SectionHeader label="Goal Alerts" accent="var(--ft-green)" />
            <SettingsInputRow title="Months behind alert" sub="Alert when X months behind on a savings goal">
              <HStack gap={6} align="center">
                <Input type="number" min={1} max={24} value={alertRules.goalBehindMonths} onChange={e => setAlertRules(p => ({ ...p, goalBehindMonths: Math.max(1, Number(e.target.value)) }))} className="pnum" style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <Text as="span" mono size={11} color="var(--ft-muted)">months</Text>
              </HStack>
            </SettingsInputRow>
            <SectionHeader label="Bill Reminders" accent="var(--ft-cyan)" />
            <SettingsInputRow title="Bill reminder days" sub="Remind X days before a bill is due">
              <HStack gap={6} align="center">
                <Input type="number" min={0} max={30} value={alertRules.billReminderDays} onChange={e => setAlertRules(p => ({ ...p, billReminderDays: Math.max(0, Number(e.target.value)) }))} className="pnum" style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <Text as="span" mono size={11} color="var(--ft-muted)">days before</Text>
              </HStack>
            </SettingsInputRow>
            <SectionHeader label="Goals" accent="var(--ft-blue)" />
            <SettingsInputRow title="Savings Rate Target" sub="Your monthly income % goal to save/invest">
              <SavingsRateTargetInput />
            </SettingsInputRow>
            <div style={{ padding: "12px 14px" }}>
              <ActionBtn label="Save Alert Rules" onClick={handleSaveAlertRules} />
            </div>
          </div>
        )}

        {activePanel === "rules" && (
          <VStack gap={12}>
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Auto-Categorization Rules</div>
            <div style={{ padding: "12px 14px" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 14 }}>When a transaction description contains the keyword, the category is auto-filled.</p>
              {catRules.length > 0 ? (
                <div className="ft-scroll-x" style={{ marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--ft-raised)" }}>
                      {["Keyword","","Category",""].map((h,i) => <th key={i} style={{ padding: "5px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 600, borderBottom: "1px solid var(--ft-border)", whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {catRules.map(rule => (
                      <tr key={rule.id} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                        <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", whiteSpace: "nowrap" }}>{rule.contains}</td>
                        <td style={{ padding: "7px 4px", color: "var(--ft-dim)", fontSize: 11, textAlign: "center" }}>→</td>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>{rule.category}</span></td>
                        <td style={{ padding: "4px 10px", textAlign: "right" }}>
                          <button onClick={() => handleDeleteCatRule(rule.id)} style={{ background: "none", border: "none", color: "var(--ft-red)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, padding: "2px 4px" }} aria-label={`Delete rule for ${rule.contains}`}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", marginBottom: 16, fontStyle: "italic" }}>No rules yet. Add one below.</div>
              )}
              <HStack gap={8} align="end" wrap>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>Keyword</div>
                  <Input placeholder="keyword" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCatRule(); } }} style={{ fontFamily: "var(--font-mono)", fontSize: 11 }} />
                </div>
                <div style={{ flexShrink: 0, minWidth: 180 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>Category</div>
                  <select value={newRuleCategory} onChange={e => setNewRuleCategory(e.target.value)} style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "6px 8px", borderRadius: 2 }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button onClick={handleAddCatRule} disabled={!newKeyword.trim()} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: newKeyword.trim() ? "var(--ft-accent)" : "var(--ft-dim)", background: "transparent", border: `1px solid ${newKeyword.trim() ? "var(--ft-accent)" : "var(--ft-border2)"}`, padding: "7px 16px", cursor: newKeyword.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap", alignSelf: "flex-end", height: 36 }}>
                  + Add
                </button>
              </HStack>
              <Text as="div" mono size={9} color="var(--ft-dim)" letterSpacing="0.04em" mt={12}>Rules apply when adding transactions and during CSV import.</Text>
            </div>
          </div>
          <CustomCategoriesPanel />
          </VStack>
        )}

        {activePanel === "dashboard" && <DashboardPanel />}

        {activePanel === "tx-defaults" && <TransactionDefaultsPanel />}

        {activePanel === "widgets" && (
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Dashboard Widgets</div>
            <div style={{ padding: "0" }}>
              {(() => {
                // Item 13: persona-varied catalogue ordering. Nothing is
                // hidden — the user always sees every widget so a market
                // persona who wants a Budget Tracker can still find it.
                // But persona-recommended widgets sort to the top so the
                // catalogue matches the persona's mental model at a
                // glance. The mono tag on each recommended row makes the
                // reason for the ordering legible.
                const recommendedSet = new Set(widgetIdsForPersona(persona));
                const sorted = [
                  ...WIDGET_REGISTRY.filter(w => recommendedSet.has(w.id)),
                  ...WIDGET_REGISTRY.filter(w => !recommendedSet.has(w.id)),
                ];
                return sorted.map(w => (
                  <SettingsWidgetRow
                    key={w.id}
                    label={w.label}
                    span={w.defaultSpan}
                    description={w.description}
                    enabled={isEnabled(w.id)}
                    onToggle={() => toggle(w.id)}
                    recommended={recommendedSet.has(w.id)}
                  />
                ));
              })()}
            </div>
            <div style={{ padding: "10px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
              Enabled widgets appear on the Dashboard page. Changes save automatically.
            </div>
          </div>
        )}

        {activePanel === "data" && (
          <VStack gap={12}>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Export</div>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 10 }}>Download all app data as a JSON file. Includes all local state stored by this app.</div>
                <HStack gap={8} wrap>
                  <ActionBtn label="Export All Data" onClick={handleExportBackup} />
                  <ActionBtn label="Export with Session Data" variant="muted" onClick={handleExportData} />
                </HStack>
              </div>
            </div>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Reset</div>
              <div style={{ padding: "4px 0" }}>
                {([
                  { label: "Clear Net Worth History", description: "Removes all saved net worth snapshots", key: "ft-nw-history", confirm: "Clear all net worth history? This cannot be undone.", storage: "local" as const },
                  { label: "Reset Budget Targets", description: "Removes all configured budget categories", key: "ft-budgets", confirm: "Reset all budget targets?", storage: "local" as const },
                  { label: "Reset Savings Goals", description: "Removes all savings goal progress", key: "ft-goals", confirm: "Reset all savings goals?", storage: "local" as const },
                  { label: "Reset Widget Layout", description: "Restores the dashboard to its default widget arrangement", key: "ft-widgets", confirm: "Reset widget layout to defaults?", storage: "local" as const },
                  { label: "Clear Dismissed Alerts", description: "Resets which alerts have been dismissed this session", key: "ft-dismissed-alerts", confirm: "", storage: "session" as const },
                ] as const).map(item => (
                  <SettingsDataResetRow key={item.key} label={item.label} description={item.description} onReset={() => handleReset(item.key, item.confirm, item.storage)} />
                ))}
              </div>
            </div>
          </VStack>
        )}

        {activePanel === "advanced" && <AdvancedPanel toast={toast} />}

        {activePanel === "connections" && <ConnectionsPanel />}

        {activePanel === "wise" && <WiseIntegrationPanel />}

        {activePanel === "crypto-wallets" && <CryptoWalletsPanel />}

        {activePanel === "digest" && <DigestPanel />}

        {activePanel === "ai" && <AiSettingsPanel />}

        {activePanel === "wardrobe" && <WardrobePanel />}

        {activePanel === "categories" && <CategoriesPanel />}

        {activePanel === "shortcuts" && (
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><Text as="span" color="var(--ft-accent)">·</Text> Keyboard Shortcuts</div>
            <div className="ft-scroll-x" style={{ background: "var(--ft-surface)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--ft-raised)" }}>
                    {["Shortcut","Action"].map(h => <th key={h} style={{ padding: "6px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 600, borderBottom: "1px solid var(--ft-border)", whiteSpace: "nowrap" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SHORTCUTS.map(([key, action]) => (
                    <tr key={key} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                      <td style={{ padding: "7px 12px", width: 120, whiteSpace: "nowrap" }}>
                        <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-accent)", padding: "2px 6px", letterSpacing: "0.04em" }}>{key}</kbd>
                      </td>
                      <td style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

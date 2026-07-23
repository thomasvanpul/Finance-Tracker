import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { getAiStyle, setAiStylePref, type AiStyle } from "@/components/ai-agent";
import { loadCatRules, saveCatRules, type CatRule } from "@/lib/auto-cat";
import { loadSidebarConfig, saveSidebarConfig } from "@/lib/sidebar-config";
import {
  useGetSettingsCurrency,
  useUpdateSettingsCurrency,
  useGetWiseStatus,
  useSyncWiseTransactions,
  useListAccounts,
} from "@workspace/api-client-react";
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
import { THEME_REWARDS, ThemeRewardsPanel, getLearnXP } from "@/components/investments/learn-tab";
import { getBotSkin, setBotSkin, SKINS, type BotSkinId } from "@/lib/bot-skins";
import { BotPreview, type Phase } from "@/components/ai-wanderer";

const WARDROBE_PHASES: Phase[] = ["idle", "sitting", "coffee", "thinking", "dancing", "complaining", "tired", "jumping", "lying"];

// ── Storage keys ──────────────────────────────────────────────────────────────
const ALERT_RULES_KEY = "ft-alert-rules";
const DENSITY_KEY = "ft-density";

// ── Types ─────────────────────────────────────────────────────────────────────
type Density = "compact" | "normal" | "comfortable";

type NavItem =
  | "appearance" | "animations" | "display"
  | "security" | "privacy" | "profile"
  | "currency" | "alerts" | "rules" | "dashboard" | "tx-defaults"
  | "widgets" | "data" | "advanced"
  | "shortcuts" | "ai"
  | "wise" | "crypto-wallets";

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

const SWATCH_DATA: { id: FintrackTheme; label: string; tagline: string; base: string; surface: string; accent: string; text: string; muted: string }[] = [
  { id: "void",       label: "Void",       tagline: "Terminal amber on void",       base: "#08090B", surface: "#0F1117", accent: "#F4A21E", text: "#CDD6F4", muted: "#6C7A96" },
  { id: "phosphor",   label: "Phosphor",   tagline: "CRT phosphor green",           base: "#020802", surface: "#050F05", accent: "#7FFF00", text: "#39FF14", muted: "#1E8C0A" },
  { id: "arctic",     label: "Arctic",     tagline: "Corporate daylight",           base: "#F0F4F8", surface: "#FFFFFF", accent: "#0052CC", text: "#1A2333", muted: "#5A6A84" },
  { id: "amber",      label: "Amber",      tagline: "Warm trader console",          base: "#0A0600", surface: "#120C00", accent: "#FFD700", text: "#FFB000", muted: "#A07020" },
  { id: "midnight",   label: "Midnight",   tagline: "Late-night deep blue",         base: "#010817", surface: "#05112A", accent: "#4D9FFF", text: "#E8F0FF", muted: "#7A99CC" },
  { id: "matrix",     label: "Matrix",     tagline: "Decoded reality",              base: "#000300", surface: "#010601", accent: "#00FF41", text: "#00CC33", muted: "#007700" },
  { id: "synthwave",  label: "Synthwave",  tagline: "Neon grids, 80s midnight",     base: "#0D001A", surface: "#170028", accent: "#FF007A", text: "#E8D5FF", muted: "#9966CC" },
  { id: "deep-space", label: "Deep Space", tagline: "Cosmic observatory",           base: "#010108", surface: "#06060F", accent: "#7B5EA7", text: "#C8D0E8", muted: "#6870A0" },
  { id: "mario",      label: "Mario",      tagline: "8-bit power-up",              base: "#5C94FC", surface: "#3A70DC", accent: "#F8C800", text: "#FCFCFC", muted: "#6888CC" },
  { id: "gilded",     label: "Gilded",     tagline: "Black gold, no noise",         base: "#080600", surface: "#0E0C00", accent: "#C8941E", text: "#F0E6C8", muted: "#7A5E0A" },
  { id: "bloodline",  label: "Bloodline",  tagline: "Dark market, red signals",     base: "#0F0003", surface: "#1A0008", accent: "#CC1A2F", text: "#F5C2C7", muted: "#883344" },
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
  { href: "/learn",         label: "Learn",        section: "TOOLS" },
];

const NAV_GROUPS: { label: string; items: { id: NavItem; label: string }[] }[] = [
  {
    label: "Personalise",
    items: [
      { id: "appearance", label: "Appearance" },
      { id: "animations", label: "Animations" },
      { id: "display",    label: "Display" },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "profile",  label: "Profile" },
      { id: "security", label: "Security" },
      { id: "privacy",  label: "Privacy" },
    ],
  },
  {
    label: "Finance",
    items: [
      { id: "currency",    label: "Currency" },
      { id: "alerts",      label: "Alerts" },
      { id: "rules",       label: "Categories" },
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
      { id: "wise", label: "Wise" },
      { id: "crypto-wallets", label: "Crypto Wallets" },
    ],
  },
  {
    label: "AI",
    items: [
      { id: "ai", label: "AI Assistant" },
    ],
  },
  {
    label: "Learn",
    items: [
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

// ── Shared primitives ─────────────────────────────────────────────────────────
const PANEL_STYLE = { background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" } as const;

const HEADER_STYLE = {
  background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)",
  padding: "0 14px", height: 34, display: "flex", alignItems: "center", gap: 8,
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--ft-muted)",
} as const;

const ROW = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", borderBottom: "1px solid var(--ft-border)",
  fontFamily: "var(--font-mono)", fontSize: 12,
} as const;

function RowLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ft-text)", fontWeight: 500, fontFamily: "var(--font-mono)" }}>{title}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--ft-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        flexShrink: 0, width: 38, height: 20, borderRadius: 10,
        border: `1px solid ${on ? "var(--ft-accent)" : "var(--ft-border2)"}`,
        background: on ? "var(--ft-accent)" : "var(--ft-raised)",
        cursor: "pointer", position: "relative", transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 14, height: 14, borderRadius: "50%",
        background: on ? "var(--ft-base)" : "var(--ft-dim)", transition: "left 0.15s",
      }} />
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: "8px 14px 4px", fontFamily: "var(--font-mono)", fontSize: 9,
      letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)",
      fontWeight: 700, background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)",
    }}>{label}</div>
  );
}

function ActionBtn({ label, variant = "accent", onClick, disabled }: { label: string; variant?: "accent" | "muted" | "danger"; onClick: () => void; disabled?: boolean }) {
  const color = variant === "danger" ? "var(--ft-red)" : variant === "muted" ? "var(--ft-muted)" : "var(--ft-accent)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "var(--font-mono)", fontSize: 11, color,
        background: "transparent", border: `1px solid ${color}`,
        padding: "7px 18px", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >&gt; {label}</button>
  );
}

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
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>%</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
        Saved automatically · used on the dashboard KPI
      </div>
    </div>
  );
}

function useIsDevUser() {
  const { data: session } = authClient.useSession();
  return session?.user?.email === "dev@bypass.local";
}

// ── Profile panel ─────────────────────────────────────────────────────────────
function ProfilePanel() {
  const { data: session } = authClient.useSession();
  const { toast } = useToast();
  const [nameEditing, setNameEditing] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const user = session?.user;

  const startEdit = () => { setNameVal(user?.name ?? ""); setNameEditing(true); };

  const handleSaveName = async () => {
    if (!nameVal.trim()) return;
    setNameSaving(true);
    try {
      await authClient.updateUser({ name: nameVal.trim() });
      setNameEditing(false);
      toast({ title: "Display name updated" });
    } catch (err) {
      toast({ title: "Could not update name", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setNameSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Profile</div>
        <div style={{ padding: "16px", background: "var(--ft-surface)", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 52, height: 52, background: "var(--ft-accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-base)", lineHeight: 1 }}>
              {((user?.name || user?.email || "U").charAt(0)).toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            {!nameEditing ? (
              <>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)", marginBottom: 4 }}>
                  {user?.name || <span style={{ color: "var(--ft-dim)", fontStyle: "italic" }}>No display name</span>}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 10 }}>{user?.email}</div>
                <ActionBtn label="Edit Name" variant="muted" onClick={startEdit} />
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  type="text" autoFocus value={nameVal}
                  onChange={e => setNameVal(e.target.value)}
                  placeholder="Display name"
                  onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setNameEditing(false); }}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--ft-raised)", border: "1px solid var(--ft-accent)", color: "var(--ft-text)", padding: "6px 10px", outline: "none" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleSaveName} disabled={nameSaving || !nameVal.trim()} style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "var(--ft-accent)", color: "var(--ft-base)", border: "none", padding: "5px 14px", cursor: "pointer", opacity: (nameSaving || !nameVal.trim()) ? 0.5 : 1 }}>
                    {nameSaving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setNameEditing(false)} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", background: "transparent", border: "1px solid var(--ft-border)", padding: "5px 12px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Account Details</div>
        {([
          ["Email", user?.email ?? "—"],
          ["User ID", user?.id ? `…${String(user.id).slice(-8)}` : "—"],
          ["Created", user?.createdAt ? new Date(String(user.createdAt)).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" }) : "—"],
        ] as [string, string][]).map(([label, val]) => (
          <div key={label} style={ROW}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>{label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{val}</span>
          </div>
        ))}
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Session</div>
        <div style={{ ...ROW, flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
          <RowLabel title="Sign out" sub="Ends your current session on this device" />
          <ActionBtn label="Sign Out" variant="danger" onClick={async () => { await authClient.signOut(); window.location.href = "/"; }} />
        </div>
      </div>
    </div>
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
      <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Transaction Defaults</div>
      <div style={ROW}>
        <RowLabel title="Default type" sub='Pre-selects the transaction type in Quick Add (N)' />
        <div style={{ display: "flex", gap: 4 }}>
          {(["expense","income","transfer"] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" as const, padding: "4px 10px", background: defType === t ? "var(--ft-accent)" : "transparent", border: `1px solid ${defType === t ? "var(--ft-accent)" : "var(--ft-border)"}`, color: defType === t ? "var(--ft-base)" : "var(--ft-muted)", cursor: "pointer", transition: "background 0.1s" }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div style={ROW}>
        <RowLabel title="Default currency" sub="Pre-selects the currency in Quick Add" />
        <select value={defCurrency} onChange={e => setCur(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px" }}>
          {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={ROW}>
        <RowLabel title="Default category" sub='Pre-fills the category field (leave blank to skip)' />
        <select value={defCategory} onChange={e => setCat(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px" }}>
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

function AppearancePanel({ theme, setTheme, density, setDensity }: {
  theme: FintrackTheme; setTheme: (t: FintrackTheme) => void;
  density: Density; setDensity: (d: Density) => void;
}) {
  const [hoveredTheme, setHoveredTheme] = useState<FintrackTheme | null>(null);
  const [accentOverride, setAccentOverride] = useState(() => ls("nr-accent-override", ""));
  const isDevUser = useIsDevUser();
  const learnXP = isDevUser ? Infinity : getLearnXP();
  const previewId = hoveredTheme ?? theme;
  const previewSwatch = SWATCH_DATA.find(x => x.id === previewId)!;

  const unlockedSwatchIds = new Set<string>(["void", ...THEME_REWARDS.filter(r => learnXP >= r.requiredXP).map(r => r.id)]);
  const visibleSwatches = SWATCH_DATA.filter(s => unlockedSwatchIds.has(s.id));
  const lockedSwatches = SWATCH_DATA.filter(s => !unlockedSwatchIds.has(s.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Theme</div>
        <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))", gap: 12, background: "var(--ft-surface)" }}>
          {visibleSwatches.map(s => {
            const isActive = theme === s.id;
            const isHovered = hoveredTheme === s.id;
            const reward = THEME_REWARDS.find(r => r.id === s.id);
            const rarityColor = reward ? RARITY_COLOR[reward.rarity] : "var(--ft-dim)";
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
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: isActive ? s.accent : "var(--ft-muted)", display: "block" }}>{s.label}</span>
                  {reward && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", color: rarityColor, display: "block", marginTop: 1 }}>{reward.rarity}</span>
                  )}
                  {!reward && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ft-dim)", display: "block", marginTop: 1 }}>DEFAULT</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {lockedSwatches.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-surface)", display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={10} style={{ color: "var(--ft-dim)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
              {lockedSwatches.length} theme{lockedSwatches.length !== 1 ? "s" : ""} locked — earn XP in Learn to unlock
            </span>
          </div>
        )}
        {/* Live preview box — shows hovered swatch on hover, active theme otherwise */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)" }}>Preview</div>
            {hoveredTheme && hoveredTheme !== theme && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: previewSwatch.accent, letterSpacing: "0.06em" }}>{previewSwatch.label}</span>
            )}
          </div>
          {(() => {
            const s = previewSwatch;
            return (
              <div style={{ width: 200, height: 100, background: s.base, border: `1px solid ${s.accent}44`, overflow: "hidden", position: "relative", display: "inline-flex", flexDirection: "column", transition: "background 0.2s" }}>
                <div style={{ height: 22, background: s.surface, display: "flex", alignItems: "center", padding: "0 8px", gap: 6, borderBottom: `1px solid ${s.muted}44` }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: s.accent, letterSpacing: "0.1em" }}>NUMERIS</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: s.accent, display: "inline-block" }} />
                </div>
                <div style={{ flex: 1, padding: "6px 8px", display: "flex", gap: 8 }}>
                  <div style={{ width: 40, display: "flex", flexDirection: "column", gap: 4 }}>
                    {[0.7,0.5,0.4,0.3].map((o,i) => <div key={i} style={{ height: 6, background: s.muted, opacity: o, borderRadius: 1 }} />)}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ height: 8, background: s.text, opacity: 0.7, borderRadius: 1, width: "80%" }} />
                    <div style={{ height: 5, background: s.accent, borderRadius: 1, width: "45%" }} />
                    <div style={{ height: 5, background: s.muted, opacity: 0.4, borderRadius: 1, width: "65%" }} />
                    <div style={{ height: 5, background: s.muted, opacity: 0.3, borderRadius: 1, width: "50%" }} />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* XP Theme Rewards */}
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> XP Rewards</div>
        <div style={{ padding: "12px 16px", background: "var(--ft-surface)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", marginBottom: 10 }}>
            VOID is the default theme. Earn XP in <span style={{ color: "var(--ft-accent)" }}>Learn</span> to unlock more.
          </div>
          <ThemeRewardsPanel totalXP={learnXP} />
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Display Density</div>
        <div style={{ background: "var(--ft-surface)", padding: "12px 16px", display: "flex", gap: 8 }}>
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
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Custom Accent Colour</div>
        <div style={{ padding: "14px 16px", background: "var(--ft-surface)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 12, lineHeight: 1.6 }}>
            Override the accent colour for any theme. Persists across sessions.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
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
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: accentOverride ? "var(--ft-text)" : "var(--ft-dim)" }}>
              {accentOverride || "Theme default"}
            </span>
            {accentOverride && (
              <button onClick={() => {
                setAccentOverride("");
                localStorage.removeItem("nr-accent-override");
                document.documentElement.style.removeProperty("--ft-accent");
              }} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", background: "transparent", border: "1px solid var(--ft-border)", padding: "3px 10px", cursor: "pointer" }}>
                Reset
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ACCENT_PRESETS.map(c => (
              <button key={c} onClick={() => {
                setAccentOverride(c);
                lsSet("nr-accent-override", c);
                document.documentElement.style.setProperty("--ft-accent", c);
              }} aria-label={c} style={{ width: 24, height: 24, background: c, border: accentOverride === c ? "2px solid var(--ft-text)" : "1px solid var(--ft-border)", cursor: "pointer", padding: 0, flexShrink: 0 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnimationsPanel() {
  const [masterOn, setMasterOn] = useState(() => lsBool("nr-theme-effects-enabled", true));
  const [intensity, setIntensity] = useState(() => parseInt(ls("nr-animation-intensity", "50"), 10));
  const [transition, setTransition] = useState(() => ls("nr-theme-transition", "fade"));
  const [perTheme, setPerTheme] = useState<Record<string, boolean>>(() => {
    return SWATCH_DATA.reduce<Record<string,boolean>>((acc, s) => {
      acc[s.id] = lsBool(`nr-theme-effects-${s.id}`, true);
      return acc;
    }, {});
  });

  const setMaster = (v: boolean) => { setMasterOn(v); lsSet("nr-theme-effects-enabled", String(v)); };
  const setPerT = (id: string, v: boolean) => {
    setPerTheme(p => ({ ...p, [id]: v }));
    lsSet(`nr-theme-effects-${id}`, String(v));
  };
  const setIntensityVal = (v: number) => { setIntensity(v); lsSet("nr-animation-intensity", String(v)); };
  const setTransitionVal = (v: string) => { setTransition(v); lsSet("nr-theme-transition", v); };

  return (
    <div style={PANEL_STYLE}>
      <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Animations</div>
      <div style={ROW}>
        <RowLabel title="Theme effects" sub="Master switch — disables all ambient background animations" />
        <Toggle on={masterOn} onChange={setMaster} />
      </div>
      {masterOn && (
        <>
          <SectionHeader label="Per-theme effects" />
          {SWATCH_DATA.map(s => (
            <div key={s.id} style={ROW}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.accent, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)" }}>{s.label}</span>
              </div>
              <Toggle on={perTheme[s.id] ?? true} onChange={v => setPerT(s.id, v)} />
            </div>
          ))}
        </>
      )}
      <SectionHeader label="Intensity" />
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 46 }}>Minimal</span>
          <input type="range" min={0} max={100} value={intensity} onChange={e => setIntensityVal(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ft-accent)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 30, textAlign: "right" }}>Rich</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", width: 32, textAlign: "right" }}>{intensity}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 6 }}>Affects particle density and opacity. Some effects require a page refresh.</div>
      </div>
      <div style={ROW}>
        <RowLabel title="Theme transition" sub="Animation style when switching themes" />
        <select value={transition} onChange={e => setTransitionVal(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px" }}>
          <option value="instant">Instant</option>
          <option value="fade">Fade (200ms)</option>
          <option value="slide">Slide (300ms)</option>
        </select>
      </div>
    </div>
  );
}

function DisplayPanel() {
  const [dateFormat, setDateFormat] = useState(() => ls("nr-date-format", "DD/MM/YYYY"));
  const [numFormat, setNumFormat] = useState(() => ls("nr-number-format", "1,234.56"));
  const [weekStart, setWeekStart] = useState(() => ls("nr-week-start", "mon"));
  const [fontScale, setFontScale] = useState(() => parseInt(ls("nr-font-scale", "100"), 10));
  const [timeFormat, setTimeFormat] = useState(() => ls("nr-time-format", "24h"));
  const [compactNums, setCompactNums] = useState(() => lsBool("nr-compact-numbers", false));
  const [showCents, setShowCents] = useState(() => lsBool("nr-show-cents", true));

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Date &amp; Time</div>
        <SectionHeader label="Date format" />
        {(["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD","D MMM YYYY"] as const).map(fmt => (
          <label key={fmt} style={{ ...ROW, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="radio" name="date-format" checked={dateFormat === fmt} onChange={() => setDate(fmt)} style={{ accentColor: "var(--ft-accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)" }}>{fmt}</span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>{datePreviewMap[fmt]}</span>
          </label>
        ))}
        <SectionHeader label="Time format" />
        <div style={ROW}>
          <RowLabel title="Clock display" sub="Affects timestamps throughout the app" />
          <div style={{ display: "flex", gap: 6 }}>
            {[["24h","24h"],["12h","12h (AM/PM)"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setTime(val)} style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 12px", background: timeFormat === val ? "var(--ft-accent)" : "transparent", border: `1px solid ${timeFormat === val ? "var(--ft-accent)" : "var(--ft-border)"}`, color: timeFormat === val ? "var(--ft-base)" : "var(--ft-muted)", cursor: "pointer" }}>{lbl}</button>
            ))}
          </div>
        </div>
        <SectionHeader label="Calendar" />
        <div style={ROW}>
          <RowLabel title="First day of week" sub="Affects calendar and weekly views" />
          <div style={{ display: "flex", gap: 6 }}>
            {[["mon","Mon"],["sun","Sun"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setWeek(val)} style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 12px", background: weekStart === val ? "var(--ft-accent)" : "transparent", border: `1px solid ${weekStart === val ? "var(--ft-accent)" : "var(--ft-border)"}`, color: weekStart === val ? "var(--ft-base)" : "var(--ft-muted)", cursor: "pointer" }}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Numbers &amp; Currency</div>
        <SectionHeader label="Number format" />
        {(["1,234.56","1.234,56","1 234.56"] as const).map(fmt => (
          <label key={fmt} style={{ ...ROW, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="radio" name="num-format" checked={numFormat === fmt} onChange={() => setNum(fmt)} style={{ accentColor: "var(--ft-accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)" }}>{fmt}</span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>{numPreviewMap[fmt]}</span>
          </label>
        ))}
        <div style={ROW}>
          <RowLabel title="Compact large numbers" sub='Show £1.2K and £3.4M instead of full values' />
          <Toggle on={compactNums} onChange={setCompact} />
        </div>
        <div style={ROW}>
          <RowLabel title="Show pence / cents" sub='Display £12.50 instead of £12' />
          <Toggle on={showCents} onChange={setCents} />
        </div>
        <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
          Preview: <span style={{ color: "var(--ft-text)" }}>
            {compactNums ? "£1.2K" : showCents ? "£1,234.56" : "£1,234"}
          </span>
        </div>
      </div>

      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Typography</div>
        <SectionHeader label="Font scale" />
        <div style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 28 }}>85%</span>
            <input type="range" min={85} max={115} value={fontScale} onChange={e => setScale(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ft-accent)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 32 }}>115%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", width: 36, textAlign: "right" }}>{fontScale}%</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 6 }}>Scales all app text. Larger = more readable, smaller = denser layout.</div>
        </div>
      </div>
    </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Amount Privacy</div>
        <div style={ROW}>
          <RowLabel title="Blur sensitive amounts" sub='Amounts show as "£ ••••" until hovered. Useful in public places.' />
          <Toggle on={blurAmounts} onChange={setBlur} />
        </div>
        {blurAmounts && (
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 8 }}>Auto-blur delay after hover: <span style={{ color: "var(--ft-accent)" }}>{autoBlurDelay === 0 ? "Immediate" : `${autoBlurDelay}s`}</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>0s</span>
              <input type="range" min={0} max={30} value={autoBlurDelay} onChange={e => setDelay(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ft-accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>30s</span>
            </div>
          </div>
        )}
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Data Masking</div>
        <div style={ROW}>
          <RowLabel title="Transaction description masking" sub="Controls how merchant names and descriptions appear" />
          <select value={maskMode} onChange={e => setMask(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px" }}>
            <option value="none">None — show full text</option>
            <option value="partial">Partial — show last 4 chars</option>
            <option value="full">Full blur — hover to reveal</option>
          </select>
        </div>
        <div style={ROW}>
          <RowLabel title="Hide amounts when printing" sub="Blurs all financial figures in print / PDF export" />
          <Toggle on={hideFromPrint} onChange={setPrint} />
        </div>
        <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
          All privacy settings apply instantly across the app.
        </div>
      </div>
    </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Dashboard</div>
        <div style={ROW}>
          <RowLabel title="Default landing page" sub="Navigate here when opening the app" />
          <select value={defaultPage} onChange={e => setPage(e.target.value)} style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px" }}>
            {pages.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
          </select>
        </div>
        <div style={ROW}>
          <RowLabel title="Sidebar collapsed by default" sub="Start with the sidebar in a collapsed state" />
          <Toggle on={sidebarCollapsed} onChange={setSidebar} />
        </div>
        <div style={ROW}>
          <RowLabel title="Show net worth in sidebar" sub="Display net worth strip in the sidebar footer" />
          <Toggle on={showNwStrip} onChange={setNwStrip} />
        </div>
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Navigation Visibility</div>
        <div style={{ padding: "8px 14px 4px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderBottom: "1px solid var(--ft-border)" }}>
          Toggle which pages appear in the sidebar. Hidden pages are still accessible via keyboard shortcuts and the command palette.
        </div>
        {navBySection.map(section => (
          <div key={section.label}>
            <SectionHeader label={section.label} />
            {section.items.map(item => (
              <div key={item.href} style={ROW}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: item.visible ? "var(--ft-text)" : "var(--ft-dim)" }}>{item.label}</span>
                <Toggle on={item.visible} onChange={v => toggleNavItem(item.href, v)} />
              </div>
            ))}
          </div>
        ))}
        <div style={{ padding: "8px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderTop: "1px solid var(--ft-border)" }}>
          Changes apply immediately. Use the sidebar ⚙ icon to reorder and pin items.
        </div>
      </div>
    </div>
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
      <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Custom Categories</div>
      <div style={{ padding: "10px 14px 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", borderBottom: "1px solid var(--ft-border)" }}>
        Add your own categories. They appear alongside built-in categories in Quick Add and auto-cat rules.
      </div>
      {customCats.length > 0 ? (
        <div style={{ padding: "8px 14px" }}>
          {customCats.map(cat => (
            <div key={cat} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--ft-border)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{cat}</span>
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
    toast({ title: "Onboarding reset. Reload the app." });
    setTimeout(() => window.location.reload(), 800);
  };

  const usage = getStorageUsage();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Feature Flags</div>
        <div style={ROW}>
          <RowLabel title="Beta features" sub='Shows a "BETA" badge on experimental pages' />
          <Toggle on={beta} onChange={setBetaVal} />
        </div>
        <div style={ROW}>
          <RowLabel title="Developer mode" sub="Shows raw data inspector panels (future use)" />
          <Toggle on={devMode} onChange={setDev} />
        </div>
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Maintenance</div>
        <div style={{ ...ROW, flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <RowLabel title="Clear app cache" sub="Removes all nr-* preference keys. Does not affect transactions or account data." />
          <ActionBtn label="Clear App Cache" variant="danger" onClick={handleClearCache} />
        </div>
        <div style={{ ...ROW, flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <RowLabel title="Reset onboarding" sub="Clears the onboarding completion flag and reloads the app." />
          <ActionBtn label="Reset Onboarding" variant="muted" onClick={handleResetOnboarding} />
        </div>
      </div>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Storage Usage</div>
        <div style={{ padding: "14px 16px", display: "flex", gap: 32 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>{usage.keyCount}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginTop: 4 }}>Keys (ft- + nr-)</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>
              {usage.sizeKb}<span style={{ fontSize: 12, color: "var(--ft-muted)", fontWeight: 400, marginLeft: 3 }}>KB</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginTop: 4 }}>Estimated size</div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>{usage.nrKeyCount}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginTop: 4 }}>App prefs (nr-)</div>
          </div>
        </div>
      </div>
    </div>
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

function AiSettingsPanel() {
  const [selected, setSelected] = useState<AiStyle>(getAiStyle);
  const [skinId, setSkinId] = useState<BotSkinId>(getBotSkin);
  const [previewPhase, setPreviewPhase] = useState<Phase>("idle");
  const [blinking, setBlinking] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const phaseIdxRef = useRef(0);
  const isDevUser = useIsDevUser();
  const learnXP = isDevUser ? Infinity : getLearnXP();

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

  const pick = useCallback((s: AiStyle) => {
    setSelected(s);
    setAiStylePref(s);
  }, []);

  const pickSkin = useCallback((id: BotSkinId) => {
    setBotSkin(id);
    setSkinId(id);
    window.dispatchEvent(new CustomEvent("numeris-skin-change"));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Assistant Style</div>
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
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.5 }}>{s.desc}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4, letterSpacing: "0.05em" }}>{s.preview}</div>
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
        <div style={PANEL_STYLE}>
          <style>{`
            @keyframes wand-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
            @keyframes wand-sit-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
            @keyframes wand-dance{0%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-6px) rotate(-4deg)}50%{transform:translateY(-8px) rotate(0deg)}75%{transform:translateY(-6px) rotate(4deg)}100%{transform:translateY(0) rotate(0deg)}}
            @keyframes wand-complain{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
            @keyframes wand-jump{0%{transform:translateY(0)}45%{transform:translateY(-30px)}70%{transform:translateY(-3px)}100%{transform:translateY(0)}}
          `}</style>
          <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Bot Skin</div>

          {/* Live preview */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* Stage */}
            <div style={{ width: 86, height: 120, background: "var(--ft-base)", border: "1px solid var(--ft-border)", display: "flex", alignItems: "flex-end", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize: "16px 16px", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: 24, left: "8%", right: "8%", height: 1, background: "linear-gradient(90deg,transparent,var(--ft-border2),transparent)" }} />
              <div style={{
                width: previewPhase === "lying" ? 110 : 36,
                height: previewPhase === "lying" ? 57 : 66,
                flexShrink: 0,
                transform: previewPhase === "lying" ? "scale(0.62)" : "scale(1.4)",
                transformOrigin: "center bottom",
                marginBottom: 24,
                animation:
                  previewPhase === "sitting" ? "wand-sit-bob 3s ease-in-out infinite" :
                  previewPhase === "dancing" ? "wand-dance 0.52s ease-in-out infinite" :
                  previewPhase === "complaining" ? "wand-complain 0.3s ease-in-out infinite" :
                  previewPhase === "tired" || previewPhase === "lying" ? "none" :
                  previewPhase === "jumping" ? "wand-jump 0.75s cubic-bezier(0.36,0.07,0.19,0.97) infinite" :
                  "wand-bob 2.6s ease-in-out infinite",
              }}>
                <BotPreview skinId={skinId} phase={previewPhase} blinking={blinking} />
              </div>
            </div>

            {/* Phase controls */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--ft-dim)" }}>PHASE</span>
                <button
                  onClick={() => setAutoPlay(a => !a)}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", color: autoPlay ? "var(--ft-accent)" : "var(--ft-dim)", background: autoPlay ? "var(--ft-accent)15" : "transparent", border: `1px solid ${autoPlay ? "var(--ft-accent)44" : "var(--ft-border)"}`, padding: "2px 6px", cursor: "pointer" }}
                >
                  {autoPlay ? "AUTO ●" : "AUTO ○"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {WARDROBE_PHASES.map(p => (
                  <button
                    key={p}
                    onClick={() => { setAutoPlay(false); setPreviewPhase(p); }}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.05em", padding: "2px 5px", border: `1px solid ${previewPhase === p ? "var(--ft-accent)" : "var(--ft-border)"}`, background: previewPhase === p ? "var(--ft-accent)15" : "transparent", color: previewPhase === p ? "var(--ft-accent)" : "var(--ft-dim)", cursor: "pointer", textTransform: "uppercase" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {/* Active skin info */}
              {(() => {
                const skin = SKINS.find(s => s.id === skinId);
                if (!skin) return null;
                const RARITY_COLOR: Record<string, string> = { COMMON: "var(--ft-dim)", EPIC: "#a855f7", LEGENDARY: "var(--ft-amber, #f59e0b)" };
                return (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--ft-border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)" }}>{skin.label}</span>
                    {" "}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.1em", color: RARITY_COLOR[skin.rarity] }}>{skin.rarity}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          <div style={{ padding: "4px 0" }}>
            {SKINS.map((skin) => {
              const themeReq = skin.requiredTheme ? THEME_REWARDS.find(t => t.id === skin.requiredTheme) : null;
              const isOwned = !themeReq || learnXP >= themeReq.requiredXP;
              const isActive = skinId === skin.id;
              const rarityCol = RARITY_COLOR[skin.rarity] ?? "var(--ft-dim)";
              return (
                <div
                  key={skin.id}
                  onClick={() => isOwned && pickSkin(skin.id)}
                  style={{
                    ...ROW,
                    cursor: isOwned ? "pointer" : "not-allowed",
                    opacity: isOwned ? 1 : 0.5,
                    background: isActive && isOwned ? "var(--ft-raised)" : "transparent",
                    borderLeft: isActive && isOwned ? `2px solid ${rarityCol}` : "2px solid transparent",
                    paddingLeft: 12,
                    transition: "background 0.1s",
                    alignItems: "flex-start",
                    paddingTop: 10,
                    paddingBottom: 10,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: isActive && isOwned ? rarityCol : "var(--ft-text)" }}>
                        {skin.label}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.1em", color: rarityCol, opacity: 0.85 }}>
                        {skin.rarity}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.5, marginBottom: skin.perks.length > 0 ? 5 : 0 }}>{skin.desc}</div>
                    {skin.perks.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 6px" }}>
                        {skin.perks.map((perk) => (
                          <span key={perk} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: rarityCol, opacity: 0.7, letterSpacing: "0.04em" }}>· {perk}</span>
                        ))}
                      </div>
                    )}
                    {!isOwned && themeReq && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 5, letterSpacing: "0.04em" }}>
                        Requires {themeReq.requiredXP.toLocaleString()} XP to unlock
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 2 }}>
                    {!isOwned && <Lock style={{ width: 10, height: 10, color: "var(--ft-dim)" }}/>}
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%",
                      border: `1.5px solid ${isActive && isOwned ? rarityCol : "var(--ft-border2)"}`,
                      background: isActive && isOwned ? rarityCol : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isActive && isOwned && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-base)" }} />}
                    </div>
                  </div>
                </div>
              );
            })}
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
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["Page awareness", "Current page name sent with every message"],
              ["Financial context", "Responses tailored to the active section"],
              ["Powered by", "Google Gemini 2.0 Flash"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 0", borderBottom: "1px solid var(--ft-border)" }}>
                <span style={{ color: "var(--ft-muted)" }}>{label}</span>
                <span style={{ color: "var(--ft-text)" }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Status panel */}
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}>
          <span style={{ color: "var(--ft-accent)" }}>·</span> Wise Integration
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
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", letterSpacing: "0.06em" }}>
                CHECKING...
              </span>
            ) : !isConfigured ? (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                fontWeight: 700, color: "#F59E0B",
                border: "1px solid #F59E0B44", padding: "2px 8px",
                background: "#F59E0B11",
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
          <div style={{ ...ROW, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", fontWeight: 500 }}>
                Sync transactions
              </div>
              {lastSyncResult && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 3 }}>
                  Last sync: {lastSyncResult.synced} transactions ({lastSyncResult.added} new, {lastSyncResult.updated} updated)
                </div>
              )}
            </div>
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
            <span style={{ color: "var(--ft-accent)" }}>·</span> Linked Accounts
          </div>
          {wiseAccounts.length === 0 ? (
            <div style={{ padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", fontStyle: "italic" }}>
              No Wise accounts synced yet — click Sync Now to import
            </div>
          ) : (
            wiseAccounts.map(account => (
              <div key={account.id} style={ROW}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)", fontWeight: 500 }}>
                    {account.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginTop: 2 }}>
                    {account.lastSyncedAt
                      ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : "Never synced"}
                  </div>
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
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Crypto Wallets Panel ──────────────────────────────────────────────────────

const CRYPTO_WALLETS_KEY = "ft-crypto-wallets";
const CRYPTO_PRICES_KEY = "ft-crypto-prices";

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
  ETH: number;
  BTC: number;
}

const DEFAULT_CRYPTO_PRICES: CryptoPrices = { ETH: 2500, BTC: 60000 };

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
    if (!raw) return { ...DEFAULT_CRYPTO_PRICES };
    return { ...DEFAULT_CRYPTO_PRICES, ...JSON.parse(raw) } as CryptoPrices;
  } catch { return { ...DEFAULT_CRYPTO_PRICES }; }
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

  // Price override form
  const [priceEth, setPriceEth] = useState(String(prices.ETH));
  const [priceBtc, setPriceBtc] = useState(String(prices.BTC));

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

  const totalValueGbp = wallets.reduce((acc, w) => {
    if (w.balance == null) return acc;
    return acc + w.balance * (w.chain === "ETH" ? prices.ETH : prices.BTC);
  }, 0);

  const hasSynced = wallets.some(w => w.balance != null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header panel with wallet list and Sync All */}
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}>
          <span style={{ color: "var(--ft-accent)" }}>·</span> Crypto Wallets
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {hasSynced && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>
                Total ≈ £{totalValueGbp.toLocaleString("en-GB", { maximumFractionDigits: 2 })}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.06em" }}>LABEL</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={e => setFormLabel(e.target.value)}
                  placeholder="e.g. Main ETH wallet"
                  style={CRYPTO_INPUT_STYLE}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.06em" }}>CHAIN</label>
                <select
                  value={formChain}
                  onChange={e => setFormChain(e.target.value as "ETH" | "BTC")}
                  style={{ ...CRYPTO_INPUT_STYLE, cursor: "pointer" }}
                >
                  <option value="ETH">ETH — Ethereum</option>
                  <option value="BTC">BTC — Bitcoin</option>
                </select>
              </div>
              <button
                onClick={handleAddWallet}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--ft-base)", background: "var(--ft-accent)",
                  border: "none", padding: "6px 16px", cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Add
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.06em" }}>ADDRESS</label>
              <input
                type="text"
                value={formAddress}
                onChange={e => setFormAddress(e.target.value)}
                placeholder={formChain === "ETH" ? "0x..." : "bc1... or 1... or 3..."}
                style={CRYPTO_INPUT_STYLE}
                onKeyDown={e => { if (e.key === "Enter") handleAddWallet(); }}
              />
            </div>
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
            const valueGbp = wallet.balance != null
              ? wallet.balance * (wallet.chain === "ETH" ? prices.ETH : prices.BTC)
              : null;

            return (
              <div key={wallet.id} style={{ ...ROW, flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
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
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ft-text)" }}>
                      {wallet.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", wordBreak: "break-all", marginBottom: 2 }}>
                    {wallet.address}
                  </div>
                  {wallet.error ? (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-red)", marginTop: 2 }}>
                      ⚠ {wallet.error}
                    </div>
                  ) : wallet.balance != null ? (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-green)" }}>
                        {wallet.balance.toFixed(6)} {wallet.chain}
                      </span>
                      {valueGbp != null && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>
                          ≈ £{valueGbp.toLocaleString("en-GB", { maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  ) : null}
                  {wallet.lastSynced && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
                      Synced {new Date(wallet.lastSynced).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
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
          <span style={{ color: "var(--ft-accent)" }}>·</span> Price Rates (GBP)
        </div>
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
            Override the approximate GBP rate used to calculate fiat values. Stored in localStorage.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto 1fr auto", gap: 8, alignItems: "center" }}>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", whiteSpace: "nowrap" }}>1 ETH ≈ £</label>
            <input
              type="number"
              min={1}
              step={100}
              value={priceEth}
              onChange={e => setPriceEth(e.target.value)}
              style={{ ...CRYPTO_INPUT_STYLE, width: "100%" }}
            />
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", whiteSpace: "nowrap", paddingLeft: 8 }}>1 BTC ≈ £</label>
            <input
              type="number"
              min={1}
              step={1000}
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
        </div>
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useFintrackTheme();
  const [activePanel, setActivePanel] = useState<NavItem>("appearance");
  const [density, setDensityState] = useState<Density>(() => loadDensity());

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

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast({ title: "New passwords don't match", variant: "destructive" }); return; }
    setPwdSubmitting(true);
    try {
      const res = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
      if (res?.error) {
        toast({ title: "Could not change password", description: (res.error as { message?: string })?.message ?? String(res.error), variant: "destructive" });
      } else {
        toast({ title: "Password changed" });
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      }
    } catch (err: unknown) {
      toast({ title: "Could not change password", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setPwdSubmitting(false);
    }
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
      const res = await fetch("/api/export/backup");
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
  return (
    <div style={{ display: "flex", height: "calc(100vh - 48px)", overflow: "hidden" }}>
      {/* Left nav */}
      <div style={{ width: 220, flexShrink: 0, background: "var(--ft-surface)", borderRight: "1px solid var(--ft-border)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 14px 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          <span style={{ color: "var(--ft-accent)" }}>·</span> System Config
        </div>
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{ padding: "10px 14px 3px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 700 }}>
              {group.label}
            </div>
            {group.items.map(item => {
              const isActive = activePanel === item.id;
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

      {/* Right panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

        {activePanel === "appearance" && <AppearancePanel theme={theme} setTheme={setTheme} density={density} setDensity={handleSetDensity} />}

        {activePanel === "animations" && <AnimationsPanel />}

        {activePanel === "display" && <DisplayPanel />}

        {activePanel === "security" && (
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Change Password</div>
            <form onSubmit={handleChangePassword} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, background: "var(--ft-surface)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>Current password</Label>
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>New password (min 8 characters)</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8} required />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>Confirm new password</Label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required />
              </div>
              <button type="submit" disabled={pwdSubmitting} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", background: "transparent", border: "1px solid var(--ft-accent)", padding: "7px 18px", cursor: pwdSubmitting ? "not-allowed" : "pointer", opacity: pwdSubmitting ? 0.5 : 1, alignSelf: "flex-start" }}>
                {pwdSubmitting ? "Changing…" : "> Change Password"}
              </button>
            </form>
          </div>
        )}

        {activePanel === "privacy" && <PrivacyPanel />}

        {activePanel === "profile" && <ProfilePanel />}

        {activePanel === "currency" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Base Currency</div>
              <div style={{ padding: "14px 16px", background: "var(--ft-surface)", display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>All amounts will be converted to this currency for display.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 180 }}>
                  <Label className="text-xs" style={{ color: "var(--ft-muted)" }}>Currency</Label>
                  <Select value={currencySettings?.baseCurrency ?? "GBP"} onValueChange={handleCurrencyChange} disabled={updateCurrency.isPending}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{SUPPORTED_CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Manual FX Rate Overrides</div>
              <div style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 12 }}>Override live FX rates for multi-currency transaction conversion. Leave blank to use live rates.</p>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--ft-raised)" }}>
                      {["Pair",`Rate (per 1 ${currencySettings?.baseCurrency ?? "GBP"})`].map(h => <th key={h} style={{ padding: "5px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 600, borderBottom: "1px solid var(--ft-border)" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {COMMON_FX_PAIRS.filter(pair => pair !== baseCur).map(pair => (
                      <tr key={pair} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                        <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", width: 90 }}>{baseCur}/{pair}</td>
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
                <ActionBtn label="Reset to Live Rates" variant="muted" onClick={handleFxReset} />
              </div>
            </div>
          </div>
        )}

        {activePanel === "alerts" && (
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Alert Rules</div>
            <div style={ROW}>
              <RowLabel title="Enable smart alerts" sub="Threshold-based notifications on the dashboard" />
              <Toggle on={alertRules.enabled} onChange={v => setAlertRules(p => ({ ...p, enabled: v }))} />
            </div>
            <SectionHeader label="Transaction Alerts" />
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <RowLabel title="Large transaction threshold" sub="Alert when a single transaction exceeds this amount" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>£</span>
                <Input type="number" min={0} value={alertRules.largeTxThreshold} onChange={e => setAlertRules(p => ({ ...p, largeTxThreshold: Number(e.target.value) }))} style={{ width: 100, fontFamily: "var(--font-mono)", fontSize: 11 }} />
              </div>
            </div>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <RowLabel title="Category spike alert" sub="Alert when a category is X% above last month" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <Input type="number" min={1} max={500} value={alertRules.categorySpikeAlertPct} onChange={e => setAlertRules(p => ({ ...p, categorySpikeAlertPct: Number(e.target.value) }))} style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>% above last month</span>
              </div>
            </div>
            <SectionHeader label="Budget Alerts" />
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <RowLabel title="Budget warning threshold" sub="Show warning when budget used above this %" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <Input type="number" min={1} max={100} value={alertRules.budgetWarningPct} onChange={e => setAlertRules(p => ({ ...p, budgetWarningPct: Math.min(100, Math.max(1, Number(e.target.value))) }))} style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>%</span>
              </div>
            </div>
            <div style={ROW}>
              <RowLabel title="Overspend warning" sub="Warn when you've exceeded a budget category" />
              <Toggle on={alertRules.budgetHardStop} onChange={v => setAlertRules(p => ({ ...p, budgetHardStop: v }))} />
            </div>
            <SectionHeader label="Goal Alerts" />
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <RowLabel title="Months behind alert" sub="Alert when X months behind on a savings goal" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <Input type="number" min={1} max={24} value={alertRules.goalBehindMonths} onChange={e => setAlertRules(p => ({ ...p, goalBehindMonths: Math.max(1, Number(e.target.value)) }))} style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>months</span>
              </div>
            </div>
            <SectionHeader label="Bill Reminders" />
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <RowLabel title="Bill reminder days" sub="Remind X days before a bill is due" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <Input type="number" min={0} max={30} value={alertRules.billReminderDays} onChange={e => setAlertRules(p => ({ ...p, billReminderDays: Math.max(0, Number(e.target.value)) }))} style={{ width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>days before</span>
              </div>
            </div>
            <SectionHeader label="Goals" />
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ft-border)" }}>
              <RowLabel title="SAVINGS RATE TARGET" sub="Your monthly income % goal to save/invest" />
              <SavingsRateTargetInput />
            </div>
            <div style={{ padding: "12px 14px" }}>
              <ActionBtn label="Save Alert Rules" onClick={handleSaveAlertRules} />
            </div>
          </div>
        )}

        {activePanel === "rules" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Auto-Categorization Rules</div>
            <div style={{ padding: "12px 14px" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", marginBottom: 14 }}>When a transaction description contains the keyword, the category is auto-filled.</p>
              {catRules.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                  <thead>
                    <tr style={{ background: "var(--ft-raised)" }}>
                      {["Keyword","","Category",""].map((h,i) => <th key={i} style={{ padding: "5px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 600, borderBottom: "1px solid var(--ft-border)" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {catRules.map(rule => (
                      <tr key={rule.id} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                        <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{rule.contains}</td>
                        <td style={{ padding: "7px 4px", color: "var(--ft-dim)", fontSize: 11, textAlign: "center" }}>→</td>
                        <td style={{ padding: "7px 10px" }}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "var(--ft-raised)", color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>{rule.category}</span></td>
                        <td style={{ padding: "4px 10px", textAlign: "right" }}>
                          <button onClick={() => handleDeleteCatRule(rule.id)} style={{ background: "none", border: "none", color: "var(--ft-red)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, padding: "2px 4px" }} aria-label={`Delete rule for ${rule.contains}`}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", marginBottom: 16, fontStyle: "italic" }}>No rules yet. Add one below.</div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
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
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 12, letterSpacing: "0.04em" }}>Rules apply when adding transactions and during CSV import.</div>
            </div>
          </div>
          <CustomCategoriesPanel />
          </div>
        )}

        {activePanel === "dashboard" && <DashboardPanel />}

        {activePanel === "tx-defaults" && <TransactionDefaultsPanel />}

        {activePanel === "widgets" && (
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Dashboard Widgets</div>
            <div style={{ padding: "0" }}>
              {WIDGET_REGISTRY.map(w => (
                <div key={w.id} style={ROW}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ft-text)", marginBottom: 2 }}>
                      {w.label}
                      <span style={{ marginLeft: 8, fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
                        {w.defaultSpan === "full" ? "FULL WIDTH" : "HALF"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ft-muted)" }}>{w.description}</div>
                  </div>
                  <Toggle on={isEnabled(w.id)} onChange={() => toggle(w.id)} />
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 14px", background: "var(--ft-raised)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}>
              Enabled widgets appear on the Dashboard page. Changes save automatically.
            </div>
          </div>
        )}

        {activePanel === "data" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Export</div>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", marginBottom: 10 }}>Download all app data as a JSON file. Includes all local state stored by this app.</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <ActionBtn label="Export All Data" onClick={handleExportBackup} />
                  <ActionBtn label="Export with Session Data" variant="muted" onClick={handleExportData} />
                </div>
              </div>
            </div>
            <div style={PANEL_STYLE}>
              <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Reset</div>
              <div style={{ padding: "4px 0" }}>
                {([
                  { label: "Clear Net Worth History", description: "Removes all saved net worth snapshots", key: "ft-nw-history", confirm: "Clear all net worth history? This cannot be undone.", storage: "local" as const },
                  { label: "Reset Budget Targets", description: "Removes all configured budget categories", key: "ft-budgets", confirm: "Reset all budget targets?", storage: "local" as const },
                  { label: "Reset Savings Goals", description: "Removes all savings goal progress", key: "ft-goals", confirm: "Reset all savings goals?", storage: "local" as const },
                  { label: "Reset Widget Layout", description: "Restores the dashboard to its default widget arrangement", key: "ft-widgets", confirm: "Reset widget layout to defaults?", storage: "local" as const },
                  { label: "Clear Dismissed Alerts", description: "Resets which alerts have been dismissed this session", key: "ft-dismissed-alerts", confirm: "", storage: "session" as const },
                ] as const).map(item => (
                  <div key={item.key} style={{ ...ROW, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)", marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>{item.description}</div>
                    </div>
                    <button onClick={() => handleReset(item.key, item.confirm, item.storage)} style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--ft-red)", background: "transparent", border: "1px solid var(--ft-red)", padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>Reset</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activePanel === "advanced" && <AdvancedPanel toast={toast} />}

        {activePanel === "wise" && <WiseIntegrationPanel />}

        {activePanel === "crypto-wallets" && <CryptoWalletsPanel />}

        {activePanel === "ai" && <AiSettingsPanel />}

        {activePanel === "shortcuts" && (
          <div style={PANEL_STYLE}>
            <div style={HEADER_STYLE}><span style={{ color: "var(--ft-accent)" }}>·</span> Keyboard Shortcuts</div>
            <div style={{ background: "var(--ft-surface)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--ft-raised)" }}>
                    {["Shortcut","Action"].map(h => <th key={h} style={{ padding: "6px 12px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", fontWeight: 600, borderBottom: "1px solid var(--ft-border)" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SHORTCUTS.map(([key, action]) => (
                    <tr key={key} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                      <td style={{ padding: "7px 12px", width: 120 }}>
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

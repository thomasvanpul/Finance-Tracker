import { useState, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadPersonaIds } from "@/lib/persona";
import {
  useListInvestments,
  useGetMarketQuotes,
  getGetMarketQuotesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { FileText, Plus, Trash2, Download, Info, Clock, CalendarDays, ShieldCheck } from "lucide-react";
import { FtDropdown } from "@/components/ft-dropdown";
import type { FtDropdownOption } from "@/components/ft-dropdown";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Disposal {
  id: string;
  assetName: string;
  ticker?: string;
  acquiredDate: string;
  disposedDate: string;
  proceeds: number;
  costBasis: number;
  gainLoss: number;
}

interface ShelterContrib {
  taxYear: string;
  amount: number;
  provider?: string;
}

interface DisposalForm {
  assetName: string;
  ticker: string;
  acquiredDate: string;
  disposedDate: string;
  proceeds: string;
  costBasis: string;
}

interface ShelterForm {
  taxYear: string;
  amount: string;
  provider: string;
}

// ── Country config ─────────────────────────────────────────────────────────────

type CountryCode = "uk" | "us" | "au" | "ca" | "de" | "my" | "sg" | "in" | "generic";
type YearFmt = "uk" | "cal" | "au" | "ind";

interface CountryConfig {
  name: string;
  code: string;
  sym: string;
  noCgt?: boolean;
  cgtNote?: string;
  cgtAllowance: number;
  cgtRateLow: number;
  cgtRateHigh: number;
  cgtRateLowLabel: string;
  cgtRateHighLabel: string;
  shelterName: string;
  shelterLimit: number;
  shelterNote?: string;
  dividendAllowance?: number;
  dividendNote?: string;
  yearFmt: YearFmt;
  incomeBands: Array<{ label: string; range: string; rate: string; color: string }>;
}

const COUNTRIES: Record<CountryCode, CountryConfig> = {
  uk: {
    name: "United Kingdom", code: "UK", sym: "£",
    cgtAllowance: 3000, cgtRateLow: 0.18, cgtRateHigh: 0.24,
    cgtRateLowLabel: "18% Basic Rate", cgtRateHighLabel: "24% Higher Rate",
    shelterName: "ISA", shelterLimit: 20000,
    shelterNote: "Cash · Stocks & Shares · Lifetime · Innovative Finance ISA",
    dividendAllowance: 500, dividendNote: "Excess dividends taxed at 8.75%/33.75%/39.35%",
    yearFmt: "uk",
    incomeBands: [
      { label: "Personal Allowance", range: "Up to £12,570", rate: "0%", color: "var(--ft-green)" },
      { label: "Basic Rate", range: "£12,571–£50,270", rate: "20%", color: "var(--ft-blue)" },
      { label: "Higher Rate", range: "£50,271–£125,140", rate: "40%", color: "var(--ft-amber)" },
      { label: "Additional Rate", range: "Over £125,140", rate: "45%", color: "var(--ft-red)" },
    ],
  },
  us: {
    name: "United States", code: "US", sym: "$",
    cgtAllowance: 0, cgtRateLow: 0.15, cgtRateHigh: 0.20,
    cgtRateLowLabel: "15% Long-Term (most filers)", cgtRateHighLabel: "20% Long-Term (high income)",
    cgtNote: "Long-term gains (held >12mo) taxed at 0%/15%/20%. Short-term gains taxed as ordinary income.",
    shelterName: "IRA", shelterLimit: 7000,
    shelterNote: "Traditional or Roth IRA (2024). 401(k) limit: $23,000 separately.",
    dividendNote: "Qualified dividends taxed at long-term CGT rates (0%/15%/20%)",
    yearFmt: "cal",
    incomeBands: [
      { label: "10%", range: "$0–$11,600", rate: "10%", color: "var(--ft-green)" },
      { label: "12%", range: "$11,601–$47,150", rate: "12%", color: "var(--ft-blue)" },
      { label: "22%", range: "$47,151–$100,525", rate: "22%", color: "var(--ft-blue)" },
      { label: "24%", range: "$100,526–$191,950", rate: "24%", color: "var(--ft-amber)" },
      { label: "32–37%", range: "Over $191,950", rate: "32–37%", color: "var(--ft-red)" },
    ],
  },
  au: {
    name: "Australia", code: "AU", sym: "A$",
    cgtAllowance: 0, cgtRateLow: 0, cgtRateHigh: 0.45,
    cgtRateLowLabel: "~0–22.5% (50% discount >12mo)", cgtRateHighLabel: "Up to 45% marginal",
    cgtNote: "Assets held >12 months qualify for 50% CGT discount. No fixed annual allowance.",
    shelterName: "Super", shelterLimit: 27500,
    shelterNote: "Concessional (pre-tax) super contributions. Non-concessional limit: A$110,000.",
    dividendNote: "Dividend imputation (franking credits) may reduce or eliminate tax on dividends.",
    yearFmt: "au",
    incomeBands: [
      { label: "Tax-Free", range: "Up to A$18,200", rate: "0%", color: "var(--ft-green)" },
      { label: "19c per $1", range: "A$18,201–A$45,000", rate: "19%", color: "var(--ft-blue)" },
      { label: "32.5c per $1", range: "A$45,001–A$120,000", rate: "32.5%", color: "var(--ft-blue)" },
      { label: "37c per $1", range: "A$120,001–A$180,000", rate: "37%", color: "var(--ft-amber)" },
      { label: "45c per $1", range: "Over A$180,000", rate: "45%", color: "var(--ft-red)" },
    ],
  },
  ca: {
    name: "Canada", code: "CA", sym: "C$",
    cgtAllowance: 0, cgtRateLow: 0.125, cgtRateHigh: 0.165,
    cgtRateLowLabel: "~12.5% effective (50% inclusion, basic rate)", cgtRateHighLabel: "~16.5% effective (higher income)",
    cgtNote: "50% of capital gains (inclusion rate) added to taxable income at marginal rate.",
    shelterName: "TFSA", shelterLimit: 7000,
    shelterNote: "2024 TFSA limit. Cumulative room available if you've never contributed.",
    dividendNote: "Enhanced dividend tax credit available for eligible dividends from Canadian companies.",
    yearFmt: "cal",
    incomeBands: [
      { label: "Federal 15%", range: "Up to C$55,867", rate: "15%", color: "var(--ft-green)" },
      { label: "Federal 20.5%", range: "C$55,868–C$111,733", rate: "20.5%", color: "var(--ft-blue)" },
      { label: "Federal 26%", range: "C$111,734–C$154,906", rate: "26%", color: "var(--ft-amber)" },
      { label: "Federal 29%", range: "C$154,907–C$220,000", rate: "29%", color: "var(--ft-amber)" },
      { label: "Federal 33%", range: "Over C$220,000", rate: "33%", color: "var(--ft-red)" },
    ],
  },
  de: {
    name: "Germany", code: "DE", sym: "€",
    cgtAllowance: 1000, cgtRateLow: 0.25, cgtRateHigh: 0.25,
    cgtRateLowLabel: "25% Abgeltungsteuer", cgtRateHighLabel: "25% + 5.5% Solidaritätszuschlag",
    cgtNote: "Flat 25% withholding tax on capital gains and dividends. Sparerpauschbetrag: €1,000/yr (combined gains + dividends).",
    shelterName: "Riester/Rürup", shelterLimit: 2100,
    shelterNote: "Riester max €2,100/yr with state subsidy. Rürup up to €27,566 (2024) deductible.",
    dividendNote: "Dividends covered by Sparerpauschbetrag (€1,000). Excess taxed at 25%.",
    dividendAllowance: 1000,
    yearFmt: "cal",
    incomeBands: [
      { label: "Grundfreibetrag", range: "Up to €11,604", rate: "0%", color: "var(--ft-green)" },
      { label: "Progressive", range: "€11,605–€17,005", rate: "14–24%", color: "var(--ft-blue)" },
      { label: "Progressive", range: "€17,006–€66,760", rate: "24–42%", color: "var(--ft-amber)" },
      { label: "Reichensteuer", range: "Over €277,826", rate: "45%", color: "var(--ft-red)" },
    ],
  },
  my: {
    name: "Malaysia", code: "MY", sym: "RM",
    noCgt: true, cgtAllowance: 0, cgtRateLow: 0, cgtRateHigh: 0,
    cgtRateLowLabel: "N/A", cgtRateHighLabel: "N/A",
    cgtNote: "No general CGT on shares or most investments. Real Property Gains Tax (RPGT) applies to property disposals: 30% (0–3 yrs), 20% (4 yrs), 15% (5 yrs), 0% (after 5 yrs for individuals).",
    shelterName: "EPF", shelterLimit: 60000,
    shelterNote: "Voluntary EPF contributions. Self-contribution tax relief up to RM3,000/yr.",
    dividendNote: "Single-tier dividends are tax-exempt at shareholder level.",
    yearFmt: "cal",
    incomeBands: [
      { label: "Tax-Free", range: "Up to RM5,000", rate: "0%", color: "var(--ft-green)" },
      { label: "1%", range: "RM5,001–RM20,000", rate: "1%", color: "var(--ft-blue)" },
      { label: "3–8%", range: "RM20,001–RM70,000", rate: "3–8%", color: "var(--ft-blue)" },
      { label: "13–24%", range: "RM70,001–RM250,000", rate: "13–24%", color: "var(--ft-amber)" },
      { label: "25–30%", range: "Over RM250,000", rate: "25–30%", color: "var(--ft-red)" },
    ],
  },
  sg: {
    name: "Singapore", code: "SG", sym: "S$",
    noCgt: true, cgtAllowance: 0, cgtRateLow: 0, cgtRateHigh: 0,
    cgtRateLowLabel: "N/A", cgtRateHighLabel: "N/A",
    cgtNote: "No capital gains tax. Gains from sale of shares, bonds, and most investments are generally not taxable.",
    shelterName: "SRS", shelterLimit: 15300,
    shelterNote: "Supplementary Retirement Scheme: S$15,300 for citizens/PR, S$35,700 for foreigners.",
    dividendNote: "Dividends from Singapore companies are exempt from personal tax (one-tier system).",
    yearFmt: "cal",
    incomeBands: [
      { label: "Tax-Free", range: "Up to S$20,000", rate: "0%", color: "var(--ft-green)" },
      { label: "2%", range: "S$20,001–S$30,000", rate: "2%", color: "var(--ft-blue)" },
      { label: "3.5–7%", range: "S$30,001–S$80,000", rate: "3.5–7%", color: "var(--ft-blue)" },
      { label: "11.5–22%", range: "S$80,001–S$500,000", rate: "11.5–22%", color: "var(--ft-amber)" },
      { label: "24%", range: "Over S$1,000,000", rate: "24%", color: "var(--ft-red)" },
    ],
  },
  in: {
    name: "India", code: "IN", sym: "₹",
    cgtAllowance: 125000, cgtRateLow: 0.125, cgtRateHigh: 0.20,
    cgtRateLowLabel: "12.5% LTCG (listed securities >12mo)", cgtRateHighLabel: "20% STCG (listed <12mo)",
    cgtNote: "Listed equity LTCG: 12.5% on gains above ₹1.25L per year. STCG: 20%. Debt funds taxed as income.",
    shelterName: "PPF/ELSS", shelterLimit: 150000,
    shelterNote: "Section 80C: PPF, ELSS, NSC etc. up to ₹1.5L total deduction.",
    dividendNote: "Dividends added to taxable income at marginal slab rates.",
    yearFmt: "ind",
    incomeBands: [
      { label: "Tax-Free", range: "Up to ₹3,00,000", rate: "0%", color: "var(--ft-green)" },
      { label: "5%", range: "₹3,00,001–₹7,00,000", rate: "5%", color: "var(--ft-blue)" },
      { label: "10%", range: "₹7,00,001–₹10,00,000", rate: "10%", color: "var(--ft-blue)" },
      { label: "15–20%", range: "₹10,00,001–₹15,00,000", rate: "15–20%", color: "var(--ft-amber)" },
      { label: "30%", range: "Over ₹15,00,000", rate: "30%", color: "var(--ft-red)" },
    ],
  },
  generic: {
    name: "Other / Generic", code: "—", sym: "$",
    cgtAllowance: 0, cgtRateLow: 0, cgtRateHigh: 0,
    cgtRateLowLabel: "—", cgtRateHighLabel: "—",
    cgtNote: "Enter your local CGT rules manually. This mode tracks gains and losses for your own records.",
    shelterName: "Tax Account", shelterLimit: 0,
    shelterNote: "Track contributions to any tax-advantaged account.",
    yearFmt: "cal",
    incomeBands: [],
  },
};

// ── Tax year helpers ───────────────────────────────────────────────────────────

function getTaxYearLabel(date: Date, fmt: YearFmt): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (fmt === "uk") {
    if (m > 4 || (m === 4 && d >= 6)) return `${y}/${String(y + 1).slice(2)}`;
    return `${y - 1}/${String(y).slice(2)}`;
  }
  if (fmt === "au") {
    if (m >= 7) return `${y}-${String(y + 1).slice(2)}`;
    return `${y - 1}-${String(y).slice(2)}`;
  }
  if (fmt === "ind") {
    if (m >= 4) return `${y}-${String(y + 1).slice(2)}`;
    return `${y - 1}-${String(y).slice(2)}`;
  }
  return String(y);
}

function getYearBounds(label: string, fmt: YearFmt): [Date, Date] {
  if (fmt === "uk") {
    const s = parseInt(label.slice(0, 4), 10);
    return [new Date(s, 3, 6), new Date(s + 1, 3, 5, 23, 59, 59)];
  }
  if (fmt === "au") {
    const s = parseInt(label.slice(0, 4), 10);
    return [new Date(s, 6, 1), new Date(s + 1, 5, 30, 23, 59, 59)];
  }
  if (fmt === "ind") {
    const s = parseInt(label.slice(0, 4), 10);
    return [new Date(s, 3, 1), new Date(s + 1, 2, 31, 23, 59, 59)];
  }
  const y = parseInt(label, 10);
  return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59)];
}

function getAvailableYears(fmt: YearFmt): string[] {
  const current = getTaxYearLabel(new Date(), fmt);
  const years: string[] = [current];
  const now = new Date();
  for (let i = 1; i < 5; i++) {
    const prev = new Date(now.getFullYear() - i, now.getMonth(), now.getDate());
    years.push(getTaxYearLabel(prev, fmt));
  }
  return [...new Set(years)];
}

function isInYear(dateStr: string, label: string, fmt: YearFmt): boolean {
  const d = new Date(dateStr);
  const [start, end] = getYearBounds(label, fmt);
  return d >= start && d <= end;
}

// ── Storage helpers ────────────────────────────────────────────────────────────

const LS_DISPOSALS = "ft-tax-disposals";
const LS_SHELTER = "ft-isa-contributions";
const LS_COUNTRY = "nr-tax-country";

function loadDisposals(): Disposal[] {
  try {
    const r = localStorage.getItem(LS_DISPOSALS);
    if (!r) return [];
    const parsed = JSON.parse(r) as Array<Record<string, unknown>>;
    return parsed.map(d => ({
      ...d,
      proceeds: (d.proceeds ?? d.proceedsGbp ?? 0) as number,
      costBasis: (d.costBasis ?? d.costBasisGbp ?? 0) as number,
    })) as Disposal[];
  } catch { return []; }
}

function saveDisposals(d: Disposal[]): void {
  try { localStorage.setItem(LS_DISPOSALS, JSON.stringify(d)); } catch { /* noop */ }
}

function loadShelter(): ShelterContrib[] {
  try {
    const r = localStorage.getItem(LS_SHELTER);
    return r ? (JSON.parse(r) as ShelterContrib[]) : [];
  } catch { return []; }
}

function saveShelter(c: ShelterContrib[]): void {
  try { localStorage.setItem(LS_SHELTER, JSON.stringify(c)); } catch { /* noop */ }
}

function fmt(v: number, sym: string): string {
  return `${v < 0 ? "-" : ""}${sym}${Math.abs(v).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Module-level style constants ───────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--ft-dim)",
  background: "var(--ft-surface)",
  borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  whiteSpace: "nowrap",
};

// ── Shared UI primitives ───────────────────────────────────────────────────────

function SectionHeader({ label, color = "var(--ft-blue)" }: { label: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "7px 12px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)", borderLeft: `3px solid ${color}` }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {label}
      </span>
    </div>
  );
}

function MetricTile({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ padding: "10px 14px", background: "var(--ft-surface)", minWidth: 0 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 5 }}>{label}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── MetricTileGroup wraps tiles with border-as-gap layout ─────────────────────

function MetricTileGroup({ cols, children }: { cols: number; children: React.ReactNode }) {
  const colClass = cols === 4 ? "ft-four-col" : cols === 3 ? "ft-three-col" : "ft-two-col";
  return (
    <div className={colClass} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 1, background: "var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
      {children}
    </div>
  );
}

// ── HoverRow for interactive list rows ────────────────────────────────────────

function TaxHoverRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      onTouchCancel={() => setHovered(false)}
      style={{
        background: hovered ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "var(--ft-base)",
        transition: "background 0.1s ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── UK Income Tax computation (shared) ────────────────────────────────────────

function computeUkIncomeTax(grossSalary: number) {
  const PA = 12_570;
  const BRU = 50_270;
  const HRU = 125_140;
  const NI_LPT = 12_570;
  const NI_UEL = 50_270;

  const effPA = grossSalary > 100_000 ? Math.max(0, PA - Math.floor((grossSalary - 100_000) / 2)) : PA;
  const adjBRU = BRU - (PA - effPA);

  const basicTax = Math.max(0, Math.min(grossSalary, adjBRU) - effPA) * 0.20;
  const higherTax = Math.max(0, Math.min(grossSalary, HRU) - adjBRU) * 0.40;
  const additionalTax = Math.max(0, grossSalary - HRU) * 0.45;
  const totalIncomeTax = basicTax + higherTax + additionalTax;

  const niMain = Math.max(0, Math.min(grossSalary, NI_UEL) - NI_LPT) * 0.08;
  const niUpper = Math.max(0, grossSalary - NI_UEL) * 0.02;
  const totalNI = niMain + niUpper;

  const totalDeductions = totalIncomeTax + totalNI;
  const netPay = grossSalary - totalDeductions;
  const effectiveRate = grossSalary > 0 ? (totalDeductions / grossSalary) * 100 : 0;

  const bands = [
    { label: "Personal Allowance", amount: Math.min(grossSalary, effPA), rate: "0%", color: "var(--ft-green)" },
    { label: "Basic Rate (20%)", amount: Math.max(0, Math.min(grossSalary, adjBRU) - effPA), rate: "20%", color: "var(--ft-blue)" },
    { label: "Higher Rate (40%)", amount: Math.max(0, Math.min(grossSalary, HRU) - adjBRU), rate: "40%", color: "var(--ft-amber)" },
    { label: "Additional Rate (45%)", amount: Math.max(0, grossSalary - HRU), rate: "45%", color: "var(--ft-red)" },
  ].filter(b => b.amount > 0);

  return { totalIncomeTax, totalNI, totalDeductions, netPay, effectiveRate, effPA, adjBRU, bands };
}

interface QuoteLike { ticker: string; price: number; currency: string; dividendYield?: number | null; }

// ── Band bar segment (module-level sub-component) ─────────────────────────────

interface BandSegment {
  label: string;
  amount: number;
  rate: string;
  color: string;
}

function IncomeBandBar({ b, grossSalary, sym: bandSym }: { b: BandSegment; grossSalary: number; sym: string }) {
  const pct = (b.amount / grossSalary) * 100;
  const opacity = b.rate === "0%" ? 0.35 : b.rate === "20%" ? 0.7 : b.rate === "40%" ? 0.85 : 1;
  return (
    <div
      title={`${b.label}: ${fmt(b.amount, bandSym)} (${pct.toFixed(0)}%)`}
      style={{
        width: `${pct}%`,
        background: b.color,
        opacity,
        transition: "none",
        flexShrink: 0,
      }}
    />
  );
}

function IncomeBandLegendItem({ b, grossSalary, sym: legendSym }: { b: BandSegment; grossSalary: number; sym: string }) {
  const pct = (b.amount / grossSalary) * 100;
  const opacity = b.rate === "0%" ? 0.35 : b.rate === "20%" ? 0.7 : b.rate === "40%" ? 0.85 : 1;
  return (
    <HStack gap={5} align="center">
      <div style={{ width: 10, height: 10, background: b.color, opacity, flexShrink: 0 }} />
      <Text as="span" mono size={9} color="var(--ft-dim)">
        {b.rate} · {fmt(b.amount, legendSym)} · {pct.toFixed(0)}%
      </Text>
    </HStack>
  );
}

// ── Disposal table row ────────────────────────────────────────────────────────

interface DisposalRowProps {
  d: Disposal;
  sym: string;
  deleteConfirmId: string | null;
  onDelete: (id: string) => void;
  holdingLabel: (d: Disposal) => { text: string; color: string };
}

function DisposalRow({ d, sym: disposalSym, deleteConfirmId, onDelete, holdingLabel }: DisposalRowProps) {
  const hl = holdingLabel(d);
  return (
    <TaxHoverRow style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--ft-border)", height: 36 }}>
      <div style={{ flex: 1, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontSize: 12, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, fontFamily: "var(--font-mono)" }}>{d.assetName}</div>
      <div style={{ width: 80, minWidth: 80, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-cyan)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.ticker ?? "—"}</div>
      <div style={{ width: 100, minWidth: 100, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>{d.acquiredDate}</div>
      <div style={{ width: 100, minWidth: 100, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-muted)", fontFamily: "var(--font-mono)" }}>{d.disposedDate}</div>
      <div style={{ width: 70, minWidth: 70, padding: "6px 8px", borderRight: "1px solid var(--ft-border)", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600, color: hl.color, textAlign: "center" }}>{hl.text}</div>
      <div className="pnum" style={{ width: 120, minWidth: 120, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-text)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.proceeds, disposalSym)}</div>
      <div className="pnum" style={{ width: 110, minWidth: 110, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-muted)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.costBasis, disposalSym)}</div>
      <div className="pnum" style={{ width: 120, minWidth: 120, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", fontSize: 13, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: d.gainLoss > 0 ? "var(--ft-green)" : d.gainLoss < 0 ? "var(--ft-red)" : "var(--ft-dim)", fontVariantNumeric: "tabular-nums" }}>{d.gainLoss > 0 ? "+" : ""}{d.gainLoss !== 0 ? fmt(d.gainLoss, disposalSym) : fmt(0, disposalSym)}</div>
      <div style={{ width: 56, minWidth: 56, padding: "4px 6px", display: "flex", justifyContent: "center" }}>
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => onDelete(d.id)}
          title={deleteConfirmId === d.id ? "Click again to confirm delete" : "Delete disposal"}
          style={deleteConfirmId === d.id ? { background: "var(--ft-red)", color: "#fff" } : undefined}
        >
          {deleteConfirmId === d.id
            ? <Text as="span" mono size={8} weight={700}>DEL?</Text>
            : <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />}
        </Button>
      </div>
    </TaxHoverRow>
  );
}

// ── Shelter contribution row ──────────────────────────────────────────────────

interface ShelterContribRowProps {
  c: ShelterContrib;
  i: number;
  isLast: boolean;
  sym: string;
  shelterName: string;
}

function ShelterContribRow({ c, i, isLast, sym: shelterSym, shelterName }: ShelterContribRowProps) {
  return (
    <TaxHoverRow style={{ display: "flex", alignItems: "center", padding: "8px 16px", gap: 16, borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
      <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>{c.provider ?? `${shelterName} Provider`}</div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--ft-blue)", fontVariantNumeric: "tabular-nums" }}>{fmt(c.amount, shelterSym)}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", width: 60, textAlign: "right" }}>{c.taxYear}</div>
    </TaxHoverRow>
  );
}

// ── Income band reference row ─────────────────────────────────────────────────

interface IncomeBandRowProps {
  b: { label: string; range: string; rate: string; color: string };
  isLast: boolean;
}

function IncomeBandRow({ b, isLast }: IncomeBandRowProps) {
  return (
    <TaxHoverRow style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", borderLeft: `3px solid ${b.color}` }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: b.color, width: 52, flexShrink: 0 }}>{b.rate}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", flex: 1 }}>{b.label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "right" }}>{b.range}</span>
    </TaxHoverRow>
  );
}

// ── Quick-add investment button ───────────────────────────────────────────────

interface QuickAddButtonProps {
  inv: { id: number; name: string; ticker: string };
  onClick: () => void;
}

function QuickAddButton({ inv, onClick }: QuickAddButtonProps) {
  return (
    <button
      key={inv.id}
      onClick={onClick}
      style={{
        padding: "2px 8px",
        borderRadius: 2,
        fontSize: 10,
        fontWeight: 700,
        background: "rgba(88,166,255,0.12)",
        color: "var(--ft-blue)",
        border: "1px solid rgba(88,166,255,0.25)",
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
      }}
    >
      {inv.ticker}
    </button>
  );
}

// ── UK Tax Year Progress ───────────────────────────────────────────────────────

function UkTaxYearProgress({ sym, grossSalary, shelterContribs, selectedYear }: {
  sym: string;
  grossSalary: number;
  shelterContribs: ShelterContrib[];
  selectedYear: string;
}) {
  const isMobile = useIsMobile();
  const now = new Date();
  const currentYear = getTaxYearLabel(now, "uk");
  const isCurrentYear = selectedYear === currentYear;

  const startYear = parseInt(selectedYear.slice(0, 4), 10);
  const taxStart = new Date(startYear, 3, 6);
  const taxEnd = new Date(startYear + 1, 3, 5, 23, 59, 59);

  const totalDays = Math.round((taxEnd.getTime() - taxStart.getTime()) / 86400000);
  const elapsed = isCurrentYear ? Math.min(totalDays, Math.round((now.getTime() - taxStart.getTime()) / 86400000)) : totalDays;
  const progressPct = (elapsed / totalDays) * 100;
  const remaining = Math.max(0, totalDays - elapsed);

  const saDeadline = new Date(startYear + 2, 0, 31);
  const daysToSA = Math.max(0, Math.round((saDeadline.getTime() - now.getTime()) / 86400000));
  const onlineSADeadline = new Date(startYear + 2, 0, 31);
  const paperSADeadline = new Date(startYear + 1, 9, 31);

  const yearISA = shelterContribs.filter(c => c.taxYear === selectedYear).reduce((s, c) => s + c.amount, 0);
  const estimatedIsaTaxSaved = yearISA * 0.18 * 0.10;

  const { totalIncomeTax, totalNI, netPay, effectiveRate, totalDeductions } = computeUkIncomeTax(grossSalary);
  const marginRate = grossSalary > 125_140 ? 45 : grossSalary > 50_270 ? 40 : 20;

  return (
    <div style={{ border: "1px solid var(--ft-border)" }}>
      <SectionHeader label={`UK TAX YEAR ${selectedYear} — OVERVIEW`} color="var(--ft-cyan)" />

      {/* Top KPI bar — border-as-gap grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
        gap: 1,
        background: "var(--ft-border)",
        borderBottom: "1px solid var(--ft-border)",
      }}>
        <div style={{ padding: "12px 16px", background: "var(--ft-surface)", borderTop: "2px solid var(--ft-amber)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
            Est. Income Tax
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-amber)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {fmt(totalIncomeTax, sym)}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            on <span className="pnum">{fmt(grossSalary, sym)}</span> gross
          </div>
        </div>
        <div style={{ padding: "12px 16px", background: "var(--ft-surface)", borderTop: `2px solid ${effectiveRate > 40 ? "var(--ft-red)" : effectiveRate > 25 ? "var(--ft-amber)" : "var(--ft-green)"}` }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
            Effective Rate
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: effectiveRate > 40 ? "var(--ft-red)" : effectiveRate > 25 ? "var(--ft-amber)" : "var(--ft-green)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {effectiveRate.toFixed(1)}%
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            marginal: {marginRate}%
          </div>
        </div>
        <div style={{ padding: "12px 16px", background: "var(--ft-surface)", borderTop: "2px solid var(--ft-green)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
            Take-Home Pay
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-green)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {fmt(netPay, sym)}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            <span className="pnum">{fmt(netPay / 12, sym)}</span>/mo
          </div>
        </div>
        <div style={{ padding: "12px 16px", background: "var(--ft-surface)", borderTop: "2px solid var(--ft-blue)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
            NI Contributions
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-blue)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {fmt(totalNI, sym)}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>
            total deductions: <span className="pnum">{fmt(totalDeductions, sym)}</span>
          </div>
        </div>
      </div>

      {/* UK Income Brackets Stacked Bar */}
      {grossSalary > 0 && (() => {
        const { bands } = computeUkIncomeTax(grossSalary);
        return (
          <div style={{ padding: "16px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 10 }}>
              Income Band Split — <span className="pnum">{fmt(grossSalary, sym)}</span> gross
            </div>
            <div style={{ height: 28, display: "flex", overflow: "hidden", border: "1px solid var(--ft-border2)", marginBottom: 8 }}>
              {bands.map(b => (
                <IncomeBandBar key={b.label} b={b} grossSalary={grossSalary} sym={sym} />
              ))}
            </div>
            <HStack gap={16} wrap>
              {bands.map(b => (
                <IncomeBandLegendItem key={b.label} b={b} grossSalary={grossSalary} sym={sym} />
              ))}
            </HStack>
          </div>
        );
      })()}

      {/* Tax year progress + deadlines */}
      <div style={{ display: "grid", gridTemplateColumns: (isMobile || !isCurrentYear) ? "1fr" : "1fr 1fr", borderBottom: "1px solid var(--ft-border)" }}>
        <div style={{ padding: "14px 16px", borderRight: (!isMobile && isCurrentYear) ? "1px solid var(--ft-border)" : "none", borderBottom: (isMobile && isCurrentYear) ? "1px solid var(--ft-border)" : "none" }}>
          <HStack gap={6} align="center" marginBottom={8}>
            <CalendarDays style={{ width: 12, height: 12, color: "var(--ft-dim)", flexShrink: 0 }} />
            <MonoLabel as="span" size={8} letterSpacing="0.1em">
              Tax Year Progress — 6 Apr {startYear} to 5 Apr {startYear + 1}
            </MonoLabel>
          </HStack>
          <HStack align="center" justify="between" marginBottom={6}>
            <Text as="span" mono size={10} color="var(--ft-muted)">
              Day {elapsed} of {totalDays}
            </Text>
            <Text as="span" mono size={11} weight={700} color={progressPct > 80 ? "var(--ft-amber)" : "var(--ft-text)"}>
              {progressPct.toFixed(0)}%
            </Text>
          </HStack>
          <div style={{ height: 8, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", overflow: "hidden", marginBottom: 6 }}>
            <div style={{
              height: "100%",
              width: `${progressPct}%`,
              background: progressPct > 90 ? "var(--ft-amber)" : "var(--ft-blue)",
              transition: "none",
            }} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
            {isCurrentYear
              ? remaining === 0 ? "Tax year ended — submit returns now" : `${remaining} days remaining in tax year`
              : "Historical tax year — ended 5 Apr " + (startYear + 1)
            }
          </div>
        </div>

        {isCurrentYear && (
          <div style={{ padding: "14px 16px" }}>
            <HStack gap={6} align="center" marginBottom={8}>
              <Clock style={{ width: 12, height: 12, color: "var(--ft-dim)", flexShrink: 0 }} />
              <MonoLabel as="span" size={8} letterSpacing="0.1em">
                Self-Assessment Deadlines
              </MonoLabel>
            </HStack>
            <VStack gap={6}>
              <HStack align="center" justify="between">
                <Text as="span" mono size={10} color="var(--ft-muted)">
                  Paper return
                </Text>
                <HStack gap={8} align="center">
                  <Text as="span" mono size={10} color="var(--ft-dim)">
                    31 Oct {paperSADeadline.getFullYear()}
                  </Text>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px",
                    background: now > paperSADeadline ? "rgba(248,81,73,0.12)" : "rgba(139,148,158,0.1)",
                    color: now > paperSADeadline ? "var(--ft-red)" : "var(--ft-dim)",
                    letterSpacing: "0.05em",
                  }}>
                    {now > paperSADeadline ? "PASSED" : `${Math.round((paperSADeadline.getTime() - now.getTime()) / 86400000)}d`}
                  </span>
                </HStack>
              </HStack>
              <HStack align="center" justify="between">
                <Text as="span" mono size={10} color="var(--ft-muted)">
                  Online + tax payment
                </Text>
                <HStack gap={8} align="center">
                  <Text as="span" mono size={10} color="var(--ft-dim)">
                    31 Jan {onlineSADeadline.getFullYear()}
                  </Text>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, padding: "2px 6px",
                    background: daysToSA <= 30 ? "rgba(248,81,73,0.15)" : daysToSA <= 90 ? "rgba(245,158,11,0.12)" : "rgba(139,148,158,0.1)",
                    color: daysToSA <= 30 ? "var(--ft-red)" : daysToSA <= 90 ? "var(--ft-amber)" : "var(--ft-dim)",
                    letterSpacing: "0.05em",
                    fontWeight: daysToSA <= 30 ? 700 : 400,
                  }}>
                    {now > onlineSADeadline ? "PASSED" : `${daysToSA}d`}
                  </span>
                </HStack>
              </HStack>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2, lineHeight: 1.5 }}>
                Self-assessment required if: self-employed · income &gt;£100k · untaxed income &gt;£1k
              </div>
            </VStack>
          </div>
        )}
      </div>

      {/* Tax savings row */}
      <div style={{ padding: "12px 16px", background: "var(--ft-surface)", display: "flex", gap: 24, flexWrap: "wrap" as const }}>
        <HStack gap={8} align="center">
          <ShieldCheck style={{ width: 12, height: 12, color: "var(--ft-green)", flexShrink: 0 }} />
          <div>
            <MonoLabel as="span" size={9} letterSpacing="0.08em">
              ISA Contributions ({selectedYear})
            </MonoLabel>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: yearISA > 0 ? "var(--ft-green)" : "var(--ft-dim)", marginLeft: 8 }}>
              {fmt(yearISA, sym)}
            </span>
            {yearISA > 0 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 6 }}>
                est. <span className="pnum">{fmt(estimatedIsaTaxSaved, sym)}</span> tax sheltered/yr
              </span>
            )}
          </div>
        </HStack>
        <HStack gap={8} align="center">
          <ShieldCheck style={{ width: 12, height: 12, color: "var(--ft-blue)", flexShrink: 0 }} />
          <div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
              Pension Relief (basic)
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-blue)", marginLeft: 8 }}>
              25% HMRC top-up
            </span>
          </div>
        </HStack>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Tax() {
  const [country, setCountry] = useState<CountryCode>(() => {
    const saved = localStorage.getItem(LS_COUNTRY);
    return (saved && saved in COUNTRIES ? saved : "uk") as CountryCode;
  });

  const rules = COUNTRIES[country];

  const [disposals, setDisposals] = useState<Disposal[]>(() => loadDisposals());
  const [shelterContribs, setShelterContribs] = useState<ShelterContrib[]>(() => loadShelter());
  const [selectedYear, setSelectedYear] = useState<string>(() => getTaxYearLabel(new Date(), rules.yearFmt));
  const [addDisposalOpen, setAddDisposalOpen] = useState(false);
  const [addShelterOpen, setAddShelterOpen] = useState(false);
  const [grossSalary, setGrossSalary] = useState(35000);
  const [disposalForm, setDisposalForm] = useState<DisposalForm>({ assetName: "", ticker: "", acquiredDate: "", disposedDate: "", proceeds: "", costBasis: "" });
  const [shelterForm, setShelterForm] = useState<ShelterForm>({ taxYear: selectedYear, amount: "", provider: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const allYears = useMemo(() => getAvailableYears(rules.yearFmt), [rules.yearFmt]);

  const changeCountry = (c: CountryCode) => {
    setCountry(c);
    localStorage.setItem(LS_COUNTRY, c);
    const newRules = COUNTRIES[c];
    const newYear = getTaxYearLabel(new Date(), newRules.yearFmt);
    setSelectedYear(newYear);
    setShelterForm(f => ({ ...f, taxYear: newYear }));
  };

  const persistDisposals = (d: Disposal[]) => { setDisposals(d); saveDisposals(d); };
  const persistShelter = (c: ShelterContrib[]) => { setShelterContribs(c); saveShelter(c); };

  const yearDisposals = useMemo(
    () => disposals.filter(d => isInYear(d.disposedDate, selectedYear, rules.yearFmt)),
    [disposals, selectedYear, rules.yearFmt],
  );

  const totalGains = useMemo(() => yearDisposals.filter(d => d.gainLoss > 0).reduce((s, d) => s + d.gainLoss, 0), [yearDisposals]);
  const totalLosses = useMemo(() => yearDisposals.filter(d => d.gainLoss < 0).reduce((s, d) => s + Math.abs(d.gainLoss), 0), [yearDisposals]);
  const netGains = Math.max(0, totalGains - totalLosses);
  const taxableGains = Math.max(0, netGains - rules.cgtAllowance);
  const cgtLowEst = taxableGains * rules.cgtRateLow;
  const cgtHighEst = taxableGains * rules.cgtRateHigh;

  const yearShelter = useMemo(() => shelterContribs.filter(c => c.taxYear === selectedYear), [shelterContribs, selectedYear]);
  const yearShelterTotal = yearShelter.reduce((s, c) => s + c.amount, 0);
  const shelterRemaining = rules.shelterLimit > 0 ? Math.max(0, rules.shelterLimit - yearShelterTotal) : 0;

  const shelterHistoryData = useMemo(() => allYears.slice().reverse().map(yr => {
    const total = shelterContribs.filter(c => c.taxYear === yr).reduce((s, c) => s + c.amount, 0);
    return { year: yr, amount: total, pct: rules.shelterLimit > 0 ? Math.min(100, (total / rules.shelterLimit) * 100) : 0 };
  }), [shelterContribs, allYears, rules.shelterLimit]);

  const { data: investments } = useListInvestments();
  const tickers = [...new Set(investments?.map(i => i.ticker) ?? [])].join(",");
  const { data: rawQuotes } = useGetMarketQuotes({ tickers }, { query: { enabled: !!tickers, queryKey: getGetMarketQuotesQueryKey({ tickers }) } });
  const quoteMap = new Map<string, QuoteLike>(((rawQuotes ?? []) as QuoteLike[]).map(q => [q.ticker, q]));
  const estimatedDividends = useMemo(() => {
    if (!investments) return 0;
    return investments.reduce((sum, inv) => {
      const q = quoteMap.get(inv.ticker);
      return q?.dividendYield ? sum + (q.dividendYield / 100) * q.price * inv.shares : sum;
    }, 0);
  }, [investments, quoteMap]);

  const handleAddDisposal = (e: React.FormEvent) => {
    e.preventDefault();
    const proceeds = parseFloat(disposalForm.proceeds);
    const costBasis = parseFloat(disposalForm.costBasis);
    persistDisposals([...disposals, { id: nanoid(), assetName: disposalForm.assetName, ticker: disposalForm.ticker || undefined, acquiredDate: disposalForm.acquiredDate, disposedDate: disposalForm.disposedDate, proceeds, costBasis, gainLoss: proceeds - costBasis }]);
    setAddDisposalOpen(false);
    setDisposalForm({ assetName: "", ticker: "", acquiredDate: "", disposedDate: "", proceeds: "", costBasis: "" });
  };

  const holdingDays = (d: Disposal) => {
    const ms = new Date(d.disposedDate).getTime() - new Date(d.acquiredDate).getTime();
    return Math.floor(ms / 86400000);
  };

  const holdingLabel = (d: Disposal) => {
    const days = holdingDays(d);
    if (days < 0) return { text: "—", color: "var(--ft-dim)" };
    const months = Math.floor(days / 30);
    const label = days < 30 ? `${days}d` : months < 12 ? `${months}mo` : `${(days / 365).toFixed(1)}yr`;
    const longTerm = days >= 365;
    return { text: label, color: longTerm ? "var(--ft-green)" : "var(--ft-amber)", longTerm };
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ country, taxYear: selectedYear, disposals: yearDisposals, shelterContributions: yearShelter, summary: { totalGains, totalLosses, netGains, cgtAllowance: rules.cgtAllowance, taxableGains, estCgtLow: cgtLowEst, estCgtHigh: cgtHighEst } }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tax-${country}-${selectedYear.replace("/", "-")}.json`; a.click();
  };

  const handleExportCsv = () => {
    const sym = rules.sym;
    const rows = [
      ["Asset", "Ticker", "Acquired", "Disposed", `Proceeds (${sym})`, `Cost Basis (${sym})`, `Gain/Loss (${sym})`, "Holding Days", "Term"].join(","),
      ...yearDisposals.map(d => {
        const days = holdingDays(d);
        return [
          `"${d.assetName}"`, d.ticker ?? "", d.acquiredDate, d.disposedDate,
          d.proceeds.toFixed(2), d.costBasis.toFixed(2), d.gainLoss.toFixed(2),
          days, days >= 365 ? "Long-term" : "Short-term",
        ].join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `disposals-${country}-${selectedYear.replace("/", "-")}.csv`; a.click();
  };

  const handleDeleteDisposal = (id: string) => {
    if (deleteConfirmId === id) {
      persistDisposals(disposals.filter(x => x.id !== id));
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const sym = rules.sym;
  const allowancePct = rules.cgtAllowance > 0 ? Math.min(100, (netGains / rules.cgtAllowance) * 100) : 0;
  const shelterPct = rules.shelterLimit > 0 ? Math.min(100, (yearShelterTotal / rules.shelterLimit) * 100) : 0;
  const divPct = rules.dividendAllowance ? Math.min(100, (estimatedDividends / rules.dividendAllowance) * 100) : 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <PageHeader
        icon={FileText}
        title="Tax Report"
        subtitle="Capital Gains · Tax Shelter Tracker · Dividend Estimate"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <FtDropdown
              label="Country"
              value={country}
              onChange={v => changeCountry(v as CountryCode)}
              options={(Object.entries(COUNTRIES) as [CountryCode, CountryConfig][]).map(([k, v]) => ({
                value: k,
                label: v.name,
                prefix: v.code,
              } satisfies FtDropdownOption))}
              minWidth={160}
            />
            <FtDropdown
              label="Tax Year"
              value={selectedYear}
              onChange={setSelectedYear}
              options={allYears.map(y => ({ value: y, label: y }))}
              minWidth={90}
            />
            <Button onClick={handleExport} size="sm" variant="outline" style={{ borderColor: "var(--ft-border2)", color: "var(--ft-muted)", fontSize: 11, height: 32 }}>
              <Download className="w-3.5 h-3.5 mr-1.5" />JSON
            </Button>
            <Button onClick={handleExportCsv} size="sm" variant="outline" style={{ borderColor: "var(--ft-border2)", color: "var(--ft-muted)", fontSize: 11, height: 32 }}>
              <Download className="w-3.5 h-3.5 mr-1.5" />CSV
            </Button>
          </div>
        }
      />

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid) return null;
        const allowanceLeft = Math.max(0, rules.cgtAllowance - netGains);
        const msgs: Record<string, string | null> = {
          wealth:  shelterRemaining > 0
            ? `${sym}${shelterRemaining.toLocaleString()} of ${rules.shelterName || "tax shelter"} allowance remaining this year — maximise before year-end.`
            : taxableGains > 0
            ? `${sym}${taxableGains.toFixed(0)} taxable gains this year. Consider tax-loss harvesting to reduce liability.`
            : `CGT allowance fully utilised or no taxable gains. Review shelter contributions via the section below.`,
          market:  allowanceLeft > 0
            ? `${sym}${allowanceLeft.toLocaleString()} of CGT allowance still available — rebalancing within this limit is tax-free.`
            : taxableGains > 0
            ? `You have exceeded your CGT allowance by ${sym}${Math.abs(rules.cgtAllowance - netGains).toLocaleString()}.`
            : null,
          budget:  null,
          social:  null,
          full:    null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-amber)", background: "color-mix(in srgb, var(--ft-amber) 5%, transparent)", padding: "8px 14px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "var(--ft-amber)", fontWeight: 700, letterSpacing: "0.06em", flexShrink: 0 }}>TAX TIP</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* ── UK Income Tax + Year Overview ─────────────────────────────────────── */}
      {country === "uk" && (
        <div style={{ border: "1px solid var(--ft-border)" }}>
          <SectionHeader label="UK INCOME TAX ESTIMATOR (2024/25)" color="var(--ft-green)" />
          <div style={{ padding: "12px 16px 4px", borderBottom: "1px solid var(--ft-border)", background: "var(--ft-base)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const }}>
              Gross Annual Salary
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={grossSalary}
              onChange={e => setGrossSalary(Math.max(0, parseInt(e.target.value) || 0))}
              style={{ fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "5px 10px", width: 140, textAlign: "right" as const, outline: "none", marginBottom: 8 }}
            />
            {grossSalary > 100_000 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-amber)", marginBottom: 8 }}>
                PA tapering applies above £100k
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── UK Tax Year Calendar + KPI block ─────────────────────────────────── */}
      {country === "uk" && (
        <UkTaxYearProgress
          sym={sym}
          grossSalary={grossSalary}
          shelterContribs={shelterContribs}
          selectedYear={selectedYear}
        />
      )}

      {/* ── Capital Gains ─────────────────────────────────────────────────────── */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <SectionHeader label={`CAPITAL GAINS — ${selectedYear} · ${rules.name}`} color="var(--ft-green)" />

        {rules.cgtNote && (
          <div className="flex items-start gap-2 px-4 py-2.5 border-b text-xs" style={{ borderColor: "var(--ft-border)", background: "rgba(139,148,158,0.06)" }}>
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: rules.noCgt ? "var(--ft-blue)" : "var(--ft-dim)" }} />
            <Text as="span" color={rules.noCgt ? "var(--ft-text)" : "var(--ft-dim)"} lineHeight={1.6}>{rules.cgtNote}</Text>
          </div>
        )}

        {!rules.noCgt && (
          <>
            {taxableGains > 0 && (rules.cgtRateLow > 0 || rules.cgtRateHigh > 0) && (
              <div className="px-4 py-4 border-b" style={{ borderColor: "var(--ft-border)", background: "rgba(248,81,73,0.04)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>
                  ESTIMATED CGT LIABILITY — {selectedYear}
                </div>
                <HStack gap={24} align="end" wrap>
                  <div>
                    <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: "var(--ft-red)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {fmt(cgtLowEst, sym)}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>{rules.cgtRateLowLabel}</div>
                  </div>
                  {rules.cgtRateHigh !== rules.cgtRateLow && (
                    <div>
                      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ft-red)", lineHeight: 1, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(cgtHighEst, sym)}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>{rules.cgtRateHighLabel}</div>
                    </div>
                  )}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", paddingBottom: 2 }}>
                    on <span className="pnum">{fmt(taxableGains, sym)}</span> taxable gains
                  </div>
                </HStack>
              </div>
            )}

            <MetricTileGroup cols={4}>
              <MetricTile label="Total Gains" value={fmt(totalGains, sym)} color="var(--ft-green)" />
              <MetricTile label="Losses to Offset" value={fmt(totalLosses, sym)} color="var(--ft-red)" />
              <MetricTile label="Net Gains" value={fmt(netGains, sym)} color={rules.cgtAllowance > 0 && netGains > rules.cgtAllowance ? "var(--ft-amber)" : "var(--ft-text)"} />
              {rules.cgtAllowance > 0 ? (
                <MetricTile label="Annual Allowance" value={fmt(rules.cgtAllowance, sym)} color="var(--ft-dim)" sub={`${allowancePct.toFixed(0)}% used`} />
              ) : (
                <MetricTile label="Taxable Gains" value={fmt(taxableGains, sym)} color={taxableGains > 0 ? "var(--ft-amber)" : "var(--ft-dim)"} />
              )}
            </MetricTileGroup>

            {rules.cgtAllowance > 0 && (
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-base)" }}>
                <div className="flex items-center justify-between mb-2">
                  <MonoLabel as="span" size={9} letterSpacing="0.08em">
                    CGT Allowance — {selectedYear}
                  </MonoLabel>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: netGains > rules.cgtAllowance ? "var(--ft-red)" : "var(--ft-green)", fontVariantNumeric: "tabular-nums" }}>
                    <span className="pnum">{fmt(netGains, sym)}</span>{" "}
                    <span style={{ fontWeight: 400, color: "var(--ft-dim)" }}>/ <span className="pnum">{fmt(rules.cgtAllowance, sym)}</span></span>
                  </span>
                </div>
                <div style={{ height: 5, background: "var(--ft-raised)" }}>
                  <div style={{ height: "100%", width: `${allowancePct}%`, background: allowancePct >= 100 ? "var(--ft-red)" : allowancePct > 80 ? "var(--ft-amber)" : "var(--ft-green)", transition: "none" }} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 5 }}>
                  <span className="pnum">{fmt(Math.max(0, rules.cgtAllowance - netGains), sym)}</span> remaining · {allowancePct.toFixed(0)}% used
                </div>
              </div>
            )}
          </>
        )}

        {/* Disposals table */}
        <div className="ft-scroll-x overflow-x-auto">
          <div className="flex">
            {[["ASSET", "1"], ["TICKER", "80px"], ["ACQUIRED", "100px"], ["DISPOSED", "100px"], ["HELD", "70px"], [`PROCEEDS (${sym})`, "120px"], [`COST (${sym})`, "110px"], [`GAIN/LOSS`, "120px"], ["", "56px"]].map(([h, w]) => (
              <div key={h} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w : undefined, minWidth: w !== "1" ? w : undefined, textAlign: ["PROCEEDS", "COST", "GAIN/LOSS"].some(x => (h as string).startsWith(x)) ? "right" : "left" }}>{h}</div>
            ))}
          </div>
          {yearDisposals.length === 0 && (
            <div style={{ padding: "40px 24px", textAlign: "center", background: "var(--ft-base)", borderBottom: "1px solid var(--ft-border)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, color: "var(--ft-border2)", marginBottom: 8, lineHeight: 1 }}>—</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", marginBottom: 4 }}>No disposals for {selectedYear}</div>
              <MonoLabel as="div" size={9} letterSpacing="0.08em">Record a disposal to calculate your CGT liability</MonoLabel>
            </div>
          )}
          {yearDisposals.map(d => (
            <DisposalRow
              key={d.id}
              d={d}
              sym={sym}
              deleteConfirmId={deleteConfirmId}
              onDelete={handleDeleteDisposal}
              holdingLabel={holdingLabel}
            />
          ))}
        </div>
        <div className="px-3 py-3 border-t flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
          <Button size="sm" onClick={() => setAddDisposalOpen(true)} style={{ background: "var(--ft-green)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontSize: 11 }}>
            <Plus className="w-3 h-3 mr-1.5" />Record Disposal
          </Button>
          {investments && investments.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs" style={{ color: "var(--ft-dim)" }}>Quick add:</span>
              {investments.slice(0, 8).map(inv => (
                <QuickAddButton
                  key={inv.id}
                  inv={inv}
                  onClick={() => { setDisposalForm(f => ({ ...f, assetName: inv.name, ticker: inv.ticker })); setAddDisposalOpen(true); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Shelter tracker ────────────────────────────────────────────────────── */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <SectionHeader label={`${rules.shelterName.toUpperCase()} TRACKER — ${selectedYear}`} color="var(--ft-blue)" />
        <MetricTileGroup cols={3}>
          <MetricTile label={`Annual ${rules.shelterName} Limit`} value={rules.shelterLimit > 0 ? fmt(rules.shelterLimit, sym) : "—"} color="var(--ft-dim)" />
          <MetricTile label="Contributed This Year" value={fmt(yearShelterTotal, sym)} color="var(--ft-blue)" sub={rules.shelterLimit > 0 ? `${shelterPct.toFixed(0)}% used` : undefined} />
          <MetricTile label="Remaining" value={rules.shelterLimit > 0 ? fmt(shelterRemaining, sym) : "—"} color={rules.shelterLimit > 0 && shelterRemaining < rules.shelterLimit * 0.25 ? "var(--ft-amber)" : "var(--ft-green)"} />
        </MetricTileGroup>
        {rules.shelterLimit > 0 && (
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-base)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <MonoLabel as="span" size={9} letterSpacing="0.08em">
                {rules.shelterName} Allowance Used
              </MonoLabel>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: shelterPct > 80 ? "var(--ft-amber)" : "var(--ft-blue)", fontVariantNumeric: "tabular-nums" }}>
                <span className="pnum">{fmt(yearShelterTotal, sym)}</span> / <span className="pnum">{fmt(rules.shelterLimit, sym)}</span>
              </span>
            </div>
            <div style={{ height: 5, background: "var(--ft-raised)" }}>
              <div style={{ height: "100%", width: `${shelterPct}%`, background: shelterPct >= 100 ? "var(--ft-red)" : shelterPct > 80 ? "var(--ft-amber)" : "var(--ft-blue)", transition: "none" }} />
            </div>
          </div>
        )}
        {yearShelter.length > 0 && (
          <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
            {yearShelter.map((c, i) => (
              <ShelterContribRow
                key={i}
                c={c}
                i={i}
                isLast={i === yearShelter.length - 1}
                sym={sym}
                shelterName={rules.shelterName}
              />
            ))}
          </div>
        )}
        {shelterHistoryData.some(d => d.amount > 0) && rules.shelterLimit > 0 && (
          <div className="p-4 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
            <div className="text-xs font-bold mb-3 uppercase tracking-wide font-mono" style={{ color: "var(--ft-blue)" }}>5-Year {rules.shelterName} History</div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={shelterHistoryData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-raised)" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--ft-dim)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${sym}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} domain={[0, rules.shelterLimit]} width={48} />
                <Tooltip formatter={(v: number) => [fmt(v, sym), "Contributed"]} contentStyle={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", fontSize: 11 }} />
                <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
                  {shelterHistoryData.map((e, i) => <Cell key={i} fill={e.amount >= rules.shelterLimit ? "var(--ft-green)" : e.amount > 0 ? "var(--ft-blue)" : "var(--ft-raised)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="px-3 py-2.5 flex items-center gap-3 flex-wrap" style={{ background: "var(--ft-surface)" }}>
          <Button size="sm" onClick={() => { setShelterForm({ taxYear: selectedYear, amount: "", provider: "" }); setAddShelterOpen(true); }} style={{ background: "var(--ft-blue)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontSize: 11 }}>
            <Plus className="w-3 h-3 mr-1.5" />Add Contribution
          </Button>
          {rules.shelterNote && <span className="text-xs" style={{ color: "var(--ft-dim)" }}>{rules.shelterNote}</span>}
        </div>
      </div>

      {/* ── Dividend estimate ───────────────────────────────────────────────────── */}
      {(rules.dividendAllowance !== undefined || rules.dividendNote) && (
        <div className="border" style={{ borderColor: "var(--ft-border)" }}>
          <SectionHeader label="DIVIDEND INCOME ESTIMATE" color="var(--ft-cyan)" />
          <MetricTileGroup cols={3}>
            <MetricTile label="Allowance / Exemption" value={rules.dividendAllowance ? fmt(rules.dividendAllowance, sym) : "—"} color="var(--ft-dim)" />
            <MetricTile label="Est. Annual Dividends" value={fmt(estimatedDividends, sym)} color={rules.dividendAllowance && estimatedDividends > rules.dividendAllowance ? "var(--ft-amber)" : "var(--ft-cyan)"} />
            <MetricTile label="Remaining" value={rules.dividendAllowance ? fmt(Math.max(0, rules.dividendAllowance - estimatedDividends), sym) : "N/A"} color={rules.dividendAllowance && estimatedDividends > rules.dividendAllowance ? "var(--ft-red)" : "var(--ft-green)"} />
          </MetricTileGroup>
          {rules.dividendAllowance && (
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-base)" }}>
              <div style={{ height: 5, background: "var(--ft-raised)" }}>
                <div style={{ height: "100%", width: `${Math.min(100, divPct)}%`, background: divPct > 100 ? "var(--ft-red)" : divPct > 80 ? "var(--ft-amber)" : "var(--ft-cyan)", transition: "none" }} />
              </div>
            </div>
          )}
          {rules.dividendNote && (
            <div className="px-4 py-2.5 text-xs" style={{ color: "var(--ft-dim)", background: "var(--ft-base)" }}>{rules.dividendNote}</div>
          )}
        </div>
      )}

      {/* ── Tax rates reference ─────────────────────────────────────────────────── */}
      {rules.incomeBands.length > 0 && (
        <div className="border" style={{ borderColor: "var(--ft-border)" }}>
          <SectionHeader label={`${rules.name.toUpperCase()} — INCOME TAX REFERENCE`} color="var(--ft-accent)" />
          <div style={{ background: "var(--ft-base)" }}>
            {rules.incomeBands.map((b, i) => (
              <IncomeBandRow
                key={b.label}
                b={b}
                isLast={i === rules.incomeBands.length - 1}
              />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 16px", background: "var(--ft-surface)", borderTop: "1px solid var(--ft-border)" }}>
            <Info style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1, color: "var(--ft-dim)" }} />
            <Text as="span" mono size={9} color="var(--ft-dim)" lineHeight={1.6}>For information only. Rates may change year to year and vary by individual circumstances. Consult a qualified tax professional for personalised advice.</Text>
          </div>
        </div>
      )}

      {/* ── Add Disposal Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addDisposalOpen} onOpenChange={setAddDisposalOpen}>
        <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>Record Capital Disposal</DialogTitle></DialogHeader>
          <form onSubmit={handleAddDisposal}>
            <div className="space-y-3">
              <div className="ft-two-col grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block" }}>Asset Name</label>
                  <Input placeholder="Apple Inc." value={disposalForm.assetName} onChange={e => setDisposalForm(f => ({ ...f, assetName: e.target.value }))} required style={{ height: 32, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                </div>
                <div className="space-y-1">
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block" }}>Ticker (optional)</label>
                  <Input placeholder="AAPL" value={disposalForm.ticker} onChange={e => setDisposalForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} style={{ height: 32, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                </div>
              </div>
              <div className="ft-two-col grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block" }}>Acquired Date</label>
                  <Input type="date" value={disposalForm.acquiredDate} onChange={e => setDisposalForm(f => ({ ...f, acquiredDate: e.target.value }))} required style={{ height: 32, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                </div>
                <div className="space-y-1">
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block" }}>Disposed Date</label>
                  <Input type="date" value={disposalForm.disposedDate} onChange={e => setDisposalForm(f => ({ ...f, disposedDate: e.target.value }))} required style={{ height: 32, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                </div>
              </div>
              <div className="ft-two-col grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block" }}>Proceeds ({sym})</label>
                  <Input type="number" step="0.01" min="0" placeholder="5000.00" value={disposalForm.proceeds} onChange={e => setDisposalForm(f => ({ ...f, proceeds: e.target.value }))} required style={{ height: 32, fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right" as const }} />
                </div>
                <div className="space-y-1">
                  <label style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block" }}>Cost Basis ({sym})</label>
                  <Input type="number" step="0.01" min="0" placeholder="3000.00" value={disposalForm.costBasis} onChange={e => setDisposalForm(f => ({ ...f, costBasis: e.target.value }))} required style={{ height: 32, fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right" as const }} />
                </div>
              </div>
              {disposalForm.proceeds && disposalForm.costBasis && (
                <div style={{ padding: "8px 12px", border: "1px solid var(--ft-border2)", background: "var(--ft-surface)", fontFamily: "var(--font-mono)", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Text as="span" upper size={9} color="var(--ft-dim)" letterSpacing="0.06em">Gain / Loss</Text>
                  <span className="pnum" style={{ color: (parseFloat(disposalForm.proceeds) - parseFloat(disposalForm.costBasis)) >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700, fontSize: 14 }}>
                    {fmt(parseFloat(disposalForm.proceeds) - parseFloat(disposalForm.costBasis), sym)}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter className="mt-5">
              <DialogClose asChild><Button type="button" variant="outline" style={{ height: 32, fontSize: 11 }}>Cancel</Button></DialogClose>
              <Button type="submit" style={{ background: "var(--ft-green)", color: "var(--ft-base)", border: "none", height: 32, fontSize: 11, fontFamily: "var(--font-mono)" }}>Record Disposal</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Shelter Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={addShelterOpen} onOpenChange={setAddShelterOpen}>
        <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--ft-text)" }}>Add {rules.shelterName} Contribution</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); persistShelter([...shelterContribs, { taxYear: shelterForm.taxYear, amount: parseFloat(shelterForm.amount), provider: shelterForm.provider || undefined }]); setAddShelterOpen(false); setShelterForm({ taxYear: selectedYear, amount: "", provider: "" }); }}>
            <div className="space-y-4">
              <div className="ft-two-col grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Tax Year</Label>
                  <FtDropdown
                    value={shelterForm.taxYear}
                    onChange={v => setShelterForm(f => ({ ...f, taxYear: v }))}
                    options={allYears.map(y => ({ value: y, label: y }))}
                    minWidth={200}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount ({sym})</Label>
                  <Input type="number" step="0.01" min="0" max={rules.shelterLimit || undefined} placeholder="1000.00" value={shelterForm.amount} onChange={e => setShelterForm(f => ({ ...f, amount: e.target.value }))} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Provider (optional)</Label>
                <Input placeholder={`e.g. ${country === "uk" ? "Vanguard, Moneybox" : country === "us" ? "Fidelity, Schwab" : country === "my" ? "EPF voluntary" : "Provider name"}`} value={shelterForm.provider} onChange={e => setShelterForm(f => ({ ...f, provider: e.target.value }))} />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" style={{ background: "var(--ft-blue)", color: "var(--ft-base)", border: "none" }}>Add Contribution</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

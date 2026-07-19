import { useState, useMemo } from "react";
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
import { FileText, Plus, Trash2, Download, Info } from "lucide-react";
import { FtDropdown } from "@/components/ft-dropdown";
import type { FtDropdownOption } from "@/components/ft-dropdown";

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

// ── Shared UI primitives ───────────────────────────────────────────────────────

function SectionHeader({ label, color = "var(--ft-blue)" }: { label: string; color?: string }) {
  return (
    <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: `${color}12`, borderColor: `${color}25`, color }}>
      ▼ {label}
    </div>
  );
}

function MetricTile({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="px-4 py-3 border-r" style={{ borderColor: "var(--ft-border)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>{label}</div>
      <div className="text-base font-bold font-mono" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--ft-dim)" }}>{sub}</div>}
    </div>
  );
}

interface QuoteLike { ticker: string; price: number; currency: string; dividendYield?: number | null; }

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
  const [disposalForm, setDisposalForm] = useState<DisposalForm>({ assetName: "", ticker: "", acquiredDate: "", disposedDate: "", proceeds: "", costBasis: "" });
  const [shelterForm, setShelterForm] = useState<ShelterForm>({ taxYear: selectedYear, amount: "", provider: "" });

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

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ country, taxYear: selectedYear, disposals: yearDisposals, shelterContributions: yearShelter, summary: { totalGains, totalLosses, netGains, cgtAllowance: rules.cgtAllowance, taxableGains, estCgtLow: cgtLowEst, estCgtHigh: cgtHighEst } }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tax-${country}-${selectedYear.replace("/", "-")}.json`; a.click();
  };

  const TH: React.CSSProperties = { padding: "6px 12px", fontSize: 10, fontWeight: 600, color: "var(--ft-dim)", background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)", borderRight: "1px solid var(--ft-border)", textTransform: "uppercase" as const, letterSpacing: "0.4px", whiteSpace: "nowrap" as const };

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
            {/* Country selector */}
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
            {/* Year selector */}
            <FtDropdown
              label="Tax Year"
              value={selectedYear}
              onChange={setSelectedYear}
              options={allYears.map(y => ({ value: y, label: y }))}
              minWidth={90}
            />
            <Button onClick={handleExport} size="sm" variant="outline" style={{ borderColor: "var(--ft-border2)", color: "var(--ft-muted)", fontSize: 11, height: 32 }}>
              <Download className="w-3.5 h-3.5 mr-1.5" />Export JSON
            </Button>
          </div>
        }
      />

      {/* ── Capital Gains ─────────────────────────────────────────────────────── */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <SectionHeader label={`CAPITAL GAINS — ${selectedYear} · ${rules.name}`} color="var(--ft-green)" />

        {rules.cgtNote && (
          <div className="flex items-start gap-2 px-4 py-2.5 border-b text-xs" style={{ borderColor: "var(--ft-border)", background: "rgba(139,148,158,0.06)" }}>
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: rules.noCgt ? "var(--ft-blue)" : "var(--ft-dim)" }} />
            <span style={{ color: rules.noCgt ? "var(--ft-text)" : "var(--ft-dim)", lineHeight: 1.6 }}>{rules.cgtNote}</span>
          </div>
        )}

        {!rules.noCgt && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
              <MetricTile label="Total Gains" value={fmt(totalGains, sym)} color="var(--ft-green)" />
              <MetricTile label="Losses to Offset" value={fmt(totalLosses, sym)} color="var(--ft-red)" />
              <MetricTile label="Net Gains" value={fmt(netGains, sym)} color={rules.cgtAllowance > 0 && netGains > rules.cgtAllowance ? "var(--ft-amber)" : "var(--ft-text)"} />
              {rules.cgtAllowance > 0 ? (
                <MetricTile label="Annual Allowance" value={fmt(rules.cgtAllowance, sym)} color="var(--ft-dim)" sub={`${allowancePct.toFixed(0)}% used`} />
              ) : (
                <MetricTile label="Taxable Gains" value={fmt(taxableGains, sym)} color={taxableGains > 0 ? "var(--ft-amber)" : "var(--ft-dim)"} />
              )}
            </div>

            {rules.cgtAllowance > 0 && (
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-base)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: "var(--ft-dim)" }}>Annual CGT allowance used ({selectedYear})</span>
                  <span className="text-xs font-mono" style={{ color: netGains > rules.cgtAllowance ? "var(--ft-red)" : "var(--ft-green)" }}>
                    {fmt(netGains, sym)} / {fmt(rules.cgtAllowance, sym)}
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--ft-raised)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${allowancePct}%`, background: allowancePct >= 100 ? "var(--ft-red)" : allowancePct > 75 ? "var(--ft-amber)" : "var(--ft-green)", borderRadius: 3, transition: "width 0.3s ease" }} />
                </div>
              </div>
            )}

            {taxableGains > 0 && (rules.cgtRateLow > 0 || rules.cgtRateHigh > 0) && (
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ft-border)", background: "rgba(248,81,73,0.04)" }}>
                <div className="text-xs font-bold mb-2 uppercase tracking-wide font-mono" style={{ color: "var(--ft-red)" }}>
                  Estimated tax on {fmt(taxableGains, sym)} above allowance
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px" }}>
                    <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>{rules.cgtRateLowLabel}</div>
                    <div className="text-xl font-bold font-mono" style={{ color: "var(--ft-amber)" }}>{fmt(cgtLowEst, sym)}</div>
                  </div>
                  {rules.cgtRateHigh !== rules.cgtRateLow && (
                    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", padding: "10px 14px" }}>
                      <div className="text-xs mb-1" style={{ color: "var(--ft-dim)" }}>{rules.cgtRateHighLabel}</div>
                      <div className="text-xl font-bold font-mono" style={{ color: "var(--ft-red)" }}>{fmt(cgtHighEst, sym)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Disposals table */}
        <div className="overflow-x-auto">
          <div className="flex">
            {[["ASSET", "1"], ["TICKER", "80px"], ["ACQUIRED", "110px"], ["DISPOSED", "110px"], [`PROCEEDS (${sym})`, "120px"], [`COST (${sym})`, "110px"], [`GAIN/LOSS`, "120px"], ["", "56px"]].map(([h, w]) => (
              <div key={h} style={{ ...TH, flex: w === "1" ? 1 : undefined, width: w !== "1" ? w : undefined, minWidth: w !== "1" ? w : undefined, textAlign: ["PROCEEDS", "COST", "GAIN/LOSS"].some(x => (h as string).startsWith(x)) ? "right" : "left" }}>{h}</div>
            ))}
          </div>
          {yearDisposals.length === 0 && (
            <div className="text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>No disposals for {selectedYear} — record one below.</div>
          )}
          {yearDisposals.map(d => (
            <div key={d.id} className="flex items-center border-b" style={{ borderColor: "rgba(33,38,45,0.5)", background: "var(--ft-base)" }}>
              <div style={{ flex: 1, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 12, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.assetName}</div>
              <div style={{ width: 80, minWidth: 80, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-cyan)", fontFamily: "var(--font-mono)" }}>{d.ticker ?? "—"}</div>
              <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-muted)" }}>{d.acquiredDate}</div>
              <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 11, color: "var(--ft-muted)" }}>{d.disposedDate}</div>
              <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-text)" }}>{fmt(d.proceeds, sym)}</div>
              <div style={{ width: 110, minWidth: 110, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--ft-muted)" }}>{fmt(d.costBasis, sym)}</div>
              <div style={{ width: 120, minWidth: 120, padding: "7px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 12, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: d.gainLoss >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>{d.gainLoss >= 0 ? "+" : ""}{fmt(d.gainLoss, sym)}</div>
              <div style={{ width: 56, minWidth: 56, padding: "4px 6px", display: "flex", justifyContent: "center" }}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete this disposal?")) persistDisposals(disposals.filter(x => x.id !== d.id)); }}>
                  <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--ft-red)" }} />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 py-3 border-t flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
          <Button size="sm" onClick={() => setAddDisposalOpen(true)} style={{ background: "var(--ft-green)", color: "white", border: "none", borderRadius: 2, fontSize: 11 }}>
            <Plus className="w-3 h-3 mr-1.5" />Record Disposal
          </Button>
          {investments && investments.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs" style={{ color: "var(--ft-dim)" }}>Quick add:</span>
              {investments.slice(0, 8).map(inv => (
                <button key={inv.id} onClick={() => { setDisposalForm(f => ({ ...f, assetName: inv.name, ticker: inv.ticker })); setAddDisposalOpen(true); }} style={{ padding: "2px 8px", borderRadius: 2, fontSize: 10, fontWeight: 700, background: "rgba(88,166,255,0.12)", color: "var(--ft-blue)", border: "1px solid rgba(88,166,255,0.25)", cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                  {inv.ticker}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Shelter tracker ────────────────────────────────────────────────────── */}
      <div className="border" style={{ borderColor: "var(--ft-border)" }}>
        <SectionHeader label={`${rules.shelterName.toUpperCase()} TRACKER — ${selectedYear}`} color="var(--ft-blue)" />
        <div className="grid grid-cols-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
          <MetricTile label={`Annual ${rules.shelterName} Limit`} value={rules.shelterLimit > 0 ? fmt(rules.shelterLimit, sym) : "—"} color="var(--ft-dim)" />
          <MetricTile label="Contributed This Year" value={fmt(yearShelterTotal, sym)} color="var(--ft-blue)" sub={rules.shelterLimit > 0 ? `${shelterPct.toFixed(0)}% used` : undefined} />
          <MetricTile label="Remaining" value={rules.shelterLimit > 0 ? fmt(shelterRemaining, sym) : "—"} color={rules.shelterLimit > 0 && shelterRemaining < rules.shelterLimit * 0.25 ? "var(--ft-amber)" : "var(--ft-green)"} />
        </div>
        {rules.shelterLimit > 0 && (
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-base)" }}>
            <div style={{ height: 6, background: "var(--ft-raised)", borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${shelterPct}%`, background: shelterPct >= 100 ? "var(--ft-red)" : shelterPct > 80 ? "var(--ft-amber)" : "var(--ft-blue)", borderRadius: 3, transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}
        {yearShelter.length > 0 && (
          <div className="border-b divide-y" style={{ borderColor: "var(--ft-border)" }}>
            {yearShelter.map((c, i) => (
              <div key={i} className="flex items-center px-4 py-2 gap-4">
                <div className="flex-1 text-sm" style={{ color: "var(--ft-text)" }}>{c.provider ?? `${rules.shelterName} Provider`}</div>
                <div className="text-sm font-mono font-semibold" style={{ color: "var(--ft-blue)" }}>{fmt(c.amount, sym)}</div>
                <div className="text-xs" style={{ color: "var(--ft-dim)" }}>{c.taxYear}</div>
              </div>
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
          <Button size="sm" onClick={() => { setShelterForm({ taxYear: selectedYear, amount: "", provider: "" }); setAddShelterOpen(true); }} style={{ background: "var(--ft-blue)", color: "white", border: "none", borderRadius: 2, fontSize: 11 }}>
            <Plus className="w-3 h-3 mr-1.5" />Add Contribution
          </Button>
          {rules.shelterNote && <span className="text-xs" style={{ color: "var(--ft-dim)" }}>{rules.shelterNote}</span>}
        </div>
      </div>

      {/* ── Dividend estimate ───────────────────────────────────────────────────── */}
      {(rules.dividendAllowance !== undefined || rules.dividendNote) && (
        <div className="border" style={{ borderColor: "var(--ft-border)" }}>
          <SectionHeader label="DIVIDEND INCOME ESTIMATE" color="var(--ft-cyan)" />
          <div className="grid grid-cols-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-surface)" }}>
            <MetricTile label="Allowance / Exemption" value={rules.dividendAllowance ? fmt(rules.dividendAllowance, sym) : "—"} color="var(--ft-dim)" />
            <MetricTile label="Est. Annual Dividends" value={fmt(estimatedDividends, sym)} color={rules.dividendAllowance && estimatedDividends > rules.dividendAllowance ? "var(--ft-amber)" : "var(--ft-cyan)"} />
            <MetricTile label="Remaining" value={rules.dividendAllowance ? fmt(Math.max(0, rules.dividendAllowance - estimatedDividends), sym) : "N/A"} color={rules.dividendAllowance && estimatedDividends > rules.dividendAllowance ? "var(--ft-red)" : "var(--ft-green)"} />
          </div>
          {rules.dividendAllowance && (
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ft-border)", background: "var(--ft-base)" }}>
              <div style={{ height: 6, background: "var(--ft-raised)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${Math.min(100, divPct)}%`, background: divPct > 100 ? "var(--ft-red)" : divPct > 80 ? "var(--ft-amber)" : "var(--ft-cyan)", borderRadius: 3, transition: "width 0.3s ease" }} />
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
          <div className="p-4">
            <div className="text-xs font-bold mb-3 uppercase tracking-wide font-mono" style={{ color: "var(--ft-accent)" }}>Income Tax Bands</div>
            <div className="space-y-2">
              {rules.incomeBands.map(b => (
                <div key={b.label} className="flex items-center gap-3 text-xs">
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: b.color, width: 48, flexShrink: 0 }}>{b.rate}</span>
                  <span style={{ color: "var(--ft-text)", flex: 1 }}>{b.label}</span>
                  <span style={{ color: "var(--ft-dim)" }}>{b.range}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-1.5 p-2 border text-xs" style={{ borderColor: "var(--ft-border2)", background: "rgba(139,148,158,0.07)" }}>
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--ft-dim)" }} />
              <span style={{ color: "var(--ft-dim)" }}>For information only. Rates may change year to year and vary by individual circumstances. Consult a qualified tax professional for personalised advice.</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Disposal Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={addDisposalOpen} onOpenChange={setAddDisposalOpen}>
        <DialogContent style={{ background: "var(--ft-base)", border: "1px solid var(--ft-border)" }}>
          <DialogHeader><DialogTitle style={{ color: "var(--ft-text)" }}>Record Capital Disposal</DialogTitle></DialogHeader>
          <form onSubmit={handleAddDisposal}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Asset Name</Label>
                  <Input placeholder="Apple Inc." value={disposalForm.assetName} onChange={e => setDisposalForm(f => ({ ...f, assetName: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Ticker (optional)</Label>
                  <Input placeholder="AAPL" value={disposalForm.ticker} onChange={e => setDisposalForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Acquired Date</Label>
                  <Input type="date" value={disposalForm.acquiredDate} onChange={e => setDisposalForm(f => ({ ...f, acquiredDate: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Disposed Date</Label>
                  <Input type="date" value={disposalForm.disposedDate} onChange={e => setDisposalForm(f => ({ ...f, disposedDate: e.target.value }))} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Proceeds ({sym})</Label>
                  <Input type="number" step="0.01" min="0" placeholder="5000.00" value={disposalForm.proceeds} onChange={e => setDisposalForm(f => ({ ...f, proceeds: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Cost Basis ({sym})</Label>
                  <Input type="number" step="0.01" min="0" placeholder="3000.00" value={disposalForm.costBasis} onChange={e => setDisposalForm(f => ({ ...f, costBasis: e.target.value }))} required />
                </div>
              </div>
              {disposalForm.proceeds && disposalForm.costBasis && (
                <div className="px-3 py-2 border text-sm font-mono" style={{ borderColor: "var(--ft-border2)", background: "var(--ft-surface)" }}>
                  Gain / Loss: <span style={{ color: (parseFloat(disposalForm.proceeds) - parseFloat(disposalForm.costBasis)) >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 700 }}>
                    {fmt(parseFloat(disposalForm.proceeds) - parseFloat(disposalForm.costBasis), sym)}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter className="mt-6">
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" style={{ background: "var(--ft-green)", color: "white", border: "none" }}>Record Disposal</Button>
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
              <div className="grid grid-cols-2 gap-4">
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
              <Button type="submit" style={{ background: "var(--ft-blue)", color: "white", border: "none" }}>Add Contribution</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

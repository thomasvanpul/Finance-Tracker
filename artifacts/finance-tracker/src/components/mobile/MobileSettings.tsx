import { useState } from "react";
import { usePrivacy } from "@/contexts/privacy-context";
import { useFintrackTheme, type FintrackTheme } from "@/contexts/theme-context";
import { useGetSettingsCurrency } from "@workspace/api-client-react";
import { ChevronLeft, ExternalLink } from "lucide-react";

const DISPLAY_FORMATS = ["£1,234.56", "£1234.56", "£1.2k", "£1.23k"] as const;
const DATE_FORMATS    = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

export function MobileSettings({ onBack }: { onBack?: () => void }) {
  const { privacy, togglePrivacy }   = usePrivacy();
  const { theme, themes, setTheme }  = useFintrackTheme();
  const { data: currency }           = useGetSettingsCurrency();
  const currencyCode = (currency as any)?.currency ?? "GBP";

  const [numberFmt, setNumberFmt]   = useState<typeof DISPLAY_FORMATS[number]>("£1,234.56");
  const [dateFmt, setDateFmt]       = useState<typeof DATE_FORMATS[number]>("DD/MM/YYYY");
  const [darkMode, setDarkMode]     = useState(true);
  const [compactMode, setCompact]   = useState(false);

  const [notifBudget, setNotifBudget]   = useState(true);
  const [notifBills, setNotifBills]     = useState(true);
  const [notifGoals, setNotifGoals]     = useState(true);
  const [notifMarkets, setNotifMarkets] = useState(false);
  const [notifWeekly, setNotifWeekly]   = useState(true);
  const [notifMonthly, setNotifMonthly] = useState(true);

  const [sync, setSync]           = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [dataShare, setDataShare] = useState(false);

  const lastSync = "2026-07-28 · 09:14";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 0", marginBottom: 12, flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", display: "flex", padding: 12, marginLeft: -12 }}>
            <ChevronLeft size={20} />
          </button>
        )}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
          Settings
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Sync Status */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--ft-green)", flexShrink: 0, boxShadow: "0 0 6px var(--ft-green)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ft-text)" }}>All accounts synced</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ft-dim)", marginTop: 1 }}>Last updated {lastSync}</div>
            </div>
            <button style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-accent)", background: "none", border: "1px solid color-mix(in srgb, var(--ft-accent) 30%, transparent)", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
              Sync
            </button>
          </div>

          {/* Financial Health Score */}
          {(() => {
            const PILLARS: { label: string; score: number; note: string }[] = [
              { label: "Emergency fund",  score: 50, note: "3.0 of 6.0 mo · adequate" },
              { label: "Budget control",  score: 62, note: "5 of 8 budgets on track" },
              { label: "Savings rate",    score: 94, note: "58% of income saved · excellent" },
              { label: "Debt load",       score: 88, note: "2% debt-to-income · very low" },
              { label: "Diversification", score: 64, note: "68% in one account · moderate" },
            ];
            const overall = Math.round(PILLARS.reduce((s, p) => s + p.score, 0) / PILLARS.length);
            const scoreColor = overall >= 80 ? "var(--ft-green)" : overall >= 60 ? "var(--ft-accent)" : "var(--ft-red)";
            const grade = overall >= 80 ? "STRONG" : overall >= 60 ? "FAIR" : "AT RISK";
            return (
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--ft-border)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)" }}>Financial Health</span>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: scoreColor, fontVariantNumeric: "tabular-nums" }}>{overall}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)" }}> / 100</span>
                    </div>
                  </div>
                  <div style={{ position: "relative", height: 5, background: "var(--ft-raised)", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${overall}%`, background: scoreColor }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: scoreColor, letterSpacing: "0.1em" }}>{grade}</div>
                </div>
                <div style={{ padding: "10px 16px" }}>
                  {PILLARS.map(({ label, score, note }, i) => {
                    const c = score >= 80 ? "var(--ft-green)" : score >= 60 ? "var(--ft-accent)" : "var(--ft-red)";
                    return (
                      <div key={label} style={{ marginBottom: i < PILLARS.length - 1 ? 9 : 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--ft-text)" }}>{label}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>{score}</span>
                        </div>
                        <div style={{ position: "relative", height: 3, background: "var(--ft-raised)", borderRadius: 1.5, overflow: "hidden", marginBottom: 2 }}>
                          <div style={{ height: "100%", width: `${score}%`, background: c }} />
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>{note}</div>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)" }}>
                    5-pillar composite · preview mode · connects to live data on sync
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Privacy & Security */}
          <Section title="Privacy & Security">
            <SettingsRow label="Privacy mode" sub="Blur all amounts on screen">
              <Toggle on={privacy} onToggle={togglePrivacy} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Biometric lock" sub="FaceID / TouchID on app open">
              <Toggle on={biometric} onToggle={() => setBiometric(b => !b)} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Anonymous analytics" sub="Help improve the app">
              <Toggle on={dataShare} onToggle={() => setDataShare(d => !d)} />
            </SettingsRow>
          </Section>

          {/* Appearance */}
          <Section title="Appearance">
            <SettingsRow label="Dark mode" sub="Bloomberg terminal aesthetic">
              <Toggle on={darkMode} onToggle={() => setDarkMode(d => !d)} />
            </SettingsRow>
            <RowDivider />
            <SettingsRow label="Compact view" sub="Reduce card padding">
              <Toggle on={compactMode} onToggle={() => setCompact(c => !c)} />
            </SettingsRow>
            <RowDivider />
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ft-text)", marginBottom: 10 }}>Accent colour</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                {themes.map(t => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as FintrackTheme)}
                      title={t.label}
                      style={{
                        width: 32, height: 32, borderRadius: 16,
                        background: t.accent,
                        border: active ? "3px solid var(--ft-text)" : "3px solid transparent",
                        cursor: "pointer", flexShrink: 0, outline: "none",
                        boxShadow: active ? `0 0 0 2px ${t.accent}` : "none",
                        transition: "box-shadow 0.15s, border-color 0.15s",
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {themes.find(t => t.id === theme)?.label ?? theme}
              </div>
            </div>
          </Section>

          {/* Display */}
          <Section title="Display Preferences">
            <SettingsRow label="Currency" sub="Base for all conversions">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-accent)" }}>{currencyCode}</span>
            </SettingsRow>
            <RowDivider />
            <div style={{ padding: "13px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ft-text)", marginBottom: 8 }}>Number format</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DISPLAY_FORMATS.map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setNumberFmt(fmt)}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500,
                      padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                      background: numberFmt === fmt ? "var(--ft-accent)" : "var(--ft-raised)",
                      border: numberFmt === fmt ? "1px solid var(--ft-accent)" : "1px solid var(--ft-border)",
                      color: numberFmt === fmt ? "var(--ft-base)" : "var(--ft-dim)",
                      transition: "all 0.15s",
                    }}
                  >{fmt}</button>
                ))}
              </div>
            </div>
            <RowDivider />
            <div style={{ padding: "13px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ft-text)", marginBottom: 8 }}>Date format</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DATE_FORMATS.map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setDateFmt(fmt)}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
                      padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                      background: dateFmt === fmt ? "var(--ft-accent)" : "var(--ft-raised)",
                      border: dateFmt === fmt ? "1px solid var(--ft-accent)" : "1px solid var(--ft-border)",
                      color: dateFmt === fmt ? "var(--ft-base)" : "var(--ft-dim)",
                      transition: "all 0.15s",
                    }}
                  >{fmt}</button>
                ))}
              </div>
            </div>
          </Section>

          {/* Notifications */}
          <Section title="Notifications">
            <NotifRow label="Budget alerts" sub="Warn at 80% and 100%" on={notifBudget} onToggle={() => setNotifBudget(n => !n)} />
            <RowDivider />
            <NotifRow label="Bill reminders" sub="3 days before due date" on={notifBills} onToggle={() => setNotifBills(n => !n)} />
            <RowDivider />
            <NotifRow label="Goal milestones" sub="When a goal hits 25%, 50%, 100%" on={notifGoals} onToggle={() => setNotifGoals(n => !n)} />
            <RowDivider />
            <NotifRow label="Market moves" sub="Large swings in your holdings" on={notifMarkets} onToggle={() => setNotifMarkets(n => !n)} />
            <RowDivider />
            <NotifRow label="Weekly digest" sub="Every Sunday morning" on={notifWeekly} onToggle={() => setNotifWeekly(n => !n)} />
            <RowDivider />
            <NotifRow label="Monthly report" sub="First of each month" on={notifMonthly} onToggle={() => setNotifMonthly(n => !n)} />
          </Section>

          {/* Data Sync */}
          <Section title="Data & Sync">
            <SettingsRow label="Background sync" sub="Refresh every 30 minutes">
              <Toggle on={sync} onToggle={() => setSync(s => !s)} />
            </SettingsRow>
            <RowDivider />
            <a href="/import" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: 2 }}>Import data</div>
                <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>CSV, OFX, QIF formats</div>
              </div>
              <ExternalLink size={13} style={{ color: "var(--ft-border)", flexShrink: 0 }} />
            </a>
            <RowDivider />
            <a href="/export" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: 2 }}>Export data</div>
                <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>Download as CSV or PDF</div>
              </div>
              <ExternalLink size={13} style={{ color: "var(--ft-border)", flexShrink: 0 }} />
            </a>
          </Section>

          {/* Advanced / Account */}
          <Section title="Advanced">
            <a href="/settings" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: 2 }}>Full settings</div>
                <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>Integrations, webhooks, API keys</div>
              </div>
              <ExternalLink size={13} style={{ color: "var(--ft-border)", flexShrink: 0 }} />
            </a>
            <RowDivider />
            <a href="/accounts" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: 2 }}>Manage accounts</div>
                <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>Connect banks, Wise, crypto</div>
              </div>
              <ExternalLink size={13} style={{ color: "var(--ft-border)", flexShrink: 0 }} />
            </a>
            <RowDivider />
            <button style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none", background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-red)", marginBottom: 2 }}>Clear local cache</div>
                <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>Force fresh data on next open</div>
              </div>
            </button>
          </Section>

          {/* App Info */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 0" }}>
              {[
                { label: "Version",  value: "2.0.0-preview" },
                { label: "Build",    value: "20260729" },
                { label: "Region",   value: "GB · London" },
                { label: "Engine",   value: "React 18 · Vite" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-accent)", marginBottom: 8 }}>{title}</div>
      <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function RowDivider() {
  return <div style={{ borderTop: "1px solid var(--ft-border)" }} />;
}

function SettingsRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: sub ? 2 : 0 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function NotifRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <SettingsRow label={label} sub={sub}>
      <Toggle on={on} onToggle={onToggle} />
    </SettingsRow>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
        background: on ? "var(--ft-accent)" : "var(--ft-raised)",
        position: "relative", flexShrink: 0, transition: "background 0.12s",
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: "50%",
        background: on ? "var(--ft-base)" : "var(--ft-dim)",
        transition: "left 0.12s",
      }} />
    </button>
  );
}

import { useState } from "react";
import { usePrivacy } from "@/contexts/privacy-context";
import { useFintrackTheme, type FintrackTheme } from "@/contexts/theme-context";
import { useGetSettingsCurrency } from "@workspace/api-client-react";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// Mobile settings — configuration, not a financial instrument.
//
// Devices from the financial-screen vocabulary that DON'T apply and are
// deliberately left out:
//   - Number rule / dotted / native currency / BlockField / ticker glyph
//     — no monetary figures on this screen.
//   - Two-level column headers — this is a stack of key/value rows.
//   - Premium 34px headline — nothing here is a monetary summary.
//
// What DOES carry over:
//   - Type ladder (mono uppercase section labels, sans row labels).
//   - Hairline structure between rows, section header rule.
//   - Primitives instead of inline flex divs.
//   - Toggle affordance and 44px touch targets.
//   - Section groups.
//
// Also removed as part of this pass:
//   - The Financial Health Score card. Every pillar in it was hard-coded
//     (50, 62, 94, 88, 64 with a made-up 72 composite). Its own footer
//     said "preview mode · connects to live data on sync". Per the
//     CLAUDE.md rule "never show a number the API did not supply", it's
//     gone. When there's a real /health-score endpoint the desktop
//     screen already links to, the card can come back wired to it.
//   - The hard-coded "Last updated 2026-07-28 · 09:14" sync timestamp.
//     Renders "Last synced —" until the API supplies a real one.

const DISPLAY_FORMATS = ["£1,234.56", "£1234.56", "£1.2k", "£1.23k"] as const;
const DATE_FORMATS    = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

export function MobileSettings({ onBack }: { onBack?: () => void }) {
  const { privacy, togglePrivacy }   = usePrivacy();
  const { theme, themes, setTheme }  = useFintrackTheme();
  const { data: currency }           = useGetSettingsCurrency();
  const currencyCode = (currency as { currency?: string } | undefined)?.currency ?? "GBP";

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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden", background: "var(--ft-base)", color: "var(--ft-text)" }}>
      {/* Header */}
      <HStack align="center" paddingX={18} paddingY={0} gap={10} height={44}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", display: "flex", padding: 8, marginLeft: -8 }}
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <Text as="span" mono size={13} weight={700} letterSpacing="0.1em" upper color="var(--ft-text)">
          Settings
        </Text>
      </HStack>

      <div
        className="mobile-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        {/* Sync status — honest: no fake timestamp. */}
        <HStack paddingX={18} paddingY={12} gap={10} align="center" role="status">
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--ft-green)", flexShrink: 0 }} />
          <VStack grow gap={2}>
            <Text as="div" size={12} weight={600}>All accounts synced</Text>
            <Text as="div" mono size={9} letterSpacing="0.06em" color="var(--ft-dim)">
              Last synced —
            </Text>
          </VStack>
          <button
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ft-accent)",
              background: "none",
              border: "1px solid var(--ft-border2)",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Sync
          </button>
        </HStack>

        <Section title="Privacy & Security">
          <SettingsRow label="Privacy mode" sub="Blur all amounts on screen">
            <Toggle on={privacy} onToggle={togglePrivacy} />
          </SettingsRow>
          <SettingsRow label="Biometric lock" sub="FaceID / TouchID on app open">
            <Toggle on={biometric} onToggle={() => setBiometric(b => !b)} />
          </SettingsRow>
          <SettingsRow label="Anonymous analytics" sub="Help improve the app">
            <Toggle on={dataShare} onToggle={() => setDataShare(d => !d)} />
          </SettingsRow>
        </Section>

        <Section title="Appearance">
          <SettingsRow label="Dark mode" sub="Bloomberg terminal aesthetic">
            <Toggle on={darkMode} onToggle={() => setDarkMode(d => !d)} />
          </SettingsRow>
          <SettingsRow label="Compact view" sub="Reduce card padding">
            <Toggle on={compactMode} onToggle={() => setCompact(c => !c)} />
          </SettingsRow>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ft-border)" }}>
            <Text as="div" size={13} weight={500} mb={10}>Accent colour</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
              {themes.map(t => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id as FintrackTheme)}
                    title={t.label}
                    aria-label={t.label}
                    aria-pressed={active}
                    style={{
                      width: 32, height: 32, borderRadius: 16,
                      background: t.accent,
                      border: active ? "3px solid var(--ft-text)" : "3px solid transparent",
                      cursor: "pointer", flexShrink: 0, outline: "none",
                    }}
                  />
                );
              })}
            </div>
            <MonoLabel size={10} letterSpacing="0.08em" color="var(--ft-accent)">
              {themes.find(t => t.id === theme)?.label ?? theme}
            </MonoLabel>
          </div>
        </Section>

        <Section title="Display Preferences">
          <SettingsRow label="Currency" sub="Base for all conversions">
            <Text as="span" mono size={14} weight={700} color="var(--ft-accent)">{currencyCode}</Text>
          </SettingsRow>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ft-border)" }}>
            <Text as="div" size={13} weight={500} mb={8}>Number format</Text>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DISPLAY_FORMATS.map(fmt => (
                <ChipButton key={fmt} active={numberFmt === fmt} onClick={() => setNumberFmt(fmt)}>{fmt}</ChipButton>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--ft-border)" }}>
            <Text as="div" size={13} weight={500} mb={8}>Date format</Text>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DATE_FORMATS.map(fmt => (
                <ChipButton key={fmt} active={dateFmt === fmt} onClick={() => setDateFmt(fmt)}>{fmt}</ChipButton>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Notifications">
          <NotifRow label="Budget alerts" sub="Warn at 80% and 100%" on={notifBudget} onToggle={() => setNotifBudget(n => !n)} />
          <NotifRow label="Bill reminders" sub="3 days before due date" on={notifBills} onToggle={() => setNotifBills(n => !n)} />
          <NotifRow label="Goal milestones" sub="When a goal hits 25%, 50%, 100%" on={notifGoals} onToggle={() => setNotifGoals(n => !n)} />
          <NotifRow label="Market moves" sub="Large swings in your holdings" on={notifMarkets} onToggle={() => setNotifMarkets(n => !n)} />
          <NotifRow label="Weekly digest" sub="Every Sunday morning" on={notifWeekly} onToggle={() => setNotifWeekly(n => !n)} />
          <NotifRow label="Monthly report" sub="First of each month" on={notifMonthly} onToggle={() => setNotifMonthly(n => !n)} />
        </Section>

        <Section title="Data & Sync">
          <SettingsRow label="Background sync" sub="Refresh every 30 minutes">
            <Toggle on={sync} onToggle={() => setSync(s => !s)} />
          </SettingsRow>
          <LinkRow href="/import" label="Import data" sub="CSV, OFX, QIF formats" />
          <LinkRow href="/export" label="Export data" sub="Download as CSV or PDF" />
        </Section>

        <Section title="Advanced">
          <LinkRow href="/settings" label="Full settings" sub="Integrations, webhooks, API keys" />
          <LinkRow href="/accounts" label="Manage accounts" sub="Connect banks, Wise, crypto" />
          <div
            role="button"
            tabIndex={0}
            style={{
              padding: "13px 18px",
              cursor: "pointer",
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            <Text as="div" size={13} weight={500} color="var(--ft-red)" mb={2}>Clear local cache</Text>
            <Text as="div" size={11} color="var(--ft-dim)">Force fresh data on next open</Text>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ── atoms ────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 18px 6px",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        <MonoLabel as="span" size={9}>{title}</MonoLabel>
      </div>
      {children}
    </div>
  );
}

function SettingsRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <HStack paddingX={18} paddingY={12} gap={12} align="center" minWidth={0}>
      <VStack grow gap={2} minWidth0>
        <Text as="div" size={13} weight={500}>{label}</Text>
        {sub && <Text as="div" size={11} color="var(--ft-dim)">{sub}</Text>}
      </VStack>
      {children}
    </HStack>
  );
}

function NotifRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: "1px solid var(--ft-border)" }}>
      <SettingsRow label={label} sub={sub}>
        <Toggle on={on} onToggle={onToggle} />
      </SettingsRow>
    </div>
  );
}

function LinkRow({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 18px",
        textDecoration: "none",
        borderBottom: "1px solid var(--ft-border)",
      }}
    >
      <VStack grow gap={2} minWidth0>
        <Text as="div" size={13} weight={500}>{label}</Text>
        <Text as="div" size={11} color="var(--ft-dim)">{sub}</Text>
      </VStack>
      <ExternalLink size={13} style={{ color: "var(--ft-dim)", flexShrink: 0 }} />
    </a>
  );
}

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 500,
        padding: "5px 10px",
        cursor: "pointer",
        background: active ? "var(--ft-accent)" : "var(--ft-raised)",
        border: active ? "1px solid var(--ft-accent)" : "1px solid var(--ft-border)",
        color: active ? "var(--ft-base)" : "var(--ft-dim)",
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      style={{
        width: 44, height: 26, border: "none", cursor: "pointer",
        background: on ? "var(--ft-accent)" : "var(--ft-raised)",
        position: "relative", flexShrink: 0, transition: "background 0.12s",
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 20, height: 20,
        background: on ? "var(--ft-base)" : "var(--ft-dim)",
        transition: "left 0.12s",
      }} />
    </button>
  );
}

import { RotateCcw } from "lucide-react";
import { useMobileConfig, ALL_ACTIONS, ALL_WIDGETS, MID_TAB_OPTIONS, type MidTab, type QuickAction } from "@/contexts/mobile-config-context";
import { useFintrackTheme, type FintrackTheme } from "@/contexts/theme-context";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

// Mobile personalisation — theme + widget selection.
//
// Devices from the financial-screen vocabulary that DON'T apply and are
// deliberately left out:
//   - Number rule / dotted / native currency / BlockField / ticker glyph
//     — no monetary figures on this screen.
//   - Premium 34px headline — nothing here is a summary.
//   - Two-level column header — this is a stack of key/value rows.
//
// What DOES carry over:
//   - Type ladder (mono uppercase section labels, sans row labels).
//   - Hairline structure between rows and section headers.
//   - Primitives instead of raw flex divs.
//   - 44px touch targets on toggles.
//
// Also removed as part of this pass:
//   - The theme preview card showed hard-coded "£18,200.00 / +23.0% /
//     +£2,570 / 16.1mo" plus a fake 7-bar chart. Per CLAUDE.md ("never
//     show a number the API did not supply") that card is replaced by
//     a colour-only theme swatch view — the theme's own accent/base/text
//     tokens, no fabricated figures.

export function MobilePersonalize() {
  const { config, setMidTabs, toggleAction, toggleWidget, resetConfig } = useMobileConfig();
  const { theme, themes, setTheme } = useFintrackTheme();
  const currentTheme = themes.find(t => t.id === theme);

  function updateMidTab(slot: 0 | 1, value: MidTab) {
    const other = slot === 0 ? config.midTabs[1] : config.midTabs[0];
    if (value === other) return;
    const tabs: [MidTab, MidTab] = slot === 0 ? [value, other] : [other, value];
    setMidTabs(tabs);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden", background: "var(--ft-base)", color: "var(--ft-text)" }}>
      <HStack align="center" paddingX={18} paddingY={0} gap={10} height={44}>
        <Text as="span" mono size={13} weight={700} letterSpacing="0.1em" upper color="var(--ft-text)">
          Personalize
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
        <Section title="Theme">
          {/* Theme sample: the theme's own tokens rendered as a colour band,
              a hairline row and two type samples — nothing fabricated. */}
          <VStack paddingX={18} paddingY={14} gap={10}>
            <HStack gap={0} height={40}>
              <div style={{ flex: 1, background: "var(--ft-accent)" }} />
              <div style={{ flex: 1, background: "var(--ft-text)" }} />
              <div style={{ flex: 1, background: "var(--ft-dim)" }} />
              <div style={{ flex: 1, background: "var(--ft-border2)" }} />
              <div style={{ flex: 1, background: "var(--ft-border)" }} />
            </HStack>
            <div style={{ borderTop: "1px dotted var(--ft-dim)" }} />
            <HStack justify="between" align="baseline">
              <Text as="span" mono size={11} letterSpacing="0.12em" upper color="var(--ft-dim)">
                {currentTheme?.label ?? theme}
              </Text>
              <Text as="span" size={14} weight={600} color="var(--ft-accent)">Aa</Text>
            </HStack>
          </VStack>
          <div style={{ padding: "0 18px 14px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
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
                      width: 34, height: 34, borderRadius: 17,
                      background: t.accent,
                      border: active ? "3px solid var(--ft-text)" : "3px solid transparent",
                      cursor: "pointer", flexShrink: 0, outline: "none",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </Section>

        <Section title={`Home Widgets · ${config.homeWidgets.length}/${ALL_WIDGETS.length} ACTIVE`}>
          {ALL_WIDGETS.map((w) => {
            const enabled = config.homeWidgets.includes(w.id);
            return (
              <div key={w.id} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                <HStack paddingX={18} paddingY={11} gap={12} align="center" minWidth={0}>
                  <VStack grow gap={2} minWidth0>
                    <Text as="div" size={13} weight={500} color={enabled ? "var(--ft-text)" : "var(--ft-dim)"}>
                      {w.label}
                    </Text>
                    <Text as="div" size={11} color="var(--ft-dim)">{w.desc}</Text>
                  </VStack>
                  <Toggle on={enabled} onToggle={() => toggleWidget(w.id)} />
                </HStack>
              </div>
            );
          })}
        </Section>

        <Section title="Navigation Tabs">
          <VStack paddingX={18} paddingY={12} gap={12}>
            <Text as="span" size={11} color="var(--ft-dim)">
              Home and More are fixed. Choose the middle 2 tabs.
            </Text>
            {([0, 1] as const).map(slot => (
              <div key={slot}>
                <MonoLabel size={9} letterSpacing="0.06em" mb={8}>
                  Tab {slot + 2}
                </MonoLabel>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {MID_TAB_OPTIONS.map(opt => {
                    const isSelected = config.midTabs[slot] === opt.id;
                    const isOther    = config.midTabs[1 - slot] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => updateMidTab(slot, opt.id)}
                        disabled={isOther}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          padding: "5px 12px",
                          background: isSelected ? "var(--ft-accent)" : "var(--ft-raised)",
                          color: isSelected ? "var(--ft-base)" : isOther ? "var(--ft-border)" : "var(--ft-dim)",
                          border: `1px solid ${isSelected ? "var(--ft-accent)" : "var(--ft-border)"}`,
                          cursor: isOther ? "not-allowed" : "pointer",
                          fontWeight: isSelected ? 700 : 400,
                          opacity: isOther ? 0.4 : 1,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </VStack>
        </Section>

        <Section title="Quick Actions">
          {ALL_ACTIONS.map((a) => {
            const enabled = config.quickActions.includes(a.id);
            return (
              <div key={a.id} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                <HStack paddingX={18} paddingY={12} gap={12} align="center" minWidth={0}>
                  <VStack grow gap={2} minWidth0>
                    <Text as="div" size={13}>{a.label}</Text>
                    {a.fixed && <Text as="div" size={11} color="var(--ft-dim)">Always shown</Text>}
                  </VStack>
                  <Toggle on={enabled} onToggle={() => toggleAction(a.id as QuickAction)} disabled={a.fixed} />
                </HStack>
              </div>
            );
          })}
        </Section>

        <div style={{ padding: "20px 18px" }}>
          <button
            onClick={() => { if (confirm("Reset all mobile preferences to defaults?")) resetConfig(); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "1px solid var(--ft-border)",
              padding: "12px 16px",
              cursor: "pointer",
              color: "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              width: "100%",
            }}
          >
            <RotateCcw size={13} />
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}

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

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      style={{
        width: 44, height: 26, border: "none", cursor: disabled ? "default" : "pointer",
        background: on ? "var(--ft-accent)" : "var(--ft-raised)",
        opacity: disabled ? 0.5 : 1, position: "relative", flexShrink: 0, transition: "background 0.12s",
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

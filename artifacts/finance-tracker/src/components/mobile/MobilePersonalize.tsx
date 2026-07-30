import { RotateCcw } from "lucide-react";
import { useMobileConfig, ALL_ACTIONS, ALL_WIDGETS, MID_TAB_OPTIONS, type MidTab, type QuickAction } from "@/contexts/mobile-config-context";
import { useFintrackTheme, type FintrackTheme } from "@/contexts/theme-context";

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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 0", marginBottom: 12, flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
          Personalize
        </div>
      </div>

      <div className="mobile-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Theme preview */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)", borderBottom: "1px solid var(--ft-border)" }}>
              Theme
            </div>
            <div style={{ padding: "14px 16px" }}>
              {/* Live preview card */}
              <div style={{ background: "var(--ft-base)", border: `1.5px solid ${currentTheme?.accent ?? "var(--ft-accent)"}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: currentTheme?.accent ?? "var(--ft-accent)" }} />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                  PREVIEW
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                  £18,200.00
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["+23.0%", "+£2,570", "16.1mo"].map(stat => (
                    <div key={stat} style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: currentTheme?.accent ?? "var(--ft-accent)" }}>
                      {stat}
                    </div>
                  ))}
                </div>
                {/* Mini accent bar chart */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, marginTop: 8, height: 24 }}>
                  {[0.5, 0.7, 0.55, 0.8, 0.9, 0.75, 1.0].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h * 100}%`, background: currentTheme?.accent ?? "var(--ft-accent)", borderRadius: 2, opacity: i === 6 ? 1 : 0.35 }} />
                  ))}
                </div>
              </div>
              {/* Colour swatches */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                {themes.map(t => {
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as FintrackTheme)}
                      title={t.label}
                      style={{
                        width: 34, height: 34, borderRadius: 17,
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
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {currentTheme?.label ?? theme}
              </div>
            </div>
          </div>

          {/* Home Widgets */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)" }}>
                Home Widgets
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                {config.homeWidgets.length}/{ALL_WIDGETS.length} active
              </div>
            </div>
            <div style={{ padding: "6px 0" }}>
              {ALL_WIDGETS.map((w, i) => {
                const enabled = config.homeWidgets.includes(w.id);
                const isLast  = i === ALL_WIDGETS.length - 1;
                return (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: enabled ? "var(--ft-text)" : "var(--ft-dim)" }}>{w.label}</div>
                      <div style={{ fontSize: 11, color: "var(--ft-dim)", marginTop: 1 }}>{w.desc}</div>
                    </div>
                    <Toggle on={enabled} onToggle={() => toggleWidget(w.id)} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)", borderBottom: "1px solid var(--ft-border)" }}>
              Navigation Tabs
            </div>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>Home and More are fixed. Choose the middle 2 tabs.</div>
              {([0, 1] as const).map(slot => (
                <div key={slot}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                    Tab {slot + 2}
                  </div>
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
                            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
                            textTransform: "uppercase", padding: "5px 12px",
                            background: isSelected ? "var(--ft-accent)" : "var(--ft-raised)",
                            color: isSelected ? "var(--ft-base)" : isOther ? "var(--ft-border)" : "var(--ft-dim)",
                            border: `1px solid ${isSelected ? "var(--ft-accent)" : "var(--ft-border)"}`,
                            borderRadius: 20, cursor: isOther ? "not-allowed" : "pointer",
                            fontWeight: isSelected ? 700 : 400, opacity: isOther ? 0.4 : 1,
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px 8px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-accent)", borderBottom: "1px solid var(--ft-border)" }}>
              Quick Actions
            </div>
            <div style={{ padding: "6px 0" }}>
              {ALL_ACTIONS.map((a, i) => {
                const enabled = config.quickActions.includes(a.id);
                const isLast  = i === ALL_ACTIONS.length - 1;
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "var(--ft-text)" }}>{a.label}</div>
                      {a.fixed && <div style={{ fontSize: 11, color: "var(--ft-dim)" }}>Always shown</div>}
                    </div>
                    <Toggle on={enabled} onToggle={() => toggleAction(a.id as QuickAction)} disabled={a.fixed} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() => { if (confirm("Reset all mobile preferences to defaults?")) resetConfig(); }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "1px solid var(--ft-border)", borderRadius: 10, padding: "12px 16px", cursor: "pointer", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", width: "100%" }}
          >
            <RotateCcw size={13} />
            Reset to defaults
          </button>

        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      style={{
        width: 44, height: 26, borderRadius: 13, border: "none", cursor: disabled ? "default" : "pointer",
        background: on ? "var(--ft-accent)" : "var(--ft-raised)",
        opacity: disabled ? 0.5 : 1, position: "relative", flexShrink: 0, transition: "background 0.12s",
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

import { useState, useEffect, useRef } from "react";
import { BotPreview, type Phase } from "@/components/ai-wanderer";
import { getBotSkin, setBotSkin, SKINS, type BotSkinId, type SkinRarity } from "@/lib/bot-skins";

const RARITY_COLOR: Record<SkinRarity, string> = {
  COMMON: "var(--ft-dim)",
  EPIC: "#a855f7",
  LEGENDARY: "var(--ft-amber, #f59e0b)",
};

const RARITY_BG: Record<SkinRarity, string> = {
  COMMON: "rgba(255,255,255,0.04)",
  EPIC: "rgba(168,85,247,0.08)",
  LEGENDARY: "rgba(245,158,11,0.08)",
};

const PHASE_CYCLE: Phase[] = ["idle", "sitting", "coffee", "thinking", "dancing", "complaining", "tired", "jumping", "lying"];

export default function Wardrobe() {
  const [activeSkin, setActiveSkin] = useState<BotSkinId>(getBotSkin);
  const [previewPhase, setPreviewPhase] = useState<Phase>("idle");
  const [blinking, setBlinking] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const phaseIdxRef = useRef(0);

  // Blink loop
  useEffect(() => {
    const blink = () => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 180);
    };
    const id = setInterval(blink, 2800 + Math.random() * 1400);
    return () => clearInterval(id);
  }, []);

  // Auto-cycle phases
  useEffect(() => {
    if (!autoPlay) return;
    const id = setInterval(() => {
      phaseIdxRef.current = (phaseIdxRef.current + 1) % PHASE_CYCLE.length;
      setPreviewPhase(PHASE_CYCLE[phaseIdxRef.current]);
    }, 2800);
    return () => clearInterval(id);
  }, [autoPlay]);

  // ── Unlock criteria (localStorage-based) ─────────────────────────────────────
  // COMMON  : always unlocked
  // EPIC    : unlock when the user has done basic setup (onboarding complete)
  //           or has connected a crypto wallet / set a savings target
  // LEGENDARY: unlock when the user has evidence of real ongoing usage
  //           (rebalance targets set + savings target + budget rollover configured)

  const achievements = (() => {
    try {
      const raw = localStorage.getItem("ft-achievements");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  })();

  const isOnboardingComplete = !!localStorage.getItem("ft-onboarding-complete");
  const hasSavingsTarget    = !!localStorage.getItem("ft-savings-target");
  const hasCryptoWallet     = (() => {
    try {
      const raw = localStorage.getItem("ft-crypto-wallets");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length > 0 : false;
    } catch { return false; }
  })();
  const hasRebalanceTargets = (() => {
    try {
      const raw = localStorage.getItem("ft-rebalance-targets");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Object.keys(parsed).length > 0;
    } catch { return false; }
  })();
  const hasBudgetRollover = !!localStorage.getItem("ft-budget-rollover");

  const epicUnlocked = isOnboardingComplete || hasSavingsTarget || hasCryptoWallet || achievements["epic_unlock"] === true;
  const legendaryUnlocked = epicUnlocked && hasRebalanceTargets && hasBudgetRollover || achievements["legendary_unlock"] === true;

  function isUnlocked(skin: typeof SKINS[0]): boolean {
    if (skin.rarity === "COMMON") return true;
    if (skin.rarity === "EPIC") return epicUnlocked;
    if (skin.rarity === "LEGENDARY") return legendaryUnlocked;
    return false;
  }

  function selectSkin(skin: typeof SKINS[0]) {
    if (!isUnlocked(skin)) return;
    setActiveSkin(skin.id);
    setBotSkin(skin.id);
    window.dispatchEvent(new CustomEvent("bot-skin-change", { detail: skin.id }));
  }

  return (
    <>
      <style>{`
        @keyframes wand-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes wand-sit-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes wand-dance{0%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-6px) rotate(-4deg)}50%{transform:translateY(-8px) rotate(0deg)}75%{transform:translateY(-6px) rotate(4deg)}100%{transform:translateY(0) rotate(0deg)}}
        @keyframes wand-complain{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
        @keyframes wand-step{0%,50%,100%{transform:translateY(0)}25%,75%{transform:translateY(-4px)}}
        @keyframes wand-jump{0%{transform:translateY(0)}45%{transform:translateY(-30px)}70%{transform:translateY(-3px)}100%{transform:translateY(0)}}
        @keyframes ix-thigh-f{0%,100%{transform:rotate(-28deg)}50%{transform:rotate(32deg)}}
        @keyframes ix-calf-f{0%,100%{transform:rotate(5deg)}50%{transform:rotate(28deg)}}
        @keyframes ix-thigh-b{0%,100%{transform:rotate(26deg)}50%{transform:rotate(-30deg)}}
        @keyframes ix-calf-b{0%,100%{transform:rotate(20deg)}50%{transform:rotate(3deg)}}
        @keyframes ix-arm-walk{0%,100%{transform:rotate(-17deg)}50%{transform:rotate(17deg)}}
        @keyframes ix-arm-walk-far{0%,100%{transform:rotate(17deg)}50%{transform:rotate(-17deg)}}
        @keyframes ix-walk-leg-l{0%,100%{transform:translateY(0px)}50%{transform:translateY(-5px)}}
        @keyframes ix-walk-leg-r{0%,100%{transform:translateY(-5px)}50%{transform:translateY(0px)}}
        @keyframes ix-arm-idle-l{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-8deg)}}
        @keyframes ix-arm-idle-r{0%,100%{transform:rotate(0deg)}50%{transform:rotate(8deg)}}
        @keyframes ix-arm-dance-l{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(18deg)}}
        @keyframes ix-arm-dance-r{0%,100%{transform:rotate(18deg)}50%{transform:rotate(-18deg)}}
        @keyframes ix-arm-complain-l{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}
        @keyframes ix-arm-complain-r{0%,100%{transform:rotate(14deg)}50%{transform:rotate(-14deg)}}
        @keyframes steam-rise{0%{opacity:0.6;transform:translateY(0) scaleX(1)}100%{opacity:0;transform:translateY(-10px) scaleX(1.4)}}
        @keyframes wardrobe-scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes wardrobe-pulse{0%,100%{opacity:0.4}50%{opacity:0.9}}
        @keyframes wardrobe-card-in{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--ft-accent)", fontWeight: 700 }}>
              NUMERIS
            </span>
            <span style={{ color: "var(--ft-border2)" }}>›</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--ft-dim)" }}>
              WARDROBE
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontFamily: "var(--font-head)", fontWeight: 700, color: "var(--ft-text)", margin: 0, letterSpacing: "-0.01em" }}>
            Bot Wardrobe
          </h1>
          <p style={{ fontSize: 12, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", marginTop: 4, letterSpacing: "0.04em" }}>
            Equip any skin · pair with matching theme for full visual effects
          </p>
        </div>

        <div className="ft-wardrobe-layout" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, alignItems: "start" }}>
          {/* ── Left: Preview panel ── */}
          <div style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            position: "sticky",
            top: 20,
          }}>
            {/* Preview header */}
            <div style={{
              borderBottom: "1px solid var(--ft-border)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--ft-dim)", fontWeight: 600 }}>
                PREVIEW
              </span>
              <button
                onClick={() => setAutoPlay(a => !a)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  letterSpacing: "0.08em",
                  color: autoPlay ? "var(--ft-accent)" : "var(--ft-dim)",
                  background: autoPlay ? "rgba(244,162,30,0.1)" : "transparent",
                  border: `1px solid ${autoPlay ? "rgba(244,162,30,0.3)" : "var(--ft-border)"}`,
                  padding: "2px 8px",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {autoPlay ? "AUTO ●" : "AUTO ○"}
              </button>
            </div>

            {/* Stage */}
            <div style={{
              position: "relative",
              height: 260,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              overflow: "hidden",
              background: "var(--ft-base)",
            }}>
              {/* Stage grid */}
              <div style={{
                position: "absolute",
                inset: 0,
                backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
                backgroundSize: "24px 24px",
                pointerEvents: "none",
              }} />
              {/* Floor line */}
              <div style={{
                position: "absolute",
                bottom: 36,
                left: "10%",
                right: "10%",
                height: 1,
                background: "linear-gradient(90deg,transparent,var(--ft-border2),transparent)",
              }} />

              {/* Bot — render at 2.0× scale */}
              <div style={{
                transform: "scale(2.0)",
                transformOrigin: "center bottom",
                marginBottom: 36,
                animation:
                  previewPhase === "sitting" ? "wand-sit-bob 3s ease-in-out infinite" :
                  previewPhase === "dancing" ? "wand-dance 0.52s ease-in-out infinite" :
                  previewPhase === "complaining" ? "wand-complain 0.3s ease-in-out infinite" :
                  previewPhase === "tired" || previewPhase === "lying" ? "none" :
                  previewPhase === "jumping" ? "wand-jump 0.75s cubic-bezier(0.36,0.07,0.19,0.97) infinite" :
                  "wand-bob 2.6s ease-in-out infinite",
              }}>
                <BotPreview skinId={activeSkin} phase={previewPhase} blinking={blinking} />
              </div>
            </div>

            {/* Phase selector */}
            <div style={{
              borderTop: "1px solid var(--ft-border)",
              padding: "10px 14px",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--ft-dim)", marginBottom: 8 }}>
                PHASE
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {PHASE_CYCLE.map(p => (
                  <button
                    key={p}
                    onClick={() => { setAutoPlay(false); setPreviewPhase(p); }}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.06em",
                      padding: "3px 7px",
                      border: `1px solid ${previewPhase === p ? "var(--ft-accent)" : "var(--ft-border)"}`,
                      background: previewPhase === p ? "rgba(244,162,30,0.12)" : "transparent",
                      color: previewPhase === p ? "var(--ft-accent)" : "var(--ft-dim)",
                      cursor: "pointer",
                      transition: "all 0.1s",
                      textTransform: "uppercase",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Active skin info */}
            {(() => {
              const skin = SKINS.find(s => s.id === activeSkin)!;
              return (
                <div style={{
                  borderTop: "1px solid var(--ft-border)",
                  padding: "12px 16px",
                  background: RARITY_BG[skin.rarity],
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-text)", fontFamily: "var(--font-head)" }}>
                      {skin.label}
                    </span>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 7,
                      letterSpacing: "0.12em",
                      fontWeight: 700,
                      color: RARITY_COLOR[skin.rarity],
                      border: `1px solid ${RARITY_COLOR[skin.rarity]}`,
                      padding: "1px 5px",
                    }}>
                      {skin.rarity}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.5, margin: "0 0 8px", fontFamily: "var(--font-body)" }}>
                    {skin.desc}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {skin.perks.map(p => (
                      <div key={p} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: RARITY_COLOR[skin.rarity], flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Right: Skin grid ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--ft-dim)", fontWeight: 600, marginBottom: 4 }}>
              SELECT SKIN
            </div>
            {SKINS.map((skin, i) => {
              const unlocked = isUnlocked(skin);
              const isActive = activeSkin === skin.id;
              const rarityCol = RARITY_COLOR[skin.rarity];

              return (
                <button
                  key={skin.id}
                  onClick={() => selectSkin(skin)}
                  disabled={!unlocked}
                  style={{
                    background: isActive ? RARITY_BG[skin.rarity] : "var(--ft-surface)",
                    border: `1px solid ${isActive ? rarityCol : "var(--ft-border)"}`,
                    borderLeft: `3px solid ${isActive ? rarityCol : "var(--ft-border)"}`,
                    padding: "16px 20px",
                    cursor: unlocked ? "pointer" : "not-allowed",
                    textAlign: "left",
                    opacity: unlocked ? 1 : 0.5,
                    transition: "all 0.15s",
                    animation: `wardrobe-card-in 0.2s ease ${i * 0.05}s both`,
                  }}
                  onMouseEnter={e => {
                    if (!unlocked) return;
                    if (!isActive) e.currentTarget.style.borderColor = "var(--ft-border2)";
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.borderColor = "var(--ft-border)";
                    e.currentTarget.style.borderLeftColor = isActive ? rarityCol : "var(--ft-border)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                    {/* Mini bot preview */}
                    <div style={{
                      width: 52,
                      height: 74,
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: "var(--ft-base)",
                      border: "1px solid var(--ft-border)",
                      position: "relative",
                      overflow: "hidden",
                    }}>
                      <div style={{ transform: "scale(1.0)", transformOrigin: "center bottom", marginBottom: 4 }}>
                        <BotPreview skinId={skin.id} phase="idle" blinking={false} />
                      </div>
                      {!unlocked && (
                        <div style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0,0,0,0.55)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                        }}>🔒</div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ft-text)", fontFamily: "var(--font-head)" }}>
                          {skin.label}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 7,
                          letterSpacing: "0.12em",
                          fontWeight: 700,
                          color: rarityCol,
                          border: `1px solid ${rarityCol}`,
                          padding: "1px 5px",
                        }}>
                          {skin.rarity}
                        </span>
                        {isActive && (
                          <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 7,
                            letterSpacing: "0.1em",
                            color: "var(--ft-green)",
                            border: "1px solid var(--ft-green)",
                            padding: "1px 5px",
                          }}>
                            EQUIPPED
                          </span>
                        )}
                        {!unlocked && (
                          <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 7,
                            letterSpacing: "0.1em",
                            color: "var(--ft-dim)",
                            border: "1px solid var(--ft-border)",
                            padding: "1px 5px",
                          }}>
                            LOCKED
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: 11, color: "var(--ft-muted)", lineHeight: 1.5, margin: "0 0 10px", fontFamily: "var(--font-body)" }}>
                        {skin.desc}
                      </p>

                      {/* Perks */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                        {skin.perks.map(p => (
                          <div key={p} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 3, height: 3, borderRadius: "50%", background: rarityCol, flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>{p}</span>
                          </div>
                        ))}
                      </div>

                      {/* Theme pairing hint */}
                      {skin.requiredTheme && (
                        <div style={{
                          marginTop: 10,
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--ft-dim)",
                          letterSpacing: "0.06em",
                        }}>
                          ↳ Pairs with <strong style={{ color: rarityCol }}>{skin.requiredTheme.toUpperCase()}</strong> theme for full effects
                        </div>
                      )}

                      {/* Unlock hint for locked skins */}
                      {!unlocked && (
                        <div style={{
                          marginTop: 8,
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color: "var(--ft-dim)",
                          letterSpacing: "0.06em",
                          padding: "4px 6px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid var(--ft-border)",
                        }}>
                          {skin.rarity === "EPIC"
                            ? "UNLOCK: Complete onboarding, set a savings target, or add a crypto wallet"
                            : "UNLOCK: Complete Epic requirements + configure rebalance targets & budget rollover"}
                        </div>
                      )}
                    </div>

                    {/* Equip radio */}
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `2px solid ${isActive ? rarityCol : "var(--ft-border2)"}`,
                      background: isActive ? rarityCol : "transparent",
                      flexShrink: 0,
                      marginTop: 3,
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      {isActive && (
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ft-base)" }} />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Theme note */}
            <div style={{
              marginTop: 8,
              padding: "12px 16px",
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--ft-dim)",
              letterSpacing: "0.06em",
              lineHeight: 1.6,
            }}>
              <span style={{ color: "var(--ft-accent)" }}>TIP</span> — Common skins are always unlocked.
              Epic skins unlock via basic setup (onboarding / savings target / crypto wallet).
              Legendary skins require full app engagement. Pair unlocked skins with their matching theme via Settings → Appearance.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

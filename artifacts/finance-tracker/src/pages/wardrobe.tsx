import { useState, useEffect, useRef } from "react";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { BotPreview, type Phase } from "@/components/ai-wanderer";
import { getBotSkin, setBotSkin, SKINS, type BotSkinId, type SkinRarity } from "@/lib/bot-skins";
import { PageHeader } from "@/components/page-header";
import { Shirt, Lock } from "lucide-react";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

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

// Rarity glyph badge
function RarityBadge({ rarity }: { rarity: SkinRarity }) {
  const col = RARITY_COLOR[rarity];
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        letterSpacing: "0.12em",
        fontWeight: 700,
        color: col,
        border: `1px solid ${col}`,
        padding: "1px 5px",
        background: `${col}14`,
        flexShrink: 0,
      }}
    >
      {rarity}
    </span>
  );
}

// Compact perk dot row
function PerkList({ perks, color }: { perks: string[]; color: string }) {
  return (
    <HStack gap="3px 12px" wrap>
      {perks.map(p => (
        <div key={p} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>{p}</span>
        </div>
      ))}
    </HStack>
  );
}

export default function Wardrobe() {
  const [activeSkin, setActiveSkin] = useState<BotSkinId>(getBotSkin);
  const [previewPhase, setPreviewPhase] = useState<Phase>("idle");
  const [blinking, setBlinking] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const phaseIdxRef = useRef(0);
  const [hoveredSkin, setHoveredSkin] = useState<BotSkinId | null>(null);

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

  // Unlock criteria (localStorage-based)
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
  const legendaryUnlocked = (epicUnlocked && hasRebalanceTargets && hasBudgetRollover) || achievements["legendary_unlock"] === true;

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

  const activeSkinDef = SKINS.find(s => s.id === activeSkin)!;

  // Determine how many skins are unlocked vs locked
  const unlockedCount = SKINS.filter(s => isUnlocked(s)).length;
  const totalCount = SKINS.length;

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
        @keyframes wardrobe-card-in{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <PageHeader
          icon={Shirt}
          title="Bot Wardrobe"
          subtitle="equip any skin · pair with matching theme for full visual effects"
        />

        {/* Unlock progress strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "var(--ft-border)",
            border: "1px solid var(--ft-border)",
            marginBottom: 16,
          }}
        >
          {[
            { label: "Total Skins", value: String(totalCount) },
            { label: "Unlocked", value: String(unlockedCount), accent: unlockedCount === totalCount ? "var(--ft-green)" : "var(--ft-text)" },
            { label: "Equipped", value: activeSkinDef.label },
            { label: "Rarity", value: activeSkinDef.rarity, accent: RARITY_COLOR[activeSkinDef.rarity] },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ background: "var(--ft-surface)", padding: "7px 12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
              <div
                className="pnum"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: accent ?? "var(--ft-text)",
                  marginTop: 2,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Persona context strip */}
        {(() => {
          const pid = loadPersonaIds()[0];
          if (!pid) return null;
          const msgs: Record<string, string | null> = {
            social:  "Your bot companion reflects your Social Finance profile. The Social skin pairs naturally with the theme — equip it for a cohesive terminal aesthetic.",
            budget:  "Bot skins are cosmetic only and entirely free to unlock — no spending required here.",
            wealth:  null,
            market:  null,
            full:    null,
          };
          const msg = msgs[pid];
          if (!msg) return null;
          const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
          return (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
              <span>{msg}</span>
            </div>
          );
        })()}

        <div className="ft-wardrobe-layout" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── Left: Preview panel ── */}
          <div style={{
            background: "var(--ft-surface)",
            border: "1px solid var(--ft-border)",
            position: "sticky",
            top: 20,
          }}>
            {/* Preview header */}
            <div style={{
              background: "var(--ft-raised)",
              borderBottom: "1px solid var(--ft-border)",
              padding: "0 12px",
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <Text as="span" mono upper size={9} weight={600} color="var(--ft-muted)" letterSpacing="0.14em">
                PREVIEW
              </Text>
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
                  transition: "background 0.1s, color 0.1s, border-color 0.1s",
                }}
              >
                {autoPlay ? "AUTO ●" : "AUTO ○"}
              </button>
            </div>

            {/* Stage */}
            <div style={{
              position: "relative",
              height: 240,
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
                background: "var(--ft-border)",
              }} />
              {/* Phase label overlay */}
              <div style={{
                position: "absolute",
                top: 8,
                left: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--ft-dim)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: 0.7,
              }}>
                {previewPhase}
              </div>

              {/* Bot */}
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
              padding: "8px 12px",
            }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "var(--ft-dim)", marginBottom: 6, textTransform: "uppercase" }}>
                PHASE
              </div>
              <HStack gap={3} wrap>
                {PHASE_CYCLE.map(p => (
                  <button
                    key={p}
                    onClick={() => { setAutoPlay(false); setPreviewPhase(p); }}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: "0.06em",
                      padding: "3px 6px",
                      border: `1px solid ${previewPhase === p ? "var(--ft-accent)" : "var(--ft-border)"}`,
                      background: previewPhase === p ? "rgba(244,162,30,0.12)" : "transparent",
                      color: previewPhase === p ? "var(--ft-accent)" : "var(--ft-dim)",
                      cursor: "pointer",
                      transition: "background 0.1s, color 0.1s, border-color 0.1s",
                      textTransform: "uppercase",
                    }}
                    onMouseEnter={e => { if (previewPhase !== p) e.currentTarget.style.borderColor = "var(--ft-border2)"; }}
                    onMouseLeave={e => { if (previewPhase !== p) e.currentTarget.style.borderColor = "var(--ft-border)"; }}
                  >
                    {p}
                  </button>
                ))}
              </HStack>
            </div>

            {/* Active skin info */}
            <div style={{
              borderTop: "1px solid var(--ft-border)",
              padding: "10px 14px",
              background: RARITY_BG[activeSkinDef.rarity],
            }}>
              <HStack gap={8} align="center" marginBottom={5}>
                <Text as="span" mono size={13} weight={700} color="var(--ft-text)">
                  {activeSkinDef.label}
                </Text>
                <RarityBadge rarity={activeSkinDef.rarity} />
              </HStack>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.5, margin: "0 0 8px" }}>
                {activeSkinDef.desc}
              </p>
              <PerkList perks={activeSkinDef.perks} color={RARITY_COLOR[activeSkinDef.rarity]} />
              {activeSkinDef.requiredTheme && (
                <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", borderTop: "1px solid var(--ft-border)", paddingTop: 8 }}>
                  ↳ Pairs with <strong style={{ color: RARITY_COLOR[activeSkinDef.rarity] }}>{activeSkinDef.requiredTheme.toUpperCase()}</strong> theme
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Skin list ── */}
          <VStack gap={0}>
            {/* Header row */}
            <div style={{
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              borderBottom: "none",
              padding: "0 14px",
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <Text as="span" mono upper size={9} weight={600} color="var(--ft-muted)" letterSpacing="0.14em">
                SELECT SKIN
              </Text>
              <Text as="span" mono size={9} color="var(--ft-dim)">
                {unlockedCount} / {totalCount} unlocked
              </Text>
            </div>

            {/* Skin cards */}
            <div style={{ border: "1px solid var(--ft-border)", display: "flex", flexDirection: "column" }}>
              {SKINS.map((skin, i) => {
                const unlocked = isUnlocked(skin);
                const isActive = activeSkin === skin.id;
                const isHovered = hoveredSkin === skin.id;
                const rarityCol = RARITY_COLOR[skin.rarity];

                return (
                  <div
                    key={skin.id}
                    onClick={() => selectSkin(skin)}
                    onMouseEnter={() => setHoveredSkin(skin.id)}
                    onMouseLeave={() => setHoveredSkin(null)}
                    style={{
                      background: isActive
                        ? `color-mix(in srgb, ${rarityCol} 8%, var(--ft-surface))`
                        : isHovered && unlocked
                        ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
                        : "var(--ft-surface)",
                      borderTop: i > 0 ? "1px solid var(--ft-border)" : undefined,
                      borderLeft: `3px solid ${isActive ? rarityCol : "transparent"}`,
                      padding: "14px 16px",
                      cursor: unlocked ? "pointer" : "not-allowed",
                      opacity: unlocked ? 1 : 0.55,
                      transition: "background 0.12s, border-color 0.12s, opacity 0.12s",
                      animation: `wardrobe-card-in 0.18s ease ${i * 0.04}s both`,
                    }}
                  >
                    <HStack gap={14} align="start">
                      {/* Mini bot preview */}
                      <div style={{
                        width: 50,
                        height: 70,
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        flexShrink: 0,
                        background: "var(--ft-base)",
                        border: `1px solid ${isActive ? rarityCol : "var(--ft-border)"}`,
                        position: "relative",
                        overflow: "hidden",
                        transition: "border-color 0.12s",
                      }}>
                        <div style={{ transform: "scale(1.0)", transformOrigin: "center bottom", marginBottom: 3 }}>
                          <BotPreview skinId={skin.id} phase="idle" blinking={false} />
                        </div>
                        {!unlocked && (
                          <div style={{
                            position: "absolute",
                            inset: 0,
                            background: "rgba(0,0,0,0.6)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                            <Lock size={14} color="var(--ft-dim)" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Title row */}
                        <HStack gap={7} align="center" wrap marginBottom={5}>
                          <Text as="span" mono size={13} weight={700} color="var(--ft-text)">
                            {skin.label}
                          </Text>
                          <RarityBadge rarity={skin.rarity} />
                          {isActive && (
                            <span style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 8,
                              letterSpacing: "0.1em",
                              color: "var(--ft-green)",
                              border: "1px solid var(--ft-green)",
                              padding: "1px 5px",
                              background: "rgba(63,185,80,0.1)",
                            }}>
                              EQUIPPED
                            </span>
                          )}
                          {!unlocked && (
                            <span style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 8,
                              letterSpacing: "0.1em",
                              color: "var(--ft-dim)",
                              border: "1px solid var(--ft-border)",
                              padding: "1px 5px",
                            }}>
                              LOCKED
                            </span>
                          )}
                        </HStack>

                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", lineHeight: 1.5, margin: "0 0 8px" }}>
                          {skin.desc}
                        </p>

                        <PerkList perks={skin.perks} color={rarityCol} />

                        {/* Theme pairing hint */}
                        {skin.requiredTheme && (
                          <div style={{
                            marginTop: 8,
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            color: "var(--ft-dim)",
                            letterSpacing: "0.06em",
                          }}>
                            ↳ Pairs with <strong style={{ color: rarityCol }}>{skin.requiredTheme.toUpperCase()}</strong> theme for full effects
                          </div>
                        )}

                        {/* Unlock hint */}
                        {!unlocked && (
                          <div style={{
                            marginTop: 8,
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            color: "var(--ft-dim)",
                            letterSpacing: "0.06em",
                            padding: "4px 8px",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid var(--ft-border)",
                            borderLeft: `2px solid ${rarityCol}`,
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
                        marginTop: 2,
                        transition: "background 0.15s, border-color 0.15s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        {isActive && (
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--ft-base)" }} />
                        )}
                      </div>
                    </HStack>
                  </div>
                );
              })}
            </div>

            {/* Info footer strip */}
            <div
              style={{
                padding: "9px 14px",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                borderTop: "none",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--ft-dim)",
                letterSpacing: "0.05em",
                lineHeight: 1.7,
              }}
            >
              <Text as="span" weight={700} color="var(--ft-accent)">COMMON</Text>{" "}skins are always unlocked.{" "}
              <span style={{ color: RARITY_COLOR["EPIC"] }}>EPIC</span>{" "}unlocks via onboarding, savings target, or crypto wallet.{" "}
              <span style={{ color: RARITY_COLOR["LEGENDARY"] }}>LEGENDARY</span>{" "}requires full engagement.{" "}
              Pair skins via <a href="/settings" style={{ color: "var(--ft-accent)", textDecoration: "none", borderBottom: "1px solid var(--ft-border2)" }}>Settings → Appearance</a>.
            </div>
          </VStack>
        </div>
      </div>
    </>
  );
}

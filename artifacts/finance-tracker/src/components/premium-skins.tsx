type Phase = "idle" | "walking" | "jumping" | "sitting" | "coffee" | "tired" | "thinking" | "lying" | "complaining" | "dancing";

// ─── GILDED (Epic) ────────────────────────────────────────────────────────────
const GH  = "#0e0800";
const GHS = "#d97706";
const GV  = "#fbbf24";
const GVF = "#060400";
const GBD = "#1a1000";
const GBS = "#3d2800";
const GJT = "#6b3a00";
const GLG = "#251600";
const GLB = "#4b2c00";
const GBB = "#7c4600";
const GCR = "#ffd700";
const GGM = "#ef4444";

function GildedEyes({ phase, blinking }: { phase: Phase; blinking: boolean }) {
  if (blinking) return (
    <><rect x="9" y="18" width="6" height="1.4" rx="0.7" fill={GV}/><rect x="21" y="18" width="6" height="1.4" rx="0.7" fill={GV}/></>
  );
  if (phase === "lying") return (
    <><path d="M9 19.5 Q12 17.5 15 19.5" stroke={GV} strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M21 19.5 Q24 17.5 27 19.5" stroke={GV} strokeWidth="1.5" fill="none" strokeLinecap="round"/></>
  );
  if (phase === "tired") return (
    <><rect x="9" y="16.5" width="6" height="5" rx="3" fill={GVF}/><rect x="9" y="19" width="6" height="3" rx="1.5" fill="#fbbf24" opacity="0.8"/><rect x="21" y="16.5" width="6" height="5" rx="3" fill={GVF}/><rect x="21" y="19" width="6" height="3" rx="1.5" fill="#fbbf24" opacity="0.8"/></>
  );
  if (phase === "coffee" || phase === "dancing") return (
    <><path d="M9 20.5 Q12 17 15 20.5" stroke={GV} strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M21 20.5 Q24 17 27 20.5" stroke={GV} strokeWidth="1.4" fill="none" strokeLinecap="round"/></>
  );
  if (phase === "thinking") return (
    <><ellipse cx="12" cy="19" rx="3" ry="2.5" fill={GV} opacity="0.9"/><circle cx="13.2" cy="17.8" r="1" fill="rgba(255,255,255,0.45)"/><ellipse cx="24" cy="18" rx="3" ry="2.5" fill={GV} opacity="0.9"/><circle cx="25.5" cy="16.8" r="1" fill="rgba(255,255,255,0.45)"/></>
  );
  if (phase === "complaining") return (
    <><ellipse cx="12" cy="19.5" rx="3" ry="2.5" fill="#f97316"/><line x1="9" y1="16.5" x2="15" y2="19" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/><ellipse cx="24" cy="19.5" rx="3" ry="2.5" fill="#f97316"/><line x1="21" y1="16.5" x2="27" y2="19" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/></>
  );
  return (
    <><ellipse cx="12" cy="19" rx="3" ry="2.5" fill={GV} opacity="0.9"/><circle cx="13" cy="17.9" r="1" fill="rgba(255,255,255,0.45)"/><ellipse cx="24" cy="19" rx="3" ry="2.5" fill={GV} opacity="0.9"/><circle cx="25" cy="17.9" r="1" fill="rgba(255,255,255,0.45)"/></>
  );
}

function GildedHead({ phase, blinking }: { phase: Phase; blinking: boolean }) {
  return (<>
    {/* Crown base band */}
    <rect x="9" y="8" width="18" height="5" rx="0.5" fill={GCR} stroke="#b8860b" strokeWidth="0.8"/>
    {/* Left peak */}
    <polygon points="9,8 12.5,-6 16,8" fill={GCR} stroke="#b8860b" strokeWidth="0.8"/>
    {/* Center peak */}
    <polygon points="14.5,8 18,-14 21.5,8" fill={GCR} stroke="#b8860b" strokeWidth="0.8"/>
    {/* Right peak */}
    <polygon points="20,8 23.5,-6 27,8" fill={GCR} stroke="#b8860b" strokeWidth="0.8"/>
    <polygon points="9,8 12.5,-6 16,8" fill={GCR}/>
    <polygon points="14.5,8 18,-14 21.5,8" fill={GCR}/>
    <polygon points="20,8 23.5,-6 27,8" fill={GCR}/>
    {/* Gems */}
    <circle cx="12.5" cy="-5" r="2.4" fill={GGM} stroke="#b8860b" strokeWidth="0.5"/>
    <circle cx="12.5" cy="-5" r="1.2" fill="#ff6b6b" opacity="0.8"/>
    <circle cx="18" cy="-12" r="3" fill="#10b981" stroke="#b8860b" strokeWidth="0.5"/>
    <circle cx="18" cy="-12" r="1.5" fill="#6ee7b7" opacity="0.8"/>
    <circle cx="23.5" cy="-5" r="2.4" fill="#3b82f6" stroke="#b8860b" strokeWidth="0.5"/>
    <circle cx="23.5" cy="-5" r="1.2" fill="#93c5fd" opacity="0.8"/>
    <circle cx="11" cy="11" r="1" fill="#b8860b"/>
    <circle cx="18" cy="11.5" r="1.2" fill="#b8860b"/>
    <circle cx="25" cy="11" r="1" fill="#b8860b"/>

    {/* ── INGOT GOLEM FACEPLATE — trapezoidal block, wider at top ── */}
    {/* Outer trapezoidal block */}
    <polygon points="4,11 32,11 29,31 7,31" fill={GH} stroke={GHS} strokeWidth="1.5"/>
    {/* Inner bevel inset */}
    <polygon points="6,12 30,12 27,29 9,29" fill="none" stroke="#1a1000" strokeWidth="1.2"/>
    {/* Forehead plate — horizontal ingot panel */}
    <rect x="5" y="11" width="26" height="5" rx="0" fill="#0e0800"/>
    <line x1="5" y1="13.5" x2="31" y2="13.5" stroke={GJT} strokeWidth="0.5" opacity="0.45"/>
    {/* Corner ingot marks */}
    <rect x="5.5" y="11.5" width="3" height="3" fill={GJT} opacity="0.7"/>
    <rect x="27.5" y="11.5" width="3" height="3" fill={GJT} opacity="0.7"/>
    {/* Wide horizontal visor — full width slit */}
    <rect x="7" y="15" width="22" height="8" rx="0.5" fill={GVF} stroke={GHS} strokeWidth="0.8"/>
    <rect x="7.5" y="15.5" width="9" height="1.2" rx="0.6" fill="rgba(255,200,50,0.08)"/>
    <GildedEyes phase={phase} blinking={blinking}/>
    {/* Jaw grill plate */}
    <polygon points="7,23 29,23 27,31 9,31" fill="#0c0800" stroke={GJT} strokeWidth="0.6" opacity="0.95"/>
    {/* Horizontal vent lines across jaw */}
    <line x1="9" y1="25" x2="27" y2="25" stroke={GJT} strokeWidth="0.7" opacity="0.55"/>
    <line x1="9.5" y1="27.5" x2="26.5" y2="27.5" stroke={GJT} strokeWidth="0.6" opacity="0.45"/>
    <line x1="10" y1="30" x2="26" y2="30" stroke={GJT} strokeWidth="0.5" opacity="0.35"/>
    {/* Center chin bolt */}
    <rect x="16" y="28.5" width="4" height="2" rx="0" fill={GJT} opacity="0.65"/>
    {/* Expressions */}
    {phase === "tired" && <ellipse cx="18" cy="27" rx="3" ry="1.5" fill={GHS} opacity="0.6"/>}
    {phase === "complaining" && <path d="M13 27 Q18 25 23 27" stroke="#f97316" strokeWidth="1.2" fill="none" strokeLinecap="round"/>}
    {(phase === "coffee" || phase === "sitting" || phase === "dancing") && <path d="M13 27 Q18 29.5 23 27" stroke={GV} strokeWidth="1.1" fill="none" strokeLinecap="round"/>}
    {phase === "thinking" && <rect x="14" y="26.5" width="8" height="1.5" rx="0.75" fill={GV} opacity="0.4"/>}
    {!["tired","complaining","coffee","sitting","dancing","thinking"].includes(phase) && <path d="M14 27 Q18 28.5 22 27" stroke={GV} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/>}
    {/* Neck ingot collar */}
    <rect x="12" y="30" width="12" height="5" rx="1" fill={GJT} stroke={GBS} strokeWidth="0.8"/>
    <line x1="12" y1="32" x2="24" y2="32" stroke={GBS} strokeWidth="0.5" opacity="0.5"/>
  </>);
}

export function GildedSprite({ phase, blinking, walking }: { phase: Phase; blinking: boolean; walking: boolean }) {
  const lArmStyle =
    phase === "lying"       ? { transform: "rotate(88deg)" } :
    phase === "sitting"     ? { transform: "rotate(28deg)" } :
    phase === "tired"       ? { transform: "rotate(22deg)" } :
    phase === "thinking"    ? { transform: "rotate(-38deg)" } :
    phase === "jumping"     ? { animation: "ix-arm-jump-l 0.75s cubic-bezier(0.36,0.07,0.19,0.97) forwards" } :
    walking                 ? { animation: "ix-arm-walk 0.42s ease-in-out infinite" } :
    phase === "complaining" ? { animation: "ix-arm-complain-l 0.35s ease-in-out infinite" } :
    phase === "dancing"     ? { animation: "ix-arm-dance-l 0.52s ease-in-out infinite" } :
                              { animation: "ix-arm-idle-l 3.2s ease-in-out infinite" };

  const rArmStyle =
    phase === "lying"       ? { transform: "rotate(-32deg)" } :
    phase === "sitting"     ? { transform: "rotate(-28deg)" } :
    phase === "coffee"      ? { transform: "rotate(-55deg)" } :
    phase === "tired"       ? { transform: "rotate(-22deg)" } :
    phase === "thinking"    ? { transform: "rotate(18deg)" } :
    phase === "jumping"     ? { animation: "ix-arm-jump-r 0.75s cubic-bezier(0.36,0.07,0.19,0.97) forwards" } :
    walking                 ? { animation: "ix-arm-walk-far 0.42s ease-in-out infinite" } :
    phase === "complaining" ? { animation: "ix-arm-complain-r 0.35s ease-in-out infinite" } :
    phase === "dancing"     ? { animation: "ix-arm-dance-r 0.52s ease-in-out infinite" } :
                              { animation: "ix-arm-idle-r 3.5s ease-in-out infinite" };

  const lLegStyle =
    phase === "lying"   ? { transform: "rotate(-20deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "sitting" ? { transform: "rotate(-50deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "dancing" ? { animation: "ix-walk-leg-l 0.5s ease-in-out infinite" } :
    walking             ? { animation: "ix-walk-leg-l 0.42s ease-in-out infinite" } : {};

  const rLegStyle =
    phase === "lying"   ? { transform: "rotate(20deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "sitting" ? { transform: "rotate(50deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "dancing" ? { animation: "ix-walk-leg-r 0.5s ease-in-out infinite" } :
    walking             ? { animation: "ix-walk-leg-r 0.42s ease-in-out infinite" } : {};

  return (
    <svg width="36" height="66" viewBox="0 0 36 66" fill="none" overflow="visible">
      <>
      {phase === "lying" && <ellipse cx="-2" cy="17" rx="12" ry="10" fill="#3a2800" stroke="#b8860b" strokeWidth="0.8"/>}
          <GildedHead phase={phase} blinking={blinking}/>

          {/* Left arm — chunky gold ingot bar */}
          <g style={{ transformOrigin: "5px 38px", ...lArmStyle }}>
            <rect x="-4" y="35" width="14" height="20" rx="5" fill={GCR} stroke="#b8860b" strokeWidth="1.2"/>
            <line x1="-4" y1="40" x2="10" y2="40" stroke="#b8860b" strokeWidth="1" opacity="0.5"/>
            <line x1="-4" y1="45" x2="10" y2="45" stroke="#b8860b" strokeWidth="1" opacity="0.5"/>
            <line x1="-4" y1="50" x2="10" y2="50" stroke="#b8860b" strokeWidth="1" opacity="0.5"/>
            <rect x="-2" y="36" width="4" height="16" rx="1" fill="rgba(255,255,255,0.12)"/>
            <rect x="-1" y="54" width="14" height="5" rx="3" fill="#b8860b" stroke="#7a5900" strokeWidth="0.8"/>
          </g>

          {/* Right arm — chunky gold ingot bar */}
          <g style={{ transformOrigin: "31px 38px", ...rArmStyle }}>
            <rect x="26" y="35" width="14" height="20" rx="5" fill={GCR} stroke="#b8860b" strokeWidth="1.2"/>
            <line x1="26" y1="40" x2="40" y2="40" stroke="#b8860b" strokeWidth="1" opacity="0.5"/>
            <line x1="26" y1="45" x2="40" y2="45" stroke="#b8860b" strokeWidth="1" opacity="0.5"/>
            <line x1="26" y1="50" x2="40" y2="50" stroke="#b8860b" strokeWidth="1" opacity="0.5"/>
            <rect x="34" y="36" width="4" height="16" rx="1" fill="rgba(255,255,255,0.12)"/>
            <rect x="23" y="54" width="14" height="5" rx="3" fill="#b8860b" stroke="#7a5900" strokeWidth="0.8"/>
          </g>

          {/* Torso — full-width ingot block */}
          <rect x="2" y="35" width="32" height="20" rx="3" fill={GBD} stroke={GBS} strokeWidth="1.4"/>
          <line x1="2" y1="41" x2="34" y2="41" stroke={GBS} strokeWidth="1" opacity="0.6"/>
          <line x1="2" y1="47" x2="34" y2="47" stroke={GBS} strokeWidth="1" opacity="0.6"/>
          <line x1="18" y1="35" x2="18" y2="55" stroke={GBS} strokeWidth="0.7" opacity="0.4"/>
          <rect x="3" y="36" width="6" height="4" rx="1" fill="#0c0800" stroke={GJT} strokeWidth="0.5" opacity="0.8"/>
          <rect x="27" y="36" width="6" height="4" rx="1" fill="#0c0800" stroke={GJT} strokeWidth="0.5" opacity="0.8"/>
          <rect x="3" y="48" width="6" height="4" rx="1" fill="#0c0800" stroke={GJT} strokeWidth="0.5" opacity="0.8"/>
          <rect x="27" y="48" width="6" height="4" rx="1" fill="#0c0800" stroke={GJT} strokeWidth="0.5" opacity="0.8"/>

          {/* Warm amber reactor */}
          <rect x="11" y="37" width="14" height="10" rx="2" fill="#080500" stroke={GJT} strokeWidth="0.8"/>
          <circle cx="18" cy="42" r="5" fill={GV} opacity="0.04"/>
          <circle cx="18" cy="42" r="3.8" fill={GV} opacity="0.08"/>
          <circle cx="18" cy="42" r="2.6" fill={GV} opacity="0.15"/>
          <circle cx="18" cy="42" r="1.6" fill={GV} opacity="0.3"/>
          <circle cx="18" cy="42" r="0.8" fill={GV}/>
          <circle cx="17.3" cy="41.3" r="0.45" fill="rgba(255,255,255,0.65)"/>

          {/* Hip — wide ingot base */}
          <rect x="4" y="55" width="28" height="6" rx="2" fill={GLG} stroke={GLB} strokeWidth="1.2"/>
          <line x1="4" y1="58" x2="32" y2="58" stroke={GLB} strokeWidth="0.8" opacity="0.5"/>
          <circle cx="18" cy="58" r="1.2" fill={GV} opacity="0.7"/>

          {/* Left leg */}
          <g style={lLegStyle}>
            <rect x="5" y="61" width="12" height="9" rx="4" fill={GLG} stroke={GLB} strokeWidth="1.1"/>
            <line x1="5" y1="65" x2="17" y2="65" stroke={GLB} strokeWidth="0.8" opacity="0.5"/>
            <rect x="3" y="68" width="16" height="5" rx="3" fill={GBB} stroke="#7a5900" strokeWidth="1"/>
            <rect x="4" y="69" width="5" height="2" rx="1" fill="rgba(255,255,255,0.12)"/>
          </g>

          {/* Right leg */}
          <g style={rLegStyle}>
            <rect x="19" y="61" width="12" height="9" rx="4" fill={GLG} stroke={GLB} strokeWidth="1.1"/>
            <line x1="19" y1="65" x2="31" y2="65" stroke={GLB} strokeWidth="0.8" opacity="0.5"/>
            <rect x="17" y="68" width="16" height="5" rx="3" fill={GBB} stroke="#7a5900" strokeWidth="1"/>
            <rect x="18" y="69" width="5" height="2" rx="1" fill="rgba(255,255,255,0.12)"/>
          </g>

          {/* PHASE ACCESSORIES */}
          {phase === "tired" && <>
            <text x="28" y="-1" fontFamily="monospace" fontSize="9" fill="#92400e" opacity="0.9">z</text>
            <text x="34" y="-7" fontFamily="monospace" fontSize="7" fill="#92400e" opacity="0.65">z</text>
            <text x="39" y="-13" fontFamily="monospace" fontSize="5.5" fill="#92400e" opacity="0.4">z</text>
          </>}

          {phase === "coffee" && <>
            <path d="M38 20 Q36 30 38 36 L46 36 Q48 30 46 20 Z" fill="#b8860b" stroke={GCR} strokeWidth="1"/>
            <ellipse cx="42" cy="20" rx="4" ry="2" fill={GCR}/>
            <ellipse cx="42" cy="36.5" rx="5" ry="1.5" fill={GCR}/>
            <rect x="40.5" y="36.5" width="3" height="4" fill="#b8860b"/>
            <ellipse cx="42" cy="40.5" rx="5" ry="1.5" fill={GCR}/>
            <ellipse cx="42" cy="22" rx="2.5" ry="1.2" fill="#fbbf24" opacity="0.3"/>
            <path d="M40 24 Q42 21 44 24" stroke="#fbbf24" strokeWidth="0.8" fill="none" opacity="0.4" style={{ animation: "steam-rise 2s ease-in-out infinite" }}/>
          </>}

          {phase === "thinking" && <>
            <circle cx="28" cy="-3" r="2" fill="rgba(251,191,36,0.2)" stroke={GHS} strokeWidth="0.7"/>
            <circle cx="33" cy="-10" r="3.5" fill="rgba(251,191,36,0.14)" stroke={GHS} strokeWidth="0.7"/>
            <circle cx="39" cy="-17" r="5" fill="rgba(251,191,36,0.09)" stroke={GHS} strokeWidth="0.7"/>
            <text x="39" y="-14" fontFamily="monospace" fontSize="7" fill={GCR} textAnchor="middle">$</text>
          </>}

          {phase === "complaining" && <>
            <text x="-10" y="20" fontFamily="monospace" fontSize="14" fill="#f97316" opacity="0.95" fontWeight="bold">!</text>
            <text x="38" y="20" fontFamily="monospace" fontSize="14" fill="#f97316" opacity="0.95" fontWeight="bold">!</text>
            <circle cx="-14" cy="10" r="4" fill={GCR} opacity="0.9"/>
            <circle cx="-14" cy="10" r="2.5" fill="#fbbf24"/>
            <circle cx="42" cy="8" r="3.5" fill={GCR} opacity="0.8"/>
            <circle cx="42" cy="8" r="2" fill="#fbbf24"/>
          </>}

          {phase === "dancing" && <>
            <circle cx="-8" cy="14" r="4.5" fill={GCR} opacity="0.9"/>
            <circle cx="-8" cy="14" r="2.8" fill="#fbbf24"/>
            <circle cx="39" cy="10" r="3.5" fill={GCR} opacity="0.8"/>
            <circle cx="39" cy="10" r="2" fill="#fbbf24"/>
            <circle cx="-3" cy="3" r="3" fill={GCR} opacity="0.7"/>
            <circle cx="34" cy="2" r="2.5" fill={GCR} opacity="0.6"/>
            <text x="36" y="26" fontFamily="serif" fontSize="11" fill={GV} opacity="0.7">♪</text>
            <text x="-10" y="28" fontFamily="serif" fontSize="9" fill={GV} opacity="0.6">♫</text>
          </>}

          {phase === "idle" && <>
            <circle cx="18" cy="-10" r="5" fill={GCR} opacity="0.9" style={{ animation: "ix-arm-idle-l 3s ease-in-out infinite" }}/>
            <circle cx="18" cy="-10" r="3" fill="#fbbf24"/>
            <circle cx="18" cy="-10" r="1.5" fill="#fcd34d"/>
          </>}

          {phase === "sitting" && <>
            {[40, 36, 32, 28].map((y, i) => (
              <ellipse key={i} cx="44" cy={y} rx="6" ry="2" fill={i % 2 === 0 ? GCR : "#fbbf24"} stroke="#b8860b" strokeWidth="0.5"/>
            ))}
          </>}

          {phase === "jumping" && <>
            <circle cx="18" cy="-12" r="6" fill={GCR} opacity="0.9"/>
            <circle cx="18" cy="-12" r="4" fill="#fbbf24"/>
            <circle cx="18" cy="-12" r="2" fill="#fcd34d"/>
          </>}
      {phase === "lying" && (
        <>
          <rect x="-3" y="34" width="42" height="35" rx="3" fill="#0d0a00" stroke="#b8860b" strokeWidth="1.2"/>
          <rect x="-3" y="34" width="42" height="6" rx="3" fill="#1a1200" stroke="#b8860b" strokeWidth="0.8"/>
          <path d="M-3 37 Q5 38.5 10 37 Q18 35.5 23 37 Q31 38.5 39 37" stroke="#b8860b" strokeWidth="0.7" fill="none" opacity="0.6"/>
          <path d="M3 45 L8 49 L3 53 L-2 49 Z" fill="none" stroke="#b8860b" strokeWidth="0.4" opacity="0.3"/>
          <path d="M28 45 L33 49 L28 53 L23 49 Z" fill="none" stroke="#b8860b" strokeWidth="0.4" opacity="0.3"/>
          <ellipse cx="11" cy="63" rx="5" ry="3.5" fill="#1a1200" stroke="#b8860b" strokeWidth="0.8"/>
          <ellipse cx="25" cy="63" rx="5" ry="3.5" fill="#1a1200" stroke="#b8860b" strokeWidth="0.8"/>
          <circle cx="11" cy="62" r="1" fill="#b8860b" opacity="0.7"/>
          <circle cx="25" cy="62" r="1" fill="#b8860b" opacity="0.7"/>
          <g style={{ animation: "ix-bed-appear 0.4s ease-out 0.8s both" }}>
            <text x="28" y="-2" fontFamily="monospace" fontSize="9" fill="#b8860b" opacity="0.9">z</text>
            <text x="34" y="-9" fontFamily="monospace" fontSize="7" fill="#b8860b" opacity="0.65">z</text>
            <text x="40" y="-15" fontFamily="monospace" fontSize="5.5" fill="#b8860b" opacity="0.4">z</text>
          </g>
        </>
      )}
      </>
    </svg>
  );
}

// ─── BLOODLINE (Legendary) ────────────────────────────────────────────────────
const BH  = "#0d0000";
const BHS = "#991b1b";
const BV  = "#ef4444";
const BVF = "#040000";
const BBD = "#150000";
const BBS = "#2d0000";
const BJT = "#500000";
const BLG = "#1c0000";
const BLB = "#3d0000";

function BloodlineEyes({ phase, blinking }: { phase: Phase; blinking: boolean }) {
  if (blinking) return (
    <><rect x="8" y="18" width="6" height="1.4" rx="0.7" fill={BV}/><rect x="20" y="18" width="6" height="1.4" rx="0.7" fill={BV}/></>
  );
  if (phase === "lying") return (
    <><path d="M8 19.5 Q11 17.5 14 19.5" stroke={BV} strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M20 19.5 Q23 17.5 26 19.5" stroke={BV} strokeWidth="1.5" fill="none" strokeLinecap="round"/></>
  );
  if (phase === "tired") return (
    <><rect x="8" y="16.5" width="6" height="5" rx="3" fill={BVF}/><rect x="8" y="19" width="6" height="3" rx="1.5" fill="#7f1d1d" opacity="0.8"/><rect x="20" y="16.5" width="6" height="5" rx="3" fill={BVF}/><rect x="20" y="19" width="6" height="3" rx="1.5" fill="#7f1d1d" opacity="0.8"/></>
  );
  if (phase === "coffee" || phase === "dancing") return (
    <><path d="M8 20.5 Q11 17 14 20.5" stroke={BV} strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M20 20.5 Q23 17 26 20.5" stroke={BV} strokeWidth="1.4" fill="none" strokeLinecap="round"/></>
  );
  if (phase === "thinking") return (
    <><ellipse cx="11" cy="19" rx="3" ry="2.5" fill={BV} opacity="0.9"/><circle cx="12.2" cy="17.8" r="1" fill="rgba(255,100,100,0.4)"/><ellipse cx="23" cy="18" rx="3" ry="2.5" fill={BV} opacity="0.9"/><circle cx="24.5" cy="16.8" r="1" fill="rgba(255,100,100,0.4)"/></>
  );
  if (phase === "complaining") return (
    <><ellipse cx="11" cy="19.5" rx="3" ry="2.5" fill={BV}/><line x1="8" y1="16.5" x2="14" y2="19" stroke={BV} strokeWidth="1.5" strokeLinecap="round"/><ellipse cx="23" cy="19.5" rx="3" ry="2.5" fill={BV}/><line x1="20" y1="16.5" x2="26" y2="19" stroke={BV} strokeWidth="1.5" strokeLinecap="round"/></>
  );
  return (
    <><ellipse cx="11" cy="19" rx="3" ry="2.5" fill={BV} opacity="0.9"/><circle cx="12" cy="17.9" r="1" fill="rgba(255,150,150,0.4)"/><ellipse cx="23" cy="19" rx="3" ry="2.5" fill={BV} opacity="0.9"/><circle cx="24" cy="17.9" r="1" fill="rgba(255,150,150,0.4)"/></>
  );
}

function BloodlineHead({ phase, blinking }: { phase: Phase; blinking: boolean }) {
  return (<>
    {/* Demon horns — massive, organic sweep */}
    <path d="M14 12 C11 6, 3 -2, 7 -16 C11 -6, 15 2, 16 12 Z" fill="#3d0000" stroke={BV} strokeWidth="0.9"/>
    <path d="M14 12 C11 6, 4 0, 8 -14 C10 -8, 14 -2, 15 12 Z" fill="#6b0000"/>
    <path d="M22 12 C25 6, 33 -2, 29 -16 C25 -6, 21 2, 20 12 Z" fill="#3d0000" stroke={BV} strokeWidth="0.9"/>
    <path d="M22 12 C25 6, 32 0, 28 -14 C26 -8, 22 -2, 21 12 Z" fill="#6b0000"/>
    <circle cx="7.5" cy="-14" r="2.8" fill={BV} opacity="0.7"/>
    <circle cx="7.5" cy="-14" r="1.4" fill="#ff6b6b" opacity="0.9"/>
    <circle cx="28.5" cy="-14" r="2.8" fill={BV} opacity="0.7"/>
    <circle cx="28.5" cy="-14" r="1.4" fill="#ff6b6b" opacity="0.9"/>

    {/* ── CRACKED DEMON SKULL — elongated, angular, not circular ── */}
    {/* Outer skull — elongated oval with pointed chin */}
    <path d="M5 10 Q4 20 7 28 Q11 35 18 37 Q25 35 29 28 Q32 20 31 10 Q25 5 18 4 Q11 5 5 10 Z" fill={BH} stroke={BHS} strokeWidth="1.4"/>
    {/* Inner skull recess */}
    <path d="M7 11 Q6 20 9 27 Q13 33 18 34 Q23 33 27 27 Q30 20 29 11 Q24 7 18 6 Q12 7 7 11 Z" fill="none" stroke="#1a0000" strokeWidth="1.8"/>
    {/* Dominant vertical crack down center — glowing */}
    <path d="M18 5 L17 15 L19 24 L17 33" stroke="rgba(220,38,38,0.35)" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
    <path d="M18 5 L17 15 L19 24 L17 33" stroke={BV} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.88"/>
    {/* Branching crack lines */}
    <path d="M17 15 L11 13" stroke={BV} strokeWidth="0.9" fill="none" opacity="0.6"/>
    <path d="M19 24 L25 22" stroke={BV} strokeWidth="0.8" fill="none" opacity="0.55"/>
    <path d="M17 20 L13 22" stroke={BHS} strokeWidth="0.5" fill="none" opacity="0.45"/>
    {/* Visor — slightly asymmetric along the crack */}
    <path d="M6 14 L17 13 L19 14 L30 15 L30 23 L19 22 L17 23 L6 22 Z" fill={BVF} stroke={BHS} strokeWidth="0.8"/>
    {/* Crack through the visor */}
    <line x1="18" y1="13" x2="18" y2="23" stroke={BV} strokeWidth="0.7" opacity="0.55"/>
    <BloodlineEyes phase={phase} blinking={blinking}/>
    {/* Dark cracked eye socket recesses */}
    <path d="M6 14 Q8 12 11 13" stroke={BHS} strokeWidth="0.5" fill="none" opacity="0.4"/>
    <path d="M30 15 Q28 12 25 13" stroke={BHS} strokeWidth="0.5" fill="none" opacity="0.4"/>
    {/* Fang tips visible below visor */}
    <path d="M11 23 L9.5 27 L13 24.5 Z" fill="#e8e8e8" opacity="0.7"/>
    <path d="M23 23 L24.5 27 L21 24.5 Z" fill="#e8e8e8" opacity="0.6"/>
    {/* Under-jaw / chin */}
    <path d="M7 23 Q9 32 18 35 Q27 32 29 23" fill="none" stroke={BHS} strokeWidth="0.7" opacity="0.5"/>
    {/* Expressions */}
    {phase === "tired" && <ellipse cx="18" cy="28" rx="3" ry="1.8" fill={BHS} opacity="0.7"/>}
    {phase === "complaining" && <path d="M12 28 Q18 26 24 28" stroke={BV} strokeWidth="1.2" fill="none" strokeLinecap="round"/>}
    {(phase === "coffee" || phase === "sitting" || phase === "dancing") && <path d="M12 28 Q18 31 24 28" stroke={BV} strokeWidth="1.2" fill="none" strokeLinecap="round"/>}
    {phase === "thinking" && <rect x="14" y="28" width="8" height="1.5" rx="0.75" fill={BV} opacity="0.5"/>}
    {!["tired","complaining","coffee","sitting","dancing","thinking"].includes(phase) && <path d="M13 28 Q18 30 23 28" stroke={BV} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/>}
    {/* Neck */}
    <rect x="14" y="34" width="8" height="4" rx="1.5" fill={BJT}/>
    <rect x="10" y="34" width="16" height="2.5" rx="1.2" fill={BLG} stroke={BLB} strokeWidth="0.8"/>
  </>);
}

export function BloodlineSprite({ phase, blinking, walking }: { phase: Phase; blinking: boolean; walking: boolean }) {
  const lArmStyle =
    phase === "lying"       ? { transform: "rotate(88deg)" } :
    phase === "sitting"     ? { transform: "rotate(28deg)" } :
    phase === "tired"       ? { transform: "rotate(22deg)" } :
    phase === "thinking"    ? { transform: "rotate(-38deg)" } :
    phase === "jumping"     ? { animation: "ix-arm-jump-l 0.75s cubic-bezier(0.36,0.07,0.19,0.97) forwards" } :
    phase === "complaining" ? { animation: "ix-arm-complain-l 0.35s ease-in-out infinite" } :
    phase === "dancing"     ? { animation: "ix-arm-dance-l 0.52s ease-in-out infinite" } :
                              { animation: "ix-arm-idle-l 3.2s ease-in-out infinite" };

  const rArmStyle =
    phase === "lying"       ? { transform: "rotate(-32deg)" } :
    phase === "sitting"     ? { transform: "rotate(-28deg)" } :
    phase === "coffee"      ? { transform: "rotate(-55deg)" } :
    phase === "tired"       ? { transform: "rotate(-22deg)" } :
    phase === "thinking"    ? { transform: "rotate(18deg)" } :
    phase === "jumping"     ? { animation: "ix-arm-jump-r 0.75s cubic-bezier(0.36,0.07,0.19,0.97) forwards" } :
    phase === "complaining" ? { animation: "ix-arm-complain-r 0.35s ease-in-out infinite" } :
    phase === "dancing"     ? { animation: "ix-arm-dance-r 0.52s ease-in-out infinite" } :
                              { animation: "ix-arm-idle-r 3.5s ease-in-out infinite" };

  const lLegStyle =
    phase === "lying"   ? { transform: "rotate(-20deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "sitting" ? { transform: "rotate(-50deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "dancing" ? { animation: "ix-walk-leg-l 0.5s ease-in-out infinite" } :
    walking             ? { animation: "ix-walk-leg-l 0.42s ease-in-out infinite" } : {};

  const rLegStyle =
    phase === "lying"   ? { transform: "rotate(20deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "sitting" ? { transform: "rotate(50deg)", transformBox: "fill-box" as const, transformOrigin: "50% 0%" } :
    phase === "dancing" ? { animation: "ix-walk-leg-r 0.5s ease-in-out infinite" } :
    walking             ? { animation: "ix-walk-leg-r 0.42s ease-in-out infinite" } : {};

  return (
    <svg width="36" height="66" viewBox="0 0 36 66" fill="none" overflow="visible">
      <>
      {phase === "lying" && <ellipse cx="-2" cy="17" rx="12" ry="10" fill="#1c0000" stroke="#7f1d1d" strokeWidth="0.8"/>}
          <BloodlineHead phase={phase} blinking={blinking}/>

          {/* BAT WINGS */}
          <g transform="translate(8,38) scale(0.65,1) translate(-8,-38)">
            <path d="M8 38 Q-2 24 -22 20 Q-32 28 -28 38 Q-20 34 -10 36 Q-14 42 8 44 Z" fill="#1c0000" stroke={BHS} strokeWidth="1" opacity="0.97"/>
            <path d="M8 39 Q-4 26 -18 22" stroke={BHS} strokeWidth="1.1" fill="none" opacity="0.8"/>
            <path d="M8 40 Q-4 30 -16 28" stroke={BHS} strokeWidth="0.8" fill="none" opacity="0.6"/>
            <path d="M8 42 Q-2 36 -14 36" stroke={BHS} strokeWidth="0.6" fill="none" opacity="0.45"/>
            <path d="M-22 20 L-26 17 L-20 18 Z" fill={BV} opacity="0.7"/>
          </g>
          <g transform="translate(28,38) scale(0.65,1) translate(-28,-38)">
            <path d="M28 38 Q38 24 58 20 Q68 28 64 38 Q56 34 46 36 Q50 42 28 44 Z" fill="#1c0000" stroke={BHS} strokeWidth="1" opacity="0.97"/>
            <path d="M28 39 Q40 26 54 22" stroke={BHS} strokeWidth="1.1" fill="none" opacity="0.8"/>
            <path d="M28 40 Q40 30 52 28" stroke={BHS} strokeWidth="0.8" fill="none" opacity="0.6"/>
            <path d="M28 42 Q38 36 50 36" stroke={BHS} strokeWidth="0.6" fill="none" opacity="0.45"/>
            <path d="M58 20 L62 17 L56 18 Z" fill={BV} opacity="0.7"/>
          </g>
          {/* Demon tail */}
          <path d="M18 52 Q24 60 22 68 Q19 74 17 70 Q15 66 16 74" stroke={BLB} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M18 52 Q24 60 22 68 Q19 74 17 70 Q15 66 16 74" stroke={BV} strokeWidth="1" fill="none" opacity="0.7" strokeLinecap="round"/>
          <path d="M15 73 L18 78 L21 73 Z" fill={BV} opacity="0.85"/>

          {/* Slender dark gauntlet arms */}
          <g style={{ transformOrigin: "5px 38px", ...lArmStyle }}>
            <rect x="1" y="36" width="7" height="16" rx="3.5" fill={BLG} stroke={BLB} strokeWidth="1"/>
            <line x1="2.5" y1="40" x2="2.5" y2="50" stroke={BJT} strokeWidth="0.8" opacity="0.5"/>
            <path d="M1 52 L-1 56 M4 52 L3.5 57 M7 52 L9 56" stroke={BV} strokeWidth="1.1" strokeLinecap="round" fill="none"/>
          </g>
          <g style={{ transformOrigin: "31px 38px", ...rArmStyle }}>
            <rect x="28" y="36" width="7" height="16" rx="3.5" fill={BLG} stroke={BLB} strokeWidth="1"/>
            <line x1="33.5" y1="40" x2="33.5" y2="50" stroke={BJT} strokeWidth="0.8" opacity="0.5"/>
            <path d="M29 52 L27 56 M32 52 L31.5 57 M35 52 L37 56" stroke={BV} strokeWidth="1.1" strokeLinecap="round" fill="none"/>
          </g>

          {/* Torso */}
          <path d="M8,35 L28,35 L26,52 L10,52 Z" fill={BBD} stroke={BBS} strokeWidth="1.2"/>
          <path d="M9.5,36 L17.5,36 L16.5,44.5 L9.5,44 Z" fill="#0a0000" stroke={BJT} strokeWidth="0.6"/>
          <path d="M18.5,36 L26.5,36 L26.5,44 L19.5,44.5 Z" fill="#0a0000" stroke={BJT} strokeWidth="0.6"/>
          <line x1="18" y1="35" x2="17.5" y2="52" stroke={BJT} strokeWidth="0.6" opacity="0.55"/>
          <path d="M13 37 L16 43 L13 48" stroke="rgba(255,30,30,0.3)" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
          <path d="M13 37 L16 43 L13 48" stroke={BV} strokeWidth="1.2" fill="none" opacity="0.8"/>
          <path d="M20 36 L22.5 42 L20 47" stroke="rgba(220,38,38,0.2)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M20 36 L22.5 42 L20 47" stroke={BHS} strokeWidth="0.8" fill="none" opacity="0.6"/>

          {/* Crimson reactor */}
          <rect x="13.5" y="37" width="9" height="7" rx="1.5" fill="#050000" stroke={BJT} strokeWidth="0.7"/>
          <circle cx="18" cy="40.5" r="4.2" fill={BV} opacity="0.04"/>
          <circle cx="18" cy="40.5" r="3.2" fill={BV} opacity="0.08"/>
          <circle cx="18" cy="40.5" r="2.2" fill={BV} opacity="0.15"/>
          <circle cx="18" cy="40.5" r="1.4" fill={BV} opacity="0.3"/>
          <circle cx="18" cy="40.5" r="0.7" fill={BV}/>
          <circle cx="17.5" cy="40" r="0.38" fill="rgba(255,150,150,0.5)"/>

          {/* Left vents */}
          <rect x="10" y="38" width="3" height="0.85" rx="0.4" fill={BJT} opacity="0.75"/>
          <rect x="10" y="39.5" width="3" height="0.85" rx="0.4" fill={BJT} opacity="0.6"/>
          <rect x="10" y="41" width="3" height="0.85" rx="0.4" fill={BJT} opacity="0.45"/>

          {/* FLAME TENDRILS */}
          <ellipse cx="14" cy="60" rx="6" ry="12" fill={BV} opacity="0.06"/>
          <ellipse cx="22" cy="62" rx="5" ry="10" fill={BV} opacity="0.05"/>
          <path d="M12 53 Q9 58 11 64 Q8 68 12 72 Q15 66 13 61 Q16 57 14 53 Z" fill="#3d0000" stroke={BV} strokeWidth="0.7" opacity="0.9"/>
          <path d="M13 54 Q10 59 12 65 Q9 69 13 73" stroke={BV} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7"/>
          <path d="M14 53 Q12 57 13 62 Q11 66 14 70" stroke="#ff4444" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.5"/>
          <path d="M10 55 Q7 60 9 65 Q6 68 9 71" stroke={BHS} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.55"/>
          <path d="M22 53 Q25 57 24 63 Q27 67 23 72 Q20 67 22 62 Q19 58 20 53 Z" fill="#3d0000" stroke={BV} strokeWidth="0.7" opacity="0.9"/>
          <path d="M22 54 Q25 59 23 65 Q26 69 22 73" stroke={BV} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7"/>
          <path d="M21 53 Q23 57 22 62 Q24 66 21 70" stroke="#ff4444" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.5"/>
          <path d="M24 55 Q27 60 25 65 Q28 68 25 71" stroke={BHS} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.55"/>
          <path d="M17 52 Q15 57 16 63 Q14 68 17 74 Q20 69 18 63 Q19 57 17 52 Z" fill="#250000" stroke={BV} strokeWidth="0.6" opacity="0.8"/>
          <path d="M17 53 Q16 59 17 65 Q15 70 17 75" stroke={BV} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.4"/>

          {/* PHASE ACCESSORIES */}
          {phase === "tired" && <>
            <ellipse cx="34" cy="7" rx="3" ry="2.5" fill="#3d0000"/>
            <path d="M31 7 Q27 3 25 7 Q29 8.5 31 7 Z" fill="#2d0000" stroke={BHS} strokeWidth="0.5"/>
            <path d="M37 7 Q41 3 43 7 Q39 8.5 37 7 Z" fill="#2d0000" stroke={BHS} strokeWidth="0.5"/>
            <circle cx="33" cy="7" r="0.8" fill={BV}/>
            <circle cx="35" cy="7" r="0.8" fill={BV}/>
            <path d="M33 5.5 L31.5 3 L34 4.5 Z" fill="#3d0000"/>
            <path d="M35 5.5 L36.5 3 L34 4.5 Z" fill="#3d0000"/>
            <ellipse cx="-8" cy="5" rx="2.5" ry="2" fill="#3d0000"/>
            <path d="M-10.5 5 Q-14 2 -15 5 Q-12 6 -10.5 5 Z" fill="#2d0000" stroke={BHS} strokeWidth="0.4"/>
            <path d="M-5.5 5 Q-2 2 -1 5 Q-4 6 -5.5 5 Z" fill="#2d0000" stroke={BHS} strokeWidth="0.4"/>
            <circle cx="-9" cy="5" r="0.7" fill={BV}/>
            <circle cx="-7" cy="5" r="0.7" fill={BV}/>
          </>}

          {phase === "coffee" && <>
            <rect x="37" y="36" width="10" height="12" rx="2" fill="#1a0000" stroke={BHS} strokeWidth="0.8"/>
            <rect x="37" y="36" width="10" height="4" rx="2" fill="#2d0000"/>
            <path d="M47 39 Q51 39 51 43 Q51 47 47 47" stroke={BHS} strokeWidth="1.2" fill="none"/>
            <path d="M40 34 Q42 31 40 27" stroke="#7f1d1d" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" style={{ animation: "steam-rise 2s ease-in-out infinite" }}/>
            <path d="M44 33 Q46 30 44 26" stroke="#7f1d1d" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.4" style={{ animation: "steam-rise 2s ease-in-out 0.9s infinite" }}/>
          </>}

          {phase === "thinking" && <>
            <circle cx="28" cy="-3" r="2.5" fill="rgba(185,28,28,0.2)" stroke={BHS} strokeWidth="0.7"/>
            <circle cx="33" cy="-10" r="3.5" fill="rgba(185,28,28,0.15)" stroke={BHS} strokeWidth="0.7"/>
            <circle cx="40" cy="-18" r="7" fill="rgba(185,28,28,0.1)" stroke={BHS} strokeWidth="0.8"/>
            <ellipse cx="40" cy="-20" rx="4" ry="4.5" fill="#1a0000"/>
            <rect x="37" y="-17.5" width="6" height="4" rx="0.5" fill="#1a0000"/>
            <ellipse cx="38.5" cy="-20.5" rx="1.6" ry="2" fill={BV} opacity="0.7"/>
            <ellipse cx="41.5" cy="-20.5" rx="1.6" ry="2" fill={BV} opacity="0.7"/>
            <rect x="37.5" y="-14.5" width="1.2" height="2.2" fill="#080000"/>
            <rect x="39.6" y="-14.5" width="1.2" height="2.2" fill="#080000"/>
            <rect x="41.7" y="-14.5" width="1.2" height="2.2" fill="#080000"/>
          </>}

          {phase === "complaining" && <>
            <text x="-10" y="20" fontFamily="monospace" fontSize="14" fill={BV} opacity="0.95" fontWeight="bold">!</text>
            <text x="38" y="20" fontFamily="monospace" fontSize="14" fill={BV} opacity="0.95" fontWeight="bold">!</text>
            <path d="M-12 10 L-8 6 L-9 12 L-5 9 L-7 14 Z" fill={BV} opacity="0.7"/>
            <path d="M42 10 L38 6 L39 12 L35 9 L37 14 Z" fill={BV} opacity="0.7"/>
          </>}

          {phase === "dancing" && <>
            <path d="M-9 18 L-6.5 12 L-4 18 L1 18.5 L-3 23 L-2 28 L-6.5 25 L-11 28 L-10 23 L-14 18.5 Z" fill={BV} opacity="0.8"/>
            <text x="37" y="18" fontFamily="serif" fontSize="11" fill={BV} opacity="0.7">♪</text>
            <text x="38" y="30" fontFamily="serif" fontSize="9" fill={BHS} opacity="0.65">♫</text>
          </>}

          {phase === "idle" && <>
            <ellipse cx="18" cy="67" rx="14" ry="3.5" fill={BV} opacity="0.08"/>
            <ellipse cx="18" cy="67" rx="10" ry="2.5" fill={BV} opacity="0.06"/>
            <circle cx="18" cy="-10" r="5" fill="#1a0000" stroke={BV} strokeWidth="0.8" opacity="0.9"/>
            <circle cx="18" cy="-10" r="3" fill={BV} opacity="0.15"/>
            <circle cx="18" cy="-10" r="1.5" fill={BV} opacity="0.3"/>
            <circle cx="17" cy="-11" r="0.7" fill="rgba(255,150,150,0.4)"/>
          </>}

          {phase === "jumping" && <>
            <circle cx="18" cy="-12" r="7" fill="#1a0000" stroke={BV} strokeWidth="1" opacity="0.9"/>
            <circle cx="18" cy="-12" r="4.5" fill={BV} opacity="0.15"/>
            <circle cx="18" cy="-12" r="2" fill={BV} opacity="0.35"/>
          </>}

          {phase === "sitting" && <>
            <rect x="36" y="42" width="18" height="22" rx="2" fill="#1a0000" stroke={BHS} strokeWidth="1"/>
            <rect x="36" y="42" width="18" height="4" rx="2" fill="#2d0000" opacity="0.8"/>
            <rect x="36" y="56" width="18" height="3" fill="#2d0000" opacity="0.5"/>
            <line x1="45" y1="42" x2="45" y2="64" stroke={BHS} strokeWidth="0.5" opacity="0.35"/>
            <circle cx="40" cy="49" r="1.2" fill={BV} opacity="0.5"/>
            <circle cx="50" cy="49" r="1.2" fill={BV} opacity="0.5"/>
            <circle cx="45" cy="47" r="1.5" fill={BV} opacity="0.3"/>
          </>}
      {phase === "lying" && (
        <>
          <rect x="-3" y="38" width="42" height="31" rx="3" fill="#0d0000" stroke="#7f1d1d" strokeWidth="1.2"/>
          <rect x="-3" y="38" width="42" height="6" rx="3" fill="#150000" stroke="#991b1b" strokeWidth="0.8"/>
          <path d="M-3 41 Q5 42.5 10 41 Q18 39.5 23 41 Q31 42.5 39 41" stroke="#ef4444" strokeWidth="0.6" fill="none" opacity="0.3"/>
          <path d="M5 50 Q9 54 5 58 Q2 54 5 50 Z" fill="none" stroke="#7f1d1d" strokeWidth="0.5" opacity="0.6"/>
          <path d="M26 50 Q30 54 28 58 Q24 54 26 50 Z" fill="none" stroke="#7f1d1d" strokeWidth="0.5" opacity="0.6"/>
          <ellipse cx="11" cy="63" rx="5" ry="3.5" fill="#0d0000" stroke="#7f1d1d" strokeWidth="0.8"/>
          <ellipse cx="25" cy="63" rx="5" ry="3.5" fill="#0d0000" stroke="#7f1d1d" strokeWidth="0.8"/>
          <path d="M7 65 L5.5 68 M10 66 L9.5 69 M13 66 L15 68" stroke="#ef4444" strokeWidth="0.9" strokeLinecap="round" opacity="0.7"/>
          <path d="M21 65 L19.5 68 M24 66 L23.5 69 M27 66 L29 68" stroke="#ef4444" strokeWidth="0.9" strokeLinecap="round" opacity="0.7"/>
          <g style={{ animation: "ix-bed-appear 0.4s ease-out 0.8s both" }}>
            <text x="28" y="-2" fontFamily="monospace" fontSize="9" fill="#7f1d1d" opacity="0.9">z</text>
            <text x="34" y="-9" fontFamily="monospace" fontSize="7" fill="#7f1d1d" opacity="0.65">z</text>
            <text x="40" y="-15" fontFamily="monospace" fontSize="5.5" fill="#7f1d1d" opacity="0.4">z</text>
          </g>
        </>
      )}
      </>
    </svg>
  );
}

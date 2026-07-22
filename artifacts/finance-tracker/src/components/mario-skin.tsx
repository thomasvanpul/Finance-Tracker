type Phase = "idle" | "walking" | "jumping" | "sitting" | "coffee" | "tired" | "thinking" | "lying" | "complaining" | "dancing";

const MC = "#E31212";
const MO = "#1B4FD8";
const MS = "#F5A06A";
const MH = "#3D1800";
const MG = "#F8F8F0";
const MB = "#5C3317";
const MY = "#F4D03F";

export function MarioSprite({ phase, blinking, walking }: { phase: Phase; blinking: boolean; walking: boolean }) {
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

  const isTired = phase === "tired";
  const eyes = blinking ? (
    <>
      <rect x="10" y="14.5" width="5" height="1.5" rx="0.75" fill={MC} opacity="0.8"/>
      <rect x="21" y="14.5" width="5" height="1.5" rx="0.75" fill={MC} opacity="0.8"/>
    </>
  ) : phase === "lying" ? (
    <>
      <path d="M10 15 Q12.5 13 15 15" stroke="#0a0500" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M21 15 Q23.5 13 26 15" stroke="#0a0500" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </>
  ) : isTired ? (
    <>
      <rect x="10" y="12" width="5.5" height="5.5" rx="2.75" fill="#0a0500"/>
      <rect x="10" y="14.5" width="5.5" height="3.2" rx="1.6" fill={MS} opacity="0.85"/>
      <rect x="21" y="12" width="5.5" height="5.5" rx="2.75" fill="#0a0500"/>
      <rect x="21" y="14.5" width="5.5" height="3.2" rx="1.6" fill={MS} opacity="0.85"/>
    </>
  ) : phase === "complaining" ? (
    <>
      <line x1="9" y1="9.5" x2="16" y2="12.5" stroke="#0a0500" strokeWidth="2" strokeLinecap="round"/>
      <line x1="27" y1="9.5" x2="20" y2="12.5" stroke="#0a0500" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="13" cy="14.5" r="2.2" fill="#0a0500"/>
      <circle cx="23" cy="14.5" r="2.2" fill="#0a0500"/>
    </>
  ) : phase === "dancing" ? (
    <>
      <path d="M10 15 Q12.5 11.5 15 15" stroke="#0a0500" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M21 15 Q23.5 11.5 26 15" stroke="#0a0500" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </>
  ) : (
    <>
      <circle cx="13" cy="14.5" r="2.2" fill="#0a0500"/>
      <circle cx="23" cy="14.5" r="2.2" fill="#0a0500"/>
      <circle cx="13.6" cy="13.7" r="0.7" fill="rgba(255,255,255,0.6)"/>
      <circle cx="23.6" cy="13.7" r="0.7" fill="rgba(255,255,255,0.6)"/>
    </>
  );

  return (
    <svg width="36" height="66" viewBox="0 0 36 66" fill="none" overflow="visible">
      <>
      {phase === "lying" && <ellipse cx="-2" cy="14" rx="12" ry="9" fill="#F8F5EE" stroke="#E0DAD0" strokeWidth="0.8"/>}
          {/* === HEAD === */}
          <ellipse cx="18" cy="6" rx="11" ry="7" fill={MH}/>
          <circle cx="18" cy="16" r="12" fill={MS}/>
          {/* Ears */}
          <circle cx="5.5" cy="16" r="2.8" fill={MS}/>
          <circle cx="30.5" cy="16" r="2.8" fill={MS}/>
          {/* Red cap */}
          <ellipse cx="18" cy="5" rx="14" ry="9" fill={MC}/>
          <rect x="3" y="11" width="30" height="5" rx="2" fill={MC}/>
          {/* White badge with M */}
          <circle cx="18" cy="6" r="5.5" fill="#FFFFFF"/>
          <text x="18" y="10.5" fontFamily="Arial Black,Impact,sans-serif" fontSize="8" fill={MC} fontWeight="bold" textAnchor="middle">M</text>
          {/* Eyes */}
          {eyes}
          {/* Nose */}
          <ellipse cx="18" cy="21" rx="3.2" ry="2.2" fill="#e8895a"/>
          {/* Mustache — two big bushy lobes */}
          <ellipse cx="12" cy="24.5" rx="6.5" ry="2.8" fill={MH} transform="rotate(-7 12 24.5)"/>
          <ellipse cx="24" cy="24.5" rx="6.5" ry="2.8" fill={MH} transform="rotate(7 24 24.5)"/>

          {/* === NECK === */}
          <rect x="15" y="28" width="6" height="4" rx="2" fill={MS}/>

          {/* === TORSO === */}
          <rect x="5" y="29" width="26" height="20" rx="3" fill={MC}/>
          {/* Blue overalls bib */}
          <rect x="10" y="30" width="16" height="17" rx="2" fill={MO}/>
          {/* Suspenders */}
          <rect x="10" y="29" width="4" height="4" rx="1.5" fill={MO}/>
          <rect x="22" y="29" width="4" height="4" rx="1.5" fill={MO}/>
          {/* Buttons */}
          <circle cx="14" cy="38" r="1.6" fill={MY}/>
          <circle cx="22" cy="38" r="1.6" fill={MY}/>

          {/* === LEFT ARM === */}
          <g style={{ transformOrigin: "5px 38px", ...lArmStyle }}>
            <circle cx="7" cy="33" r="4" fill={MC}/>
            <rect x="2" y="32" width="8" height="13" rx="4" fill={MC}/>
            <circle cx="6" cy="47" r="5" fill={MG}/>
            <line x1="3.5" y1="45.5" x2="2.5" y2="43.5" stroke="#ccc" strokeWidth="1" strokeLinecap="round"/>
            <line x1="8.5" y1="45.5" x2="9.5" y2="43.5" stroke="#ccc" strokeWidth="1" strokeLinecap="round"/>
          </g>

          {/* === RIGHT ARM === */}
          <g style={{ transformOrigin: "31px 38px", ...rArmStyle }}>
            <circle cx="29" cy="33" r="4" fill={MC}/>
            <rect x="26" y="32" width="8" height="13" rx="4" fill={MC}/>
            <circle cx="30" cy="47" r="5" fill={MG}/>
            <line x1="27.5" y1="45.5" x2="26.5" y2="43.5" stroke="#ccc" strokeWidth="1" strokeLinecap="round"/>
            <line x1="32.5" y1="45.5" x2="33.5" y2="43.5" stroke="#ccc" strokeWidth="1" strokeLinecap="round"/>
          </g>

          {/* === HIP === */}
          <rect x="9" y="49" width="18" height="6" rx="3" fill={MO}/>
          <rect x="13" y="51" width="10" height="2.5" rx="1.2" fill="#0e239a" opacity="0.5"/>

          {/* === LEGS === */}
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 0%", ...lLegStyle }}>
            <rect x="9" y="55" width="9" height="10" rx="3" fill={MO}/>
          </g>
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 0%", ...rLegStyle }}>
            <rect x="18" y="55" width="9" height="10" rx="3" fill={MO}/>
          </g>

          {/* === BOOTS === */}
          <rect x="7" y="63" width="11" height="5" rx="2" fill={MB}/>
          <rect x="6" y="65.5" width="13" height="3" rx="1.5" fill={MB}/>
          <rect x="7.5" y="64.5" width="5" height="1" rx="0.5" fill="rgba(255,255,255,0.07)"/>
          <rect x="18" y="63" width="11" height="5" rx="2" fill={MB}/>
          <rect x="17" y="65.5" width="13" height="3" rx="1.5" fill={MB}/>
          <rect x="18.5" y="64.5" width="5" height="1" rx="0.5" fill="rgba(255,255,255,0.07)"/>

          {/* === PHASE ACCESSORIES === */}

          {phase === "tired" && <>
            <text x="28" y="-1" fontFamily="monospace" fontSize="9" fill="#CC2000" opacity="0.9">z</text>
            <text x="34" y="-7" fontFamily="monospace" fontSize="7" fill="#CC2000" opacity="0.65">z</text>
            <text x="40" y="-13" fontFamily="monospace" fontSize="5.5" fill="#CC2000" opacity="0.4">z</text>
          </>}

          {/* Coffee mug + mushroom */}
          {phase === "coffee" && <>
            <rect x="36" y="26" width="14" height="16" rx="2" fill="#7B341E" stroke="#92400e" strokeWidth="0.8"/>
            <rect x="36" y="26" width="14" height="5" rx="2" fill="#92400e"/>
            <path d="M50 30 Q55 30 55 36 Q55 42 50 42" stroke="#92400e" strokeWidth="1.5" fill="none"/>
            <path d="M40 24 Q42 20 40 16" stroke="#c4c4c4" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5" style={{ animation: "steam-rise 2s ease-in-out infinite" }}/>
            <path d="M46 23 Q48 19 46 15" stroke="#c4c4c4" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.35" style={{ animation: "steam-rise 2s ease-in-out 0.9s infinite" }}/>
            {/* Mushroom on left */}
            <ellipse cx="-7" cy="36" rx="7" ry="5" fill="#ef4444"/>
            <ellipse cx="-7" cy="40" rx="5.5" ry="4" fill={MS}/>
            <circle cx="-11" cy="33" r="2" fill="white" opacity="0.85"/>
            <circle cx="-3.5" cy="32.5" r="1.8" fill="white" opacity="0.85"/>
            <circle cx="-9" cy="37" r="1.3" fill="white" opacity="0.6"/>
          </>}

          {/* Question block */}
          {phase === "thinking" && <>
            <circle cx="27" cy="4" r="2.5" fill="rgba(251,191,36,0.25)" stroke={MY} strokeWidth="0.8"/>
            <circle cx="33" cy="-3" r="4" fill="rgba(251,191,36,0.18)" stroke={MY} strokeWidth="0.8"/>
            <rect x="36" y="-16" width="18" height="18" rx="2" fill={MY} stroke="#b8860b" strokeWidth="1.5"/>
            <rect x="36" y="-16" width="18" height="4" rx="2" fill="#fcd34d"/>
            <rect x="36" y="-16" width="18" height="1.5" rx="1" fill="rgba(255,255,255,0.3)"/>
            <text x="45" y="-3.5" fontFamily="Arial Black,Impact,sans-serif" fontSize="12" fill={MC} textAnchor="middle" fontWeight="bold">?</text>
          </>}

          {/* Exclamation + fireball */}
          {phase === "complaining" && <>
            <text x="-17" y="24" fontFamily="monospace" fontSize="20" fill="#ef4444" opacity="0.95" fontWeight="bold">!</text>
            <text x="38" y="24" fontFamily="monospace" fontSize="20" fill="#ef4444" opacity="0.95" fontWeight="bold">!</text>
            <circle cx="47" cy="9" r="7" fill="#f97316" opacity="0.85"/>
            <circle cx="47" cy="9" r="4.5" fill="#fbbf24"/>
            <circle cx="44.5" cy="7" r="1.8" fill="white" opacity="0.5"/>
          </>}

          {/* Star + notes */}
          {phase === "dancing" && <>
            <path d="M-10 16 L-7.5 9.5 L-5 16 L-0.5 16.5 L-4 20.5 L-3 25.5 L-7.5 22.5 L-12 25.5 L-11 20.5 L-14.5 16.5 Z" fill={MY} opacity="0.95"/>
            <text x="37" y="18" fontFamily="serif" fontSize="14" fill={MC} opacity="0.85">♪</text>
            <text x="38" y="33" fontFamily="serif" fontSize="12" fill={MC} opacity="0.7">♫</text>
          </>}

          {/* Brick block */}
          {phase === "sitting" && <>
            <rect x="36" y="42" width="18" height="18" rx="1.5" fill="#b45309"/>
            <rect x="36" y="42" width="18" height="4.5" rx="1.5" fill="#d97706" opacity="0.55"/>
            <rect x="36" y="52" width="18" height="4" fill="#d97706" opacity="0.35"/>
            <rect x="45.5" y="42" width="1.5" height="18" fill="#d97706" opacity="0.4"/>
            <rect x="36" y="46.5" width="9" height="1.5" fill="#d97706" opacity="0.4"/>
            <rect x="46" y="56.5" width="8" height="1.5" fill="#d97706" opacity="0.4"/>
          </>}

          {/* Coin above when jumping */}
          {phase === "jumping" && <>
            <circle cx="18" cy="-12" r="8" fill={MY}/>
            <circle cx="18" cy="-12" r="5.5" fill="#fbbf24"/>
            <circle cx="18" cy="-12" r="3" fill="#fcd34d"/>
            <text x="18" y="-9" fontFamily="Arial Black" fontSize="5.5" fill="#b8860b" textAnchor="middle" fontWeight="bold">$</text>
          </>}

          {/* Walking: coin trail dots */}
          {(phase === "walking" || walking) && phase !== "idle" && <>
            <circle cx="-4" cy="30" r="1.5" fill={MY} opacity="0.5"/>
            <circle cx="-9" cy="28" r="1" fill={MY} opacity="0.3"/>
          </>}
      {phase === "lying" && (
        <>
          <rect x="-2" y="27" width="40" height="43" rx="3" fill={MC} opacity="0.92"/>
          <rect x="-2" y="27" width="40" height="5" rx="3" fill="#e03010" stroke="#cc2000" strokeWidth="0.7"/>
          <path d="M-2 30 Q6 31.5 11 30 Q18 28.5 23 30 Q30 31.5 38 30" stroke="#aa1800" strokeWidth="0.8" fill="none" opacity="0.8"/>
          <ellipse cx="10" cy="64" rx="5" ry="3.5" fill={MB} stroke="#3a1800" strokeWidth="0.7"/>
          <ellipse cx="24" cy="64" rx="5" ry="3.5" fill={MB} stroke="#3a1800" strokeWidth="0.7"/>
          <ellipse cx="10" cy="62" rx="3" ry="1.2" fill="rgba(255,255,255,0.07)"/>
          <ellipse cx="24" cy="62" rx="3" ry="1.2" fill="rgba(255,255,255,0.07)"/>
          <g style={{ animation: "ix-bed-appear 0.4s ease-out 0.8s both" }}>
            <text x="28" y="-2" fontFamily="monospace" fontSize="9" fill="#CC2000" opacity="0.9">z</text>
            <text x="34" y="-9" fontFamily="monospace" fontSize="7" fill="#CC2000" opacity="0.65">z</text>
            <text x="40" y="-15" fontFamily="monospace" fontSize="5.5" fill="#CC2000" opacity="0.4">z</text>
          </g>
        </>
      )}
      </>
    </svg>
  );
}

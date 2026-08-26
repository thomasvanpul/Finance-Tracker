import { Skeleton } from "@/components/skeleton";

// Shape-matching skeleton for phone screens (and desktop Suspense fallbacks
// that used to render a full-viewport cream rectangle). Sizes to its slot
// via flex:1; minHeight:0 — never uses viewport arithmetic. See lock #15
// (viewport-arithmetic.leak-lock.test.ts) for the pattern this replaces.
//
// Amendment lines followed (see src/index.css:47–94):
//   :54  border-radius 16-24px on cards, sheets, buttons and floating nav.
//        Tables and aligned metric columns stay square.
//   :59  gradients are permitted on backgrounds, cards and area-chart fills.
//   :77  minimum 11px type; primary number on a screen at 28px or above.
//   :78  no screen may end with more than ~25% dead vertical space unless
//        the emptiness is the message.
//   :88  BANNED: delaying data behind a transition. When real content
//        arrives, replace this skeleton in one frame (React unmounts it).
//   :188 reduced-motion collapse handles the shimmer.

type Shape = "header-list" | "header-hero-list" | "card-grid" | "plain";

interface PhoneScreenSkeletonProps {
  shape: Shape;
  rows?: number;
}

// Row height matches typical list row: label + value ≈ 44px (Amendment
// :74 minimum touch target). Skeleton uses a shorter 20px bar centred
// vertically so the row's visual weight matches what will replace it.
const HEADER_STRIP_HEIGHT = 44;
const ROW_HEIGHT = 56;
const ROW_BAR_HEIGHT = 20;
const HERO_HEIGHT = 96;
const CARD_HEIGHT = 96;
const CARD_RADIUS = 18;  // Amendment :54 range 16-24
const HERO_RADIUS = 20;  // Amendment :54 range 16-24
const EDGE_INSET = 16;
const SECTION_GAP = 12;

function HeaderStrip() {
  return (
    <div
      style={{
        height: HEADER_STRIP_HEIGHT,
        display: "flex",
        alignItems: "center",
        padding: `0 ${EDGE_INSET}px`,
        borderBottom: "1px solid var(--ft-border)",
        flexShrink: 0,
      }}
    >
      <Skeleton width={120} height={12} />
    </div>
  );
}

function ListRow() {
  return (
    <div
      style={{
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${EDGE_INSET}px`,
        borderBottom: "1px solid var(--ft-border)",
        flexShrink: 0,
      }}
    >
      <Skeleton width="60%" height={ROW_BAR_HEIGHT} />
      <Skeleton width={64} height={ROW_BAR_HEIGHT} />
    </div>
  );
}

function HeroBlock() {
  return (
    <div style={{ padding: EDGE_INSET, flexShrink: 0 }}>
      <Skeleton width="100%" height={HERO_HEIGHT} radius={HERO_RADIUS} />
    </div>
  );
}

function CardGridBlock() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: SECTION_GAP,
        padding: EDGE_INSET,
        flexShrink: 0,
      }}
    >
      <Skeleton width="100%" height={CARD_HEIGHT} radius={CARD_RADIUS} />
      <Skeleton width="100%" height={CARD_HEIGHT} radius={CARD_RADIUS} />
      <Skeleton width="100%" height={CARD_HEIGHT} radius={CARD_RADIUS} />
      <Skeleton width="100%" height={CARD_HEIGHT} radius={CARD_RADIUS} />
    </div>
  );
}

function PlainBlock() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: EDGE_INSET,
        display: "flex",
        flexDirection: "column",
        gap: SECTION_GAP,
      }}
    >
      <Skeleton width="100%" height="100%" />
    </div>
  );
}

export function PhoneScreenSkeleton({ shape, rows = 6 }: PhoneScreenSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--ft-base)",
      }}
    >
      {shape === "header-list" && (
        <>
          <HeaderStrip />
          {Array.from({ length: rows }).map((_, i) => (
            <ListRow key={i} />
          ))}
        </>
      )}
      {shape === "header-hero-list" && (
        <>
          <HeaderStrip />
          <HeroBlock />
          {Array.from({ length: Math.max(rows - 1, 0) }).map((_, i) => (
            <ListRow key={i} />
          ))}
        </>
      )}
      {shape === "card-grid" && (
        <>
          <HeaderStrip />
          <CardGridBlock />
        </>
      )}
      {shape === "plain" && <PlainBlock />}
    </div>
  );
}

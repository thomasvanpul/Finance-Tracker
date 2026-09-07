import type { CSSProperties, ReactNode } from "react";
import { Link } from "wouter";

// ── Drill ───────────────────────────────────────────────────────────────────
// A figure computed from rows is a button, and pressing it opens the rows
// (DESIGN.md §14). This is the only component that says so, so the affordance
// lives in exactly one place and every screen inherits the same one.
//
// The visual half is `.ft-drill` in index.css — a faint underline at rest,
// accent on hover and keyboard focus. The behavioural half is here.
//
// Two forms, because the destination is not always a URL:
//   Drill        navigates, and is an <a>: keyboard reachable, middle
//                clickable, and it shows its target in the status bar.
//   DrillButton  opens a surface on the current screen — used only where
//                there is genuinely no href, because an <a> is the better
//                element every time there is one.
//
// Both stop the click reaching a clickable ancestor. Drills sit inside rows
// that are themselves pressable, and the drill is the more specific target:
// pressing a category inside a transaction row means "show me this category",
// not "open this transaction". Without this the row wins and the drill looks
// broken.
//
// There is no `style` on the visual properties this class owns — colour and
// underline come from `.ft-drill` alone, so no call site can quietly invent a
// second affordance. `style` carries layout and typography only, which the
// class does not touch: it inherits colour and sets no font.

interface DrillBaseProps {
  children: ReactNode;
  /** Layout and typography only. Colour and underline belong to `.ft-drill`. */
  style?: CSSProperties;
  /** Native tooltip — say what pressing it opens. */
  title?: string;
  "aria-label"?: string;
}

interface DrillProps extends DrillBaseProps {
  href: string;
}

export function Drill({ href, children, style, title, ...rest }: DrillProps) {
  return (
    <Link
      href={href}
      className="ft-drill"
      style={style}
      title={title}
      aria-label={rest["aria-label"]}
      onClick={(e) => { e.stopPropagation(); }}
    >
      {children}
    </Link>
  );
}

interface DrillButtonProps extends DrillBaseProps {
  onClick: () => void;
}

export function DrillButton({ onClick, children, style, title, ...rest }: DrillButtonProps) {
  return (
    <button
      type="button"
      className="ft-drill"
      title={title}
      aria-label={rest["aria-label"]}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        textAlign: "inherit",
        ...style,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
  );
}

/**
 * A drill whose whole row or cell is the target.
 *
 * Wrap the cell in this and mark the figure inside with `.ft-drill` (or a
 * `<span className="ft-drill">`). The underline stays on the figure — that is
 * what §14 is about — while the hit area is the whole cell, which is how a
 * phone reaches its 44px without an underline running the width of a row.
 */
export function DrillTarget({ href, children, style, title }: DrillProps) {
  return (
    <Link
      href={href}
      className="ft-drill-target"
      style={style}
      title={title}
      onClick={(e) => { e.stopPropagation(); }}
    >
      {children}
    </Link>
  );
}

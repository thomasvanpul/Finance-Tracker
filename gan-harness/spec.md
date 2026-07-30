# Finance Tracker — Design Specification

## What This Is

A personal finance operating system for someone who finds Mint patronizing and YNAB too slow.
Not a dashboard. Not an app. A terminal with opinions.

The experience model is: you sit down, the interface tells you exactly where you stand, and you act.
No onboarding flows. No empty states with illustrations. No "getting started" checklists.
If you open it and your portfolio is down 4%, it tells you immediately, in red, in numbers.

---

## The Chromatic Contract

Every theme has exactly four semantic color roles. These roles never drift — `--ft-positive` is always
green and means only one thing. Color is information, not decoration.

### Five Named Themes (each a distinct personality)

**1. Bloomberg Void** *(default)*
- Background: `#000000` — pure black, no tint
- Surface: `#0A0A0A` — barely lifted from void
- Text primary: `#E8E8E8`
- Text muted: `#5A5A5A`
- Accent: `#E8A430` — amber, the original terminal glow
- Positive: `#22C55E`
- Negative: `#EF4444`
- Border: `#1A1A1A`

**2. Phosphor Green** *(nostalgia terminal)*
- Background: `#020904`
- Surface: `#060F08`
- Text primary: `#39FF14` — phosphor green, slightly scanline-soft
- Text muted: `#1A5C10`
- Accent: `#39FF14`
- Positive: `#39FF14`
- Negative: `#FF4444`
- Border: `#0D2610`

**3. Arctic** *(the one light-mode power user)*
- Background: `#F4F6F9`
- Surface: `#FFFFFF`
- Text primary: `#0D1117`
- Text muted: `#6B7280`
- Accent: `#0EA5E9` — ice blue
- Positive: `#059669`
- Negative: `#DC2626`
- Border: `#E2E8F0`

**4. Midnight Navy** *(Reuters Eikon, institutional)*
- Background: `#030D1A`
- Surface: `#071628`
- Text primary: `#CBD5E1`
- Text muted: `#334155`
- Accent: `#06B6D4` — cyan
- Positive: `#10B981`
- Negative: `#F43F5E`
- Border: `#0F2137`

**5. Amber Terminal** *(old school trading floor)*
- Background: `#0C0800`
- Surface: `#140F00`
- Text primary: `#F59E0B`
- Text muted: `#78350F`
- Accent: `#FBBF24`
- Positive: `#84CC16`
- Negative: `#EF4444`
- Border: `#1C1200`

---

## Typography — Non-Negotiable Rules

### Fonts
- **Data / numbers / values / timestamps / codes**: `JetBrains Mono` or `IBM Plex Mono` — no exceptions
- **Labels / headers / navigation**: `Space Grotesk` or `Epilogue`
- **Body / descriptions**: `IBM Plex Sans`

### Sizes (two tiers only — no in-between)
- **Dense tier** (transaction rows, metadata, labels): 11–13px
- **Hero tier** (primary KPIs, section headings): 20–28px
- Nothing lives at 15–19px. That range is the comfort zone of mediocrity.

### Number formatting rules
- Always 2 decimal places minimum for currency
- Always comma-separated thousands: `$12,440.00` not `$12440`
- Positive delta with `+` prefix: `+$340.00`
- Negative delta: `–$120.00` (en dash, not hyphen)
- Percentage: `+4.22%` not `+4.22 %`

---

## Layout Architecture

### The Grid
12-column grid. Named panel zones, not generic cards.

```
┌─────────────────────────────────────────────────────────────────┐
│ TOPBAR: session info · last sync · active theme                 │
├──────────┬──────────────────────────────┬───────────────────────┤
│          │                              │                       │
│ WATCHLIST│        MAIN STAGE            │    POSITION LEDGER    │
│   panel  │   (chart / overview / txn)   │    (net worth, etc)   │
│          │                              │                       │
├──────────┴──────────────────────────────┴───────────────────────┤
│ STATUSBAR: connection · account · keyboard shortcut hints       │
└─────────────────────────────────────────────────────────────────┘
```

### Mandatory Structural Elements

**Top bar** (32–40px tall, always visible)
- Left: logo/wordmark in accent color, 12px monospace
- Center: page name in muted text, 11px caps
- Right: sync status dot, username, session uptime, theme switcher icon

**Status bar** (28–32px tall, pinned to bottom of viewport — ALWAYS)
- Left: connection indicator `● CONNECTED` or `◌ SYNCING`
- Center: last action taken `Last sync 2m ago · 1,247 transactions loaded`
- Right: keyboard shortcut hints that change by context `[K] Command · [/] Search · [T] Theme`
- This is the terminal's heartbeat. If it's missing, the design fails.

**Command palette** (`Ctrl+K` or `/` from anywhere)
- Full-width overlay, monospace input
- Recent commands listed below
- Results: `> Go to Transactions`, `> Add transaction`, `> Switch theme: Phosphor`

### Data Density Target
At 1440×900, the default view must show:
- Net worth (current + delta from last month)
- Monthly spend vs budget (number + micro bar)
- Top 3 spending categories
- Last 5 transactions (with amount, merchant, date, category)
- At least 2 more data points the user cares about

That is the minimum. Showing less than this is choosing comfort over the user.

---

## Visual Grammar — Hard Rules

### Borders
- `1px solid var(--ft-border)` everywhere data is separated
- No `box-shadow` on data containers
- No `border-radius` above `3px` on data tables or panels
- Cards that use large `border-radius` (>8px) must be non-data UI only (modals, toasts)

### Spacing
- Intentional asymmetry: column padding ≠ row padding
- Data rows: `6px 10px` (tight — this is a ledger, not a form)
- Section headers: `16px 0 8px` (breathe above, compress below)
- NOT `p-4` on everything. `p-4` is the typographic equivalent of beige.

### Color use rules
- Green = positive number, balance increase, success
- Red = negative number, balance decrease, error
- Amber/Accent = primary action, interactive element, current selection
- White/Primary text = labels, static content
- NEVER use accent color for decoration (no gradient headers, no colored backgrounds)

### Interactions
- Row hover: `background: var(--ft-surface)` + left accent border `2px solid var(--ft-accent)`
- Active panel: subtle inner glow on border `box-shadow: inset 0 0 0 1px var(--ft-accent)`
- Button press: no animation, instant response (terminals don't bounce)
- Theme switch: instant, no transition (flipping a switch, not a crossfade)

---

## Screens

### 1. Main Dashboard
The terminal at rest. Shows financial position at a glance.
- Net worth hero number, top center
- Delta badge: `+$2,140 this month (↑4.2%)` in accent green
- Three column layout: watchlist left / main stage center / position ledger right
- Recent transactions in a tight table at the bottom of main stage
- Status bar must show last sync time and active account

### 2. Transactions
Dense ledger view. No illustrations, no empty state art.
- Full-width table: DATE | MERCHANT | CATEGORY | AMOUNT | ACCOUNT | STATUS
- Row height: 36px maximum
- Inline category chip (not a full badge — just text with a left-border color)
- Filter bar above table: monospace filter tokens like `category:food amount:>50 date:this-month`
- Running total visible: `Showing 247 transactions · Total outflow: –$8,440.22`

### 3. Settings
Serious configuration. Tabbed: Display / Panels / Keyboard / Account / Danger Zone.
- Theme picker: 5 swatches in a horizontal strip, each shows the actual palette not just a name
- Layout density toggle: Compact / Standard / Spacious (shows pixel count per row)
- Panel manager: drag-reorder list of visible panels with toggle switches
- Keyboard reference: actual shortcut table, monospace, two-column

### 4. Profile
- User card with avatar, display name, email, account tier
- Auth providers: which are linked, which aren't (with link button)
- Session list: active sessions, last active, location
- Danger zone: separated by a red `1px` rule, delete account button in muted red

---

## The Signature Element

The status bar is non-negotiable, but the signature move is the **command palette as primary navigation**.

There is no hamburger menu. There is no nav drawer. The only nav entry point is:
- The status bar shortcut hint `[K] Command`
- A single `>_` icon in the top bar

Power users never use sidebars. They use commands. This interface trusts its users to know what they want.

---

## What This Is NOT

- Not shadcn default with finance data poured in
- Not a prettier version of Mint
- Not dark mode + green = "terminal"
- Not a SaaS dashboard that happens to track money
- Not built for someone who needs to be onboarded

If the generator produces something a Fortune 500 product team would call "clean and modern," it has failed.
The right output would make that same team nervous. That is the goal.

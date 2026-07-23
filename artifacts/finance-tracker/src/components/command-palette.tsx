import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/privacy-context";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNewTransaction?: () => void;
}

type CommandSection = "navigation" | "actions";

interface Command {
  id: string;
  section: CommandSection;
  icon: string;
  title: string;
  shortcut?: string;
  action: () => void;
}

function buildCommands(
  navigate: (path: string) => void,
  onClose: () => void,
  onNewTransaction?: () => void,
  togglePrivacy?: () => void,
): Command[] {
  const nav = (path: string) => () => {
    navigate(path);
    onClose();
  };

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return [
    { id: "go-dashboard",     section: "navigation", icon: "◈", title: "Go to Dashboard",     shortcut: "G D", action: nav("/") },
    { id: "go-transactions",  section: "navigation", icon: "⇌", title: "Go to Transactions",  shortcut: "G T", action: nav("/transactions") },
    { id: "go-accounts",      section: "navigation", icon: "▣", title: "Go to Accounts",      shortcut: "G A", action: nav("/accounts") },
    { id: "go-reports",       section: "navigation", icon: "≡", title: "Go to Reports",       shortcut: "G R", action: nav("/reports") },
    { id: "go-settings",      section: "navigation", icon: "◎", title: "Go to Settings",      shortcut: "G S", action: nav("/settings") },
    { id: "go-recurring",     section: "navigation", icon: "↺", title: "Go to Recurring",     shortcut: "G U", action: nav("/recurring") },
    { id: "go-investments",   section: "navigation", icon: "△", title: "Go to Investments",   shortcut: "G I", action: nav("/investments") },
    { id: "go-owing",         section: "navigation", icon: "◁", title: "Go to Owing",         shortcut: "G O", action: nav("/owing") },
    { id: "go-goals",         section: "navigation", icon: "◎", title: "Go to Goals",         shortcut: "G L", action: nav("/goals") },
    { id: "go-analytics",     section: "navigation", icon: "◈", title: "Go to Analytics",     shortcut: "G N", action: nav("/analytics") },
    { id: "go-profile",       section: "navigation", icon: "○", title: "Go to Profile",       shortcut: "G P", action: nav("/profile") },
    { id: "go-budget",        section: "navigation", icon: "▦", title: "Go to Budget",        shortcut: "G B", action: nav("/budget") },
    { id: "go-health-score",  section: "navigation", icon: "♥", title: "Go to Health Score",  shortcut: "G H", action: nav("/health-score") },
    { id: "go-net-worth",     section: "navigation", icon: "◇", title: "Go to Net Worth",     shortcut: "G W", action: nav("/net-worth") },
    { id: "go-whatif",        section: "navigation", icon: "?", title: "Go to Calculators",   shortcut: "G F", action: nav("/whatif") },
    { id: "go-subscriptions", section: "navigation", icon: "↻", title: "Go to Subscriptions", shortcut: "G C", action: nav("/subscriptions") },
    { id: "go-tax",           section: "navigation", icon: "£", title: "Go to Tax",           shortcut: "G Y", action: nav("/tax") },
    { id: "go-mortgage",      section: "navigation", icon: "⌂", title: "Go to Mortgage",      shortcut: "G M", action: nav("/mortgage") },
    { id: "go-calendar",      section: "navigation", icon: "▦", title: "Go to Calendar",      shortcut: "G K", action: nav("/calendar") },
    { id: "go-split",         section: "navigation", icon: "÷", title: "Go to Bill Split",    shortcut: "G X", action: nav("/split") },
    { id: "go-cashflow",      section: "navigation", icon: "→", title: "Go to Cash Flow",     shortcut: "G V", action: nav("/cashflow") },
    { id: "go-year-review",   section: "navigation", icon: "★", title: "Go to Year Review",   shortcut: "G E", action: nav("/year-review") },
    { id: "go-import",        section: "navigation", icon: "↑", title: "Go to Import",        shortcut: "G J", action: nav("/import") },
    { id: "go-ai-coach",      section: "navigation", icon: "✦", title: "Go to AI Coach",      shortcut: "G G", action: nav("/ai-coach") },
    {
      id: "new-transaction",
      section: "actions",
      icon: "+",
      title: "New Transaction",
      shortcut: "N",
      action: onNewTransaction ? act(onNewTransaction) : onClose,
    },
    {
      id: "import-transactions",
      section: "actions",
      icon: "↑",
      title: "Import Transactions (CSV)",
      action: nav("/import"),
    },
    {
      id: "set-budget-limits",
      section: "actions",
      icon: "▦",
      title: "Set Budget Limits",
      action: nav("/budget"),
    },
    {
      id: "manage-accounts",
      section: "actions",
      icon: "▣",
      title: "Manage Accounts",
      action: nav("/accounts"),
    },
    {
      id: "toggle-privacy",
      section: "actions",
      icon: "◉",
      title: "Toggle Privacy Mode",
      shortcut: "P",
      action: togglePrivacy ? act(togglePrivacy) : onClose,
    },
    {
      id: "add-new-goal",
      section: "actions",
      icon: "◎",
      title: "Add New Goal",
      action: nav("/goals"),
    },
    {
      id: "new-debt-iou",
      section: "actions",
      icon: "◁",
      title: "New Debt / IOU",
      action: nav("/owing"),
    },
    {
      id: "quick-csv-import",
      section: "actions",
      icon: "↑",
      title: "Import CSV",
      action: nav("/import"),
    },
    {
      id: "toggle-sidebar",
      section: "actions",
      icon: "⊟",
      title: "Toggle Sidebar",
      shortcut: "⌘[",
      action: onClose,
    },
  ];
}

const SECTION_LABELS: Record<CommandSection, string> = {
  navigation: "NAVIGATION",
  actions: "ACTIONS",
};

const SECTION_ORDER: CommandSection[] = ["navigation", "actions"];

export function CommandPalette({ open, onClose, onNewTransaction }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<Element | null>(null);
  const { togglePrivacy } = usePrivacy();

  const commands = buildCommands(navigate, onClose, onNewTransaction, togglePrivacy);

  const filtered = query.trim() === ""
    ? commands
    : commands.filter((cmd) =>
        cmd.title.toLowerCase().includes(query.toLowerCase())
      );

  const grouped = SECTION_ORDER.reduce<Record<CommandSection, Command[]>>(
    (acc, section) => {
      acc[section] = filtered.filter((cmd) => cmd.section === section);
      return acc;
    },
    { navigation: [], actions: [] }
  );

  const flatFiltered = SECTION_ORDER.flatMap((s) => grouped[s]);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement;
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      (prevFocusRef.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeSelected = useCallback(() => {
    const cmd = flatFiltered[selectedIndex];
    if (cmd) cmd.action();
  }, [flatFiltered, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        executeSelected();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, flatFiltered.length, executeSelected]);

  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLDivElement>("[data-selected='true']");
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.72)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--ft-border)",
            padding: "0 14px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              color: "var(--ft-accent)",
              marginRight: 8,
              userSelect: "none",
            }}
          >
            &gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or destination..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              color: "var(--ft-text)",
              padding: "14px 0",
              caretColor: "var(--ft-accent)",
            }}
          />
        </div>

        <div
          ref={listRef}
          style={{
            maxHeight: 380,
            overflowY: "auto",
            padding: "6px 0",
          }}
        >
          {flatFiltered.length === 0 ? (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ft-dim)",
                padding: "20px 14px",
                textAlign: "center",
              }}
            >
              NO RESULTS
            </div>
          ) : (
            SECTION_ORDER.map((section) => {
              const sectionItems = grouped[section];
              if (sectionItems.length === 0) return null;

              return (
                <div key={section}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      color: "var(--ft-dim)",
                      padding: "8px 14px 4px",
                      userSelect: "none",
                    }}
                  >
                    {SECTION_LABELS[section]}
                  </div>
                  {sectionItems.map((cmd) => {
                    const itemIndex = flatIndex++;
                    const isSelected = itemIndex === selectedIndex;

                    return (
                      <CommandRow
                        key={cmd.id}
                        cmd={cmd}
                        isSelected={isSelected}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        onClick={cmd.action}
                      />
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--ft-border)",
            padding: "6px 14px",
            display: "flex",
            gap: 16,
          }}
        >
          <HintItem keys="↑ ↓" label="navigate" />
          <HintItem keys="↵" label="execute" />
          <HintItem keys="esc" label="close" />
        </div>
      </div>
    </div>
  );
}

type CommandRowProps = {
  cmd: Command;
  isSelected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

function CommandRow({ cmd, isSelected, onMouseEnter, onClick }: CommandRowProps) {
  return (
    <div
      data-selected={isSelected ? "true" : "false"}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 14px",
        cursor: "pointer",
        background: isSelected ? "var(--ft-raised)" : "transparent",
        borderLeft: isSelected ? "2px solid var(--ft-accent)" : "2px solid transparent",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          color: isSelected ? "var(--ft-accent)" : "var(--ft-muted)",
          width: 18,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {cmd.icon}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: isSelected ? "var(--ft-text)" : "var(--ft-muted)",
          flex: 1,
        }}
      >
        {cmd.title}
      </span>
      {cmd.shortcut && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-dim)",
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border2)",
            padding: "1px 6px",
            flexShrink: 0,
          }}
        >
          {cmd.shortcut}
        </span>
      )}
    </div>
  );
}

function HintItem({ keys, label }: { keys: string; label: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--ft-dim)",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span
        style={{
          background: "var(--ft-base)",
          border: "1px solid var(--ft-border2)",
          padding: "0px 4px",
          color: "var(--ft-muted)",
        }}
      >
        {keys}
      </span>
      {label}
    </span>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable;

      if (e.key === "/" && !isEditable) {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return { open, openPalette, closePalette };
}

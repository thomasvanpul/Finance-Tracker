import { useMemo, useState } from "react";
import { useLocation } from "wouter";

// Directory landing shows SIX rows so it fits one phone screen without
// scrolling. Multi-item groups (Calculators, Reports, People, Settings)
// expand to a sub-picker in place; single-item groups (Goals, Data) tap
// straight to their destination.
//
// State model is local (useState). No new URLs — a phone user does not
// bookmark "the Calculators picker"; they bookmark /pension or /fire.
// The sub-picker is a within-screen navigation that the back button on
// the sub-picker header collapses.

type DirectoryItem = {
  href: string;
  label: string;
  desc: string;
};

type DirectoryGroup = {
  key: string;
  heading: string;
  desc: string;                      // one-line summary rendered on the collapsed row
  items: readonly DirectoryItem[];
};

const GROUPS: readonly DirectoryGroup[] = [
  {
    key: "calculators",
    heading: "Calculators",
    desc: "What if I change a number",
    items: [
      { href: "/whatif",       label: "What if",          desc: "Model a change and see the result" },
      { href: "/fire",         label: "FIRE",             desc: "Financial independence timeline" },
      { href: "/pension",      label: "Pension",          desc: "Retirement pot and projected income" },
      { href: "/mortgage",     label: "Mortgage",         desc: "Payment, amortisation, remortgage cost" },
      { href: "/projection",   label: "Projection",       desc: "Where balances land over time" },
      { href: "/tax",          label: "Tax",              desc: "Estimates against your data" },
      { href: "/calculators",  label: "More calculators", desc: "One-off tools that don't need a home" },
    ],
  },
  {
    key: "reports",
    heading: "Reports",
    desc: "Statements you can look at",
    items: [
      { href: "/reports",    label: "Reports",   desc: "Statements you can look at" },
      { href: "/decisions",  label: "Decisions", desc: "Choices you've made about money" },
      { href: "/briefing",   label: "Briefing",  desc: "Daily read on your money" },
    ],
  },
  {
    key: "people",
    heading: "People",
    desc: "Money involving other people",
    items: [
      { href: "/owing",  label: "Owing",        desc: "Who owes what to whom" },
      { href: "/split",  label: "Split a bill", desc: "Divide a receipt across people" },
    ],
  },
  {
    key: "goals",
    heading: "Goals",
    desc: "What you're saving toward",
    items: [
      { href: "/goals", label: "Goals", desc: "What you're saving toward" },
    ],
  },
  {
    key: "data",
    heading: "Data",
    desc: "Import a CSV or a statement",
    items: [
      { href: "/import", label: "Import", desc: "Bring in a CSV or a statement" },
    ],
  },
  {
    key: "settings",
    heading: "Settings",
    desc: "How the app behaves and who you are",
    items: [
      { href: "/profile",  label: "Profile",  desc: "Who you are on the app" },
      { href: "/settings", label: "Settings", desc: "How the app behaves" },
    ],
  },
];

// Total number of directory destinations across all groups. Exported so
// callers like MobileHome's "ALL N PLACES" footer derive from the single
// source of truth rather than a literal that goes stale silently.
export const DIRECTORY_ITEM_COUNT: number = GROUPS.reduce((n, g) => n + g.items.length, 0);

// Item URLs the directory reaches. Cross-checked at build time by the
// wrapped-routes lock (#18) — every URL here must be a wrapped route in
// PhoneShell.tsx.
export const DIRECTORY_DESTINATIONS: readonly string[] = GROUPS.flatMap((g) => g.items.map((i) => i.href));

function filterGroups(query: string): readonly DirectoryGroup[] {
  const q = query.trim().toLowerCase();
  if (q === "") return GROUPS;
  return GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0 || g.heading.toLowerCase().includes(q));
}

function ItemRow({ item, onTap }: { item: DirectoryItem; onTap: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 2,
          padding: "12px 16px",
          minHeight: 44,
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--ft-border)",
          textAlign: "left",
          cursor: "pointer",
          color: "var(--ft-text)",
        }}
      >
        <span style={{ fontSize: 15 }}>{item.label}</span>
        <span style={{ fontSize: 12, color: "var(--ft-dim)" }}>{item.desc}</span>
      </button>
    </li>
  );
}

function GroupRow({ group, onTap }: { group: DirectoryGroup; onTap: () => void }) {
  const isMulti = group.items.length > 1;
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px",
          minHeight: 56,
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--ft-border)",
          textAlign: "left",
          cursor: "pointer",
          color: "var(--ft-text)",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{group.heading}</span>
          <span style={{ fontSize: 12, color: "var(--ft-dim)" }}>{group.desc}</span>
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-dim)",
            letterSpacing: "0.06em",
          }}
        >
          {isMulti ? `${group.items.length} ›` : "›"}
        </span>
      </button>
    </li>
  );
}

export function DirectoryScreen() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  const visible = useMemo(() => filterGroups(query), [query]);
  const activeGroup = useMemo(
    () => (activeGroupKey ? GROUPS.find((g) => g.key === activeGroupKey) ?? null : null),
    [activeGroupKey],
  );

  const handleGroupTap = (g: DirectoryGroup) => {
    if (g.items.length === 1) {
      navigate(g.items[0].href);
      return;
    }
    setActiveGroupKey(g.key);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--ft-surface)",
          borderBottom: "1px solid var(--ft-border)",
          flexShrink: 0,
        }}
      >
        {activeGroup ? (
          <button
            onClick={() => setActiveGroupKey(null)}
            aria-label="Back to directory"
            type="button"
            style={{
              background: "none",
              border: "none",
              color: "var(--ft-muted)",
              fontSize: 13,
              padding: 0,
              cursor: "pointer",
              minHeight: 44,
              minWidth: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
            }}
          >
            ‹
          </button>
        ) : null}
        {activeGroup ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ft-dim)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              flex: 1,
            }}
          >
            {activeGroup.heading}
          </span>
        ) : (
          <input
            type="search"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            aria-label="Search directory"
            style={{
              flex: 1,
              minHeight: 44,
              padding: "0 12px",
              background: "var(--ft-base)",
              border: "1px solid var(--ft-border)",
              color: "var(--ft-text)",
              fontFamily: "var(--font-sans)",
              fontSize: 15,
              outline: "none",
              borderRadius: 6,
            }}
          />
        )}
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {activeGroup ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {activeGroup.items.map((item) => (
              <ItemRow key={item.href} item={item} onTap={() => navigate(item.href)} />
            ))}
          </ul>
        ) : (
          <>
            {visible.length === 0 && (
              <div
                style={{
                  padding: "48px 20px",
                  textAlign: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--ft-text-xs)",
                  letterSpacing: "0.08em",
                  color: "var(--ft-dim)",
                  textTransform: "uppercase",
                }}
              >
                Nothing matches "{query}"
              </div>
            )}
            {query.trim() === "" ? (
              // No search — 6 collapsed group rows.
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {GROUPS.map((group) => (
                  <GroupRow key={group.key} group={group} onTap={() => handleGroupTap(group)} />
                ))}
              </ul>
            ) : (
              // Searching — flattened item list under group headings.
              visible.map((group) => (
                <section key={group.key} aria-labelledby={`dir-${group.key}`}>
                  <h2
                    id={`dir-${group.key}`}
                    style={{
                      margin: 0,
                      padding: "20px 16px 8px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--ft-text-xs)",
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      color: "var(--ft-dim)",
                    }}
                  >
                    {group.heading.toUpperCase()}
                  </h2>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {group.items.map((item) => (
                      <ItemRow key={item.href} item={item} onTap={() => navigate(item.href)} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

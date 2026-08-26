import { useMemo, useState } from "react";
import { useLocation } from "wouter";

// Intent-based grouping. The rejection Thomas made of the earlier MORE
// menu was that it was leftovers: things grouped by which codebase folder
// they lived in. This directory groups by the question in the user's
// head — "what am I trying to do" — regardless of which subsystem the
// destination happens to live in.
//
// The ordering within each group is deliberate: item likeliest to be
// opened first, first. Settings is always the last group and Settings
// (the item) is always the last item of its group.
//
// Every entry here MUST have a matching wrapped route in
// components/phone/PhoneShell.tsx WRAPPED_ROUTES. The D5 ratchet lock
// enforces that. If a route is removed from PhoneShell it must also be
// removed here; if added, added here too.

type DirectoryItem = {
  href: string;
  label: string;
  desc: string;
};

type DirectoryGroup = {
  key: string;
  heading: string;
  items: readonly DirectoryItem[];
};

const GROUPS: readonly DirectoryGroup[] = [
  {
    key: "plan",
    heading: "PLAN",
    items: [
      { href: "/goals",         label: "Goals",         desc: "What you're saving toward" },
      { href: "/health-score",  label: "Health Score",  desc: "How your money is doing overall" },
    ],
  },
  {
    key: "calculators",
    heading: "CALCULATORS",
    items: [
      { href: "/whatif",        label: "What if",       desc: "Model a change and see the result" },
      { href: "/pension",       label: "Pension",       desc: "Retirement pot and projected income" },
      { href: "/fire",          label: "FIRE",          desc: "Financial independence timeline" },
      { href: "/projection",    label: "Projection",    desc: "Where balances land over time" },
      { href: "/mortgage",      label: "Mortgage",      desc: "Payment, amortisation, remortgage cost" },
      { href: "/tax",           label: "Tax",           desc: "Estimates against your data" },
      { href: "/calculators",   label: "More calculators", desc: "One-off tools that don't need a home" },
    ],
  },
  {
    key: "people",
    heading: "PEOPLE & MONEY",
    items: [
      { href: "/owing",         label: "Owing",         desc: "Who owes what to whom" },
      { href: "/split",         label: "Split a bill",  desc: "Divide a receipt across people" },
      { href: "/shared",        label: "Shared expenses", desc: "A joint pot with someone" },
    ],
  },
  {
    key: "assistant",
    heading: "ASSISTANT",
    items: [
      { href: "/ai-coach",      label: "AI Coach",      desc: "Ask something in plain English" },
      { href: "/briefing",      label: "Briefing",      desc: "Daily read on your money" },
    ],
  },
  {
    key: "reports",
    heading: "REPORTS",
    items: [
      { href: "/reports",       label: "Reports",       desc: "Statements you can look at" },
      { href: "/year-review",   label: "Year review",   desc: "An annual retrospective" },
      { href: "/decisions",     label: "Decisions",     desc: "Choices you've made about money" },
    ],
  },
  {
    key: "contexts",
    heading: "SEPARATE CONTEXTS",
    items: [
      { href: "/business",      label: "Business",      desc: "Your business finances, separate" },
      { href: "/family",        label: "Family",        desc: "Household-level view" },
      { href: "/trading",       label: "Trading",       desc: "Trading journal, separate from investing" },
    ],
  },
  {
    key: "data",
    heading: "DATA",
    items: [
      { href: "/import",        label: "Import",        desc: "Bring in a CSV or a statement" },
    ],
  },
  {
    key: "settings",
    heading: "SETTINGS",
    items: [
      { href: "/profile",       label: "Profile",       desc: "Who you are on the app" },
      { href: "/settings",      label: "Settings",      desc: "How the app behaves" },
    ],
  },
];

function filterGroups(query: string): readonly DirectoryGroup[] {
  const q = query.trim().toLowerCase();
  if (q === "") return GROUPS;
  return GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.items.length > 0);
}

export function DirectoryScreen() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterGroups(query), [query]);

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
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {visible.length === 0 && (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: "var(--ft-dim)",
              textTransform: "uppercase",
            }}
          >
            Nothing matches "{query}"
          </div>
        )}
        {visible.map((group) => (
          <section key={group.key} aria-labelledby={`dir-${group.key}`}>
            <h2
              id={`dir-${group.key}`}
              style={{
                margin: 0,
                padding: "20px 16px 8px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "var(--ft-dim)",
              }}
            >
              {group.heading}
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => navigate(item.href)}
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
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--ft-dim)",
                      }}
                    >
                      {item.desc}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

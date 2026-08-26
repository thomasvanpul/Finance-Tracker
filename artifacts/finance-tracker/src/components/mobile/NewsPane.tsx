// F3 news pane — mobile home.
//
// Renders only items tied to something the user actually holds
// (ticker or currency). Each row states the connection to the user's
// position — never a general market feed. If the user holds nothing
// AND the response has no items, the pane does not render at all.
//
// Headlines are someone else's copy: link out, never paraphrase.
// Each row is a link to the source publisher. We show the headline
// as it came from the RSS feed, plus a small "for your ${anchor}"
// tag showing the connection.
//
// Data comes from GET /api/market/news/for-user which pulls
// per-ticker news via the existing lib/market.ts feed path and
// tags each item with its anchor. Currency-side news is deferred
// until a generic-feed source is wired.

import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { VStack } from "@/components/primitives";

interface ConnectedTo {
  kind: "ticker" | "currency";
  value: string;
  label: string;
}
interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
  connectedTo: ConnectedTo;
}
interface NewsResponse {
  tickers: string[];
  currencies: string[];
  items: NewsItem[];
}

const KEY = ["market", "news", "for-user"] as const;

function useNews() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => customFetch<NewsResponse>("/api/market/news/for-user"),
    // News is refetched on tab focus by default. Give it a 10-minute
    // staleTime to match the server's per-ticker cache TTL.
    staleTime: 10 * 60 * 1000,
  });
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diffH = (Date.now() - d.getTime()) / 3600_000;
    if (diffH < 1) return `${Math.round(diffH * 60)}m`;
    if (diffH < 24) return `${Math.round(diffH)}h`;
    return `${Math.round(diffH / 24)}d`;
  } catch {
    return "";
  }
}

export function NewsPane({ onOpenInvestments }: { onOpenInvestments?: () => void }) {
  const { data } = useNews();
  // The rule: if the user holds nothing, don't render at all — a
  // generic feed is exactly what F3 rejects. Also don't render
  // when the query hasn't loaded yet, or when it returned zero
  // items (no anchor-tied news right now).
  if (!data) return null;
  const noHoldings = data.tickers.length === 0 && data.currencies.length === 0;
  if (noHoldings) return null;
  if (data.items.length === 0) return null;

  return (
    <>
      {/* Section header — matches the shape of SectionHeader in
          MobileHome. Kept inline here so the whole pane
          (header + list) appears all-or-nothing based on whether
          any anchor-tied news exists. An empty header above an
          empty list would waste real estate. */}
      <div
        style={{
          marginTop: 24,
          padding: "16px 18px 0",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
            NEWS · CONNECTED TO YOU
          </span>
          {onOpenInvestments && (
            <a
              onClick={(e) => { e.preventDefault(); onOpenInvestments(); }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                color: "var(--ft-dim)",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              INVESTMENTS ›
            </a>
          )}
        </div>
      </div>
    <div style={{ padding: "0 18px" }}>
      <VStack gap={0}>
        {data.items.slice(0, 6).map((it, i) => (
          <a
            key={it.link}
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              minHeight: 60,
              padding: "12px 0",
              borderTop: "1px solid var(--ft-border)",
              ...(i === Math.min(5, data.items.length - 1)
                ? { borderBottom: "1px solid var(--ft-border)" }
                : {}),
              textDecoration: "none",
              color: "var(--ft-text)",
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.35, color: "var(--ft-text)" }}>
              {it.title}
            </div>
            <div
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-dim)",
                letterSpacing: "0.06em",
              }}
            >
              <span style={{ color: "var(--ft-accent)" }}>
                {it.connectedTo.kind === "ticker" ? "YOUR " : "YOUR "}{it.connectedTo.label}
              </span>
              <span>·</span>
              <span>{it.publisher}</span>
              {it.publishedAt && (
                <>
                  <span>·</span>
                  <span>{formatWhen(it.publishedAt)}</span>
                </>
              )}
            </div>
          </a>
        ))}
      </VStack>
    </div>
    </>
  );
}

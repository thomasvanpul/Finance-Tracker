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
import { SectionHeader } from "@/components/phone/SectionHeader";
import { HomeSectionHeader } from "./home-section-header";

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
      {/* Header + list render all-or-nothing, so an empty header never
          sits above an empty list. The header is HOME's one section header
          (DESIGN.md §2); until 16 Sep 2026 this pane drew its own. */}
      {onOpenInvestments
        ? <HomeSectionHeader label="NEWS · CONNECTED TO YOU" link="INVESTMENTS ›" onLink={onOpenInvestments} />
        : <div style={{ marginTop: 16 }}><SectionHeader label="NEWS · CONNECTED TO YOU" /></div>}
    <div style={{ padding: "0 16px" }}>
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
              // The header's rule already sits above the first row; a second
              // one there doubles up (DESIGN.md §5).
              ...(i > 0 ? { borderTop: "1px solid var(--ft-border)" } : {}),
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
              {/* A tag that reads, not a control: muted, not the accent
                  (DESIGN.md §11). */}
              <span style={{ color: "var(--ft-muted)" }}>
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

// The AI switch is off — said before the user clicks anything (audit A2/A3).
//
// Until 5 Oct 2026 /ai-coach and /briefing never read the switch: the coach
// showed a green AI ONLINE badge and ten live-looking questions, and the
// first click came back "AI is off for this account" underneath that badge.
// A surface that offers AI renders this instead of its AI controls while the
// switch is off, and this is the one way back: the Settings panel that holds
// the switch.

import { Link } from "wouter";
import { HStack, MonoLabel, PanelBox, Text, VStack } from "@/components/primitives";

export const AI_SETTINGS_HREF = "/settings?panel=ai";

// why fixed: steps on the app's type ladder and spacing scale, which live as literals (docs/STYLE-INVENTORY.md), not as config.
const N = { gap: 8, label: 9, head: 11, body: 10, leading: 1.7, link: 10, weight: 700 } as const;

export function AiOffNotice({ what }: { what: string }) {
  return (
    <PanelBox padding="14px 16px">
      <VStack gap={N.gap}>
        <HStack gap={N.gap} align="baseline" wrap>
          <MonoLabel as="span" size={N.label} color="var(--ft-muted)" letterSpacing="0.14em">AI OFF</MonoLabel>
          <Text as="span" size={N.head} color="var(--ft-text)">AI is off for this account.</Text>
        </HStack>
        <Text as="div" size={N.body} color="var(--ft-dim)" lineHeight={N.leading}>
          {what} While it is off, nothing is sent to an AI provider.
        </Text>
        <Link
          href={AI_SETTINGS_HREF}
          style={{ alignSelf: "flex-start", fontFamily: "var(--font-sans)", fontSize: N.link, fontWeight: N.weight, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-accent)", border: "1px solid var(--ft-accent)", padding: "6px 12px", textDecoration: "none" }}
        >
          Turn on AI in Settings ▸
        </Link>
      </VStack>
    </PanelBox>
  );
}

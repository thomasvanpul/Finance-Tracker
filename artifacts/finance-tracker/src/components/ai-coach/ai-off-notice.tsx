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

export function AiOffNotice({ what }: { what: string }) {
  return (
    <PanelBox padding="14px 16px">
      <VStack gap={8}>
        <HStack gap={8} align="baseline" wrap>
          <MonoLabel as="span" size={9} color="var(--ft-muted)" letterSpacing="0.14em">AI OFF</MonoLabel>
          <Text as="span" size={11} color="var(--ft-text)">AI is off for this account.</Text>
        </HStack>
        <Text as="div" size={10} color="var(--ft-dim)" lineHeight={1.7}>
          {what} While it is off, nothing is sent to an AI provider.
        </Text>
        <Link
          href={AI_SETTINGS_HREF}
          style={{ alignSelf: "flex-start", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-accent)", border: "1px solid var(--ft-accent)", padding: "6px 12px", textDecoration: "none" }}
        >
          Turn on AI in Settings ▸
        </Link>
      </VStack>
    </PanelBox>
  );
}

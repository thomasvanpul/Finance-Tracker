// Shown on the sign-in screen after account deletion when a Google or
// GitHub sign-in grant could not be revoked at the provider. Says which,
// and where the user removes it. Stays until dismissed.

import { useState } from "react";
import { VStack, Text } from "@/components/primitives";
import { GRANT_HELP, readRemainingGrants, clearRemainingGrants, type GrantProvider } from "@/lib/deleted-grants";

export function DeletedGrantsNotice() {
  const [remaining, setRemaining] = useState<GrantProvider[]>(() => readRemainingGrants());
  if (remaining.length === 0) return null;

  const names = remaining.map((p) => GRANT_HELP[p].label).join(" and ");
  return (
    <div
      role="status"
      data-testid="deleted-grants-notice"
      style={{
        border: "1px solid color-mix(in srgb, var(--ft-amber) 50%, var(--ft-border))",
        background: "color-mix(in srgb, var(--ft-amber) 6%, var(--ft-surface))",
        padding: 14,
        marginBottom: 12,
      }}
    >
      <VStack gap={8}>
        <Text as="p" size={11} weight={600} color="var(--ft-text)" lineHeight={1.5}>
          Your account is deleted. Numeris could not remove its {names} sign-in access for you.
        </Text>
        <Text as="p" size={10} color="var(--ft-muted)" lineHeight={1.6}>
          It gives nobody access to your deleted data, but Numeris stays listed as a connected app until you remove it:
        </Text>
        {remaining.map((p) => (
          <Text as="p" key={p} size={10} color="var(--ft-muted)" lineHeight={1.6}>
            {GRANT_HELP[p].where}:{" "}
            <a href={GRANT_HELP[p].url} target="_blank" rel="noreferrer" style={{ color: "var(--ft-accent)" }}>
              {GRANT_HELP[p].url.replace(/^https:\/\//, "")}
            </a>
          </Text>
        ))}
        <button
          type="button"
          onClick={() => { clearRemainingGrants(); setRemaining([]); }}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            color: "var(--ft-muted)",
            background: "transparent",
            border: "1px solid var(--ft-border)",
            padding: "5px 14px",
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Dismiss
        </button>
      </VStack>
    </div>
  );
}

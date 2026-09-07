interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  fill?: boolean;
  minHeight?: string;
}

export function EmptyState({ title, description, action, fill = true, minHeight }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "60px 24px",
        textAlign: "center",
        border: "1px solid var(--ft-border)",
        background: "var(--ft-surface)",
        // DESIGN.md §10: an empty state is copy a reader reads, not a value
        // scanned against its neighbours. The title below keeps mono because
        // it is a short uppercase legend; the description and the button
        // label are language and inherit sans from here.
        fontFamily: "var(--font-sans)",
        ...(fill ? { minHeight: minHeight ?? "40vh", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center" } : {}),
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ft-dim)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        — {title} —
      </div>
      {description && (
        <div
          style={{
            fontSize: 10,
            color: "var(--ft-dim)",
            letterSpacing: "0.04em",
            marginBottom: action ? 20 : 0,
            maxWidth: 300,
          }}
        >
          {description}
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: "var(--ft-accent)",
            color: "var(--ft-base)",
            border: "none",
            padding: "10px 20px",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        border: "1px solid var(--ft-border)",
        background: "var(--ft-surface)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
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
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: "transparent",
            color: "var(--ft-accent)",
            border: "1px solid var(--ft-accent)",
            padding: "6px 16px",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
